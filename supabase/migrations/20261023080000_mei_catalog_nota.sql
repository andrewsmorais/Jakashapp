-- Pacote MEI: catálogo de produtos e serviços + dados para a ficha da nota fiscal.
-- O Jakash NÃO emite nota fiscal: ele reúne os dados que o emissor oficial pede (Emissor Nacional NFS-e, NF-e da SEFAZ)
-- para a pessoa copiar e colar lá. Por isso são só campos de texto que a própria pessoa digita (códigos não são validados contra tabela oficial).

-- 1. Catálogo de produtos e serviços do MEI (dados só do dono; não entram na gestão compartilhada)
CREATE TABLE IF NOT EXISTS public.mei_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('servico', 'produto')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  -- un, h, kg, m... (texto livre curto)
  unit text CHECK (unit IS NULL OR char_length(unit) BETWEEN 1 AND 10),
  -- Serviço: Código de Tributação Nacional (cTribNac), 6 dígitos no padrão 01.01.01 (item.subitem.desdobro da LC 116/2003).
  ctrib_nac text CHECK (ctrib_nac IS NULL OR ctrib_nac ~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'),
  -- Serviço: item da NBS (9 dígitos, guardado como 1.0101.10.00). Limite frouxo de propósito: o emissor é quem confirma o código.
  nbs text CHECK (nbs IS NULL OR char_length(nbs) <= 15),
  -- Serviço: código complementar do município (só alguns municípios têm).
  municipal_code text CHECK (municipal_code IS NULL OR char_length(municipal_code) <= 10),
  -- Produto: NCM (8 dígitos, só números) e CFOP (4 dígitos, só números).
  ncm text CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$'),
  cfop text CHECK (cfop IS NULL OR cfop ~ '^[0-9]{4}$'),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Cada tipo guarda só os próprios campos fiscais.
  CONSTRAINT mei_items_service_fields CHECK (kind = 'servico' OR (ctrib_nac IS NULL AND nbs IS NULL AND municipal_code IS NULL)),
  CONSTRAINT mei_items_product_fields CHECK (kind = 'produto' OR (ncm IS NULL AND cfop IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_mei_items_user ON public.mei_items (user_id, archived, kind);

ALTER TABLE public.mei_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Dono gerencia os proprios itens' AND polrelid = 'public.mei_items'::regclass) THEN
    CREATE POLICY "Dono gerencia os proprios itens" ON public.mei_items FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

REVOKE ALL ON public.mei_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mei_items TO authenticated;

-- 2. Perfil: dados do prestador (o MEI) que a ficha da nota precisa e ainda não existiam.
-- O CNPJ e o nome do negócio já existem (business_cnpj, business_name). Tudo opcional, só texto, com limites de tamanho.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_municipio text CHECK (business_municipio IS NULL OR char_length(business_municipio) <= 80);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_uf text CHECK (business_uf IS NULL OR business_uf ~ '^[A-Z]{2}$');
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_im text CHECK (business_im IS NULL OR char_length(business_im) <= 20);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_cep text CHECK (business_cep IS NULL OR business_cep ~ '^[0-9]{8}$');
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_address text CHECK (business_address IS NULL OR char_length(business_address) <= 200);

-- A edição de perfil é liberada coluna a coluna (REVOKE UPDATE na fase 0): libera só as novas, como as demais do MEI.
GRANT UPDATE (business_municipio, business_uf, business_im, business_cep, business_address) ON public.profiles TO authenticated;

-- 3. Clientes: endereço do tomador (o emissor pede CEP, logradouro, número, bairro e município). Tudo opcional.
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS cep text CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS address text CHECK (address IS NULL OR char_length(address) <= 120);
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS address_number text CHECK (address_number IS NULL OR char_length(address_number) <= 20);
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS address_complement text CHECK (address_complement IS NULL OR char_length(address_complement) <= 60);
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS neighborhood text CHECK (neighborhood IS NULL OR char_length(neighborhood) <= 80);
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS city text CHECK (city IS NULL OR char_length(city) <= 80);
ALTER TABLE public.mei_clients ADD COLUMN IF NOT EXISTS uf text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');

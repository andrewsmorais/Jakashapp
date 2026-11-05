-- Desfaz o catálogo e os campos da ficha da nota. Atenção: apaga os itens do catálogo e os endereços/dados fiscais já cadastrados.
REVOKE UPDATE (business_municipio, business_uf, business_im, business_cep, business_address) ON public.profiles FROM authenticated;

ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS uf;
ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS city;
ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS neighborhood;
ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS address_complement;
ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS address_number;
ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS address;
ALTER TABLE public.mei_clients DROP COLUMN IF EXISTS cep;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS business_address;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS business_cep;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS business_im;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS business_uf;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS business_municipio;

DROP TABLE IF EXISTS public.mei_items;

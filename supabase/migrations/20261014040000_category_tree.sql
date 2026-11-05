-- Arvore de categorias padrao: novas categorias principais + subcategorias (somente INSERT).

-- 1. Novas categorias principais
INSERT INTO public.categories (name, type, is_default)
SELECT v.name, v.type::public.transaction_type, true
  FROM (VALUES
    ('Pet', 'expense'), ('Viagens', 'expense'), ('Doações', 'expense'),
    ('Dívidas e financiamentos', 'expense'), ('Seguros', 'expense'), ('Negócio', 'expense'),
    ('Vendas e serviços', 'income')
  ) AS v(name, type)
 WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c WHERE c.is_default AND c.parent_id IS NULL AND lower(c.name) = lower(v.name)
 );

-- 2. Subcategorias
INSERT INTO public.categories (name, type, is_default, parent_id)
SELECT s.name, p.type, true, p.id
  FROM (VALUES
    ('Alimentação', 'Supermercado'), ('Alimentação', 'Restaurantes'), ('Alimentação', 'Delivery'), ('Alimentação', 'Padaria e lanches'), ('Alimentação', 'Feira e hortifruti'),
    ('Compras', 'Roupas e calçados'), ('Compras', 'Eletrônicos'), ('Compras', 'Compras online'), ('Compras', 'Presentes'), ('Compras', 'Papelaria e livraria'), ('Compras', 'Cuidados pessoais'),
    ('Educação', 'Escola e faculdade'), ('Educação', 'Cursos'), ('Educação', 'Material escolar'), ('Educação', 'Creche'),
    ('Lazer', 'Cinema, shows e teatro'), ('Lazer', 'Bares e festas'), ('Lazer', 'Esporte e academia'), ('Lazer', 'Jogos e hobbies'),
    ('Moradia', 'Aluguel'), ('Moradia', 'Condomínio'), ('Moradia', 'Energia elétrica'), ('Moradia', 'Água'), ('Moradia', 'Gás'), ('Moradia', 'Internet e TV'), ('Moradia', 'Manutenção e reformas'), ('Moradia', 'IPTU'),
    ('Saúde', 'Consultas'), ('Saúde', 'Exames'), ('Saúde', 'Farmácia'), ('Saúde', 'Plano de saúde'), ('Saúde', 'Dentista'),
    ('Serviços', 'Celular'), ('Serviços', 'Assinaturas e streaming'), ('Serviços', 'Serviços profissionais'),
    ('Taxas/Impostos', 'DAS (MEI)'), ('Taxas/Impostos', 'IPVA'), ('Taxas/Impostos', 'Imposto de renda'), ('Taxas/Impostos', 'Tarifas bancárias'), ('Taxas/Impostos', 'Multas'),
    ('Transporte', 'Combustível'), ('Transporte', 'Transporte público'), ('Transporte', 'Aplicativos de transporte'), ('Transporte', 'Estacionamento e pedágio'), ('Transporte', 'Manutenção do veículo'),
    ('Pet', 'Ração e petiscos'), ('Pet', 'Veterinário'), ('Pet', 'Banho e tosa'),
    ('Viagens', 'Passagens'), ('Viagens', 'Hospedagem'), ('Viagens', 'Passeios e ingressos'),
    ('Dívidas e financiamentos', 'Fatura de cartão'), ('Dívidas e financiamentos', 'Empréstimos'), ('Dívidas e financiamentos', 'Financiamentos'), ('Dívidas e financiamentos', 'Juros e multas'),
    ('Seguros', 'Seguro do veículo'), ('Seguros', 'Seguro de vida'), ('Seguros', 'Seguro residencial'),
    ('Negócio', 'Fornecedores e mercadorias'), ('Negócio', 'Marketing e anúncios'), ('Negócio', 'Ferramentas e sistemas'), ('Negócio', 'Taxas de maquininha'), ('Negócio', 'Frete e entregas'), ('Negócio', 'Contador'),
    ('Rendimentos', 'Juros e dividendos'), ('Rendimentos', 'Aluguéis recebidos'),
    ('Vendas e serviços', 'Venda de produtos'), ('Vendas e serviços', 'Prestação de serviços'), ('Vendas e serviços', 'Comissões')
  ) AS s(parent, name)
  JOIN public.categories p ON p.is_default AND p.parent_id IS NULL AND lower(p.name) = lower(s.parent)
 WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c WHERE c.parent_id = p.id AND lower(c.name) = lower(s.name)
 );

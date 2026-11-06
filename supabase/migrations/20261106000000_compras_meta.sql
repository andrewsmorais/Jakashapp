-- Comprar: meta de gasto da compra e marca dos itens que entraram no carrinho sem estar na lista.
-- Só acrescenta colunas opcionais; nada do que já existe muda.
ALTER TABLE public.shopping_lists ADD COLUMN IF NOT EXISTS budget NUMERIC(12,2) CHECK (budget IS NULL OR budget >= 0);
ALTER TABLE public.shopping_items ADD COLUMN IF NOT EXISTS extra BOOLEAN NOT NULL DEFAULT false;

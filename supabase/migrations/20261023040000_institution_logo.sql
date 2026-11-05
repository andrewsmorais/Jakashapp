-- Imagem do selo escolhida pela pessoa para a conta ou cartão (ícone pequeno, já reduzido no aparelho).
-- Guardada como data URL de imagem (PNG, JPEG ou WebP), até ~45 KB. Sem SVG (evita conteúdo ativo).
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS logo TEXT CHECK (logo IS NULL OR (length(logo) <= 60000 AND logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'));
ALTER TABLE public.credit_cards
    ADD COLUMN IF NOT EXISTS logo TEXT CHECK (logo IS NULL OR (length(logo) <= 60000 AND logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'));

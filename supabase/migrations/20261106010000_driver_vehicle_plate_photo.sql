-- Motorista de app: o carro passa a ser cadastrado só com nome, placa e foto (opcional).
-- Consumo e preço do combustível continuam sendo informados em cada turno.
ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS plate TEXT
    CHECK (plate IS NULL OR plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$');
ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS photo_path TEXT
    CHECK (photo_path IS NULL OR char_length(photo_path) <= 200);
ALTER TABLE public.driver_vehicles ALTER COLUMN efficiency DROP NOT NULL;

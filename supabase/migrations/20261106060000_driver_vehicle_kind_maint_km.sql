-- Motorista de app: tipo do veículo (moto, carro, van, ônibus, caminhão, bicicleta) e, na mecânica,
-- onde a peça foi comprada e o km do veículo na troca. Só colunas novas; nada existente muda.
ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'carro'
  CHECK (kind IN ('moto','carro','van','onibus','caminhao','bicicleta'));
ALTER TABLE public.driver_maintenance ADD COLUMN IF NOT EXISTS bought_at text
  CHECK (bought_at IS NULL OR char_length(bought_at) <= 80);
ALTER TABLE public.driver_maintenance ADD COLUMN IF NOT EXISTS km numeric(10,1)
  CHECK (km IS NULL OR (km >= 0 AND km <= 5000000));

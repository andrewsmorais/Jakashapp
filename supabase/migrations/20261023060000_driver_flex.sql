-- Carro flex: média e preço no etanol (efficiency/fuel_price continuam valendo para a gasolina).
ALTER TABLE public.driver_vehicles
  ADD COLUMN IF NOT EXISTS efficiency_alt numeric(6,2) CHECK (efficiency_alt IS NULL OR (efficiency_alt > 0 AND efficiency_alt <= 100)),
  ADD COLUMN IF NOT EXISTS fuel_price_alt numeric(8,3) CHECK (fuel_price_alt IS NULL OR (fuel_price_alt >= 0 AND fuel_price_alt <= 100));

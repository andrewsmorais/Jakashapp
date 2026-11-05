-- Motorista de app (Turnos): KM inicial e final do hodômetro. km continua sendo os km rodados (final − inicial).
ALTER TABLE public.driver_shifts
  ADD COLUMN IF NOT EXISTS km_start numeric(10,1) CHECK (km_start IS NULL OR (km_start >= 0 AND km_start <= 9999999)),
  ADD COLUMN IF NOT EXISTS km_end numeric(10,1) CHECK (km_end IS NULL OR (km_end >= 0 AND km_end <= 9999999));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_shifts_km_order') THEN
    ALTER TABLE public.driver_shifts ADD CONSTRAINT driver_shifts_km_order
      CHECK (km_start IS NULL OR km_end IS NULL OR km_end >= km_start);
  END IF;
END $$;

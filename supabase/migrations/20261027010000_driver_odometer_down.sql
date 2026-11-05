ALTER TABLE public.driver_shifts DROP CONSTRAINT IF EXISTS driver_shifts_km_order;
ALTER TABLE public.driver_shifts DROP COLUMN IF EXISTS km_end, DROP COLUMN IF EXISTS km_start;

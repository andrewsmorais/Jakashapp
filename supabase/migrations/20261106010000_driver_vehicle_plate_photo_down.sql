UPDATE public.driver_vehicles SET efficiency = 10 WHERE efficiency IS NULL;
ALTER TABLE public.driver_vehicles ALTER COLUMN efficiency SET NOT NULL;
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS photo_path;
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS plate;

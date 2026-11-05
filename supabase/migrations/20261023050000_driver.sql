-- Motorista de app: carros e dias de trabalho (ganhos por plataforma, km, horas e gastos).
-- Cada pessoa vê e edita só os próprios registros.
CREATE TABLE IF NOT EXISTS public.driver_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  fuel text NOT NULL DEFAULT 'gasolina' CHECK (fuel IN ('gasolina','etanol','flex','diesel','gnv','eletrico')),
  efficiency numeric(6,2) NOT NULL CHECK (efficiency > 0 AND efficiency <= 100),
  fuel_price numeric(8,3) NOT NULL DEFAULT 0 CHECK (fuel_price >= 0 AND fuel_price <= 100),
  cost_per_km numeric(8,3) NOT NULL DEFAULT 0 CHECK (cost_per_km >= 0 AND cost_per_km <= 100),
  daily_rent numeric(10,2) NOT NULL DEFAULT 0 CHECK (daily_rent >= 0 AND daily_rent <= 10000),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.driver_vehicles(id) ON DELETE SET NULL,
  date date NOT NULL,
  start_time time,
  end_time time,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 1440),
  km numeric(8,1) NOT NULL DEFAULT 0 CHECK (km >= 0 AND km <= 3000),
  -- Dados do carro copiados no dia (mudar o preço do combustível depois não muda os dias antigos).
  fuel text CHECK (fuel IS NULL OR fuel IN ('gasolina','etanol','flex','diesel','gnv','eletrico')),
  efficiency numeric(6,2) CHECK (efficiency IS NULL OR (efficiency > 0 AND efficiency <= 100)),
  fuel_price numeric(8,3) CHECK (fuel_price IS NULL OR (fuel_price >= 0 AND fuel_price <= 100)),
  cost_per_km numeric(8,3) NOT NULL DEFAULT 0 CHECK (cost_per_km >= 0 AND cost_per_km <= 100),
  rent numeric(10,2) NOT NULL DEFAULT 0 CHECK (rent >= 0 AND rent <= 10000),
  -- [{ "platform": "uber", "amount": 180.5, "hours": 4, "trips": 12 }, ...]
  earnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(earnings) = 'array' AND jsonb_array_length(earnings) <= 20 AND pg_column_size(earnings) <= 8000),
  tips numeric(10,2) NOT NULL DEFAULT 0 CHECK (tips >= 0 AND tips <= 100000),
  tolls numeric(10,2) NOT NULL DEFAULT 0 CHECK (tolls >= 0 AND tolls <= 100000),
  parking numeric(10,2) NOT NULL DEFAULT 0 CHECK (parking >= 0 AND parking <= 100000),
  wash numeric(10,2) NOT NULL DEFAULT 0 CHECK (wash >= 0 AND wash <= 100000),
  food numeric(10,2) NOT NULL DEFAULT 0 CHECK (food >= 0 AND food <= 100000),
  other_cost numeric(10,2) NOT NULL DEFAULT 0 CHECK (other_cost >= 0 AND other_cost <= 100000),
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  income_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  expense_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_shifts_user_date_idx ON public.driver_shifts (user_id, date DESC);
CREATE INDEX IF NOT EXISTS driver_vehicles_user_idx ON public.driver_vehicles (user_id);

ALTER TABLE public.driver_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_shifts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Próprios carros' AND polrelid = 'public.driver_vehicles'::regclass) THEN
    CREATE POLICY "Próprios carros" ON public.driver_vehicles FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Próprios dias de trabalho' AND polrelid = 'public.driver_shifts'::regclass) THEN
    CREATE POLICY "Próprios dias de trabalho" ON public.driver_shifts FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id AND (vehicle_id IS NULL OR EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE v.id = vehicle_id AND v.user_id = auth.uid())));
  END IF;
END $$;

REVOKE ALL ON public.driver_vehicles, public.driver_shifts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_vehicles, public.driver_shifts TO authenticated;

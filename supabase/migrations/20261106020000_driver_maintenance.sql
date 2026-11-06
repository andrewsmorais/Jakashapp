-- Motorista de app: gastos com mecânica do veículo (oficina, peça, mão de obra). Tabela nova; nada existente muda.
CREATE TABLE IF NOT EXISTS public.driver_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.driver_vehicles(id) ON DELETE SET NULL,
  date date NOT NULL,
  shop text CHECK (shop IS NULL OR char_length(shop) <= 80),
  part text NOT NULL CHECK (char_length(btrim(part)) BETWEEN 1 AND 120),
  part_cost numeric(10,2) NOT NULL DEFAULT 0 CHECK (part_cost >= 0 AND part_cost <= 1000000),
  labor_cost numeric(10,2) NOT NULL DEFAULT 0 CHECK (labor_cost >= 0 AND labor_cost <= 1000000),
  tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (part_cost + labor_cost > 0)
);
CREATE INDEX IF NOT EXISTS idx_driver_maintenance_user_date ON public.driver_maintenance (user_id, date DESC);
ALTER TABLE public.driver_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso aos proprios gastos de mecanica" ON public.driver_maintenance FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (vehicle_id IS NULL OR EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE v.id = vehicle_id AND v.user_id = (SELECT auth.uid()))));
REVOKE ALL ON public.driver_maintenance FROM anon;

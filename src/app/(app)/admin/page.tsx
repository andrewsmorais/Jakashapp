"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote, CircleDollarSign, Percent, Receipt, TrendingDown, TrendingUp, UserMinus, UserPlus, Users, Wallet } from "lucide-react";
import { BackTitle, Card, Empty, ErrorNote } from "@/components/ui/page";
import { KpiCard } from "@/components/admin/KpiCard";
import { CustomersChart, RevenueChart } from "@/components/admin/AdminCharts";
import { CostsForm } from "@/components/admin/CostsForm";
import { SyncBar } from "@/components/admin/SyncBar";
import { PeriodPicker } from "@/components/admin/PeriodPicker";
import { brl } from "@/lib/format";
import type { CostRow, Dashboard } from "@/lib/adminMetrics";

const pct = (cur: number, prev: number | undefined): number | null =>
  prev === undefined || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Dashboard | null>(null);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Default to this month if no params
  const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const defaultTo = new Date().toISOString().split("T")[0];
  const from = searchParams?.get("from") || defaultFrom;
  const to = searchParams?.get("to") || defaultTo;

  const load = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/metrics?from=${fromDate}&to=${toDate}`, { cache: "no-store" });
    if (res.status === 404 || res.status === 401) { router.replace("/menu"); return; }
    if (!res.ok) { setError("Não foi possível carregar as métricas."); setLoading(false); return; }
    const d = (await res.json()) as Dashboard;
    setData(d);
    setCosts(d.costs);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(from, to); }, [from, to, load]);

  const handlePeriodChange = (newFrom: string, newTo: string) => {
    router.push(`?from=${newFrom}&to=${newTo}`);
  };

  if (loading) return <div className="max-w-5xl mx-auto"><Empty>Carregando…</Empty></div>;

  const cur = data?.current;
  const prev = data?.previous ?? undefined;

  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-6">
      <BackTitle title="Painel do dono" subtitle="Métricas do Jakash. Só você vê esta página." />
      <ErrorNote message={error} />

      {data && cur && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <SyncBar sync={data.sync} onDone={() => { load(from, to); }} />
            </div>
            <div className="flex-1">
              <PeriodPicker from={from} to={to} onApply={handlePeriodChange} />
            </div>
          </div>

          <div className="text-sm text-gray-500">
            Período: <b className="text-gray-900 dark:text-white">{from}</b> até <b className="text-gray-900 dark:text-white">{to}</b> ({data.days} dias) · Anterior: {data.previous.revenue > 0 ? brl(data.previous.revenue) : "—"}
          </div>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={Users} label="Clientes pagantes (agora)" value={String(data.paying)} hint={`${data.trial} em teste · ${data.pastDue} em atraso`} />
            <KpiCard icon={Banknote} label={`Vendido ${data.grain === 'day' && data.days === 1 ? 'hoje' : 'no período'}`} value={brl(cur.revenue)} delta={pct(cur.revenue, prev?.revenue)} hint={`${cur.payments} pagamento(s)`} />
            <KpiCard icon={CircleDollarSign} label="MRR (agora)" value={brl(data.mrr)} hint={`ARR ${brl(data.arr)}`} />
            <KpiCard icon={UserMinus} label={`Desistências ${data.grain === 'day' && data.days === 1 ? 'hoje' : 'no período'}`} value={String(cur.churned)} delta={pct(cur.churned, prev?.churned)} invert hint={`churn ≈ ${data.churnRate.toFixed(1)}%`} />
            <KpiCard icon={UserPlus} label={`Novos clientes ${data.grain === 'day' && data.days === 1 ? 'hoje' : 'no período'}`} value={String(cur.new_customers)} delta={pct(cur.new_customers, prev?.new_customers)} hint={`${cur.payers ?? 0} pagantes no período`} />
            <KpiCard icon={Wallet} label="Custo operacional" value={brl(cur.operatingCost)} hint={cur.fees_known > 0 ? `${cur.fees_known} com taxa conhecida` : "—"} />
            <KpiCard icon={TrendingUp} label="Lucro bruto" value={brl(cur.grossProfit)} delta={pct(cur.grossProfit, prev?.grossProfit)} />
            <KpiCard icon={cur.netProfit >= 0 ? Receipt : TrendingDown} label="Lucro líquido" value={brl(cur.netProfit)} delta={pct(cur.netProfit, prev?.netProfit)} />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h2 className="font-extrabold text-lg mb-3">Vendas por {data.grain === 'day' ? 'dia' : 'mês'}</h2>
              <RevenueChart series={data.series} grain={data.grain} />
            </Card>
            <Card>
              <h2 className="font-extrabold text-lg mb-3">Novos clientes x cancelamentos por {data.grain === 'day' ? 'dia' : 'mês'}</h2>
              <CustomersChart series={data.series} grain={data.grain} />
            </Card>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h2 className="font-extrabold text-lg mb-3">Assinantes por plano</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-white/5">
                    <th className="py-2 font-bold">Plano</th>
                    <th className="py-2 font-bold text-right">Pagantes</th>
                    <th className="py-2 font-bold text-right">Em teste</th>
                    <th className="py-2 font-bold text-right">Vendido no período</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {data.byPlan.map((p) => (
                    <tr key={p.plan}>
                      <td className="py-2.5 font-bold">{p.label}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.subscribers}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.trial}</td>
                      <td className="py-2.5 text-right tabular-nums">{brl(p.revenuePeriod)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-2">Pagantes = assinatura ativa ou em atraso. {data.canceled > 0 && `${data.canceled} cancelada(s) no total.`}</p>
              <p className="text-xs text-gray-500 mt-3">
                Ticket médio {brl(data.arpu)}/cliente · LTV estimado {data.ltv === null ? "— (sem cancelamentos)" : brl(data.ltv)}
              </p>
            </Card>

            <Card>
              <h2 className="font-extrabold text-lg mb-3 flex items-center gap-2"><Percent size={18} /> Como o lucro é calculado</h2>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
                <li><b>Vendido</b> = pagamentos confirmados no mês (Asaas).</li>
                <li><b>Lucro bruto</b> = vendido − reembolsos − taxas do Asaas (reais, vindas da API), Vercel, Supabase e IA.</li>
                <li><b>Custo operacional</b> = todos os custos lançados, menos impostos.</li>
                <li><b>Lucro líquido</b> = lucro bruto − domínio, outros e impostos.</li>
              </ul>
              <p className="text-xs text-gray-500 mt-3">
                Vendas e cancelamentos contam a partir de agora (quando o painel passou a registrar os eventos do Asaas). O que você lança em &ldquo;Custos&rdquo; vem de você, não é automático.
              </p>
            </Card>
          </section>

          <CostsForm costs={costs} onSaved={() => load(from, to)} />
        </>
      )}
    </div>
  );
}

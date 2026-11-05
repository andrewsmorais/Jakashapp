"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, todayISO } from "@/lib/format";
import { ACTIVITY_LABEL, KIND_LABEL, EMPTY_SUMMARY, dasnTotals, monthlySeries, toSummary, type MeiActivity, type RevenueKind, type YearSummary } from "@/lib/mei";
import { dasnCsv, downloadText, type DasnRow } from "@/lib/meiExport";
import { BackTitle, Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

type Prof = { full_name: string | null; business_name: string | null; business_cnpj: string | null; mei_activity: MeiActivity };
type TxRow = { id: string; date: string; description: string; amount: number | string; revenue_kind: RevenueKind | null; client_id: string | null };

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// A DASN-SIMEI do ano anterior vence em 31/05: até lá o padrão é o ano passado.
function defaultYear(today: string): number {
  const y = Number(today.slice(0, 4));
  return today.slice(5, 10) <= "05-31" ? y - 1 : y;
}

export default function DasnPage() {
  const { supabase, userId, ready } = useSupabase();
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(defaultYear(today));
  const [prof, setProf] = useState<Prof | null>(null);
  const [summary, setSummary] = useState<YearSummary>(EMPTY_SUMMARY);
  const [monthly, setMonthly] = useState<number[]>(Array(12).fill(0));
  const [rows, setRows] = useState<DasnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, m, t, c] = await Promise.all([
      supabase.from("profiles").select("full_name,business_name,business_cnpj,mei_activity").eq("id", userId!).maybeSingle(),
      supabase.rpc("mei_year_summary", { p_year: year }),
      supabase.rpc("mei_monthly", { p_year: year }),
      supabase.from("transactions").select("id,date,description,amount,revenue_kind,client_id").eq("user_id", userId!).eq("is_business", true).eq("type", "income")
        .gte("date", `${year}-01-01`).lt("date", `${year + 1}-01-01`).order("date").limit(5000),
      supabase.from("mei_clients").select("id,name"),
    ]);
    if (p.error || s.error || m.error || t.error) setError("Não foi possível carregar os dados da DASN.");
    else setError(null);
    const profile = p.data as Prof | null;
    setProf(profile);
    const sum = toSummary(((s.data ?? []) as Partial<Record<keyof YearSummary, number | string>>[])[0]);
    setSummary(sum);
    setMonthly(monthlySeries((m.data ?? []) as { month: number; revenue: number; expenses: number }[]).revenue);
    const names = new Map(((c.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
    const fallback: RevenueKind = profile?.mei_activity ?? "servicos";
    setRows(((t.data ?? []) as TxRow[]).map((r) => ({
      date: r.date, description: r.description, amount: Number(r.amount), kind: r.revenue_kind ?? fallback, client: r.client_id ? names.get(r.client_id) ?? "" : "",
    })));
    setLoading(false);
  }, [supabase, userId, year]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);

  const totals = dasnTotals(summary);
  const money = (n: number) => n.toFixed(2).replace(".", ",");

  async function copy(key: string, value: number) {
    try { await navigator.clipboard.writeText(money(value)); setCopied(key); setTimeout(() => setCopied(null), 1800); }
    catch { setError("Não consegui copiar. Selecione o valor e copie manualmente."); }
  }

  const field = (key: string, label: string, value: number) => (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-extrabold">{brl(value)}</p>
      </div>
      <button type="button" className={btnGhostCls + " !py-2 !px-3 print:hidden"} onClick={() => copy(key, value)} aria-label={`Copiar ${label}`}>
        {copied === key ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <div className="print:hidden">
        <BackTitle title="DASN-SIMEI pronta" subtitle="A receita do ano já separada como a declaração pede, com CSV e PDF para o contador." href="/mei" />
      </div>
      <ErrorNote message={error} />

      <Card className="print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Ano-base</Label>
            <select className={inputCls + " !w-auto"} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano-base">
              {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="button" className={btnCls} onClick={() => downloadText(`dasn-${year}.csv`, dasnCsv(year, rows, summary))} disabled={loading || rows.length === 0}>
            <Download size={16} /> Baixar CSV
          </button>
          <button type="button" className={btnGhostCls + " !py-2.5 !px-4"} onClick={() => window.print()} disabled={loading}>
            <Printer size={14} /> Imprimir ou salvar PDF
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          A declaração do ano-base {year} vence em 31/05/{year + 1} e é obrigatória mesmo sem faturamento. Receitas sem tipo definido usam a atividade principal
          do seu perfil ({ACTIVITY_LABEL[prof?.mei_activity ?? "servicos"]}). Para separar, escolha o tipo ao lançar a receita da empresa.
        </p>
      </Card>

      {loading ? <Empty>Carregando…</Empty> : (
        <article className="space-y-6">
          <Card>
            <h2 className="font-extrabold text-lg">Valores para a declaração de {year}</h2>
            <p className="text-sm text-gray-500 mt-0.5 mb-4">{prof?.business_name || prof?.full_name || "Sua empresa"}{prof?.business_cnpj ? ` · CNPJ ${prof.business_cnpj}` : ""}</p>
            <div className="space-y-3">
              {field("goods", "Receita bruta total do comércio e da indústria", totals.goods)}
              {field("services", "Receita bruta total da prestação de serviços", totals.services)}
              {field("total", "Total da receita bruta do ano", totals.total)}
            </div>
            <p className="text-xs text-gray-400 mt-3">Informe também na declaração se teve empregado contratado. Confira os valores com seu contador antes de transmitir.</p>
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg mb-2">Mês a mês</h2>
            <table className="w-full text-sm">
              <tbody>
                {monthly.map((v, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-[#262626] first:border-0">
                    <td className="py-1.5 pr-3 text-gray-500">{MONTHS[i]}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{brl(v)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 dark:border-[#333] font-extrabold">
                  <td className="py-2">Total</td><td className="py-2 text-right whitespace-nowrap">{brl(totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg mb-1">Receitas lançadas</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Nenhuma receita da empresa em {year}. Marque as receitas como “da empresa” no lançamento para que entrem aqui.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
                {rows.map((r, i) => (
                  <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{r.description}</p>
                      <p className="text-xs text-gray-500">{formatDateBR(r.date)}{r.client ? ` · ${r.client}` : ""} · {r.kind === "servicos" ? "Serviços" : r.kind === "comercio" ? "Comércio" : "Indústria"}</p>
                    </div>
                    <span className="font-bold text-sm whitespace-nowrap shrink-0 text-emerald-600">{brl(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-[10px] text-gray-400">
            Gerado pelo Jakash em {formatDateBR(today)} com base nos lançamentos marcados como da empresa. Tipos: {Object.values(KIND_LABEL).join("; ")}. Não é documento
            emitido pela Receita Federal.
          </p>
        </article>
      )}
    </div>
  );
}

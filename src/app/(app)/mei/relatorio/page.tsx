"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, monthLabel, monthRange, todayISO } from "@/lib/format";
import { ACTIVITY_LABEL, reportMonthFor, type MeiActivity, type RevenueKind } from "@/lib/mei";
import { BackTitle, Empty, btnCls } from "@/components/ui/page";

type Row = { id: string; date: string; description: string; amount: number; revenue_kind: RevenueKind | null };
type Prof = { full_name: string | null; business_name: string | null; business_cnpj: string | null; mei_activity: MeiActivity };

// Relatório mensal de receitas brutas, pronto para imprimir ou salvar em PDF.
// É um modelo próprio do Jakash, inspirado no relatório oficial do MEI: confira com seu contador antes de usar como comprovação.
function Report() {
  const params = useSearchParams();
  const { supabase, userId, ready } = useSupabase();
  const raw = params.get("m") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : reportMonthFor(todayISO().slice(0, 7));
  const [prof, setProf] = useState<Prof | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;
    const { start, end } = monthRange(month);
    Promise.all([
      supabase.from("profiles").select("full_name,business_name,business_cnpj,mei_activity").eq("id", userId).maybeSingle(),
      supabase.from("transactions").select("id,date,description,amount,revenue_kind").eq("user_id", userId).eq("is_business", true).eq("type", "income")
        .gte("date", start).lt("date", end).order("date").limit(2000),
    ]).then(([p, t]) => {
      setFailed(Boolean(p.error || t.error));
      setProf(p.data as Prof | null);
      setRows(((t.data ?? []) as Row[]).map((r) => ({ ...r, amount: Number(r.amount) })));
      setLoading(false);
    });
  }, [ready, userId, supabase, month]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const activity = prof?.mei_activity ?? "servicos";
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  // Receita sem tipo usa a atividade principal; com tipo definido no lançamento, cada linha soma o seu.
  const sumKind = (kind: RevenueKind) => rows.filter((r) => (r.revenue_kind ?? activity) === kind).reduce((s, r) => s + r.amount, 0);
  const line = (label: string, kind: RevenueKind) => (
    <tr><td className="border border-gray-400 px-3 py-2">{label}</td><td className="border border-gray-400 px-3 py-2 text-right whitespace-nowrap w-40">{brl(sumKind(kind))}</td></tr>
  );

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="print:hidden">
        <BackTitle title="Relatório mensal de receitas brutas" subtitle="Use o botão abaixo e escolha “Salvar como PDF” na janela de impressão." href="/mei" />
        <button type="button" className={btnCls + " mb-5"} onClick={() => window.print()}><Printer size={16} /> Imprimir ou salvar PDF</button>
      </div>

      {loading ? <Empty>Carregando…</Empty> : failed ? <Empty>Não foi possível carregar o relatório.</Empty> : (
        <article className="bg-white text-black rounded-2xl p-6 md:p-8 shadow-sm print:shadow-none print:rounded-none print:p-0 text-sm leading-relaxed">
          <h1 className="text-center text-lg font-extrabold uppercase">Relatório mensal das receitas brutas</h1>
          <p className="text-center text-xs text-gray-600 mt-1">Microempreendedor Individual (MEI)</p>

          <table className="w-full mt-5 border-collapse">
            <tbody>
              <tr><td className="border border-gray-400 px-3 py-2 w-48 font-bold">CNPJ</td><td className="border border-gray-400 px-3 py-2">{prof?.business_cnpj || "—"}</td></tr>
              <tr><td className="border border-gray-400 px-3 py-2 font-bold">Empresário individual</td><td className="border border-gray-400 px-3 py-2">{prof?.full_name || "—"}</td></tr>
              <tr><td className="border border-gray-400 px-3 py-2 font-bold">Nome empresarial</td><td className="border border-gray-400 px-3 py-2">{prof?.business_name || "—"}</td></tr>
              <tr><td className="border border-gray-400 px-3 py-2 font-bold">Atividade</td><td className="border border-gray-400 px-3 py-2">{ACTIVITY_LABEL[activity]}</td></tr>
              <tr><td className="border border-gray-400 px-3 py-2 font-bold">Período de apuração</td><td className="border border-gray-400 px-3 py-2">01/{String(m).padStart(2, "0")}/{y} a {lastDay}/{String(m).padStart(2, "0")}/{y} ({monthLabel(month)})</td></tr>
            </tbody>
          </table>

          <h2 className="font-extrabold mt-6 mb-2">Receita bruta do mês</h2>
          <table className="w-full border-collapse">
            <tbody>
              {line("I – Revenda de mercadorias (comércio)", "comercio")}
              {line("II – Venda de produtos industrializados (indústria)", "industria")}
              {line("III – Prestação de serviços", "servicos")}
              <tr className="font-extrabold"><td className="border border-gray-400 px-3 py-2">IV – Total das receitas brutas (I + II + III)</td><td className="border border-gray-400 px-3 py-2 text-right whitespace-nowrap">{brl(total)}</td></tr>
            </tbody>
          </table>

          <h2 className="font-extrabold mt-6 mb-2">Receitas lançadas</h2>
          {rows.length === 0 ? (
            <p className="text-gray-600">Nenhuma receita da empresa lançada neste mês. Marque as receitas como “da empresa” para que apareçam aqui.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead><tr className="bg-gray-100 text-left"><th className="border border-gray-400 px-3 py-1.5 w-28">Data</th><th className="border border-gray-400 px-3 py-1.5">Descrição</th><th className="border border-gray-400 px-3 py-1.5 text-right w-36">Valor</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}><td className="border border-gray-400 px-3 py-1.5 whitespace-nowrap">{formatDateBR(r.date)}</td><td className="border border-gray-400 px-3 py-1.5">{r.description}</td><td className="border border-gray-400 px-3 py-1.5 text-right whitespace-nowrap">{brl(r.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mt-6 text-xs text-gray-600">Guarde junto a este relatório as notas fiscais de compras e de serviços prestados e tomados no período.</p>

          <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
            <div className="border-t border-black pt-1">Local e data</div>
            <div className="border-t border-black pt-1">Assinatura do empresário</div>
          </div>
          <p className="mt-8 text-[10px] text-gray-500">Gerado pelo Jakash em {formatDateBR(todayISO())} com base nos lançamentos marcados como da empresa. Modelo próprio, inspirado no relatório oficial do MEI; não é documento emitido pela Receita Federal.</p>
        </article>
      )}
    </div>
  );
}

export default function RelatorioPage() {
  return (
    <Suspense fallback={<Empty>Carregando…</Empty>}>
      <Report />
    </Suspense>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney, currentMonth, monthRange, shiftMonth, monthProgress } from "@/lib/format";
import { rootId, type CatRow } from "@/lib/categories";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";
import { BackTitle, Card, Label, MonthNav, Progress, Empty, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

type Budget = { id: string; category_id: string | null; amount_limit: number };
type Tx = { amount: number; type: "income" | "expense"; date: string; category_id: string | null };

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function LimitesPage() {
  const { supabase, userId, ready } = useSupabase();
  const [month, setMonth] = useState(currentMonth());
  const [cats, setCats] = useState<CatRow[]>([]);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ category_id: string; amount: string } | null>(null);

  const load = useCallback(async () => {
    const from = monthRange(shiftMonth(month, -2)).start;
    const to = monthRange(shiftMonth(month, 2)).end;
    const [c, b, t] = await Promise.all([
      loadCategoryState(supabase, userId),
      supabase.from("budgets").select("id,category_id,amount_limit"),
      supabase.from("transactions").select("amount,type,date,category_id").gte("date", from).lt("date", to).limit(5000),
    ]);
    if (c.error || b.error || t.error) { setError("Não foi possível carregar os dados."); return; }
    setError(null);
    setCats(c.cats.filter((x) => x.type === "expense"));
    setHiddenCats(c.hidden);
    setBudgets(((b.data ?? []) as Budget[]).map((x) => ({ ...x, amount_limit: Number(x.amount_limit) })));
    setTxs(((t.data ?? []) as Tx[]).map((x) => ({ ...x, amount: Number(x.amount) })));
  }, [supabase, month, userId]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  // Na escolha, só as categorias à mostra (e as que já têm limite).
  const parents = useMemo(() => visibleCats(cats, hiddenCats, budgets.map((b) => b.category_id)).filter((c) => !c.parent_id), [cats, hiddenCats, budgets]);
  const general = budgets.find((b) => !b.category_id);
  const catBudgets = budgets.filter((b) => b.category_id);
  const limitTotal = general?.amount_limit ?? catBudgets.reduce((s, b) => s + b.amount_limit, 0);

  const inMonth = (m: string) => { const { start, end } = monthRange(m); return txs.filter((t) => t.date >= start && t.date < end); };
  const spentOf = (m: string) => inMonth(m).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const spent = spentOf(month);
  const income = inMonth(month).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

  const spentByRoot = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of inMonth(month)) {
      if (t.type !== "expense") continue;
      const r = rootId(cats, t.category_id) ?? "none";
      m[r] = (m[r] ?? 0) + t.amount;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, cats, month]);

  const chart = [-2, -1, 0, 1, 2].map((d) => {
    const m = shiftMonth(month, d);
    return { name: MONTH_SHORT[Number(m.split("-")[1]) - 1], gastos: Math.round(spentOf(m) * 100) / 100, limite: limitTotal };
  });

  const remaining = limitTotal - spent;
  const pct = limitTotal > 0 ? (spent / limitTotal) * 100 : 0;
  const tone = pct >= 100 ? "bad" : pct >= 80 ? "warn" : "ok";
  const planSaving = income > 0 ? income - limitTotal : null;
  const isPastMonth = month < currentMonth();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const v = parseMoney(editing.amount);
    if (!(v > 0)) { setError("Informe um valor maior que zero."); return; }
    const category_id = editing.category_id || null;
    const existing = budgets.find((b) => b.category_id === category_id);
    const { error: err } = existing
      ? await supabase.from("budgets").update({ amount_limit: v }).eq("id", existing.id)
      : await supabase.from("budgets").insert({ user_id: userId, category_id, amount_limit: v });
    if (err) { setError("Não foi possível salvar o limite."); return; }
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    const { error: err } = await supabase.from("budgets").delete().eq("id", id);
    if (err) setError("Não foi possível excluir."); else load();
  }

  const rows = catBudgets.map((b) => {
    const used = spentByRoot[b.category_id as string] ?? 0;
    return { ...b, used, pct: (used / b.amount_limit) * 100, name: cats.find((c) => c.id === b.category_id)?.name ?? "Categoria" };
  }).sort((a, b) => b.pct - a.pct);

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <BackTitle title="Limites de gastos" subtitle="Acompanhe seus gastos e planeje os limites do mês." />
      <SectionTabs group="orcamento" />
      <div className="mb-4"><MonthNav month={month} onChange={setMonth} /></div>
      <ErrorNote message={error} />

      {/* Visão de 5 meses */}
      <Card className="mb-4">
        <div className="h-44 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#94A3B8" }} />
              <YAxis hide />
              <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ borderRadius: 12 }} />
              <Bar dataKey="gastos" name="Gastos" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
              {limitTotal > 0 && <Line dataKey="limite" name="Limite" stroke="#F97316" strokeDasharray="5 5" dot={false} strokeWidth={2} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center mt-2">
          {limitTotal > 0 ? (
            <>
              <p className="text-xs text-gray-500">{remaining >= 0 ? (isPastMonth ? "Sobrou" : "Você ainda pode gastar") : "Você passou do limite em"}</p>
              <p className={`text-3xl font-extrabold ${remaining < 0 ? "text-red-500" : ""}`}>{brl(Math.abs(remaining))}</p>
              <p className="text-xs text-gray-500">do limite de {brl(limitTotal)} deste mês · Total gasto: {brl(spent)}</p>
            </>
          ) : <p className="text-sm text-gray-500">Defina um limite mensal para acompanhar quanto ainda pode gastar.</p>}
        </div>
      </Card>

      {/* Planejado */}
      <Card className="mb-4">
        <p className="font-extrabold mb-4">Gastos planejados</p>
        <div className="flex justify-center my-2">
          <div className="relative w-44 h-44 rounded-full flex items-center justify-center"
            style={{ background: `conic-gradient(${pct >= 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : "#8B5CF6"} ${Math.min(pct, 100) * 3.6}deg, rgba(148,163,184,0.2) 0deg)` }}>
            <div className="w-32 h-32 rounded-full bg-white dark:bg-[#161616] flex flex-col items-center justify-center text-center">
              <span className="text-[11px] text-gray-500">Gasto total</span>
              <span className="text-lg font-extrabold">{brl(spent)}</span>
              <span className="text-[11px] text-gray-500">/ {brl(limitTotal)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-[#262626]">
          <div><p className="text-xs text-gray-500">Gastos planejados</p><p className="text-xl font-extrabold">{brl(limitTotal)}</p></div>
          <button onClick={() => setEditing({ category_id: "", amount: general ? String(general.amount_limit).replace(".", ",") : "" })} aria-label="Editar limite geral" className={btnGhostCls + " !w-10 !h-10 !p-0"}><Pencil size={16} /></button>
        </div>
        {!general && catBudgets.length > 0 && <p className="text-xs text-gray-400 mt-2">Somando os limites das categorias. Defina um limite geral para sobrepor.</p>}
      </Card>

      <Card className="mb-4">
        <dl className="space-y-3 text-sm">
          {[
            ["Receita do mês", brl(income)],
            ["Gastos planejados", brl(limitTotal)],
            ["Gastos realizados", brl(spent)],
            ["Restante do planejado", brl(Math.max(remaining, 0))],
          ].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-gray-500">{k}</dt><dd className="font-extrabold">{v}</dd></div>)}
          <div className="flex justify-between"><dt className="text-gray-500">Economia planejada</dt><dd className="font-extrabold">{planSaving === null ? <span className="text-gray-400 font-medium">Sem receita recebida</span> : brl(planSaving)}</dd></div>
        </dl>
        <div className="relative mt-6">
          {month === currentMonth() && (
            <div className="absolute -top-5 text-[10px] font-bold" style={{ left: `${monthProgress(month) * 100}%`, transform: "translateX(-50%)" }}>
              <span className="rounded-full border border-gray-200 dark:border-white/10 px-2 py-0.5 bg-white dark:bg-[#161616]">Hoje</span>
            </div>
          )}
          <Progress value={pct} tone={tone} />
        </div>
        <div className="flex justify-between text-sm mt-2"><span>Limite usado</span><span className="font-bold">{Math.round(pct)}%</span></div>
      </Card>

      {/* Por categoria */}
      <div className="flex items-center justify-between mb-3 mt-6">
        <p className="font-extrabold">Limites por categoria</p>
        <button onClick={() => setEditing({ category_id: "", amount: "" })} className={btnGhostCls}><PlusCircle size={14} /> Adicionar</button>
      </div>
      {rows.length === 0 ? (
        <Card className="border-dashed text-center">
          <Empty>Nenhuma categoria com limite ativo. Defina quanto quer gastar em cada uma.</Empty>
          <button onClick={() => setEditing({ category_id: "", amount: "" })} className={btnCls}><PlusCircle size={16} /> Adicionar limite de gastos</button>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="!p-4">
              <div className="flex items-center justify-between mb-2">
                <div><p className="font-bold">{r.name}</p><p className="text-xs text-gray-500">{brl(r.used)} de {brl(r.amount_limit)} · {Math.round(r.pct)}%</p></div>
                <span className="flex gap-3 text-gray-400">
                  <button aria-label="Editar" onClick={() => setEditing({ category_id: r.category_id as string, amount: String(r.amount_limit).replace(".", ",") })}><Pencil size={15} /></button>
                  <button aria-label="Excluir" onClick={() => remove(r.id)} className="hover:text-red-500"><Trash2 size={15} /></button>
                </span>
              </div>
              <Progress value={r.pct} tone={r.pct >= 100 ? "bad" : r.pct >= 80 ? "warn" : "ok"} />
              {r.pct >= 100 && <p className="text-xs text-red-500 font-bold mt-2">Limite estourado em {brl(r.used - r.amount_limit)}.</p>}
              {r.pct >= 80 && r.pct < 100 && <p className="text-xs text-amber-600 font-bold mt-2">Atenção: restam {brl(r.amount_limit - r.used)}.</p>}
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-6">Os limites valem para todos os meses até você mudar. Subcategorias contam na categoria principal.</p>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
            <h2 className="text-xl font-extrabold">Limite de gastos</h2>
            <div><Label>Categoria</Label>
              <select className={inputCls} value={editing.category_id} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                <option value="">Limite geral do mês</option>
                {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><Label>Limite mensal</Label><input autoFocus className={inputCls} inputMode="decimal" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} placeholder="0,00" /></div>
            <ErrorNote message={error} />
            <div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button><button className={btnCls + " flex-1"} type="submit">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

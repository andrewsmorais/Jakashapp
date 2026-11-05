"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CloudOff, ShoppingCart, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useCards } from "@/lib/useCards";
import { useUsageType } from "@/lib/useUsageType";
import { useHideValues } from "@/lib/useHideValues";
import { brl, monthRange, parseMoney, todayISO } from "@/lib/format";
import { invoiceMonthFor } from "@/lib/cards";
import { rootId, type CatRow } from "@/lib/categories";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";
import { budgetLeft, listTotals, parseShoppingInput, quantityLabel, suggestNames, type ShopItem } from "@/lib/shopping";
import { BackTitle, Card, Empty, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type ListRow = { id: string; user_id: string; name: string; is_business: boolean; created_at: string };
type Acc = { id: string; name: string };
type Op = { v: number; insert?: ShopItem; patch?: Partial<ShopItem>; del?: boolean };

const RETRY_MS = 4000;

export default function ComprarPage() {
  const { supabase, userId, ready } = useSupabase();
  const { cards } = useCards();
  const { isMei } = useUsageType();
  const { money } = useHideValues();
  const [scope, setScope] = useState<"pessoal" | "empresa">("pessoal");
  const [list, setList] = useState<ListRow | null>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(0); // alterações ainda não salvas (sinal fraco)
  const [cats, setCats] = useState<CatRow[]>([]);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [accs, setAccs] = useState<Acc[]>([]);
  const [foodLimit, setFoodLimit] = useState<number | null>(null);
  const [foodSpent, setFoodSpent] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const ops = useRef(new Map<string, Op>());
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const [id, op] of Array.from(ops.current.entries())) {
        const v = op.v;
        let err: unknown = null;
        if (op.del) ({ error: err } = await supabase.from("shopping_items").delete().eq("id", id));
        else if (op.insert) ({ error: err } = await supabase.from("shopping_items").upsert({ ...op.insert, ...(op.patch ?? {}) }, { onConflict: "id" }));
        else if (op.patch) ({ error: err } = await supabase.from("shopping_items").update(op.patch).eq("id", id));
        if (!err && ops.current.get(id)?.v === v) ops.current.delete(id);
      }
    } finally {
      flushing.current = false;
      setWaiting(ops.current.size);
    }
  }, [supabase]);

  // Tenta de novo sozinho enquanto houver alteração sem salvar, e quando o sinal volta.
  useEffect(() => {
    if (waiting === 0) return;
    const t = setInterval(() => { flush(); }, RETRY_MS);
    const on = () => { flush(); };
    window.addEventListener("online", on);
    return () => { clearInterval(t); window.removeEventListener("online", on); };
  }, [waiting, flush]);

  function enqueue(id: string, change: (op: Op) => Op | null) {
    const cur = ops.current.get(id) ?? { v: 0 };
    const next = change({ ...cur });
    if (next === null) ops.current.delete(id);
    else ops.current.set(id, { ...next, v: cur.v + 1 });
    setWaiting(ops.current.size);
    flush();
  }

  const load = useCallback(async () => {
    if (!userId) return;
    const isBiz = scope === "empresa";
    const { data: lists, error: le } = await supabase.from("shopping_lists").select("id,user_id,name,is_business,created_at")
      .eq("status", "open").eq("is_business", isBiz).order("created_at").limit(1);
    if (le) { setError("Não foi possível carregar a lista. Tente de novo em instantes."); setLoading(false); return; }
    let cur = ((lists ?? []) as ListRow[])[0];
    if (!cur) {
      const ins = await supabase.from("shopping_lists").insert({ user_id: userId, name: isBiz ? "Empresa" : "Mercado", is_business: isBiz }).select("id,user_id,name,is_business,created_at").single();
      if (ins.error || !ins.data) { setError("Não foi possível criar a lista."); setLoading(false); return; }
      cur = ins.data as ListRow;
    }
    const [it, hist] = await Promise.all([
      supabase.from("shopping_items").select("id,list_id,created_by,name,quantity,unit,est_price,checked,position").eq("list_id", cur.id).order("position").order("created_at"),
      supabase.from("shopping_items").select("name").order("created_at", { ascending: false }).limit(400),
    ]);
    setList(cur);
    if (!it.error) {
      // Mantém alterações ainda não salvas por cima do que veio do servidor.
      const server = ((it.data ?? []) as ShopItem[]).map((x) => ({ ...x, quantity: Number(x.quantity), est_price: x.est_price == null ? null : Number(x.est_price) }));
      const merged = server.filter((x) => !ops.current.get(x.id)?.del).map((x) => ({ ...x, ...(ops.current.get(x.id)?.patch ?? {}) }));
      for (const [id, op] of ops.current) if (op.insert && op.insert.list_id === cur.id && !merged.some((m) => m.id === id)) merged.push({ ...op.insert, ...(op.patch ?? {}) });
      setItems(merged);
    }
    setHistory(((hist.data ?? []) as { name: string }[]).map((x) => x.name));
    setError(null);
    setLoading(false);
  }, [supabase, userId, scope]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  // Categorias, contas e o limite de Alimentação do mês.
  useEffect(() => {
    if (!ready || !userId) return;
    (async () => {
      const month = todayISO().slice(0, 7);
      const { start, end } = monthRange(month);
      const [c, a, b, t] = await Promise.all([
        loadCategoryState(supabase, userId).then((st) => ({ data: st.cats.filter((x) => x.type === "expense"), hidden: st.hidden })),
        supabase.from("accounts").select("id,name").eq("archived", false).order("created_at"),
        supabase.from("budgets").select("category_id,amount_limit"),
        supabase.from("transactions").select("amount,type,category_id").eq("type", "expense").gte("date", start).lt("date", end).limit(5000),
      ]);
      const cl = (c.data ?? []) as CatRow[];
      setCats(cl);
      setHiddenCats(c.hidden);
      setAccs((a.data ?? []) as Acc[]);
      const food = cl.find((x) => !x.parent_id && /aliment/i.test(x.name));
      if (!food) { setFoodLimit(null); return; }
      const lim = ((b.data ?? []) as { category_id: string | null; amount_limit: number | string }[]).find((x) => x.category_id === food.id);
      setFoodLimit(lim ? Number(lim.amount_limit) : null);
      setFoodSpent(((t.data ?? []) as { amount: number | string; category_id: string | null }[]).filter((x) => rootId(cl, x.category_id) === food.id).reduce((s, x) => s + Number(x.amount), 0));
    })();
  }, [ready, userId, supabase, done]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!list || !userId) return;
    const parsed = parseShoppingInput(text);
    if (parsed.length === 0) return;
    const base = items.reduce((m, i) => Math.max(m, i.position), 0);
    const rows: ShopItem[] = parsed.map((p, i) => ({
      id: crypto.randomUUID(), list_id: list.id, created_by: userId, name: p.name, quantity: p.quantity, unit: p.unit, est_price: null, checked: false, position: base + i + 1,
    }));
    setItems((cur) => [...cur, ...rows]);
    for (const r of rows) enqueue(r.id, (op) => ({ ...op, insert: r }));
    setText("");
  }

  function addName(name: string) {
    if (!list || !userId) return;
    const row: ShopItem = { id: crypto.randomUUID(), list_id: list.id, created_by: userId, name, quantity: 1, unit: null, est_price: null, checked: false, position: items.reduce((m, i) => Math.max(m, i.position), 0) + 1 };
    setItems((cur) => [...cur, row]);
    enqueue(row.id, (op) => ({ ...op, insert: row }));
  }

  function patch(id: string, p: Partial<ShopItem> & { checked_at?: string | null }) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));
    enqueue(id, (op) => (op.insert ? { ...op, insert: { ...op.insert, ...p } } : { ...op, patch: { ...(op.patch ?? {}), ...p } }));
  }
  const toggle = (i: ShopItem) => patch(i.id, { checked: !i.checked, checked_at: !i.checked ? new Date().toISOString() : null } as Partial<ShopItem>);

  function remove(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id));
    enqueue(id, (op) => (op.insert ? null : { ...op, del: true, patch: undefined }));
  }

  const totals = useMemo(() => listTotals(items), [items]);
  const suggestions = useMemo(() => suggestNames(history, items.map((i) => i.name)), [history, items]);
  const sorted = useMemo(() => [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.position - b.position), [items]);
  const left = budgetLeft(foodLimit, foodSpent);

  // --- Finalizar a compra ---
  const [fin, setFin] = useState({ amount: "", description: "", category_id: "", pay: "", date: todayISO() });
  const creditCards = cards.filter((c) => c.kind === "credito" && !c.archived);

  function openFinish() {
    const food = cats.find((x) => !x.parent_id && /aliment/i.test(x.name));
    setFin({
      amount: totals.cart > 0 ? String(totals.cart).replace(".", ",") : "",
      description: list?.name ?? "Mercado",
      category_id: food?.id ?? "",
      pay: accs[0] ? `acc:${accs[0].id}` : creditCards[0] ? `card:${creditCards[0].id}` : "",
      date: todayISO(),
    });
    setError(null);
    setFinishing(true);
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!list) return;
    const amount = fin.amount.trim() === "" ? 0 : parseMoney(fin.amount);
    if (Number.isNaN(amount) || amount < 0) { setError("Informe o valor pago."); return; }
    await flush();
    if (ops.current.size > 0) { setError("Ainda estou salvando a lista. Espere alguns segundos e tente de novo."); return; }
    const [kind, id] = fin.pay.split(":");
    const card = kind === "card" ? creditCards.find((c) => c.id === id) : undefined;
    const { data, error: err } = await supabase.rpc("finish_shopping_list", {
      p_list_id: list.id,
      p_amount: amount,
      p_description: fin.description.trim() || list.name,
      p_date: fin.date,
      p_category_id: fin.category_id || null,
      p_account_id: kind === "acc" ? id : null,
      p_card_id: card ? card.id : null,
      p_invoice_month: card ? invoiceMonthFor(card, fin.date) : null,
    });
    if (err) { setError("Não foi possível finalizar a compra. Tente de novo."); return; }
    const res = data as { transaction_id: string | null; leftover_list_id: string | null; already: boolean };
    setFinishing(false);
    setDone(res.already ? "Esta compra já tinha sido finalizada." : amount > 0 ? `Compra registrada: ${brl(amount)}.${res.leftover_list_id ? " O que faltou passou para a próxima lista." : ""}` : `Lista encerrada.${res.leftover_list_id ? " O que faltou passou para a próxima lista." : ""}`);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <BackTitle title="Comprar" subtitle="Monte a lista, marque no mercado e finalize para lançar o gasto." />

      {isMei && (
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-4" role="group" aria-label="Qual lista">
          {([["pessoal", "Minha lista"], ["empresa", "Lista da empresa"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setScope(k); setLoading(true); setItems([]); }} className={`py-2.5 rounded-xl text-sm font-bold ${scope === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      )}

      {done && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <span>{done}</span>
          <button onClick={() => setDone(null)} className="font-bold shrink-0">Ok</button>
        </div>
      )}

      {waiting > 0 && (
        <p className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400"><CloudOff size={14} /> Sem sinal por enquanto. {waiting} alteração(ões) serão salvas assim que voltar.</p>
      )}

      {left !== null ? (
        <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${left < 0 ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : totals.estimated > left && totals.estimated > 0 ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] text-gray-600 dark:text-gray-300"}`}>
          {left < 0
            ? <>Você já passou <strong>{money(brl(-left))}</strong> do limite de Alimentação deste mês.</>
            : <>Você ainda pode gastar <strong>{money(brl(left))}</strong> em Alimentação este mês.{totals.estimated > left && <> A lista estimada ({money(brl(totals.estimated))}) passa disso.</>}</>}
        </div>
      ) : (
        <p className="mb-4 text-xs text-gray-400">Defina um limite de Alimentação em <Link href="/limites" className="font-bold text-brand-dark dark:text-brand-soft">Orçamento do mês</Link> para ver aqui quanto ainda pode gastar.</p>
      )}

      <form onSubmit={add} className="flex gap-2 mb-3">
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 2 leite, pão, 1kg arroz" aria-label="Adicionar itens à lista" maxLength={400} />
        <button type="submit" className={btnCls + " shrink-0"} disabled={!text.trim() || !list}>Adicionar</button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4" aria-label="Sugestões">
          {suggestions.map((s) => (
            <button key={s} onClick={() => addName(s)} className="rounded-full border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300">+ {s}</button>
          ))}
        </div>
      )}

      <ErrorNote message={error} />

      <Card className="!p-2 md:!p-3 mt-2">
        {loading ? <Empty>Carregando...</Empty> : sorted.length === 0 ? (
          <Empty>Lista vazia. Escreva o que precisa comprar acima.</Empty>
        ) : (
          <ul>
            {sorted.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-2 py-1.5 border-b last:border-b-0 border-gray-100 dark:border-white/5">
                <button onClick={() => toggle(i)} aria-pressed={i.checked} aria-label={`${i.checked ? "Desmarcar" : "Marcar"} ${i.name}`}
                  className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center border-2 transition-colors ${i.checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 dark:border-white/20 text-transparent"}`}>
                  <Check size={20} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold truncate ${i.checked ? "line-through text-gray-400" : ""}`}>{i.name}</p>
                  {quantityLabel(i) && <p className="text-xs text-gray-500">{quantityLabel(i)}</p>}
                </div>
                <input
                  key={`${i.id}-${i.est_price ?? ""}`}
                  className="w-24 rounded-xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-[#1E1E1E] px-2.5 py-2 text-sm text-right"
                  inputMode="decimal" placeholder="R$" aria-label={`Preço de ${i.name}`}
                  defaultValue={i.est_price != null ? String(i.est_price).replace(".", ",") : ""}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const v = raw === "" ? null : parseMoney(raw);
                    if (v !== null && (Number.isNaN(v) || v < 0)) return;
                    if (v !== i.est_price) patch(i.id, { est_price: v });
                  }}
                />
                <button onClick={() => remove(i.id)} aria-label={`Remover ${i.name}`} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500"><Trash2 size={17} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {items.length > 0 && (
        <div className="sticky bottom-20 md:bottom-4 mt-4 rounded-[28px] border border-white/80 dark:border-white/5 bg-white/90 dark:bg-[#161616] backdrop-blur-xl shadow-lg p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><p className="text-[11px] font-bold text-gray-500">Estimado</p><p className="text-lg font-extrabold">{money(brl(totals.estimated))}</p></div>
            <div><p className="text-[11px] font-bold text-gray-500">No carrinho ({totals.checked}/{totals.total})</p><p className="text-lg font-extrabold">{money(brl(totals.cart))}</p></div>
          </div>
          <button onClick={openFinish} className={btnCls + " w-full"}><ShoppingCart size={18} /> Finalizar compra</button>
        </div>
      )}

      {finishing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setFinishing(false)}>
          <form onSubmit={finish} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-xl font-extrabold">Finalizar compra</h2>
            <p className="text-xs text-gray-500">Vira um lançamento só de despesa. O que você não marcou passa para a próxima lista.</p>
            <div><Label>Valor pago</Label><input autoFocus className={inputCls} inputMode="decimal" value={fin.amount} onChange={(e) => setFin({ ...fin, amount: e.target.value })} placeholder="0,00" /></div>
            <div><Label>Descrição</Label><input className={inputCls} value={fin.description} onChange={(e) => setFin({ ...fin, description: e.target.value })} maxLength={120} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoria</Label>
                <select className={inputCls} value={fin.category_id} onChange={(e) => setFin({ ...fin, category_id: e.target.value })}>
                  <option value="">Sem categoria</option>
                  {visibleCats(cats, hiddenCats, [fin.category_id]).filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><Label>Data</Label><input type="date" className={inputCls} value={fin.date} max={todayISO()} onChange={(e) => setFin({ ...fin, date: e.target.value })} /></div>
            </div>
            <div><Label>Pago com</Label>
              <select className={inputCls} value={fin.pay} onChange={(e) => setFin({ ...fin, pay: e.target.value })}>
                <option value="">Não informar</option>
                {accs.map((a) => <option key={a.id} value={`acc:${a.id}`}>Conta · {a.name}</option>)}
                {creditCards.map((c) => <option key={c.id} value={`card:${c.id}`}>Cartão · {c.name}</option>)}
              </select></div>
            <ErrorNote message={error} />
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setFinishing(false)} className={btnGhostCls}>Cancelar</button>
              <button type="submit" className={btnCls}>Registrar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

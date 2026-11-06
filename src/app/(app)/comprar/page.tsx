"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, CloudOff, LoaderCircle, Mic, ShoppingCart, Square, Trash2, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useCards } from "@/lib/useCards";
import { useUsageType } from "@/lib/useUsageType";
import { useHideValues } from "@/lib/useHideValues";
import { brl, monthRange, parseMoney, todayISO } from "@/lib/format";
import { invoiceMonthFor } from "@/lib/cards";
import { rootId, type CatRow } from "@/lib/categories";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";
import { detectVoiceMethod, startVoice, voiceErrorText, type VoiceMethod, type VoiceSession } from "@/lib/voiceInput";
import { shrinkImage } from "@/lib/fileImport";
import { budgetLeft, compareReceipt, goalStatus, itemTotal, listTotals, parseShoppingInput, quantityLabel, suggestNames, type ReceiptItem, type ShopItem } from "@/lib/shopping";
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
  const [shop, setShop] = useState(false); // false = planejando em casa; true = no mercado (marca o que pegou)
  const [goal, setGoal] = useState<number | null>(null);
  const [voiceMethod, setVoiceMethod] = useState<VoiceMethod>("none");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const voice = useRef<VoiceSession | null>(null);
  const [receipt, setReceipt] = useState<{ store: string; date: string; total: string; items: ReceiptItem[] } | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => { setVoiceMethod(detectVoiceMethod()); return () => { voice.current?.cancel(); }; }, []);

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
        else if (op.insert) {
          ({ error: err } = await supabase.from("shopping_items").upsert({ ...op.insert, ...(op.patch ?? {}) }, { onConflict: "id" }));
          // Banco ainda sem a coluna "extra": salva o item sem a marca, para não perder o que a pessoa digitou.
          if (err && op.insert.extra) {
            const { extra: _extra, ...plain } = op.insert; // eslint-disable-line @typescript-eslint/no-unused-vars
            ({ error: err } = await supabase.from("shopping_items").upsert({ ...plain, ...(op.patch ?? {}) }, { onConflict: "id" }));
          }
        }
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
    // Meta e "fora da lista": colunas novas. Se ainda não existirem no banco, a lista continua funcionando sem elas.
    const [bg, ex] = await Promise.all([
      supabase.from("shopping_lists").select("budget").eq("id", cur.id).maybeSingle(),
      supabase.from("shopping_items").select("id,extra").eq("list_id", cur.id),
    ]);
    setGoal(!bg.error && (bg.data as { budget: number | string | null } | null)?.budget != null ? Number((bg.data as { budget: number | string }).budget) : null);
    const extraIds = new Set(((ex.error ? [] : ex.data ?? []) as { id: string; extra: boolean }[]).filter((x) => x.extra).map((x) => x.id));
    if (!it.error) {
      // Mantém alterações ainda não salvas por cima do que veio do servidor.
      const server = ((it.data ?? []) as ShopItem[]).map((x) => ({ ...x, extra: extraIds.has(x.id), quantity: Number(x.quantity), est_price: x.est_price == null ? null : Number(x.est_price) }));
      const merged: ShopItem[] = server.filter((x) => !ops.current.get(x.id)?.del).map((x) => ({ ...x, ...(ops.current.get(x.id)?.patch ?? {}) }));
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
    addFromText(text);
    setText("");
  }

  function addFromText(input: string) {
    if (!list || !userId) return;
    const parsed = parseShoppingInput(input);
    if (parsed.length === 0) return;
    const base = items.reduce((m, i) => Math.max(m, i.position), 0);
    const rows: ShopItem[] = parsed.map((p, i) => ({
      id: crypto.randomUUID(), list_id: list.id, created_by: userId, name: p.name, quantity: p.quantity, unit: p.unit, est_price: null, checked: false, position: base + i + 1, ...(shop ? { extra: true } : {}),
    }));
    setItems((cur) => [...cur, ...rows]);
    for (const r of rows) enqueue(r.id, (op) => ({ ...op, insert: r }));
  }

  async function toggleMic() {
    if (listening) { voice.current?.stop(); return; }
    setHeard(""); setError(null); setListening(true);
    const s = await startVoice(voiceMethod, {
      onPartial: (t) => setHeard(t),
      onLevel: () => undefined,
      onPhase: () => undefined,
      onFinal: (t) => { voice.current = null; setListening(false); setHeard(""); addFromText(t); },
      onError: (code, msg) => { voice.current = null; setListening(false); setHeard(""); setError(code === "limit" || code === "not-allowed-plan" ? msg || voiceErrorText(code, false) : voiceErrorText(code, false)); },
    });
    voice.current = s;
  }

  async function saveGoal(v: number | null) {
    setGoal(v);
    if (!list) return;
    const { error: err } = await supabase.from("shopping_lists").update({ budget: v }).eq("id", list.id);
    if (err) setError("Não foi possível guardar a meta agora.");
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
  // Em casa a meta é comparada com o estimado; no mercado, com o que já foi para o carrinho.
  const gs = goalStatus(goal, shop ? totals.cart : totals.estimated);

  // --- Finalizar a compra ---
  const [fin, setFin] = useState({ amount: "", description: "", category_id: "", pay: "", date: todayISO() });
  const creditCards = cards.filter((c) => c.kind === "credito" && !c.archived);

  async function readReceipt(file: File | undefined) {
    if (!file) return;
    setError(null); setReading(true);
    try {
      const small = await shrinkImage(file);
      const fd = new FormData();
      fd.append("file", small);
      const res = await fetch("/api/compras/nota", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { store?: string | null; date?: string | null; total?: number | null; items?: ReceiptItem[]; error?: string };
      if (!res.ok) { setError(data.error ?? "Não consegui ler a nota agora."); return; }
      if (!data.items || data.items.length === 0) { setError("Não encontrei produtos nesta foto. Tente de novo com a nota inteira, reta e bem iluminada."); return; }
      setReceipt({ store: data.store ?? "", date: data.date ?? todayISO(), total: data.total != null ? String(data.total).replace(".", ",") : "", items: data.items });
    } catch {
      setError("Não consegui enviar a foto. Verifique o sinal e tente de novo.");
    } finally {
      setReading(false);
    }
  }

  function openFinish(fromReceipt = false) {
    const food = cats.find((x) => !x.parent_id && /aliment/i.test(x.name));
    setFin({
      amount: fromReceipt && receipt?.total ? receipt.total : totals.cart > 0 ? String(totals.cart).replace(".", ",") : "",
      description: (fromReceipt && receipt?.store.trim()) || (list?.name ?? "Mercado"),
      category_id: food?.id ?? "",
      pay: accs[0] ? `acc:${accs[0].id}` : creditCards[0] ? `card:${creditCards[0].id}` : "",
      date: fromReceipt && receipt?.date && receipt.date <= todayISO() ? receipt.date : todayISO(),
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
      <BackTitle title="Comprar" subtitle="Planeje o que comprar, some no mercado o que for pegando e lance o gasto." />

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

      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-4" role="group" aria-label="Etapa da compra">
        {([[false, "Planejar a compra"], [true, "Estou no mercado"]] as const).map(([k, l]) => (
          <button key={String(k)} onClick={() => setShop(k)} aria-pressed={shop === k} className={`py-2.5 rounded-xl text-sm font-bold ${shop === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] px-4 py-3">
        <label htmlFor="meta" className="text-sm font-bold flex-1">Quanto quero gastar<span className="block text-xs font-normal text-gray-500">Sua meta para esta compra</span></label>
        <input id="meta" key={goal ?? "none"} className="w-28 rounded-xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-[#1E1E1E] px-2.5 py-2 text-sm text-right" inputMode="decimal" placeholder="R$ 0,00"
          defaultValue={goal != null ? String(goal).replace(".", ",") : ""}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const v = raw === "" ? null : parseMoney(raw);
            if (v !== null && (Number.isNaN(v) || v < 0)) return;
            if (v !== goal) void saveGoal(v);
          }} />
      </div>

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
        <input className={inputCls} value={listening && heard ? heard : text} onChange={(e) => setText(e.target.value)} placeholder={shop ? "Pegou algo que não estava na lista?" : "Ex.: 2 leite, pão, 1kg arroz"} aria-label="Adicionar itens à lista" maxLength={400} />
        {voiceMethod !== "none" && (
          <button type="button" onClick={toggleMic} aria-label={listening ? "Parar de ouvir" : "Falar os itens"} disabled={!list}
            className={`w-11 h-11 shrink-0 self-center rounded-full flex items-center justify-center text-white ${listening ? "bg-red-500" : "bg-brand-dark dark:bg-brand-vivid"}`}>
            {listening ? <Square size={16} /> : <Mic size={18} />}
          </button>
        )}
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
              <li key={i.id} className={`flex items-center gap-3 px-2 py-1.5 border-b last:border-b-0 border-gray-100 dark:border-white/5 border-l-4 rounded-l-lg ${shop ? (i.checked ? "border-l-blue-500 bg-blue-500/5" : "border-l-red-500 bg-red-500/5") : "border-l-transparent"}`}>
                <button onClick={() => toggle(i)} aria-pressed={i.checked} aria-label={`${i.checked ? "Desmarcar" : "Marcar"} ${i.name}`}
                  className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center border-2 transition-colors ${i.checked ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300 dark:border-white/20 text-transparent"}`}>
                  <Check size={20} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold truncate ${i.checked ? (shop ? "text-blue-600 dark:text-blue-400" : "line-through text-gray-400") : shop ? "text-red-600 dark:text-red-400" : ""}`}>{i.name}{i.extra && <span className="ml-2 rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">fora da lista</span>}</p>
                  {quantityLabel(i) && <p className="text-xs text-gray-500">{quantityLabel(i)}</p>}
                </div>
                <input
                  key={`${i.id}-${i.est_price ?? ""}`}
                  className="w-24 rounded-xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-[#1E1E1E] px-2.5 py-2 text-sm text-right"
                  inputMode="decimal" placeholder={shop ? "Preço" : "R$"} aria-label={`Preço de ${i.name}`}
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

      <label className={`mt-4 flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand-dark/30 dark:border-white/15 px-4 py-3 ${reading ? "opacity-60" : "cursor-pointer hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E]"}`}>
        {reading ? <LoaderCircle size={20} className="animate-spin text-brand-dark dark:text-brand-soft shrink-0" /> : <Camera size={20} className="text-brand-dark dark:text-brand-soft shrink-0" />}
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">{reading ? "Lendo a nota..." : "Já passou no caixa? Foto da nota fiscal"}</span>
          <span className="block text-xs text-gray-500">Mostro o que foi comprado e comparo com a sua lista.</span>
        </span>
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={reading} onChange={(e) => { void readReceipt(e.target.files?.[0]); e.target.value = ""; }} />
      </label>

      {receipt && (() => {
        const cmp = compareReceipt(items, receipt.items);
        const rTotal = parseMoney(receipt.total || "0");
        const finalTotal = Number.isNaN(rTotal) ? 0 : rTotal;
        const diff = Math.round((finalTotal - totals.cart) * 100) / 100;
        const goalFinal = goalStatus(goal, finalTotal);
        return (
          <Card className="mt-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="text-lg font-extrabold">Nota fiscal{receipt.store ? ` · ${receipt.store}` : ""}</h2><p className="text-xs text-gray-500">Confira: a leitura por foto pode errar um valor.</p></div>
              <button onClick={() => setReceipt(null)} aria-label="Fechar a nota" className="text-gray-400"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-gray-100 dark:bg-[#1E1E1E] p-2.5"><p className="text-[11px] font-bold text-gray-500">1. Planejado</p><p className="font-extrabold">{money(brl(totals.estimated))}</p>{goal != null && <p className="text-[10px] text-gray-500">meta {money(brl(goal))}</p>}</div>
              <div className="rounded-2xl bg-blue-500/10 p-2.5"><p className="text-[11px] font-bold text-blue-600 dark:text-blue-400">2. Carrinho</p><p className="font-extrabold">{money(brl(totals.cart))}</p><p className="text-[10px] text-gray-500">{totals.checked}/{totals.total} itens</p></div>
              <div className="rounded-2xl bg-emerald-500/10 p-2.5"><p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">3. No caixa</p><p className="font-extrabold">{money(brl(finalTotal))}</p><p className="text-[10px] text-gray-500">{receipt.items.length} produtos</p></div>
            </div>
            {totals.cart > 0 && <p className={`text-sm font-bold ${diff > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{diff === 0 ? "O caixa fechou igual ao seu carrinho." : diff > 0 ? `O caixa deu ${money(brl(diff))} a mais que o seu carrinho.` : `O caixa deu ${money(brl(-diff))} a menos que o seu carrinho.`}</p>}
            {goalFinal && <p className={`text-sm font-bold ${goalFinal.over ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{goalFinal.over ? `Passou ${money(brl(-goalFinal.left))} da meta de ${money(brl(goal ?? 0))}.` : `Ficou ${money(brl(goalFinal.left))} abaixo da meta de ${money(brl(goal ?? 0))}.`}</p>}

            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">4. Sua lista × a nota</p>
              <ul className="divide-y divide-gray-100 dark:divide-white/5">
                {cmp.rows.map(({ item, match }) => {
                  const mine = itemTotal(item);
                  return (
                    <li key={item.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${match ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="min-w-0 flex-1 truncate font-bold">{item.name}{item.extra && <span className="ml-2 text-[10px] font-bold text-amber-700 dark:text-amber-300">fora da lista</span>}</span>
                      {match ? (
                        <span className="shrink-0 text-right text-xs">
                          <span className="block font-bold">{money(brl(match.total))}</span>
                          {mine > 0 && Math.abs(match.total - mine) >= 0.01 && <span className={`block ${match.total > mine ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>você anotou {money(brl(mine))}</span>}
                        </span>
                      ) : <span className="shrink-0 text-xs text-red-600 dark:text-red-400 font-bold">não veio na nota</span>}
                    </li>
                  );
                })}
              </ul>
            </div>

            {cmp.unlisted.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">Saiu no caixa e não estava na sua lista</p>
                <ul className="divide-y divide-gray-100 dark:divide-white/5">
                  {cmp.unlisted.map((r, k) => (
                    <li key={`${r.name}-${k}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="shrink-0 font-bold text-xs">{money(brl(r.total))}</span>
                      <button aria-label={`Tirar ${r.name} da nota`} onClick={() => setReceipt({ ...receipt, items: receipt.items.filter((x) => x !== r) })} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-gray-500 mt-1">Leu errado? Toque no X para tirar da comparação.</p>
              </div>
            )}

            <div><Label>Total da nota</Label><input className={inputCls} inputMode="decimal" value={receipt.total} onChange={(e) => setReceipt({ ...receipt, total: e.target.value })} /></div>
            <button onClick={() => openFinish(true)} className={btnCls + " w-full"}><ShoppingCart size={18} /> Lançar como despesa</button>
          </Card>
        );
      })()}

      {items.length > 0 && (
        <div className="sticky bottom-20 md:bottom-4 mt-4 rounded-[28px] border border-white/80 dark:border-white/5 bg-white/90 dark:bg-[#161616] backdrop-blur-xl shadow-lg p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><p className="text-[11px] font-bold text-gray-500">Estimado</p><p className="text-lg font-extrabold">{money(brl(totals.estimated))}</p></div>
            <div><p className="text-[11px] font-bold text-blue-600 dark:text-blue-400">No carrinho ({totals.checked}/{totals.total})</p><p className="text-lg font-extrabold">{money(brl(totals.cart))}</p></div>
          </div>
          {gs && (
            <div className="mb-3" role="status">
              <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-[#262626] overflow-hidden"><div className={`h-full rounded-full ${gs.over ? "bg-red-500" : gs.pct >= 85 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${gs.pct}%` }} /></div>
              <p className={`mt-1.5 text-xs font-bold ${gs.over ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>
                {gs.over ? `Passou ${money(brl(-gs.left))} da meta de ${money(brl(goal ?? 0))}` : `Ainda cabem ${money(brl(gs.left))} da meta de ${money(brl(goal ?? 0))}`}
              </p>
            </div>
          )}
          <button onClick={() => openFinish()} className={btnCls + " w-full"}><ShoppingCart size={18} /> Finalizar compra</button>
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

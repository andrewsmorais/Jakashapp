"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronRight, CloudOff, LoaderCircle, Mic, ShoppingCart, Square, Trash2, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useCards } from "@/lib/useCards";
import { useUsageType } from "@/lib/useUsageType";
import { useHideValues } from "@/lib/useHideValues";
import { brl, formatDateBR, monthRange, parseMoney, todayISO } from "@/lib/format";
import { invoiceMonthFor } from "@/lib/cards";
import { rootId, type CatRow } from "@/lib/categories";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";
import { detectVoiceMethod, startVoice, voiceErrorText, type VoiceMethod, type VoiceSession } from "@/lib/voiceInput";
import { shrinkImage } from "@/lib/fileImport";
import { budgetLeft, compareReceipt, goalStatus, itemTotal, listTotals, parseShoppingInput, quantityLabel, suggestNames, type ReceiptItem, type ShopItem } from "@/lib/shopping";
import { ShoppingReport } from "@/components/ShoppingReport";
import { BackTitle, Card, Empty, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type ListRow = { id: string; user_id: string; name: string; is_business: boolean; created_at: string; list_date: string };
// Lista que ainda não ganhou nome: o campo "Nome da lista" aparece em branco e, nas escolhas, fica "Lista sem nome".
const UNNAMED = "Lista sem nome";
const listLabel = (x: { name: string; list_date: string }) => `${x.name === UNNAMED ? UNNAMED : x.name} · ${formatDateBR(x.list_date)}`;
const LIST_COLS = "id,user_id,name,is_business,created_at,list_date";
type Acc = { id: string; name: string };
type Op = { v: number; insert?: ShopItem; patch?: Partial<ShopItem>; del?: boolean };

const RETRY_MS = 4000;

export default function SupermercadoPage() {
  const { supabase, userId, ready } = useSupabase();
  const { cards } = useCards();
  const { isMei } = useUsageType();
  const { money } = useHideValues();
  const [scope, setScope] = useState<"pessoal" | "empresa">("pessoal");
  const [list, setList] = useState<ListRow | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"comprar" | "relatorio">("comprar");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState(todayISO());
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1 planejar, 2 no mercado, 3 nota, 4 comparar
  const shop = step === 2; // o que entra na lista no mercado ganha a etiqueta "fora da lista"
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
    const { data: open, error: le } = await supabase.from("shopping_lists").select(LIST_COLS)
      .eq("status", "open").eq("is_business", isBiz).order("list_date", { ascending: false }).order("created_at", { ascending: false }).limit(50);
    if (le) { setError("Não foi possível carregar a lista. Tente de novo em instantes."); setLoading(false); return; }
    let all = (open ?? []) as ListRow[];
    if (all.length === 0) {
      const ins = await supabase.from("shopping_lists").insert({ user_id: userId, name: UNNAMED, is_business: isBiz }).select(LIST_COLS).single();
      if (ins.error || !ins.data) { setError("Não foi possível criar a lista."); setLoading(false); return; }
      all = [ins.data as ListRow];
    }
    const cur = all.find((x) => x.id === selectedId) ?? all[0];
    setLists(all);
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
  }, [supabase, userId, scope, selectedId]);

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

  function pickList(id: string) {
    if (id === list?.id) return;
    setLoading(true); setItems([]); setReceipt(null); setGoal(null); setSelectedId(id);
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const name = newName.trim().replace(/\s+/g, " ");
    if (name.length < 1) { setError("Dê um nome para a lista (ex.: Compra do Atacadão)."); return; }
    const { data, error: err } = await supabase.from("shopping_lists").insert({ user_id: userId, name: name.slice(0, 60), list_date: newDate || todayISO(), is_business: scope === "empresa" }).select(LIST_COLS).single();
    if (err || !data) { setError("Não foi possível criar a lista."); return; }
    setError(null); setNewOpen(false); setNewName(""); setNewDate(todayISO());
    setLoading(true); setItems([]); setReceipt(null); setGoal(null);
    setSelectedId((data as ListRow).id);
  }

  async function saveListInfo(patchRow: { name?: string; list_date?: string }) {
    if (!list) return;
    const { error: err } = await supabase.from("shopping_lists").update(patchRow).eq("id", list.id);
    if (err) { setError("Não foi possível salvar a lista."); return; }
    setError(null);
    setList({ ...list, ...patchRow });
    setLists((cur) => cur.map((x) => (x.id === list.id ? { ...x, ...patchRow } : x)));
  }

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
  // No mercado a meta é comparada com o que já foi para o carrinho.
  const gs = goalStatus(goal, totals.cart);

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
      description: (fromReceipt && receipt?.store.trim()) || (list && list.name !== UNNAMED ? list.name : "Mercado"),
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
      p_description: fin.description.trim() || (list.name !== UNNAMED ? list.name : "Mercado"),
      p_date: fin.date,
      p_category_id: fin.category_id || null,
      p_account_id: kind === "acc" ? id : null,
      p_card_id: card ? card.id : null,
      p_invoice_month: card ? invoiceMonthFor(card, fin.date) : null,
    });
    if (err) { setError("Não foi possível finalizar a compra. Tente de novo."); return; }
    const res = data as { transaction_id: string | null; leftover_list_id: string | null; already: boolean };
    setFinishing(false);
    setReceipt(null);
    setSelectedId(null);
    setStep(1);
    setDone(res.already ? "Esta compra já tinha sido finalizada." : amount > 0 ? `Compra registrada: ${brl(amount)}.${res.leftover_list_id ? " O que faltou passou para a próxima lista." : ""}` : `Lista encerrada.${res.leftover_list_id ? " O que faltou passou para a próxima lista." : ""}`);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  // ---------- etapa 4: o que deu certo, o que faltou e o que entrou a mais ----------
  const cmp = receipt ? compareReceipt(items, receipt.items) : null;
  const receiptTotal = receipt ? parseMoney(receipt.total || "0") : NaN;
  const spent = receipt && !Number.isNaN(receiptTotal) ? receiptTotal : totals.cart;
  const bought: { name: string; price: number | null }[] = cmp
    ? cmp.rows.filter((r) => r.match && !r.item.extra).map((r) => ({ name: r.item.name, price: r.match!.total }))
    : items.filter((i) => i.checked && !i.extra).map((i) => ({ name: i.name, price: i.est_price != null ? itemTotal(i) : null }));
  const missed: string[] = cmp
    ? cmp.rows.filter((r) => !r.match && !r.item.extra).map((r) => r.item.name)
    : items.filter((i) => !i.checked && !i.extra).map((i) => i.name);
  const added: { name: string; price: number | null }[] = cmp
    ? [...cmp.rows.filter((r) => r.match && r.item.extra).map((r) => ({ name: r.item.name, price: r.match!.total })), ...cmp.unlisted.map((r) => ({ name: r.name, price: r.total }))]
    : items.filter((i) => i.checked && i.extra).map((i) => ({ name: i.name, price: i.est_price != null ? itemTotal(i) : null }));
  const goalEnd = goalStatus(goal, spent);

  const STEPS = [[1, "Planejar"], [2, "No mercado"], [3, "Nota"], [4, "Comparar"]] as const;
  const nextBtn = (to: 1 | 2 | 3 | 4, label: string) => (
    <button onClick={() => { setStep(to); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={btnCls + " w-full mt-4"}>{label} <ChevronRight size={18} /></button>
  );
  const micBtn = voiceMethod !== "none" && (
    <button type="button" onClick={toggleMic} aria-label={listening ? "Parar de ouvir" : "Falar os itens"} disabled={!list}
      className={`w-11 h-11 shrink-0 self-center rounded-full flex items-center justify-center text-white ${listening ? "bg-red-500" : "bg-brand-dark dark:bg-brand-vivid"}`}>
      {listening ? <Square size={16} /> : <Mic size={18} />}
    </button>
  );
  const addForm = (placeholder: string) => (
    <form onSubmit={add} className="flex gap-2 mb-3">
      <input className={inputCls} value={listening && heard ? heard : text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Adicionar itens" maxLength={400} />
      {micBtn}
      <button type="submit" className={btnCls + " shrink-0"} disabled={!text.trim() || !list}>Adicionar</button>
    </form>
  );
  const Section = ({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) => (
    <div className="mt-4"><p className={`text-xs font-extrabold mb-1 ${tone}`}>{title}</p>{children}</div>
  );
  const priceTxt = (p: number | null) => (p == null ? "" : money(brl(p)));

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <BackTitle title="Supermercado" subtitle="Planeje a compra, marque no mercado, confira a nota e compare." />

      {isMei && (
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-4" role="group" aria-label="Qual lista">
          {([["pessoal", "Minha lista"], ["empresa", "Lista da empresa"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setScope(k); setLoading(true); setItems([]); setReceipt(null); }} className={`py-2.5 rounded-xl text-sm font-bold ${scope === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
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

      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-4" role="tablist" aria-label="Supermercado">
        {([["comprar", "Minhas listas"], ["relatorio", "Relatório"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`py-2.5 rounded-xl text-sm font-bold ${view === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>

      {view === "relatorio" && <ShoppingReport supabase={supabase} isBiz={scope === "empresa"} money={money} />}

      {view === "comprar" && (<>
      <Card className="mb-4 !p-4 space-y-3">
        {step > 1 && (
          <div>
            <Label>Qual lista?</Label>
            <select className={inputCls} value={list?.id ?? ""} onChange={(e) => pickList(e.target.value)} aria-label="Escolher a lista criada no Planejar">
              {lists.map((x) => <option key={x.id} value={x.id}>{listLabel(x)}</option>)}
            </select>
          </div>
        )}
        {step === 1 && list && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome da lista</Label><input key={`n-${list.id}`} className={inputCls} defaultValue={list.name === UNNAMED ? "" : list.name} maxLength={60} placeholder="Ex.: Compra do Atacadão"
              onBlur={(e) => { const v = e.target.value.trim().replace(/\s+/g, " ").slice(0, 60) || UNNAMED; if (v !== list.name) void saveListInfo({ name: v }); }} /></div>
            <div><Label>Data da compra</Label><input key={`d-${list.id}`} type="date" className={inputCls} defaultValue={list.list_date}
              onBlur={(e) => { const v = e.target.value; if (v && v !== list.list_date) void saveListInfo({ list_date: v }); }} /></div>
          </div>
        )}
        {newOpen ? (
          <form onSubmit={createList} className="space-y-3 rounded-2xl border border-white/70 dark:border-white/5 p-3">
            <p className="text-sm font-extrabold">Nova lista</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome *</Label><input autoFocus className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Ex.: Feira de sábado" /></div>
              <div><Label>Data</Label><input type="date" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setNewOpen(false); setError(null); }} className={btnGhostCls + " flex-1 !py-2.5"}>Cancelar</button>
              <button type="submit" className={btnCls + " flex-1 !py-2.5"}>Criar lista</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => { setNewOpen(true); setStep(1); }} className="text-sm font-bold text-brand-dark dark:text-brand-soft">+ Nova lista</button>
        )}
      </Card>

      <nav className="grid grid-cols-4 gap-1.5 mb-5" aria-label="Etapas da compra">
        {STEPS.map(([n, l]) => (
          <button key={n} onClick={() => setStep(n)} aria-current={step === n ? "step" : undefined}
            className={`rounded-2xl py-2 text-center ${step === n ? "bg-brand-dark text-white dark:bg-brand-vivid" : step > n ? "bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft" : "bg-gray-100 dark:bg-[#161616] text-gray-400"}`}>
            <span className="block text-base font-extrabold leading-none">{n}</span>
            <span className="block text-[11px] font-bold mt-1">{l}</span>
          </button>
        ))}
      </nav>

      <ErrorNote message={error} />

      {step === 1 && (
        <>
          <p className="text-sm text-gray-500 mb-3">Escreva ou fale o que precisa comprar. Não precisa de preço nem de peso.</p>
          {addForm("Ex.: arroz, feijão, 2 leites")}
          {suggestions.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4" aria-label="Sugestões">
              {suggestions.map((s) => (
                <button key={s} onClick={() => addName(s)} className="rounded-full border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300">+ {s}</button>
              ))}
            </div>
          )}
          <Card className="!p-2 md:!p-3">
            {loading ? <Empty>Carregando...</Empty> : items.length === 0 ? <Empty>Sua lista está vazia.</Empty> : (
              <ul>
                {[...items].sort((a, b) => a.position - b.position).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-2 py-2.5 border-b last:border-b-0 border-gray-100 dark:border-white/5">
                    <span className="min-w-0 flex-1 font-bold truncate">{i.name}{quantityLabel(i) && <span className="ml-2 text-xs font-normal text-gray-500">{quantityLabel(i)}</span>}</span>
                    <button onClick={() => remove(i.id)} aria-label={`Remover ${i.name}`} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500"><Trash2 size={17} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] px-4 py-3">
            <label htmlFor="meta" className="text-sm font-bold flex-1">Quanto quero gastar nesta compra</label>
            <input id="meta" key={goal ?? "none"} className="w-28 rounded-xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-[#1E1E1E] px-2.5 py-2 text-sm text-right" inputMode="decimal" placeholder="R$ 0,00"
              defaultValue={goal != null ? String(goal).replace(".", ",") : ""}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const v = raw === "" ? null : parseMoney(raw);
                if (v !== null && (Number.isNaN(v) || v < 0)) return;
                if (v !== goal) void saveGoal(v);
              }} />
          </div>
          {items.length > 0 && nextBtn(2, "Cheguei no mercado")}
        </>
      )}

      {step === 2 && (
        <>
          <p className="text-sm text-gray-500 mb-3">Toque no que já pegou. <span className="font-bold text-blue-600 dark:text-blue-400">Azul</span> está no carrinho, <span className="font-bold text-red-600 dark:text-red-400">vermelho</span> ainda falta. O preço é opcional.</p>
          <Card className="!p-2 md:!p-3">
            {loading ? <Empty>Carregando...</Empty> : sorted.length === 0 ? <Empty>Sua lista está vazia. Volte em Planejar.</Empty> : (
              <ul>
                {sorted.map((i) => (
                  <li key={i.id} className={`flex items-center gap-3 px-2 py-1.5 border-b last:border-b-0 border-gray-100 dark:border-white/5 border-l-4 rounded-l-lg ${i.checked ? "border-l-blue-500 bg-blue-500/5" : "border-l-red-500 bg-red-500/5"}`}>
                    <button onClick={() => toggle(i)} aria-pressed={i.checked} aria-label={`${i.checked ? "Desmarcar" : "Marcar"} ${i.name}`}
                      className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center border-2 transition-colors ${i.checked ? "bg-blue-500 border-blue-500 text-white" : "border-red-300 dark:border-red-500/40 text-transparent"}`}>
                      <Check size={20} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold truncate ${i.checked ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>{i.name}{i.extra && <span className="ml-2 rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">fora da lista</span>}</p>
                      {quantityLabel(i) && <p className="text-xs text-gray-500">{quantityLabel(i)}</p>}
                    </div>
                    <input
                      key={`${i.id}-${i.est_price ?? ""}`}
                      className="w-24 rounded-xl border border-white/70 dark:border-white/5 bg-white/70 dark:bg-[#1E1E1E] px-2.5 py-2 text-sm text-right"
                      inputMode="decimal" placeholder="Preço" aria-label={`Preço de ${i.name}`}
                      defaultValue={i.est_price != null ? String(i.est_price).replace(".", ",") : ""}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const v = raw === "" ? null : parseMoney(raw);
                        if (v !== null && (Number.isNaN(v) || v < 0)) return;
                        if (v !== i.est_price) patch(i.id, { est_price: v });
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mt-4">{addForm("Pegou algo que não estava na lista?")}</div>
          <div className="sticky bottom-20 md:bottom-4 mt-2 rounded-[28px] border border-white/80 dark:border-white/5 bg-white/90 dark:bg-[#161616] backdrop-blur-xl shadow-lg p-4">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-[11px] font-bold text-blue-600 dark:text-blue-400">No carrinho ({totals.checked}/{totals.total})</p><p className="text-2xl font-extrabold">{money(brl(totals.cart))}</p></div>
              {goal != null && <p className="text-xs font-bold text-gray-500 text-right">Meta<br /><span className="text-base text-gray-900 dark:text-white">{money(brl(goal))}</span></p>}
            </div>
            {gs && (
              <div className="mt-2" role="status">
                <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-[#262626] overflow-hidden"><div className={`h-full rounded-full ${gs.over ? "bg-red-500" : gs.pct >= 85 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${gs.pct}%` }} /></div>
                <p className={`mt-1.5 text-xs font-bold ${gs.over ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>{gs.over ? `Passou ${money(brl(-gs.left))} da meta` : `Ainda cabem ${money(brl(gs.left))}`}</p>
              </div>
            )}
            {nextBtn(3, "Passei no caixa")}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <label className={`flex flex-col items-center gap-2 rounded-[28px] border-2 border-dashed border-brand-dark/30 dark:border-white/15 px-4 py-8 text-center ${reading ? "opacity-60" : "cursor-pointer hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E]"}`}>
            {reading ? <LoaderCircle size={32} className="animate-spin text-brand-dark dark:text-brand-soft" /> : <Camera size={32} className="text-brand-dark dark:text-brand-soft" />}
            <span className="text-base font-extrabold">{reading ? "Lendo a nota..." : receipt ? "Tirar outra foto" : "Tirar foto da nota fiscal"}</span>
            <span className="text-xs text-gray-500">A nota inteira, reta e com boa luz. Eu leio os produtos e os preços.</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={reading} onChange={(e) => { void readReceipt(e.target.files?.[0]); e.target.value = ""; }} />
          </label>

          {receipt && (
            <Card className="mt-4">
              <h2 className="text-lg font-extrabold">O que você comprou{receipt.store ? ` · ${receipt.store}` : ""}</h2>
              <p className="text-xs text-gray-500 mb-2">Confira: a leitura por foto pode errar. Toque no X para tirar uma linha errada.</p>
              <ul className="divide-y divide-gray-100 dark:divide-white/5">
                {receipt.items.map((r, k) => (
                  <li key={`${r.name}-${k}`} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 font-bold">{money(brl(r.total))}</span>
                    <button aria-label={`Tirar ${r.name}`} onClick={() => setReceipt({ ...receipt, items: receipt.items.filter((_, j) => j !== k) })} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><Label>Total pago</Label><input className={inputCls} inputMode="decimal" value={receipt.total} onChange={(e) => setReceipt({ ...receipt, total: e.target.value })} /></div>
            </Card>
          )}
          {nextBtn(4, receipt ? "Comparar com a minha lista" : "Comparar sem a nota")}
        </>
      )}

      {step === 4 && (
        <Card>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-gray-100 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] font-bold text-gray-500">Queria gastar</p><p className="text-xl font-extrabold">{goal != null ? money(brl(goal)) : "—"}</p></div>
            <div className={`rounded-2xl p-3 ${goalEnd?.over ? "bg-red-500/10" : "bg-emerald-500/10"}`}><p className="text-[11px] font-bold text-gray-500">{receipt ? "Gastei (nota)" : "Gastei (carrinho)"}</p><p className="text-xl font-extrabold">{money(brl(spent))}</p></div>
          </div>
          {goalEnd ? (
            <p className={`mt-3 text-sm font-extrabold ${goalEnd.over ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {goalEnd.over ? `Você gastou ${money(brl(-goalEnd.left))} a mais do que planejou.` : goalEnd.left === 0 ? "Você gastou exatamente o que planejou." : `Você gastou ${money(brl(goalEnd.left))} a menos do que planejou.`}
            </p>
          ) : <p className="mt-3 text-xs text-gray-500">Sem meta. Na próxima, diga em Planejar quanto quer gastar.</p>}

          <Section title={`Comprou o que planejou (${bought.length})`} tone="text-emerald-700 dark:text-emerald-400">
            {bought.length === 0 ? <p className="text-xs text-gray-400">Nada.</p> : <ul className="text-sm">{bought.map((b, k) => <li key={k} className="flex justify-between gap-2 py-1"><span className="truncate">{b.name}</span><span className="font-bold shrink-0">{priceTxt(b.price)}</span></li>)}</ul>}
          </Section>
          <Section title={`Faltou, não pegou (${missed.length})`} tone="text-red-600 dark:text-red-400">
            {missed.length === 0 ? <p className="text-xs text-gray-400">Pegou tudo.</p> : <ul className="text-sm">{missed.map((m, k) => <li key={k} className="py-1">{m}</li>)}</ul>}
          </Section>
          <Section title={`Acrescentou, não estava na lista (${added.length})`} tone="text-amber-700 dark:text-amber-400">
            {added.length === 0 ? <p className="text-xs text-gray-400">Nada a mais.</p> : <ul className="text-sm">{added.map((a, k) => <li key={k} className="flex justify-between gap-2 py-1"><span className="truncate">{a.name}</span><span className="font-bold shrink-0">{priceTxt(a.price)}</span></li>)}</ul>}
          </Section>
          {left !== null && <p className="mt-4 text-xs text-gray-500">{left < 0 ? `Você já passou ${money(brl(-left))} do limite de Alimentação deste mês.` : `Ainda pode gastar ${money(brl(left))} em Alimentação este mês.`}</p>}

          <button onClick={() => openFinish(Boolean(receipt))} className={btnCls + " w-full mt-5"}><ShoppingCart size={18} /> Lançar como despesa</button>
          <p className="text-[11px] text-gray-500 mt-2 text-center">O que você não pegou passa para a próxima lista.</p>
        </Card>
      )}

      </>)}

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

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, FileUp, Paperclip, Pin, Repeat, Save, CheckCircle2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useUsageType } from "@/lib/useUsageType";
import { addPeriod, brl, formatDateBR, parseMoney, todayISO } from "@/lib/format";
import { rootId, type CatRow } from "@/lib/categories";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";
import { buildCardPurchase, dueDateFor, invoiceMonthFor, splitInstallments } from "@/lib/cards";
import { ACCEPT, stashFile } from "@/lib/fileImport";
import { RECEIPT_ACCEPT, uploadReceipt } from "@/lib/receipts";
import { KIND_LABEL, type RevenueKind } from "@/lib/mei";
import { lightImpact } from "@/lib/haptics";
import { useMeiSuppliers } from "@/lib/useMeiSuppliers";
import { Label, ErrorNote, inputCls } from "@/components/ui/page";
import { SupplierSelect } from "@/components/mei/SupplierSelect";
import { VoiceEntry } from "@/components/VoiceEntry";
import type { VoiceItem } from "@/lib/voiceParse";

type Acc = { id: string; name: string; is_business: boolean };
type CardOpt = { id: string; name: string; closing_day: number; due_day: number; is_business: boolean; kind: "credito" | "debito"; pay_account_id: string | null };

// voice/voiceQueue: lançamento entendido por voz que abre preenchido (o "Também entendi" depois de salvar o primeiro).
export type QuickAddPreset = { cardId?: string; voice?: VoiceItem; voiceQueue?: VoiceItem[] };

type VoiceField = "type" | "amount" | "description" | "category" | "date" | "biz";
const fieldAmount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));
// Destaque dos campos que vieram da voz (some quando a pessoa mexe no campo).
const HL = " !border-brand-vivid ring-2 ring-brand-vivid/40";

// Janela de novo lançamento (botão + do app). Avisa a tela atual por evento "jakash:changed".
export function QuickAdd({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: QuickAddPreset }) {
  const router = useRouter();
  const { supabase, userId } = useSupabase();
  const { isMei } = useUsageType();
  const { active: suppliers } = useMeiSuppliers(supabase, userId, open && isMei);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [accs, setAccs] = useState<Acc[]>([]);
  const [cards, setCards] = useState<CardOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [voiceFields, setVoiceFields] = useState<VoiceField[]>([]);
  const voiceQueue = useRef<VoiceItem[]>([]);
  const [f, setF] = useState({
    type: "expense" as "income" | "expense", amount: "", description: "", category_id: "", account_id: "", date: todayISO(), paid: true,
    method: "account" as "account" | "card" | "debit", card_id: "", installments: 1, biz: false,
    kind: "servicos" as RevenueKind, draw: false, supplier_id: "",
    fixed: false, sameDue: true, due: todayISO(), compOn: false, comp: todayISO(),
    repeat: false, freq: "monthly" as "weekly" | "monthly" | "yearly", count: 12,
  });
  const [myName, setMyName] = useState("");

  const fRef = useRef(f);
  fRef.current = f;
  const catsRef = useRef(cats);
  catsRef.current = cats;
  const hl = (k: VoiceField) => (voiceFields.includes(k) ? HL : "");
  const unmark = (k: VoiceField) => setVoiceFields((v) => (v.includes(k) ? v.filter((x) => x !== k) : v));

  // Preenche o formulário com o que a voz entendeu. Só preenche: quem confere e salva é a pessoa.
  function applyVoice(item: VoiceItem, list: CatRow[] = catsRef.current) {
    const type = item.type ?? fRef.current.type;
    const cat = item.categoryId ? list.find((c) => c.id === item.categoryId && c.type === type) : undefined;
    const touched: VoiceField[] = [];
    if (item.type) touched.push("type");
    if (item.amount !== null) touched.push("amount");
    if (item.description) touched.push("description");
    if (cat) touched.push("category");
    if (item.date) touched.push("date");
    setVoiceFields(touched);
    setF((p) => ({
      ...p,
      type,
      amount: item.amount !== null ? fieldAmount(item.amount) : p.amount,
      description: item.description || p.description,
      category_id: cat ? cat.id : type !== p.type ? "" : p.category_id,
      date: item.date ?? p.date,
      biz: false, // app só pessoal: "da empresa" dito na voz é ignorado
    }));
  }

  useEffect(() => {
    if (!open || !userId) return;
    setError(null);
    setVoiceFields([]);
    Promise.all([
      // Só as categorias à mostra (as escondidas em Categorias não aparecem aqui nem na voz).
      loadCategoryState(supabase, userId).then((st) => ({ data: visibleCats(st.cats, st.hidden) })),
      supabase.from("accounts").select("id,name,is_business").eq("archived", false).order("created_at"),
      supabase.from("credit_cards").select("id,name,closing_day,due_day,is_business,kind,pay_account_id").eq("archived", false).order("created_at"),
      supabase.from("profiles").select("mei_activity,full_name").eq("id", userId).maybeSingle(),
    ]).then(([c, a, k, pr]) => {
      const catList = (c.data ?? []) as CatRow[];
      setCats(catList);
      setAccs((a.data ?? []) as Acc[]);
      const list = (k.data ?? []) as CardOpt[];
      const credits = list.filter((x) => x.kind === "credito");
      setCards(list);
      const prof = pr.data as { mei_activity?: RevenueKind; full_name?: string | null } | null;
      const activity = (prof?.mei_activity ?? "servicos") as RevenueKind;
      setMyName(prof?.full_name?.trim() || "Você");
      setF((p) => ({
        ...p, date: todayISO(), installments: 1, kind: activity, draw: false, supplier_id: "",
        fixed: false, sameDue: true, due: todayISO(), compOn: false, comp: todayISO(), repeat: false, count: 12,
        ...(preset?.cardId && list.some((x) => x.id === preset.cardId)
          ? { type: "expense" as const, method: "card" as const, card_id: preset.cardId, biz: false }
          : { method: "account" as const, card_id: credits.length === 1 ? credits[0].id : "", biz: false }),
      }));
      // Abriu pelo "Também entendi" da voz: já vem preenchido (e o resto da fila segue depois de salvar).
      if (preset?.voice) {
        voiceQueue.current = preset.voiceQueue ?? [];
        applyVoice(preset.voice, catList);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, supabase, preset?.cardId, preset?.voice]);

  if (!open) return null;

  const isIncome = f.type === "income";
  const creditCards = cards.filter((c) => c.kind === "credito");
  const debitCards = cards.filter((c) => c.kind === "debito");
  const useCard = !isIncome && f.method === "card" && creditCards.length > 0;
  const useDebit = !isIncome && f.method === "debit" && debitCards.length > 0;
  const card = creditCards.find((c) => c.id === f.card_id);
  const debit = debitCards.find((c) => c.id === f.card_id);
  const methods = [["account", "Conta"] as const, ...(creditCards.length ? [["card", "Crédito"] as const] : []), ...(debitCards.length ? [["debit", "Débito"] as const] : [])];
  const total = parseMoney(f.amount);
  const per = Number.isNaN(total) || !(total > 0) ? 0 : splitInstallments(total, f.installments)[0];
  // Fornecedor (opcional): só em despesa da empresa que vira lançamento (à vista, crédito ou débito), que não seja retirada do sócio,
  // e só para quem já cadastrou fornecedores.
  const isDraw = f.draw && !useCard && !useDebit;
  const showSupplier = isMei && f.biz && !isIncome && !isDraw && (useCard || useDebit || f.paid) && suppliers.length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(f.amount);
    if (!f.description.trim() || !(amount > 0)) { setError("Informe descrição e um valor maior que zero."); return; }
    if (useCard && !card) { setError("Escolha o cartão."); return; }
    if (useDebit && (!debit || !debit.pay_account_id)) { setError(debit ? "Este cartão de débito está sem conta vinculada. Edite o cartão e escolha a conta." : "Escolha o cartão de débito."); return; }
    const doRepeat = f.repeat && !useCard && f.count >= 2;
    if (f.repeat && !useCard && (!Number.isInteger(f.count) || f.count < 2 || f.count > 60)) { setError("Em Repetir, informe de 2 a 60 vezes."); return; }
    setSaving(true);
    // Só vai na gravação quando escolhido (assim nada muda para quem não usa fornecedores).
    const sup = showSupplier && f.supplier_id && suppliers.some((x) => x.id === f.supplier_id) ? { supplier_id: f.supplier_id } : {};
    let att: { attachment_path?: string; attachment_name?: string } = {};
    if (receipt && !(!useCard && !useDebit && !f.paid)) {
      try { const r = await uploadReceipt(supabase, userId!, receipt); att = { attachment_path: r.path, attachment_name: r.name }; }
      catch (err) { setSaving(false); setError(err instanceof Error ? err.message : "Não foi possível enviar o comprovante."); return; }
    }
    // Campos opcionais: só vão quando a pessoa usou (assim o salvar simples não depende deles).
    const fixedX = f.fixed && !useCard ? { is_fixed: true } : {};
    const dueX = f.paid && !f.sameDue && f.due && !useCard && !useDebit ? { due_date: f.due } : {};
    const compX = f.paid && f.compOn && f.comp && !useCard && !useDebit ? { competence_date: f.comp } : {};
    let res: { error: unknown } | undefined;
    if (useCard && card) {
      const rows = buildCardPurchase(card, {
        userId: userId!, description: f.description.trim(), total: amount, installments: f.installments, date: f.date, category_id: f.category_id || null,
      });
      res = await supabase.from("transactions").insert(rows.map((r) => ({ ...r, is_business: f.biz, ...att, ...sup })));
    } else if (useDebit && debit) {
      // Débito sai da conta na hora: lançamento normal na conta do cartão, marcado com o cartão usado.
      res = await supabase.from("transactions").insert({
        user_id: userId, description: f.description.trim(), amount, type: "expense", date: f.date,
        category_id: f.category_id || null, account_id: debit.pay_account_id, debit_card_id: debit.id, origin: "manual", is_business: f.biz, ...fixedX, ...att, ...sup,
      });
    } else if (f.paid) {
      res = await supabase.from("transactions").insert({
        user_id: userId, description: f.description.trim(), amount, type: f.type, date: f.date,
        category_id: f.category_id || null, account_id: f.account_id || null, origin: "manual", is_business: f.biz, ...att,
        revenue_kind: f.biz && f.type === "income" ? f.kind : null,
        is_owner_draw: f.biz && f.type === "expense" && f.draw, ...fixedX, ...dueX, ...compX, ...sup,
      });
    } else if (!doRepeat) {
      res = await supabase.from("bills").insert({
        user_id: userId, description: f.description.trim(), amount, type: f.type, due_date: f.date, ...fixedX,
      });
    }
    // Repetir: o primeiro já foi (ou, sem "pago", é a primeira conta); os demais entram como contas a pagar/receber.
    if (doRepeat && (!res || !res.error)) {
      const firstIsBill = !f.paid && !useDebit;
      const bills = Array.from({ length: f.count }, (_, k) => k).filter((k) => firstIsBill || k > 0).map((k) => ({
        user_id: userId, description: f.description.trim(), amount, type: f.type, due_date: addPeriod(f.date, f.freq, k), ...fixedX,
      }));
      const r2 = await supabase.from("bills").insert(bills);
      if (r2.error || !res) res = r2;
    }
    setSaving(false);
    if (!res || res.error) { setError("Não foi possível salvar."); return; }
    setF({ ...f, amount: "", description: "", installments: 1, supplier_id: "", fixed: false, repeat: false, compOn: false, sameDue: true });
    setReceipt(null);
    setVoiceFields([]);
    window.dispatchEvent(new Event("jakash:changed"));
    void lightImpact(); // vibração leve no app iOS (no site não faz nada)
    onClose();
    // "Também entendi": abre o próximo item já preenchido (a pessoa ainda confere e toca em Salvar).
    const queue = voiceQueue.current;
    voiceQueue.current = [];
    if (queue.length) setTimeout(() => window.dispatchEvent(new CustomEvent("jakash:quickadd", { detail: { voice: queue[0], voiceQueue: queue.slice(1) } })), 150);
  }

  // Categoria principal + subcategoria: o que vai para o banco continua sendo um só id (a subcategoria, se houver).
  const typeCats = cats.filter((c) => c.type === f.type);
  const parents = typeCats.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const parentId = rootId(cats, f.category_id) ?? "";
  const subs = typeCats.filter((c) => c.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const subId = cats.find((c) => c.id === f.category_id)?.parent_id ? f.category_id : "";
  const accountMode = !useCard && !useDebit;
  const verbDate = isIncome ? "recebi" : "paguei";
  const rowCls = "flex items-center justify-between gap-3 px-4 py-3.5";
  const hint = "text-xs text-gray-500 dark:text-gray-400 mt-0.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] max-h-[92vh] flex flex-col overflow-hidden">
        <div className={`flex items-center justify-center gap-10 px-6 pt-5${voiceFields.includes("type") ? " ring-2 ring-brand-vivid/40" : ""}`}>
          {(["expense", "income"] as const).map((t) => {
            const on = f.type === t;
            const color = t === "income" ? "text-emerald-600 border-emerald-600" : "text-red-600 border-red-600";
            return (
              <button key={t} type="button" onClick={() => { setF({ ...f, type: t, category_id: "" }); unmark("type"); unmark("category"); }}
                className={`flex items-center gap-2 pb-2 text-lg font-extrabold border-b-[3px] ${on ? color : "border-transparent opacity-40 " + color.split(" ")[0]}`}>
                {t === "expense" ? <ArrowUpCircle size={22} /> : <ArrowDownCircle size={22} />}
                {t === "expense" ? "Despesa" : "Receita"}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-4 space-y-4">
          <VoiceEntry cats={cats} resetKey={preset?.voice} onDraft={(item) => applyVoice(item)} onQueue={(items) => { voiceQueue.current = items; }} />
          {voiceFields.length > 0 && <p className="text-xs text-gray-500 -mt-2">O que veio da sua voz está destacado. Confira antes de salvar.</p>}

          <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand-dark/30 dark:border-white/15 px-4 py-3 cursor-pointer hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E]">
            <FileUp size={20} className="text-brand-dark dark:text-brand-soft shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-extrabold">Enviar arquivo</span>
              <span className="block text-xs text-gray-500">PDF, foto, planilha, OFX ou CSV: os lançamentos entram no app</span>
            </span>
            <input type="file" className="hidden" accept={ACCEPT} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; stashFile(file); onClose(); router.push("/importar"); }} />
          </label>

          {!isIncome && methods.length > 1 && (
            <div className={`grid gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] ${methods.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {methods.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, method: k, repeat: k === "card" ? false : f.repeat, card_id: k === "card" ? (creditCards.length === 1 ? creditCards[0].id : "") : k === "debit" ? (debitCards.length === 1 ? debitCards[0].id : "") : f.card_id })}
                  className={`py-2 rounded-xl text-xs font-bold ${f.method === k ? "bg-white dark:bg-brand-vivid text-brand-dark dark:text-white shadow-sm" : "text-gray-500"}`}>{l}</button>
              ))}
            </div>
          )}

          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{useCard && f.installments > 1 ? "Valor total da compra" : "Valor"}</p>
            <input autoFocus aria-label="Valor" className={"w-full bg-transparent text-center text-4xl font-extrabold py-2 focus:outline-none placeholder:text-gray-300 rounded-2xl" + hl("amount")} inputMode="decimal" placeholder="R$ 0,00" value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); unmark("amount"); }} />
          </div>

          <div><Label>Descrição</Label><input className={inputCls + hl("description")} placeholder={isIncome ? "Ex.: Salário" : "Ex.: Compra no supermercado"} value={f.description} onChange={(e) => { setF({ ...f, description: e.target.value }); unmark("description"); }} /></div>
          <div><Label>Categoria</Label>
            <select className={inputCls + hl("category")} value={parentId} onChange={(e) => { setF({ ...f, category_id: e.target.value }); unmark("category"); }}>
              <option value="">Escolha uma categoria</option>
              {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><Label>Subcategoria</Label>
            <select className={inputCls + (parentId ? "" : " opacity-60")} disabled={!parentId} value={subId} onChange={(e) => setF({ ...f, category_id: e.target.value || parentId })}>
              <option value="">{parentId ? (subs.length ? "Sem subcategoria" : "Esta categoria não tem subcategorias") : "Selecione uma categoria primeiro"}</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>

          {useCard ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cartão</Label>
                  <select className={inputCls} value={f.card_id} onChange={(e) => setF({ ...f, card_id: e.target.value, biz: false })}>
                    <option value="">Escolher</option>
                    {creditCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><Label>Parcelas</Label>
                  <select className={inputCls} value={f.installments} onChange={(e) => setF({ ...f, installments: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>)}
                  </select></div>
              </div>
              <div><Label>Data da compra</Label><input type="date" className={inputCls + hl("date")} value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); unmark("date"); }} /></div>
              {f.installments > 1 && per > 0 && <p className="text-xs text-gray-500 -mt-2">{f.installments}x de {brl(per)} (a primeira parcela pode ter alguns centavos a mais).</p>}
              {card && <p className="text-xs text-gray-500 -mt-2">Entra na fatura que vence em {formatDateBR(dueDateFor(card, invoiceMonthFor(card, f.date)))}. O dinheiro só sai da conta quando você pagar a fatura.</p>}
            </>
          ) : useDebit ? (
            <>
              <div><Label>Cartão de débito</Label>
                <select className={inputCls} value={f.card_id} onChange={(e) => setF({ ...f, card_id: e.target.value, biz: false })}>
                  <option value="">Escolher</option>
                  {debitCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              {debit && <p className="text-xs text-gray-500 -mt-2">Sai na hora da conta {accs.find((a) => a.id === debit.pay_account_id)?.name ?? "vinculada ao cartão"}.</p>}
              <div><Label>Data</Label><input type="date" className={inputCls + hl("date")} value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); unmark("date"); }} /></div>
            </>
          ) : (
            <>
              {accs.length > 0 && f.paid && (
                <div><Label>Conta</Label>
                  <select className={inputCls} value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value, biz: false })}>
                    <option value="">Conta principal</option>
                    {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></div>
              )}
              <div className="rounded-2xl border border-gray-200 dark:border-white/10 divide-y divide-gray-200 dark:divide-white/10">
                <div className={rowCls}>
                  <div className="min-w-0"><p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} className="text-emerald-600" />{isIncome ? "Já recebi" : "Já paguei"}</p><p className={hint}>{isIncome ? "Desligue se ainda vai receber" : "Desligue se ainda vai pagar"}</p></div>
                  <Switch on={f.paid} onChange={(v) => setF({ ...f, paid: v })} label={isIncome ? "Já recebi" : "Já paguei"} />
                </div>
                <div className="px-4 py-3.5">
                  <Label>{f.paid ? `Dia em que ${verbDate}` : "Dia que vence"}</Label>
                  <input type="date" className={inputCls + hl("date")} value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); unmark("date"); }} />
                </div>
                {f.paid && (
                  <div className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0"><p className="font-bold">Vence no mesmo dia</p><p className={hint}>{f.sameDue ? `Vence em ${formatDateBR(f.date)}` : "Escolha o dia que vence"}</p></div>
                      <Switch on={f.sameDue} onChange={(v) => setF({ ...f, sameDue: v })} label="Vence no mesmo dia" />
                    </div>
                    {!f.sameDue && <input type="date" aria-label="Dia que vence" className={inputCls + " mt-3"} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />}
                  </div>
                )}
                {f.paid && (
                  <div className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0"><p className="font-bold">Contar em outro mês</p><p className={hint}>{f.compOn ? "Escolha o mês em que entra nas suas contas" : `Vai contar em ${formatDateBR(f.date)}, o dia em que ${verbDate}`}</p></div>
                      <Switch on={f.compOn} onChange={(v) => setF({ ...f, compOn: v })} label="Contar em outro mês" />
                    </div>
                    {f.compOn && <input type="date" aria-label="Contar em outro mês" className={inputCls + " mt-3"} value={f.comp} onChange={(e) => setF({ ...f, comp: e.target.value })} />}
                  </div>
                )}
              </div>
              {!f.paid && <p className="text-xs text-gray-500 -mt-2">Fica em Contas a pagar/receber até você dar baixa.</p>}
            </>
          )}

          {!useCard && (
            <div className="rounded-2xl border border-gray-200 dark:border-white/10 divide-y divide-gray-200 dark:divide-white/10">
              <div className={rowCls}>
                <div className="min-w-0"><p className="flex items-center gap-2 font-bold"><Pin size={18} className="text-gray-400" />{isIncome ? "Receita recorrente" : "Despesa recorrente"}</p><p className={hint}>{isIncome ? "Chega sempre, como o salário" : "Sempre existe, como o aluguel"}</p></div>
                <Switch on={f.fixed} onChange={(v) => setF({ ...f, fixed: v })} label={isIncome ? "Receita recorrente" : "Despesa recorrente"} />
              </div>
              <div className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="flex items-center gap-2 font-bold"><Repeat size={18} className="text-gray-400" />Repetir nos próximos meses</p><p className={hint}>Lança de uma vez, como Netflix ou aluguel</p></div>
                  <Switch on={f.repeat} onChange={(v) => setF({ ...f, repeat: v })} label="Repetir lançamento" />
                </div>
                {f.repeat && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div><Label>De quanto em quanto tempo</Label>
                        <select className={inputCls} value={f.freq} onChange={(e) => setF({ ...f, freq: e.target.value as typeof f.freq })}>
                          <option value="monthly">Todo mês</option><option value="weekly">Toda semana</option><option value="yearly">Todo ano</option>
                        </select></div>
                      <div><Label>Quantas vezes</Label>
                        <input className={inputCls} inputMode="numeric" value={String(f.count)} onChange={(e) => setF({ ...f, count: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {f.paid || useDebit ? "O primeiro entra agora; os outros ficam em Contas a pagar e receber, nas datas seguintes." : "Cada data vira uma conta a pagar/receber."}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          <div><Label>De quem é</Label>
            <select className={inputCls} value="me" onChange={() => undefined} aria-label="De quem é">
              <option value="me">{myName || "Você"}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">O lançamento fica no seu nome.</p>
          </div>

          {(isMei || f.biz) && (useCard || useDebit || f.paid) && (
            <label className={`flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] px-4 py-3 text-sm font-bold${voiceFields.includes("biz") ? " ring-2 ring-brand-vivid/40" : ""}`}>
              <span>Da empresa (MEI)<span className="block text-xs font-normal text-gray-500">Entra na receita bruta e no limite do MEI</span></span>
              <input type="checkbox" checked={f.biz} onChange={(e) => { setF({ ...f, biz: e.target.checked }); unmark("biz"); }} className="h-5 w-5 accent-brand-dark" />
            </label>
          )}
          {f.biz && isIncome && f.paid && accountMode && (
            <div>
              <Label>Tipo da receita (para a DASN)</Label>
              <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RevenueKind })}>
                {(Object.keys(KIND_LABEL) as RevenueKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
          )}
          {f.biz && !isIncome && accountMode && f.paid && (
            <label className="flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] px-4 py-3 text-sm font-bold">
              <span>É retirada para a pessoa física<span className="block text-xs font-normal text-gray-500">Pró-labore: não conta como despesa da empresa</span></span>
              <input type="checkbox" checked={f.draw} onChange={(e) => setF({ ...f, draw: e.target.checked })} className="h-5 w-5 accent-brand-dark" />
            </label>
          )}
          {showSupplier && <SupplierSelect suppliers={suppliers} value={f.supplier_id} onChange={(id) => setF({ ...f, supplier_id: id })} onNavigate={onClose} />}
          {(useCard || useDebit || f.paid) && (
            <div>
              <label className="flex items-center gap-2 text-sm font-bold text-brand-dark dark:text-brand-soft cursor-pointer w-fit">
                <Paperclip size={16} /> {receipt ? "Trocar comprovante" : "Anexar comprovante (opcional)"}
                <input type="file" className="hidden" accept={RECEIPT_ACCEPT} onChange={(e) => { setReceipt(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
              {receipt && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 min-w-0"><span className="truncate">{receipt.name}</span>
                  <button type="button" onClick={() => setReceipt(null)} className="text-red-500 font-bold shrink-0">remover</button></p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-white/10 px-6 pt-3 pb-4">
          <ErrorNote message={error} />
          <button disabled={saving} type="submit"
            className={`mt-1 w-full inline-flex items-center justify-center gap-2 rounded-full py-3.5 text-lg font-bold text-white disabled:opacity-50 ${isIncome ? "bg-emerald-600" : "bg-red-600"}`}>
            <Save size={20} />{saving ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" onClick={onClose} className="w-full pt-3 text-lg text-gray-500">Cancelar</button>
        </div>
      </form>
    </div>
  );
}

// Interruptor liga/desliga (verde quando ligado).
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-gray-300 dark:bg-[#333]"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

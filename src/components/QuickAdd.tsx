"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Paperclip, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useUsageType } from "@/lib/useUsageType";
import { brl, formatDateBR, parseMoney, todayISO } from "@/lib/format";
import { categoryOptions, type CatRow } from "@/lib/categories";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";
import { buildCardPurchase, dueDateFor, invoiceMonthFor, splitInstallments } from "@/lib/cards";
import { ACCEPT, stashFile } from "@/lib/fileImport";
import { RECEIPT_ACCEPT, uploadReceipt } from "@/lib/receipts";
import { KIND_LABEL, type RevenueKind } from "@/lib/mei";
import { lightImpact } from "@/lib/haptics";
import { useMeiSuppliers } from "@/lib/useMeiSuppliers";
import { Label, ErrorNote, inputCls, btnCls } from "@/components/ui/page";
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
  });

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
    if (item.isBusiness !== null) touched.push("biz");
    setVoiceFields(touched);
    setF((p) => ({
      ...p,
      type,
      amount: item.amount !== null ? fieldAmount(item.amount) : p.amount,
      description: item.description || p.description,
      category_id: cat ? cat.id : type !== p.type ? "" : p.category_id,
      date: item.date ?? p.date,
      biz: item.isBusiness ?? p.biz,
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
      supabase.from("profiles").select("mei_activity").eq("id", userId).maybeSingle(),
    ]).then(([c, a, k, pr]) => {
      const catList = (c.data ?? []) as CatRow[];
      setCats(catList);
      setAccs((a.data ?? []) as Acc[]);
      const list = (k.data ?? []) as CardOpt[];
      const credits = list.filter((x) => x.kind === "credito");
      setCards(list);
      const activity = ((pr.data as { mei_activity?: RevenueKind } | null)?.mei_activity ?? "servicos") as RevenueKind;
      setF((p) => ({
        ...p, date: todayISO(), installments: 1, kind: activity, draw: false, supplier_id: "",
        ...(preset?.cardId && list.some((x) => x.id === preset.cardId)
          ? { type: "expense" as const, method: "card" as const, card_id: preset.cardId, biz: Boolean(list.find((x) => x.id === preset.cardId)?.is_business) }
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
    setSaving(true);
    // Só vai na gravação quando escolhido (assim nada muda para quem não usa fornecedores).
    const sup = showSupplier && f.supplier_id && suppliers.some((x) => x.id === f.supplier_id) ? { supplier_id: f.supplier_id } : {};
    let att: { attachment_path?: string; attachment_name?: string } = {};
    if (receipt && !(!useCard && !useDebit && !f.paid)) {
      try { const r = await uploadReceipt(supabase, userId!, receipt); att = { attachment_path: r.path, attachment_name: r.name }; }
      catch (err) { setSaving(false); setError(err instanceof Error ? err.message : "Não foi possível enviar o comprovante."); return; }
    }
    let res;
    if (useCard && card) {
      const rows = buildCardPurchase(card, {
        userId: userId!, description: f.description.trim(), total: amount, installments: f.installments, date: f.date, category_id: f.category_id || null,
      });
      res = await supabase.from("transactions").insert(rows.map((r) => ({ ...r, is_business: f.biz, ...att, ...sup })));
    } else if (useDebit && debit) {
      // Débito sai da conta na hora: lançamento normal na conta do cartão, marcado com o cartão usado.
      res = await supabase.from("transactions").insert({
        user_id: userId, description: f.description.trim(), amount, type: "expense", date: f.date,
        category_id: f.category_id || null, account_id: debit.pay_account_id, debit_card_id: debit.id, origin: "manual", is_business: f.biz, ...att, ...sup,
      });
    } else if (f.paid) {
      res = await supabase.from("transactions").insert({
        user_id: userId, description: f.description.trim(), amount, type: f.type, date: f.date,
        category_id: f.category_id || null, account_id: f.account_id || null, origin: "manual", is_business: f.biz, ...att,
        revenue_kind: f.biz && f.type === "income" ? f.kind : null,
        is_owner_draw: f.biz && f.type === "expense" && f.draw, ...sup,
      });
    } else {
      res = await supabase.from("bills").insert({
        user_id: userId, description: f.description.trim(), amount, type: f.type, due_date: f.date,
      });
    }
    setSaving(false);
    if (res.error) { setError("Não foi possível salvar."); return; }
    setF({ ...f, amount: "", description: "", installments: 1, supplier_id: "" });
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

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">Novo lançamento</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-gray-400"><X size={20} /></button>
        </div>

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

        <div className={`grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#262626]${voiceFields.includes("type") ? " ring-2 ring-brand-vivid/40" : ""}`}>
          {(["expense", "income"] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setF({ ...f, type: t, category_id: "" }); unmark("type"); unmark("category"); }}
              className={`py-2.5 rounded-xl text-sm font-bold ${f.type === t ? (t === "income" ? "bg-emerald-500 text-white" : "bg-red-500 text-white") : "text-gray-500"}`}>
              {t === "expense" ? "Despesa" : "Receita"}
            </button>
          ))}
        </div>

        {!isIncome && methods.length > 1 && (
          <div className={`grid gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] ${methods.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {methods.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setF({ ...f, method: k, card_id: k === "card" ? (creditCards.length === 1 ? creditCards[0].id : "") : k === "debit" ? (debitCards.length === 1 ? debitCards[0].id : "") : f.card_id })}
                className={`py-2 rounded-xl text-xs font-bold ${f.method === k ? "bg-white dark:bg-brand-vivid text-brand-dark dark:text-white shadow-sm" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>
        )}

        <div><Label>{useCard && f.installments > 1 ? "Valor total da compra" : "Valor"}</Label><input autoFocus className={inputCls + " !text-2xl !font-extrabold" + hl("amount")} inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); unmark("amount"); }} /></div>
        <div><Label>Descrição</Label><input className={inputCls + hl("description")} placeholder={isIncome ? "Ex.: salário" : "Ex.: mercado"} value={f.description} onChange={(e) => { setF({ ...f, description: e.target.value }); unmark("description"); }} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Categoria</Label>
            <select className={inputCls + hl("category")} value={f.category_id} onChange={(e) => { setF({ ...f, category_id: e.target.value }); unmark("category"); }}>
              <option value="">Sem categoria</option>
              {categoryOptions(cats, f.type).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div><Label>{useCard ? "Data da compra" : f.paid ? "Data" : "Vencimento"}</Label><input type="date" className={inputCls + hl("date")} value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); unmark("date"); }} /></div>
        </div>

        {useCard ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cartão</Label>
                <select className={inputCls} value={f.card_id} onChange={(e) => setF({ ...f, card_id: e.target.value, biz: Boolean(cards.find((c) => c.id === e.target.value)?.is_business) || f.biz })}>
                  <option value="">Escolher</option>
                  {creditCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><Label>Parcelas</Label>
                <select className={inputCls} value={f.installments} onChange={(e) => setF({ ...f, installments: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>)}
                </select></div>
            </div>
            {f.installments > 1 && per > 0 && <p className="text-xs text-gray-500 -mt-2">{f.installments}x de {brl(per)} (a primeira parcela pode ter alguns centavos a mais).</p>}
            {card && <p className="text-xs text-gray-500 -mt-2">Entra na fatura que vence em {formatDateBR(dueDateFor(card, invoiceMonthFor(card, f.date)))}. O dinheiro só sai da conta quando você pagar a fatura.</p>}
          </>
        ) : useDebit ? (
          <>
            <div><Label>Cartão de débito</Label>
              <select className={inputCls} value={f.card_id} onChange={(e) => setF({ ...f, card_id: e.target.value, biz: Boolean(debitCards.find((c) => c.id === e.target.value)?.is_business) || f.biz })}>
                <option value="">Escolher</option>
                {debitCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            {debit && <p className="text-xs text-gray-500 -mt-2">Sai na hora da conta {accs.find((a) => a.id === debit.pay_account_id)?.name ?? "vinculada ao cartão"}.</p>}
          </>
        ) : (
          <>
            {accs.length > 0 && f.paid && (
              <div><Label>Conta</Label>
                <select className={inputCls} value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value, biz: Boolean(accs.find((a) => a.id === e.target.value)?.is_business) || f.biz })}>
                  <option value="">Conta principal</option>
                  {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></div>
            )}
            <label className="flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] px-4 py-3 text-sm font-bold">
              {isIncome ? "Já recebi" : "Já paguei"}
              <input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} className="h-5 w-5 accent-brand-dark" />
            </label>
            {!f.paid && <p className="text-xs text-gray-500 -mt-2">Fica em Contas a pagar/receber até você dar baixa.</p>}
          </>
        )}
        {(isMei || f.biz) && (useCard || useDebit || f.paid) && (
          <label className={`flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] px-4 py-3 text-sm font-bold${voiceFields.includes("biz") ? " ring-2 ring-brand-vivid/40" : ""}`}>
            <span>Da empresa (MEI)<span className="block text-xs font-normal text-gray-500">Entra na receita bruta e no limite do MEI</span></span>
            <input type="checkbox" checked={f.biz} onChange={(e) => { setF({ ...f, biz: e.target.checked }); unmark("biz"); }} className="h-5 w-5 accent-brand-dark" />
          </label>
        )}
        {f.biz && isIncome && f.paid && (
          <div>
            <Label>Tipo da receita (para a DASN)</Label>
            <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RevenueKind })}>
              {(Object.keys(KIND_LABEL) as RevenueKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
        )}
        {f.biz && !isIncome && !useCard && !useDebit && f.paid && (
          <label className="flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] px-4 py-3 text-sm font-bold">
            <span>É retirada para a pessoa física<span className="block text-xs font-normal text-gray-500">Pró-labore: não conta como despesa da empresa</span></span>
            <input type="checkbox" checked={f.draw} onChange={(e) => setF({ ...f, draw: e.target.checked })} className="h-5 w-5 accent-brand-dark" />
          </label>
        )}
        {showSupplier && <SupplierSelect suppliers={suppliers} value={f.supplier_id} onChange={(id) => setF({ ...f, supplier_id: id })} onNavigate={onClose} />}
        <ErrorNote message={error} />
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
        <button className={btnCls + " w-full"} disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar"}</button>
      </form>
    </div>
  );
}

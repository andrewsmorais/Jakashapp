"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Wallet, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useCards } from "@/lib/useCards";
import { useHideValues } from "@/lib/useHideValues";
import { brl, parseMoney, todayISO, formatDateBR } from "@/lib/format";
import { BRANDS, cardUsed, closingDateFor, dueDateFor, invoiceMonthFor, invoiceStatus } from "@/lib/cards";
import { InvoiceChip } from "@/components/CardBits";
import { BackTitle, Card, Label, MonthNav, Empty, ErrorNote, Progress, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type Tx = {
  id: string; description: string; amount: number; type: "income" | "expense"; date: string; category_id: string | null;
  installment_group: string | null; installment_number: number | null; installment_total: number | null;
};
type Pay = { id: string; amount: number; paid_on: string; account_id: string | null };
type Acc = { id: string; name: string };

export default function FaturaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { supabase, userId, ready } = useSupabase();
  const { cards, invoices, loading: loadingCards } = useCards();
  const { money } = useHideValues();
  const card = cards.find((c) => c.id === id);
  // Cartão de débito não tem fatura: volta para a lista.
  useEffect(() => { if (card?.kind === "debito") window.location.replace("/cartoes"); }, [card?.kind]);

  const [month, setMonth] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [accs, setAccs] = useState<Acc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", date: todayISO(), account_id: "" });
  const [delTx, setDelTx] = useState<Tx | null>(null);

  // Mês inicial: ?m=AAAA-MM ou a fatura atual do cartão.
  useEffect(() => {
    if (!card || month) return;
    const q = new URLSearchParams(window.location.search).get("m");
    setMonth(q && /^\d{4}-\d{2}$/.test(q) ? q : invoiceMonthFor(card, todayISO()).slice(0, 7));
  }, [card, month]);

  const load = useCallback(async () => {
    if (!month) return;
    const im = `${month}-01`;
    const [t, p, c, a] = await Promise.all([
      supabase.from("transactions")
        .select("id,description,amount,type,date,category_id,installment_group,installment_number,installment_total")
        .eq("card_id", id).eq("invoice_month", im).order("date", { ascending: false }).limit(500),
      supabase.from("card_invoice_payments").select("id,amount,paid_on,account_id").eq("card_id", id).eq("invoice_month", im).order("paid_on"),
      supabase.from("categories").select("id,name"),
      supabase.from("accounts").select("id,name").eq("archived", false).order("created_at"),
    ]);
    if (t.error || p.error) setError("Não foi possível carregar a fatura."); else setError(null);
    setTxs(((t.data ?? []) as Tx[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setPays(((p.data ?? []) as Pay[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setCats(Object.fromEntries((c.data ?? []).map((x) => [x.id, x.name])));
    setAccs((a.data ?? []) as Acc[]);
  }, [supabase, id, month]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  if (loadingCards || (card && !month)) return <div className="max-w-3xl mx-auto"><Card><Empty>Carregando...</Empty></Card></div>;
  if (!card) return <div className="max-w-3xl mx-auto"><BackTitle title="Cartão não encontrado" href="/cartoes" /><Card><Empty>Esse cartão não existe ou foi excluído.</Empty></Card></div>;

  const today = todayISO();
  const im = `${month}-01`;
  const total = Math.round(txs.reduce((s, t) => s + (t.type === "expense" ? t.amount : -t.amount), 0) * 100) / 100;
  const paid = Math.round(pays.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const remaining = Math.max(Math.round((total - paid) * 100) / 100, 0);
  const status = invoiceStatus(card, im, total, paid, today);
  const used = cardUsed(invoices, card.id);
  const pct = card.credit_limit > 0 ? (used / card.credit_limit) * 100 : 0;
  const accName = (aid: string | null) => accs.find((a) => a.id === aid)?.name ?? "Conta";

  function openPay() {
    setPayForm({ amount: String(remaining).replace(".", ","), date: todayISO(), account_id: card?.pay_account_id ?? accs[0]?.id ?? "" });
    setError(null);
    setPayOpen(true);
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(payForm.amount);
    if (!(amount > 0)) { setError("Informe um valor maior que zero."); return; }
    const { error: err } = await supabase.from("card_invoice_payments").insert({
      user_id: userId, card_id: id, invoice_month: im, amount, paid_on: payForm.date, account_id: payForm.account_id || null,
    });
    if (err) { setError("Não foi possível registrar o pagamento."); return; }
    setPayOpen(false);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  async function removePayment(pid: string) {
    const { error: err } = await supabase.from("card_invoice_payments").delete().eq("id", pid);
    if (err) setError("Não foi possível excluir o pagamento."); else window.dispatchEvent(new Event("jakash:changed"));
  }

  async function removeTx(all: boolean) {
    if (!delTx) return;
    const q = supabase.from("transactions").delete();
    const { error: err } = all && delTx.installment_group ? await q.eq("installment_group", delTx.installment_group) : await q.eq("id", delTx.id);
    setDelTx(null);
    if (err) setError("Não foi possível excluir."); else window.dispatchEvent(new Event("jakash:changed"));
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <BackTitle title={card.name} subtitle={`${BRANDS[card.brand] ?? "Cartão"} · fecha dia ${card.closing_day} · vence dia ${card.due_day}`} href="/cartoes" />

      <div className="mb-4"><MonthNav month={month} onChange={setMonth} /></div>

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-gray-500">Total da fatura</p>
            <p className="text-3xl font-extrabold">{money(brl(total))}</p>
          </div>
          <InvoiceChip status={status} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div className="rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-2.5"><p className="text-[11px] font-bold text-gray-500">Fecha em</p><p className="font-extrabold">{formatDateBR(closingDateFor(card, im))}</p></div>
          <div className="rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-2.5"><p className="text-[11px] font-bold text-gray-500">Vence em</p><p className="font-extrabold">{formatDateBR(dueDateFor(card, im))}</p></div>
        </div>
        {paid > 0 && (
          <div className="flex justify-between text-sm mt-4"><span className="text-gray-500">Pago</span><span className="font-bold text-emerald-600">{money(brl(paid))}</span></div>
        )}
        {total > 0 && remaining > 0 && (
          <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">Falta pagar</span><span className="font-extrabold">{money(brl(remaining))}</span></div>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={() => window.dispatchEvent(new CustomEvent("jakash:quickadd", { detail: { cardId: id } }))} className={btnCls + " flex-1"}><Plus size={16} /> Nova compra</button>
          {remaining > 0 && <button onClick={openPay} className={btnGhostCls + " flex-1 !py-2.5"}><Wallet size={14} /> Pagar fatura</button>}
        </div>
        <ErrorNote message={payOpen ? null : error} />
      </Card>

      {card.credit_limit > 0 && (
        <Card className="mb-4 !p-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5"><span>{money(brl(used))} do limite usados</span><span>Disponível {money(brl(Math.max(card.credit_limit - used, 0)))}</span></div>
          <Progress value={pct} tone={pct >= 100 ? "bad" : pct >= 80 ? "warn" : "ok"} />
        </Card>
      )}

      <Card className="mb-4">
        <p className="font-extrabold mb-2">Compras desta fatura</p>
        {txs.length === 0 ? <Empty>Nenhuma compra nesta fatura.</Empty> : (
          <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{t.description}</p>
                  <p className="text-xs text-gray-500">{formatDateBR(t.date)} · {t.category_id ? cats[t.category_id] ?? "Outros" : "Sem categoria"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${t.type === "income" ? "text-emerald-500" : ""}`}>{t.type === "income" ? "-" : ""}{money(brl(t.amount))}</span>
                  <button onClick={() => (t.installment_group ? setDelTx(t) : supabase.from("transactions").delete().eq("id", t.id).then(({ error: err }) => { if (err) setError("Não foi possível excluir."); else window.dispatchEvent(new Event("jakash:changed")); }))} aria-label="Excluir" className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pays.length > 0 && (
        <Card>
          <p className="font-extrabold mb-2">Pagamentos</p>
          <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
            {pays.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="font-bold">{money(brl(p.amount))}</p><p className="text-xs text-gray-500">{formatDateBR(p.paid_on)} · {accName(p.account_id)}</p></div>
                <button onClick={() => removePayment(p.id)} aria-label="Excluir pagamento" className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPayOpen(false)}>
          <form onSubmit={pay} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">Pagar fatura</h2><button type="button" onClick={() => setPayOpen(false)} aria-label="Fechar" className="text-gray-400"><X size={20} /></button></div>
            <div><Label>Valor</Label><input autoFocus className={inputCls + " !text-2xl !font-extrabold"} inputMode="decimal" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><input type="date" className={inputCls} value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></div>
              <div><Label>Sai da conta</Label>
                <select className={inputCls} value={payForm.account_id} onChange={(e) => setPayForm({ ...payForm, account_id: e.target.value })}>
                  <option value="">Não descontar</option>
                  {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></div>
            </div>
            <p className="text-xs text-gray-500">O pagamento não conta como nova despesa: as compras já estão nas suas despesas.</p>
            <ErrorNote message={error} />
            <button className={btnCls + " w-full"} type="submit">Registrar pagamento</button>
          </form>
        </div>
      )}

      {delTx && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDelTx(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-sm bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-3">
            <h2 className="text-lg font-extrabold">Excluir compra parcelada</h2>
            <p className="text-sm text-gray-500">{delTx.description}</p>
            <button onClick={() => removeTx(false)} className={btnGhostCls + " w-full !py-3"}>Só esta parcela</button>
            <button onClick={() => removeTx(true)} className={btnCls + " w-full !bg-none !bg-red-500 !shadow-none"}>Todas as parcelas</button>
            <button onClick={() => setDelTx(null)} className="w-full text-sm font-bold text-gray-500 py-2">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

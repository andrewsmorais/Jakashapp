"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useUsageType } from "@/lib/useUsageType";
import { useMeiSuppliers } from "@/lib/useMeiSuppliers";
import { brl, parseMoney, todayISO, formatDateBR, daysUntil } from "@/lib/format";
import { PageHeader, Card, Label, Empty, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { SupplierSelect } from "@/components/mei/SupplierSelect";

type Bill = { id: string; description: string; amount: number; due_date: string; type: "income" | "expense"; recurrence: "none" | "monthly"; status: "pending" | "paid"; supplier_id?: string | null };

export default function ContasPage() {
  const { supabase, userId, ready } = useSupabase();
  const { isMei } = useUsageType();
  const { active: suppliers, byId: supplierById } = useMeiSuppliers(supabase, userId, isMei);
  const [bills, setBills] = useState<Bill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ description: "", amount: "", due_date: todayISO(), type: "expense" as "income" | "expense", recurrence: "none" as "none" | "monthly", biz: false, supplier_id: "" });

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("bills").select("*").eq("status", "pending").order("due_date");
    if (err) { setError("Não foi possível carregar as contas."); return; }
    setError(null);
    setBills(((data ?? []) as Bill[]).map((b) => ({ ...b, amount: Number(b.amount) })));
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(form.amount);
    if (!form.description.trim() || !(amount > 0)) { setError("Informe descrição e valor maior que zero."); return; }
    // Da empresa e fornecedor só valem para conta a pagar de quem usa o MEI; sem isso a conta segue como sempre foi.
    const biz = isMei && form.type === "expense" && form.biz;
    const supplier = biz && suppliers.some((s) => s.id === form.supplier_id) ? form.supplier_id : "";
    const { error: err } = await supabase.from("bills").insert({
      user_id: userId, description: form.description.trim(), amount, due_date: form.due_date, type: form.type, recurrence: form.recurrence,
      ...(biz ? { is_business: true } : {}), ...(supplier ? { supplier_id: supplier } : {}),
    });
    if (err) { setError("Não foi possível salvar."); return; }
    setForm({ ...form, description: "", amount: "", supplier_id: "" });
    load();
  }

  async function pay(id: string) {
    const { error: err } = await supabase.rpc("mark_bill_paid", { p_bill_id: id });
    if (err) setError("Não foi possível dar baixa."); else load();
  }

  async function remove(id: string) {
    const { error: err } = await supabase.from("bills").delete().eq("id", id);
    if (err) setError("Não foi possível excluir."); else load();
  }

  const toPay = bills.filter((b) => b.type === "expense").reduce((s, b) => s + b.amount, 0);
  const toReceive = bills.filter((b) => b.type === "income").reduce((s, b) => s + b.amount, 0);

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <PageHeader title="Contas a pagar e receber" subtitle="Ao dar baixa, o lançamento entra nas transações e a próxima parcela mensal é criada" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card><p className="text-xs font-bold text-gray-500">A pagar</p><p className="text-2xl font-bold text-red-500">{brl(toPay)}</p></Card>
        <Card><p className="text-xs font-bold text-gray-500">A receber</p><p className="text-2xl font-bold text-emerald-500">{brl(toReceive)}</p></Card>
      </div>

      <Card className="mb-6">
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2"><Label>Descrição</Label><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: aluguel, DAS" /></div>
          <div><Label>Valor</Label><input className={inputCls} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></div>
          <div><Label>Vencimento</Label><input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div><Label>Tipo</Label>
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "income" | "expense" })}>
              <option value="expense">A pagar</option><option value="income">A receber</option>
            </select></div>
          <div><Label>Repete</Label>
            <select className={inputCls} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as "none" | "monthly" })}>
              <option value="none">Não</option><option value="monthly">Todo mês</option>
            </select></div>
          {isMei && form.type === "expense" && (
            <label className="md:col-span-5 flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] px-4 py-3 text-sm font-bold">
              <span>Da empresa (MEI)<span className="block text-xs font-normal text-gray-500">Ao pagar, entra nas despesas da empresa</span></span>
              <input type="checkbox" checked={form.biz} onChange={(e) => setForm({ ...form, biz: e.target.checked })} className="h-5 w-5 accent-brand-dark" />
            </label>
          )}
          {isMei && form.type === "expense" && form.biz && suppliers.length > 0 && (
            <div className="md:col-span-2"><SupplierSelect suppliers={suppliers} value={form.supplier_id} onChange={(id) => setForm({ ...form, supplier_id: id })} /></div>
          )}
          <div className="md:col-span-4"><button className={btnCls} type="submit">Adicionar conta</button></div>
        </form>
        <ErrorNote message={error} />
      </Card>

      <Card>
        {bills.length === 0 ? <Empty>Nenhuma conta pendente.</Empty> : (
          <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
            {bills.map((b) => {
              const d = daysUntil(b.due_date);
              const label = d < 0 ? `Vencida há ${-d} dia(s)` : d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`;
              const supplier = b.supplier_id ? supplierById.get(b.supplier_id)?.name : undefined;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{b.description}{b.recurrence === "monthly" && <span className="ml-2 text-xs text-gray-400">mensal</span>}</p>
                    <p className={`text-xs ${d < 0 ? "text-red-500 font-bold" : d <= 3 ? "text-amber-600 font-bold" : "text-gray-500"}`}>{formatDateBR(b.due_date)} · {label}{supplier ? <span className="font-normal text-gray-500"> · {supplier}</span> : null}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${b.type === "income" ? "text-emerald-500" : "text-red-500"}`}>{brl(b.amount)}</span>
                    <button onClick={() => pay(b.id)} className={btnGhostCls}><Check size={14} /> {b.type === "income" ? "Recebi" : "Paguei"}</button>
                    <button onClick={() => remove(b.id)} aria-label="Excluir" className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

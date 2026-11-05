"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronRight, Layers, Pencil, Plus } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useCards, type Card as CardRow } from "@/lib/useCards";
import { useHideValues } from "@/lib/useHideValues";
import { brl, parseMoney, todayISO, formatDateBR } from "@/lib/format";
import { BRANDS, cardUsed, dueDateFor, invoiceMonthFor, invoiceStatus, shiftInvoiceMonth } from "@/lib/cards";
import { InvoiceChip } from "@/components/CardBits";
import { InstitutionBadge, InstitutionSelect } from "@/components/InstitutionBadge";
import { WhoBadge } from "@/components/WhoBadge";
import { usePartnership } from "@/lib/usePartnership";
import { BackTitle, Card, Label, Empty, ErrorNote, Progress, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";
import { loadLogos } from "@/lib/logoImage";

type Acc = { id: string; name: string };
const EMPTY_FORM = { kind: "credito" as "credito" | "debito", name: "", brand: "outro", limit: "", closing: "", due: "", pay_account_id: "", institution: "", logo: null as string | null };

export default function CartoesPage() {
  const { supabase, userId, ready } = useSupabase();
  const { cards, invoices, loading, error: loadError, reload } = useCards();
  const { money } = useHideValues();
  const { nameOf } = usePartnership();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [accs, setAccs] = useState<Acc[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debitSpend, setDebitSpend] = useState<Record<string, number>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => { if (ready && userId) loadLogos(supabase).then(setLogos); }, [ready, userId, supabase, cards]);

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.from("accounts").select("id,name").eq("archived", false).order("created_at").then(({ data }) => setAccs((data ?? []) as Acc[]));
  }, [ready, userId, supabase]);

  // Gasto do mês em cada cartão de débito (compras no débito saem direto da conta, sem fatura).
  useEffect(() => {
    if (!ready || !userId) return;
    const load = () => {
      supabase.from("transactions").select("debit_card_id,amount,type").not("debit_card_id", "is", null).gte("date", `${todayISO().slice(0, 7)}-01`).limit(5000)
        .then(({ data }) => {
          const m: Record<string, number> = {};
          ((data ?? []) as { debit_card_id: string; amount: number | string; type: string }[]).forEach((x) => { m[x.debit_card_id] = (m[x.debit_card_id] ?? 0) + (x.type === "expense" ? Number(x.amount) : -Number(x.amount)); });
          setDebitSpend(m);
        });
    };
    load();
    window.addEventListener("jakash:changed", load);
    return () => window.removeEventListener("jakash:changed", load);
  }, [ready, userId, supabase]);

  const today = todayISO();
  const active = cards.filter((c) => !c.archived && c.kind === "credito");
  const shown = cards.filter((c) => (tab === "active" ? !c.archived : c.archived));
  const openTotal = invoices
    .filter((i) => active.some((c) => c.id === i.card_id))
    .reduce((s, i) => s + Math.max(i.total - i.paid, 0), 0);
  const limitTotal = active.reduce((s, c) => s + c.credit_limit, 0);
  const usedTotal = active.reduce((s, c) => s + cardUsed(invoices, c.id), 0);

  function openNew() { setForm(EMPTY_FORM); setEditing("new"); setError(null); setConfirmDelete(false); }
  function openEdit(c: CardRow) {
    setForm({ kind: c.kind, name: c.name, brand: c.brand, limit: String(c.credit_limit).replace(".", ","), closing: String(c.closing_day), due: String(c.due_day), pay_account_id: c.pay_account_id ?? "", institution: c.institution ?? "", logo: logos[c.id] ?? null });
    setEditing(c.id); setError(null); setConfirmDelete(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const debit = form.kind === "debito";
    let payload;
    if (debit) {
      // Débito não tem limite nem fatura: só precisa da conta de onde o dinheiro sai (1 e 10 são valores de enchimento, ignorados).
      if (!form.name.trim()) { setError("Informe o nome do cartão."); return; }
      if (!form.pay_account_id) { setError("Escolha a conta de onde o débito sai."); return; }
      payload = { kind: "debito", name: form.name.trim(), brand: form.brand, credit_limit: 0, closing_day: 1, due_day: 10, pay_account_id: form.pay_account_id, institution: form.institution || null };
    } else {
      const limit = form.limit.trim() === "" ? 0 : parseMoney(form.limit);
      const closing = Number(form.closing);
      const due = Number(form.due);
      if (!form.name.trim() || Number.isNaN(limit) || limit < 0) { setError("Informe o nome e um limite válido."); return; }
      if (!Number.isInteger(closing) || closing < 1 || closing > 31 || !Number.isInteger(due) || due < 1 || due > 31) {
        setError("Fechamento e vencimento devem ser dias entre 1 e 31."); return;
      }
      payload = { kind: "credito", name: form.name.trim(), brand: form.brand, credit_limit: limit, closing_day: closing, due_day: due, pay_account_id: form.pay_account_id || null, institution: form.institution || null };
    }
    // A imagem só entra no envio quando mudou (assim nada depende da coluna nova para quem não usa imagem).
    const logoChanged = form.logo !== ((editing && editing !== "new" ? logos[editing] : null) ?? null);
    if (logoChanged) payload = { ...payload, logo: form.logo };
    const res = editing === "new"
      ? await supabase.from("credit_cards").insert({ ...payload, user_id: userId })
      : await supabase.from("credit_cards").update(payload).eq("id", editing);
    if (res.error) { setError("Não foi possível salvar o cartão."); return; }
    setEditing(null);
    reload();
  }

  async function setArchived(id: string, archived: boolean) {
    const { error: err } = await supabase.from("credit_cards").update({ archived }).eq("id", id);
    if (err) setError("Não foi possível atualizar."); else reload();
  }

  async function remove() {
    if (!editing || editing === "new") return;
    const { error: err } = await supabase.from("credit_cards").delete().eq("id", editing);
    if (err) { setError("Não foi possível excluir o cartão."); return; }
    setEditing(null);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <BackTitle title="Cartões" subtitle="Crédito com faturas e limites. Débito saindo direto da conta." />
      <SectionTabs group="contas" />

      <button onClick={openNew} className={btnCls + " w-full mb-3"}><Plus size={18} /> Adicionar cartão</button>
      <Link href="/parcelamentos" className="mb-5 flex items-center justify-between rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold"><Layers size={18} className="text-brand-dark dark:text-brand-soft" /> Ver parcelamentos e quando acabam</span>
        <ChevronRight size={18} className="text-gray-300" />
      </Link>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-5">
        {([["active", "Ativos"], ["archived", "Arquivados"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 rounded-xl text-sm font-bold ${tab === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "active" && active.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="!p-4"><p className="text-xs font-bold text-gray-500">Faturas em aberto</p><p className="text-xl font-extrabold">{money(brl(openTotal))}</p></Card>
          <Card className="!p-4"><p className="text-xs font-bold text-gray-500">Limite disponível</p><p className="text-xl font-extrabold">{limitTotal > 0 ? money(brl(Math.max(limitTotal - usedTotal, 0))) : "—"}</p></Card>
        </div>
      )}

      {(error || loadError) && <ErrorNote message={error ?? "Não foi possível carregar os cartões."} />}

      <div className="space-y-3 mt-3">
        {loading ? <Card><Empty>Carregando...</Empty></Card> : shown.length === 0 ? (
          <Card><Empty>{tab === "active" ? "Nenhum cartão ainda. Adicione o primeiro." : "Nenhum cartão arquivado."}</Empty></Card>
        ) : shown.map((c) => {
          if (c.kind === "debito") {
            const accName = accs.find((a) => a.id === c.pay_account_id)?.name;
            return (
              <Card key={c.id} className="!p-4">
                <div className="flex items-center gap-3">
                  <InstitutionBadge institution={c.institution} name={c.name} logo={logos[c.id]} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold truncate flex items-center gap-2">{c.name}<span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">Débito</span></p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">{BRANDS[c.brand] ?? "Outro"} · sai da conta {accName ?? "vinculada"}<WhoBadge name={nameOf(c.user_id)} /></p>
                  </div>
                </div>
                {!c.archived && (
                  <div className="mt-4 rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-3">
                    <p className="text-[11px] font-bold text-gray-500">Gasto no débito este mês</p>
                    <p className="text-lg font-extrabold">{money(brl(Math.max(debitSpend[c.id] ?? 0, 0)))}</p>
                  </div>
                )}
                <div className="flex gap-2 mt-3 justify-end">
                  {!c.archived && <button onClick={() => openEdit(c)} className={btnGhostCls}><Pencil size={14} /> Editar</button>}
                  <button onClick={() => setArchived(c.id, !c.archived)} className={btnGhostCls}>
                    {c.archived ? <><ArchiveRestore size={14} /> Restaurar</> : <><Archive size={14} /> Arquivar</>}
                  </button>
                </div>
              </Card>
            );
          }
          const curMonth = invoiceMonthFor(c, today);
          const get = (m: string) => invoices.find((i) => i.card_id === c.id && i.invoice_month === m);
          const cur = get(curMonth) ?? { total: 0, paid: 0 };
          const prevMonth = shiftInvoiceMonth(curMonth, -1);
          const prev = get(prevMonth);
          const prevRemaining = prev ? prev.total - prev.paid : 0;
          const used = cardUsed(invoices, c.id);
          const pct = c.credit_limit > 0 ? (used / c.credit_limit) * 100 : 0;
          const curStatus = invoiceStatus(c, curMonth, cur.total, cur.paid, today);
          return (
            <Card key={c.id} className="!p-4">
              <div className="flex items-center gap-3">
                <InstitutionBadge institution={c.institution} name={c.name} logo={logos[c.id]} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">{BRANDS[c.brand] ?? "Outro"} · fecha dia {c.closing_day} · vence dia {c.due_day}<WhoBadge name={nameOf(c.user_id)} /></p>
                </div>
              </div>

              {!c.archived && (
                <>
                  <Link href={`/cartoes/${c.id}`} className="mt-4 flex items-center justify-between rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-bold text-gray-500">Fatura atual · vence {formatDateBR(dueDateFor(c, curMonth))}</p>
                      <p className="text-lg font-extrabold">{money(brl(cur.total))}</p>
                    </div>
                    <div className="flex items-center gap-2"><InvoiceChip status={curStatus} /><ChevronRight size={18} className="text-gray-300" /></div>
                  </Link>

                  {prevRemaining > 0.004 && (
                    <Link href={`/cartoes/${c.id}?m=${prevMonth.slice(0, 7)}`} className="mt-2 flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                      <div>
                        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Fatura anterior em aberto · vence {formatDateBR(dueDateFor(c, prevMonth))}</p>
                        <p className="font-extrabold">{money(brl(prevRemaining))}</p>
                      </div>
                      <InvoiceChip status={invoiceStatus(c, prevMonth, prev?.total ?? 0, prev?.paid ?? 0, today)} />
                    </Link>
                  )}

                  {c.credit_limit > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>{money(brl(used))} usados</span>
                        <span>Disponível {money(brl(Math.max(c.credit_limit - used, 0)))}</span>
                      </div>
                      <Progress value={pct} tone={pct >= 100 ? "bad" : pct >= 80 ? "warn" : "ok"} />
                      <p className="text-[11px] text-gray-400 mt-1.5">Limite de {money(brl(c.credit_limit))}</p>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2 mt-3 justify-end">
                {!c.archived && <button onClick={() => openEdit(c)} className={btnGhostCls}><Pencil size={14} /> Editar</button>}
                <button onClick={() => setArchived(c.id, !c.archived)} className={btnGhostCls}>
                  {c.archived ? <><ArchiveRestore size={14} /> Restaurar</> : <><Archive size={14} /> Arquivar</>}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-6">As compras no crédito entram nas despesas e nos limites pela data da compra, e o dinheiro só sai da conta quando você paga a fatura. As compras no débito saem da conta na hora. Mudar o dia de fechamento vale para as próximas compras.</p>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-xl font-extrabold">{editing === "new" ? "Novo cartão" : "Editar cartão"}</h2>
            {editing === "new" ? (
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#262626]" role="group" aria-label="Tipo do cartão">
                {([["credito", "Crédito"], ["debito", "Débito"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })}
                    className={`py-2.5 rounded-xl text-sm font-bold ${form.kind === k ? "bg-white dark:bg-brand-vivid text-brand-dark dark:text-white shadow-sm" : "text-gray-500"}`}>{l}</button>
                ))}
              </div>
            ) : (
              <p className="text-xs font-bold text-gray-500">Cartão de {form.kind === "debito" ? "débito" : "crédito"}</p>
            )}
            <div><Label>Nome do cartão</Label><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Nubank" /></div>
            <InstitutionSelect value={form.institution} onChange={(v) => setForm({ ...form, institution: v })} name={form.name} logo={form.logo} onLogoChange={(v) => setForm({ ...form, logo: v })} />
            {form.kind === "credito" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Bandeira</Label>
                    <select className={inputCls} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
                      {Object.entries(BRANDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></div>
                  <div><Label>Limite</Label><input className={inputCls} inputMode="decimal" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} placeholder="0,00" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Dia de fechamento</Label><input className={inputCls} inputMode="numeric" value={form.closing} onChange={(e) => setForm({ ...form, closing: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Ex.: 25" /></div>
                  <div><Label>Dia de vencimento</Label><input className={inputCls} inputMode="numeric" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Ex.: 5" /></div>
                </div>
                {accs.length > 0 && (
                  <div><Label>Conta que paga a fatura (opcional)</Label>
                    <select className={inputCls} value={form.pay_account_id} onChange={(e) => setForm({ ...form, pay_account_id: e.target.value })}>
                      <option value="">Escolher na hora de pagar</option>
                      {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select></div>
                )}
              </>
            ) : (
              <>
                <div><Label>Bandeira</Label>
                  <select className={inputCls} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
                    {Object.entries(BRANDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><Label>Conta de onde o débito sai</Label>
                  {accs.length === 0 ? (
                    <p className="text-sm text-gray-500">Cadastre antes uma <Link href="/contas-bancarias" className="font-bold text-brand-dark dark:text-brand-soft">conta bancária</Link>.</p>
                  ) : (
                    <select className={inputCls} value={form.pay_account_id} onChange={(e) => setForm({ ...form, pay_account_id: e.target.value })}>
                      <option value="">Escolher</option>
                      {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                  <p className="text-xs text-gray-500 mt-1">As compras no débito descontam do saldo dessa conta na hora, sem fatura.</p></div>
              </>
            )}
            <ErrorNote message={error} />
            <div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button><button className={btnCls + " flex-1"} type="submit">Salvar</button></div>
            {editing !== "new" && (
              confirmDelete ? (
                <button type="button" onClick={remove} className="w-full text-sm font-bold text-red-500 py-2">Confirmar: apagar o cartão e todas as compras e pagamentos dele</button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-sm font-bold text-red-500/80 py-2">Excluir cartão</button>
              )
            )}
          </form>
        </div>
      )}
    </div>
  );
}

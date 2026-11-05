"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, parseMoney, todayISO } from "@/lib/format";
import { KIND_LABEL, type RevenueKind } from "@/lib/mei";
import { buildPixPayload, validatePixKey, type PixKeyType } from "@/lib/pix";
import { daysLate, receivableLevel, receivableTotals, waLink } from "@/lib/meiClients";
import { UF_LIST, normalizeCep, normalizeUf, formatCep } from "@/lib/meiNota";
import { BackTitle, Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

type Client = {
  id: string; name: string; document: string | null; phone: string | null; email: string | null; notes: string | null; archived: boolean;
  cep: string | null; address: string | null; address_number: string | null; address_complement: string | null; neighborhood: string | null; city: string | null; uf: string | null;
};
type Bill = { id: string; description: string; amount: number; due_date: string; client_id: string | null; revenue_kind: RevenueKind | null };
type Paid = { id: string; client_id: string; amount: number; date: string; description: string };
type PixProf = { pix_key: string | null; pix_key_type: string | null; pix_name: string | null; pix_city: string | null; mei_activity: RevenueKind };

const emptyClient = { name: "", document: "", phone: "", email: "", notes: "", cep: "", address: "", address_number: "", address_complement: "", neighborhood: "", city: "", uf: "" };

export default function ClientesPage() {
  const { supabase, userId, ready } = useSupabase();
  const today = todayISO();
  const [tab, setTab] = useState<"receber" | "clientes">("receber");
  const [clients, setClients] = useState<Client[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [paid, setPaid] = useState<Paid[]>([]);
  const [prof, setProf] = useState<PixProf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cForm, setCForm] = useState(emptyClient);
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [bForm, setBForm] = useState({ client_id: "", description: "", amount: "", due_date: today, kind: "servicos" as RevenueKind });

  const load = useCallback(async () => {
    const [c, b, t, p] = await Promise.all([
      supabase.from("mei_clients").select("id,name,document,phone,email,notes,archived,cep,address,address_number,address_complement,neighborhood,city,uf").order("name"),
      supabase.from("bills").select("id,description,amount,due_date,client_id,revenue_kind").eq("user_id", userId!).eq("status", "pending").eq("type", "income").eq("is_business", true).order("due_date"),
      supabase.from("transactions").select("id,client_id,amount,date,description").eq("user_id", userId!).eq("is_business", true).eq("type", "income").not("client_id", "is", null).order("date", { ascending: false }).limit(2000),
      supabase.from("profiles").select("pix_key,pix_key_type,pix_name,pix_city,mei_activity").eq("id", userId!).maybeSingle(),
    ]);
    if (c.error || b.error || t.error) setError("Não foi possível carregar os clientes.");
    else setError(null);
    setClients((c.data ?? []) as Client[]);
    setBills(((b.data ?? []) as Bill[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setPaid(((t.data ?? []) as Paid[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    const pr = p.data as PixProf | null;
    setProf(pr);
    if (pr) setBForm((f) => ({ ...f, kind: pr.mei_activity }));
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 2800); };
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const totals = receivableTotals(bills, today);

  async function addBill(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseMoney(bForm.amount);
    if (!bForm.description.trim() || !(amount > 0)) { setError("Informe a descrição e um valor maior que zero."); return; }
    const { error: err } = await supabase.from("bills").insert({
      user_id: userId, description: bForm.description.trim(), amount, due_date: bForm.due_date, type: "income",
      is_business: true, revenue_kind: bForm.kind, client_id: bForm.client_id || null,
    });
    if (err) { setError("Não foi possível registrar a cobrança."); return; }
    setBForm({ ...bForm, description: "", amount: "" });
    flash("Cobrança registrada.");
    load();
  }

  async function receive(id: string) {
    const { error: err } = await supabase.rpc("mark_bill_paid", { p_bill_id: id });
    if (err) setError("Não foi possível dar baixa."); else { flash("Recebido! Entrou na receita da empresa."); window.dispatchEvent(new Event("jakash:changed")); }
  }

  async function removeBill(id: string) {
    const { error: err } = await supabase.from("bills").delete().eq("id", id);
    if (err) setError("Não foi possível excluir."); else load();
  }

  function chargeLink(b: Bill): string {
    const c = b.client_id ? byId.get(b.client_id) : undefined;
    const late = daysLate(b.due_date, today);
    let text = `Olá${c ? `, ${c.name.split(" ")[0]}` : ""}! ${late > 0 ? `Passando para lembrar que o pagamento de` : `Segue a cobrança de`} ${b.description}, no valor de ${brl(b.amount)}, ${late > 0 ? `venceu em ${formatDateBR(b.due_date)}.` : `com vencimento em ${formatDateBR(b.due_date)}.`}`;
    if (prof?.pix_key && prof.pix_key_type && prof.pix_name && prof.pix_city && !validatePixKey(prof.pix_key_type as PixKeyType, prof.pix_key)) {
      const code = buildPixPayload({ type: prof.pix_key_type as PixKeyType, key: prof.pix_key, name: prof.pix_name, city: prof.pix_city, amount: b.amount, description: b.description });
      text += `\n\nPix copia e cola:\n${code}`;
    }
    return waLink(c?.phone, text);
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cForm.name.trim()) { setError("Informe o nome do cliente."); return; }
    // Endereço do cliente: serve à ficha da nota fiscal (tomador). CEP e UF precisam estar no formato certo.
    if (cForm.cep.trim() && !normalizeCep(cForm.cep)) { setError("O CEP tem 8 números."); return; }
    if (cForm.uf.trim() && !normalizeUf(cForm.uf)) { setError("O estado (UF) deve ter 2 letras, como SP."); return; }
    const row = {
      name: cForm.name.trim(), document: cForm.document.trim() || null, phone: cForm.phone.trim() || null,
      email: cForm.email.trim() || null, notes: cForm.notes.trim() || null,
      cep: normalizeCep(cForm.cep), address: cForm.address.trim() || null, address_number: cForm.address_number.trim() || null,
      address_complement: cForm.address_complement.trim() || null, neighborhood: cForm.neighborhood.trim() || null, city: cForm.city.trim() || null, uf: normalizeUf(cForm.uf),
    };
    const { error: err } = editing
      ? await supabase.from("mei_clients").update(row).eq("id", editing)
      : await supabase.from("mei_clients").insert({ user_id: userId, ...row });
    if (err) { setError("Não foi possível salvar o cliente."); return; }
    setCForm(emptyClient);
    setEditing(null);
    flash(editing ? "Cliente atualizado." : "Cliente cadastrado.");
    load();
  }

  async function setArchived(id: string, archived: boolean) {
    const { error: err } = await supabase.from("mei_clients").update({ archived }).eq("id", id);
    if (err) setError("Não foi possível atualizar."); else load();
  }

  function edit(c: Client) {
    setEditing(c.id);
    setCForm({
      name: c.name, document: c.document ?? "", phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "",
      cep: c.cep ? formatCep(c.cep) : "", address: c.address ?? "", address_number: c.address_number ?? "", address_complement: c.address_complement ?? "",
      neighborhood: c.neighborhood ?? "", city: c.city ?? "", uf: c.uf ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeClients = clients.filter((c) => !c.archived);
  const visibleClients = clients.filter((c) => showArchived || !c.archived);

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <BackTitle title="Clientes e a receber" subtitle="Quem ainda não te pagou, cobrança no WhatsApp com Pix e o histórico de cada cliente." href="/mei" />
      <ErrorNote message={error} />
      {note && <p className="text-sm font-bold text-emerald-600">{note}</p>}

      <div className="flex gap-2" role="tablist">
        {([["receber", "A receber"], ["clientes", "Clientes"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${tab === k ? "bg-brand-dark text-white dark:bg-brand-vivid" : "bg-white/70 dark:bg-[#1E1E1E] text-gray-600 dark:text-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Empty>Carregando…</Empty> : tab === "receber" ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card><p className="text-xs font-bold text-gray-500">Em aberto</p><p className="text-2xl font-extrabold">{brl(totals.open)}</p><p className="text-xs text-gray-500 mt-1">{totals.count} cobrança{totals.count === 1 ? "" : "s"}</p></Card>
            <Card><p className="text-xs font-bold text-gray-500">Atrasado</p><p className={`text-2xl font-extrabold ${totals.late > 0 ? "text-red-500" : ""}`}>{brl(totals.late)}</p><p className="text-xs text-gray-500 mt-1">{totals.lateCount} atrasada{totals.lateCount === 1 ? "" : "s"}</p></Card>
          </div>

          <Card>
            <h2 className="font-extrabold text-lg mb-3">Nova cobrança</h2>
            <form onSubmit={addBill} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Cliente (opcional)</Label>
                <select className={inputCls} value={bForm.client_id} onChange={(e) => setBForm({ ...bForm, client_id: e.target.value })}>
                  <option value="">Sem cliente</option>
                  {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><Label>Descrição</Label><input className={inputCls} maxLength={120} value={bForm.description} onChange={(e) => setBForm({ ...bForm, description: e.target.value })} placeholder="Ex.: Serviço de outubro" /></div>
              <div><Label>Valor</Label><input className={inputCls} inputMode="decimal" value={bForm.amount} onChange={(e) => setBForm({ ...bForm, amount: e.target.value })} placeholder="0,00" /></div>
              <div><Label>Vencimento</Label><input type="date" className={inputCls} value={bForm.due_date} onChange={(e) => setBForm({ ...bForm, due_date: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Tipo da receita (para a DASN)</Label>
                <select className={inputCls} value={bForm.kind} onChange={(e) => setBForm({ ...bForm, kind: e.target.value as RevenueKind })}>
                  {(Object.keys(KIND_LABEL) as RevenueKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select></div>
              <div className="sm:col-span-2"><button className={btnCls} type="submit">Registrar cobrança</button></div>
            </form>
            {!(prof?.pix_key && prof.pix_name && prof.pix_city) && (
              <p className="text-xs text-gray-500 mt-3">Cadastre sua chave Pix em Pacote MEI › Cobrar por Pix e a mensagem de cobrança já leva o código “copia e cola”.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg mb-1">Cobranças em aberto</h2>
            {bills.length === 0 ? <Empty>Nada a receber. Quando registrar uma cobrança, ela aparece aqui.</Empty> : (
              <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
                {bills.map((b) => {
                  const lvl = receivableLevel(b.due_date, today);
                  const late = daysLate(b.due_date, today);
                  const c = b.client_id ? byId.get(b.client_id) : undefined;
                  return (
                    <li key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold truncate">{b.description}</p>
                        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-1.5">
                          {c ? c.name : "Sem cliente"} · vence {formatDateBR(b.due_date)}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${lvl === "atrasada" ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" : lvl === "vence_hoje" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-brand-dark/10 text-brand-dark dark:bg-[#262626] dark:text-brand-soft"}`}>
                            {lvl === "atrasada" ? `${late} dia${late === 1 ? "" : "s"} de atraso` : lvl === "vence_hoje" ? "vence hoje" : "a vencer"}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <span className="font-extrabold text-emerald-600 whitespace-nowrap mr-1">{brl(b.amount)}</span>
                        <a className={btnGhostCls} href={chargeLink(b)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Cobrar</a>
                        <button type="button" className={btnCls + " !px-4 !py-2"} onClick={() => receive(b.id)}><Check size={14} /> Recebi</button>
                        <button type="button" className="p-2 text-gray-400 hover:text-red-500" onClick={() => removeBill(b.id)} aria-label="Excluir cobrança"><Trash2 size={16} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <h2 className="font-extrabold text-lg mb-3">{editing ? "Editar cliente" : "Novo cliente"}</h2>
            <form onSubmit={saveClient} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label>Nome</Label><input className={inputCls} maxLength={120} value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} /></div>
              <div><Label>WhatsApp</Label><input className={inputCls} maxLength={20} inputMode="tel" value={cForm.phone} onChange={(e) => setCForm({ ...cForm, phone: e.target.value })} placeholder="(11) 99999-8888" /></div>
              <div><Label>CPF ou CNPJ (opcional)</Label><input className={inputCls} maxLength={20} value={cForm.document} onChange={(e) => setCForm({ ...cForm, document: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>E-mail (opcional)</Label><input type="email" className={inputCls} maxLength={120} value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Observações (opcional)</Label><input className={inputCls} maxLength={500} value={cForm.notes} onChange={(e) => setCForm({ ...cForm, notes: e.target.value })} /></div>
              <details className="sm:col-span-2 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4" open={Boolean(cForm.cep || cForm.address || cForm.city)}>
                <summary className="cursor-pointer text-sm font-bold">Endereço do cliente (para a ficha da nota fiscal)</summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div><Label>CEP</Label><input className={inputCls} maxLength={9} inputMode="numeric" value={cForm.cep} onChange={(e) => setCForm({ ...cForm, cep: e.target.value })} placeholder="00000-000" /></div>
                  <div><Label>Logradouro</Label><input className={inputCls} maxLength={120} value={cForm.address} onChange={(e) => setCForm({ ...cForm, address: e.target.value })} placeholder="Rua, avenida..." /></div>
                  <div><Label>Número</Label><input className={inputCls} maxLength={20} value={cForm.address_number} onChange={(e) => setCForm({ ...cForm, address_number: e.target.value })} /></div>
                  <div><Label>Complemento (opcional)</Label><input className={inputCls} maxLength={60} value={cForm.address_complement} onChange={(e) => setCForm({ ...cForm, address_complement: e.target.value })} /></div>
                  <div><Label>Bairro</Label><input className={inputCls} maxLength={80} value={cForm.neighborhood} onChange={(e) => setCForm({ ...cForm, neighborhood: e.target.value })} /></div>
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <div><Label>Município</Label><input className={inputCls} maxLength={80} value={cForm.city} onChange={(e) => setCForm({ ...cForm, city: e.target.value })} /></div>
                    <div><Label>UF</Label>
                      <select className={inputCls} value={cForm.uf} onChange={(e) => setCForm({ ...cForm, uf: e.target.value })}>
                        <option value="">--</option>
                        {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select></div>
                  </div>
                </div>
              </details>
              <div className="sm:col-span-2 flex gap-2">
                <button className={btnCls} type="submit">{editing ? "Salvar" : "Cadastrar cliente"}</button>
                {editing && <button type="button" className={btnGhostCls + " !py-2.5 !px-4"} onClick={() => { setEditing(null); setCForm(emptyClient); }}>Cancelar</button>}
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="font-extrabold text-lg">Seus clientes</h2>
              {clients.some((c) => c.archived) && (
                <button type="button" className="text-xs font-bold text-brand-dark dark:text-brand-soft" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}</button>
              )}
            </div>
            {visibleClients.length === 0 ? <Empty>Nenhum cliente ainda. Cadastre o primeiro acima.</Empty> : (
              <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
                {visibleClients.map((c) => {
                  const received = paid.filter((p) => p.client_id === c.id);
                  const pending = bills.filter((b) => b.client_id === c.id);
                  const totalReceived = received.reduce((s, p) => s + p.amount, 0);
                  const totalPending = pending.reduce((s, b) => s + b.amount, 0);
                  const isOpen = open === c.id;
                  return (
                    <li key={c.id} className={`py-3 ${c.archived ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                          <p className="font-bold truncate flex items-center gap-1.5">{c.name}<ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} /></p>
                          <p className="text-xs text-gray-500">Recebido {brl(totalReceived)}{totalPending > 0 ? ` · a receber ${brl(totalPending)}` : ""}</p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" className="p-2 text-gray-400 hover:text-brand-dark" onClick={() => edit(c)} aria-label={`Editar ${c.name}`}><Pencil size={16} /></button>
                          <button type="button" className="p-2 text-gray-400 hover:text-brand-dark" onClick={() => setArchived(c.id, !c.archived)} aria-label={c.archived ? `Restaurar ${c.name}` : `Arquivar ${c.name}`}>
                            {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="mt-3 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4 text-sm space-y-3">
                          <p className="text-xs text-gray-500">{[c.phone, c.email, c.document].filter(Boolean).join(" · ") || "Sem contato cadastrado."}</p>
                          {c.notes && <p className="text-xs">{c.notes}</p>}
                          {(c.address || c.city) && <p className="text-xs text-gray-500">{[c.address, c.address_number, c.neighborhood, c.city && c.uf ? `${c.city}/${c.uf}` : c.city, c.cep ? formatCep(c.cep) : ""].filter(Boolean).join(", ")}</p>}
                          {pending.length > 0 && (
                            <div><p className="text-xs font-bold text-gray-500 mb-1">Em aberto</p>
                              <ul className="space-y-1">{pending.map((b) => <li key={b.id} className="flex justify-between gap-3"><span className="truncate">{b.description} · {formatDateBR(b.due_date)}</span><span className="font-bold whitespace-nowrap">{brl(b.amount)}</span></li>)}</ul></div>
                          )}
                          <div><p className="text-xs font-bold text-gray-500 mb-1">Histórico de recebimentos</p>
                            {received.length === 0 ? <p className="text-xs text-gray-500">Nenhum recebimento ligado a este cliente ainda.</p> : (
                              <ul className="space-y-1">{received.slice(0, 12).map((p) => <li key={p.id} className="flex justify-between gap-3"><span className="truncate">{p.description} · {formatDateBR(p.date)}</span><span className="font-bold text-emerald-600 whitespace-nowrap">{brl(p.amount)}</span></li>)}</ul>
                            )}</div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, Copy, Pencil, Plus, Search, Truck, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, todayISO } from "@/lib/format";
import {
  CATEGORY_SUGGESTIONS, EMPTY_SUPPLIER_FORM, EMPTY_SUPPLIER_SUMMARY, SUPPLIER_LIMITS, documentKind, filterSuppliers, formatDocument, overallTotals,
  summarizeSuppliers, supplierRow, supplierToForm, type PayableRow, type PurchaseRow, type Supplier, type SupplierForm,
} from "@/lib/meiSuppliers";
import { BackTitle, Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

export default function FornecedoresPage() {
  const { supabase, userId, ready } = useSupabase();
  const today = todayISO();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Janela de cadastro: `id` null = novo fornecedor.
  const [modal, setModal] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_SUPPLIER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, b, t] = await Promise.all([
      supabase.from("mei_suppliers").select("id,name,document,phone,email,pix_key,category,notes,archived").order("name"),
      supabase.from("bills").select("id,description,amount,due_date,supplier_id").eq("user_id", userId!).eq("status", "pending").eq("type", "expense").not("supplier_id", "is", null).order("due_date"),
      supabase.from("transactions").select("id,supplier_id,amount,date,description").eq("user_id", userId!).eq("is_business", true).eq("type", "expense").not("supplier_id", "is", null).order("date", { ascending: false }).limit(2000),
    ]);
    if (s.error || b.error || t.error) setError("Não foi possível carregar os fornecedores.");
    else setError(null);
    setSuppliers((s.data ?? []) as Supplier[]);
    setPayables(((b.data ?? []) as PayableRow[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setPurchases(((t.data ?? []) as PurchaseRow[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const closeModal = useCallback(() => { setModal(null); setFormError(null); }, []);
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 2800); };
  const summaries = useMemo(() => summarizeSuppliers(purchases, payables, today), [purchases, payables, today]);
  const totals = useMemo(() => overallTotals(summaries.values()), [summaries]);
  const visible = useMemo(() => filterSuppliers(suppliers, query, showArchived), [suppliers, query, showArchived]);
  const hasArchived = suppliers.some((s) => s.archived);

  function openNew() {
    setForm(EMPTY_SUPPLIER_FORM);
    setFormError(null);
    setModal({ id: null });
  }

  function openEdit(s: Supplier) {
    setForm(supplierToForm(s));
    setFormError(null);
    setModal({ id: s.id });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setFormError(null);
    const r = supplierRow(form);
    if (!r.ok) { setFormError(r.error); return; }
    setSaving(true);
    const { error: err } = modal.id
      ? await supabase.from("mei_suppliers").update(r.row).eq("id", modal.id)
      : await supabase.from("mei_suppliers").insert({ user_id: userId, ...r.row });
    setSaving(false);
    if (err) { setFormError("Não foi possível salvar o fornecedor."); return; }
    const wasNew = !modal.id;
    closeModal();
    flash(wasNew ? "Fornecedor cadastrado." : "Fornecedor atualizado.");
    load();
  }

  async function setArchived(s: Supplier, archived: boolean) {
    const { error: err } = await supabase.from("mei_suppliers").update({ archived }).eq("id", s.id);
    if (err) { setError("Não foi possível atualizar."); return; }
    if (modal?.id === s.id) closeModal();
    flash(archived ? "Fornecedor arquivado. O histórico dele continua guardado." : "Fornecedor restaurado.");
    load();
  }

  async function copyPix(s: Supplier) {
    if (!s.pix_key) return;
    try {
      await navigator.clipboard.writeText(s.pix_key);
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1800);
    } catch {
      setError("Não consegui copiar. Selecione a chave e copie manualmente.");
    }
  }

  const editing = modal?.id ? suppliers.find((s) => s.id === modal.id) : undefined;

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <BackTitle title="Fornecedores" subtitle="Quem te vende, quanto você já comprou de cada um e o que ainda falta pagar." href="/mei" />
      <ErrorNote message={error} />
      {note && <p role="status" className="text-sm font-bold text-emerald-600">{note}</p>}

      {loading ? <Empty>Carregando…</Empty> : suppliers.length === 0 ? (
        <Card className="text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-brand-dark/10 dark:bg-white/5 inline-flex items-center justify-center text-brand-dark dark:text-brand-soft mb-3"><Truck size={26} /></span>
          <h2 className="font-extrabold text-lg">Nenhum fornecedor ainda</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Cadastre quem te vende e veja quanto já comprou e quanto ainda deve a cada um.</p>
          <button type="button" className={btnCls + " mt-4"} onClick={openNew}><Plus size={16} /> Cadastrar o primeiro fornecedor</button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-xs font-bold text-gray-500">Comprado no mês</p>
              <p className="text-2xl font-extrabold">{brl(totals.month)}</p>
              <p className="text-xs text-gray-500 mt-1">{brl(totals.year)} no ano</p>
            </Card>
            <Card>
              <p className="text-xs font-bold text-gray-500">A pagar aos fornecedores</p>
              <p className="text-2xl font-extrabold">{brl(totals.open)}</p>
              <p className={`text-xs mt-1 ${totals.overdueCount > 0 ? "font-bold text-red-500" : "text-gray-500"}`}>
                {totals.overdueCount > 0 ? `${brl(totals.overdue)} em atraso` : `${totals.openCount} conta${totals.openCount === 1 ? "" : "s"} em aberto`}
              </p>
            </Card>
          </div>

          <Card>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input className={inputCls + " !pl-10"} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, o que fornece ou CNPJ" aria-label="Buscar fornecedor" />
              </div>
              <button type="button" className={btnCls + " shrink-0"} onClick={openNew}><Plus size={16} /> Novo fornecedor</button>
            </div>
            {hasArchived && (
              <button type="button" className="text-xs font-bold text-brand-dark dark:text-brand-soft" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
              </button>
            )}

            {visible.length === 0 ? (
              <Empty>{query.trim() ? `Nenhum fornecedor encontrado para “${query.trim()}”.` : "Nenhum fornecedor ativo. Mostre os arquivados ou cadastre um novo."}</Empty>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
                {visible.map((s) => {
                  const sum = summaries.get(s.id) ?? EMPTY_SUPPLIER_SUMMARY;
                  const isOpen = open === s.id;
                  return (
                    <li key={s.id} className={`py-3 ${s.archived ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                          <p className="font-bold truncate flex items-center gap-1.5">
                            <span className="truncate">{s.name}</span>
                            {s.archived && <span className="shrink-0 rounded-full bg-gray-100 dark:bg-[#262626] px-2 py-0.5 text-[10px] font-bold text-gray-500">Arquivado</span>}
                            <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </p>
                          <p className="text-xs text-gray-500">
                            {s.category ? `${s.category} · ` : ""}Comprado no mês {brl(sum.month)}
                            {sum.openCount > 0 && <span className={sum.overdueCount > 0 ? "font-bold text-red-500" : ""}> · a pagar {brl(sum.openTotal)}</span>}
                          </p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" className="p-2 text-gray-400 hover:text-brand-dark" onClick={() => openEdit(s)} aria-label={`Editar ${s.name}`}><Pencil size={16} /></button>
                          <button type="button" className="p-2 text-gray-400 hover:text-brand-dark" onClick={() => setArchived(s, !s.archived)} aria-label={s.archived ? `Restaurar ${s.name}` : `Arquivar ${s.name}`}>
                            {s.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="mt-3 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4 text-sm space-y-4">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-white/70 dark:bg-[#161616] p-2.5"><p className="text-[11px] text-gray-500">No mês</p><p className="font-extrabold text-sm">{brl(sum.month)}</p></div>
                            <div className="rounded-xl bg-white/70 dark:bg-[#161616] p-2.5"><p className="text-[11px] text-gray-500">No ano</p><p className="font-extrabold text-sm">{brl(sum.year)}</p></div>
                            <div className="rounded-xl bg-white/70 dark:bg-[#161616] p-2.5">
                              <p className="text-[11px] text-gray-500">A pagar</p>
                              <p className={`font-extrabold text-sm ${sum.overdueCount > 0 ? "text-red-500" : ""}`}>{brl(sum.openTotal)}</p>
                            </div>
                          </div>
                          {sum.nextDue && <p className="text-xs text-gray-500 -mt-2">Próximo vencimento: <span className="font-bold">{formatDateBR(sum.nextDue)}</span></p>}

                          <div className="space-y-1">
                            <p className="text-xs text-gray-500">
                              {[s.phone, s.email, s.document ? `${documentKind(s.document) === "cpf" ? "CPF" : "CNPJ"} ${formatDocument(s.document)}` : null].filter(Boolean).join(" · ") || "Sem contato cadastrado."}
                            </p>
                            {s.notes && <p className="text-xs">{s.notes}</p>}
                          </div>

                          {s.pix_key && (
                            <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 dark:bg-[#161616] px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="text-[11px] text-gray-500">Chave Pix</p>
                                <p className="font-bold text-sm break-all">{s.pix_key}</p>
                              </div>
                              <button type="button" className={btnGhostCls + " shrink-0"} onClick={() => copyPix(s)} aria-label={`Copiar a chave Pix de ${s.name}`}>
                                {copied === s.id ? <><Check size={14} /> Copiada</> : <><Copy size={14} /> Copiar</>}
                              </button>
                            </div>
                          )}

                          <div>
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <p className="text-xs font-bold text-gray-500">Contas a pagar</p>
                              {sum.open.length > 0 && <Link href="/contas" className="text-xs font-bold text-brand-dark dark:text-brand-soft">Dar baixa em Contas a pagar</Link>}
                            </div>
                            {sum.open.length === 0 ? <p className="text-xs text-gray-500">Nada em aberto com este fornecedor.</p> : (
                              <ul className="space-y-1">
                                {sum.open.map((b) => (
                                  <li key={b.id} className="flex justify-between gap-3">
                                    <span className="truncate">
                                      {b.description} · {formatDateBR(b.due_date)}
                                      {b.due_date < today && <span className="ml-1.5 rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">atrasada</span>}
                                    </span>
                                    <span className="font-bold whitespace-nowrap">{brl(b.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-bold text-gray-500 mb-1">Últimas compras</p>
                            {sum.recent.length === 0 ? (
                              <p className="text-xs text-gray-500">Nenhuma compra ligada a este fornecedor ainda. Ao lançar uma despesa da empresa, escolha o fornecedor.</p>
                            ) : (
                              <ul className="space-y-1">
                                {sum.recent.map((p) => (
                                  <li key={p.id} className="flex justify-between gap-3">
                                    <span className="truncate">{p.description} · {formatDateBR(p.date)}</span>
                                    <span className="font-bold whitespace-nowrap">{brl(p.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closeModal}>
          <form role="dialog" aria-modal="true" aria-labelledby="fornecedor-titulo" onSubmit={save} onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 id="fornecedor-titulo" className="text-xl font-extrabold">{modal.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>
              <button type="button" onClick={closeModal} aria-label="Fechar" className="text-gray-400"><X size={20} /></button>
            </div>

            <div><Label>Nome</Label><input autoFocus className={inputCls} maxLength={SUPPLIER_LIMITS.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Papelaria Central" /></div>
            <div>
              <Label>O que ele fornece (opcional)</Label>
              <input className={inputCls} list="fornecedor-categorias" maxLength={SUPPLIER_LIMITS.category} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Matéria-prima" />
              <datalist id="fornecedor-categorias">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>CPF ou CNPJ (opcional)</Label>
                <input className={inputCls} inputMode="numeric" maxLength={18} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })}
                  onBlur={() => { if (documentKind(form.document)) setForm((f) => ({ ...f, document: formatDocument(f.document) })); }} /></div>
              <div><Label>Telefone ou WhatsApp</Label><input className={inputCls} inputMode="tel" maxLength={SUPPLIER_LIMITS.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-8888" /></div>
            </div>
            <div><Label>E-mail (opcional)</Label><input type="email" className={inputCls} maxLength={SUPPLIER_LIMITS.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <Label>Chave Pix (opcional)</Label>
              <input className={inputCls} maxLength={SUPPLIER_LIMITS.pix_key} value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>
            <div><Label>Observações (opcional)</Label><input className={inputCls} maxLength={SUPPLIER_LIMITS.notes} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex.: entrega às terças, pedido mínimo de R$ 200" /></div>

            <ErrorNote message={formError} />
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} type="submit" disabled={saving}>{saving ? "Salvando..." : modal.id ? "Salvar" : "Cadastrar fornecedor"}</button>
              <button type="button" className={btnGhostCls + " !py-2.5 !px-4"} onClick={closeModal}>Cancelar</button>
              {editing && (
                <button type="button" className={btnGhostCls + " !py-2.5 !px-4 sm:ml-auto"} onClick={() => setArchived(editing, !editing.archived)}>
                  {editing.archived ? <><ArchiveRestore size={14} /> Restaurar</> : <><Archive size={14} /> Arquivar</>}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

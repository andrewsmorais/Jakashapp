"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Pencil, Plus, Send, Trash2, Wrench } from "lucide-react";
import { brl, formatDateBR, parseMoney, todayISO } from "@/lib/format";
import { maintenanceCost, maintenanceTotal, VEHICLE_KINDS, plateLabel, type Maintenance, type Vehicle } from "@/lib/driver";
import { Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

const EMPTY = { date: todayISO(), vehicle_id: "", shop: "", part: "", part_cost: "", labor_cost: "", bought_at: "", km: "" };
const str = (n: number) => (n ? String(n).replace(".", ",") : "");
const isoDaysAgo = (n: number) => { const v = new Date(Date.now() - n * 86_400_000); return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`; };

// Gastos com mecânica do veículo: oficina, peça e mão de obra. Entram nas despesas dos Relatórios do mesmo período.
export function MaintenancePanel({ supabase, userId, vehicles, items, vehicleId, onChanged, onAddVehicle, reportOnly = false }: {
  supabase: unknown; userId: string; vehicles: Vehicle[]; items: Maintenance[]; vehicleId: string; onChanged: () => void;
  /** Leva para a aba Veículos, para cadastrar um veículo novo. */
  onAddVehicle?: () => void;
  /** Dentro dos Relatórios: só consulta (sem formulário, editar, excluir ou lançar). */
  reportOnly?: boolean;
}) {
  const db = supabase as SupabaseClient;
  const active = vehicles.filter((v) => !v.archived);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = items.filter((m) => !vehicleId || m.vehicle_id === vehicleId);
  const total = maintenanceTotal(shown);
  const vName = (id: string | null) => vehicles.find((v) => v.id === id)?.name ?? "Veículo removido";
  const byVehicle = Array.from(new Set(shown.map((m) => m.vehicle_id))).map((id) => ({ id, total: maintenanceTotal(shown.filter((m) => m.vehicle_id === id)) })).sort((a, b) => b.total - a.total);

  const partV = form.part_cost.trim() ? parseMoney(form.part_cost) : 0;
  const laborV = form.labor_cost.trim() ? parseMoney(form.labor_cost) : 0;
  const formTotal = (Number.isNaN(partV) ? 0 : partV) + (Number.isNaN(laborV) ? 0 : laborV);

  function open(m: Maintenance | null) {
    setForm(m ? { date: m.date, vehicle_id: m.vehicle_id ?? "", shop: m.shop ?? "", part: m.part, part_cost: str(m.part_cost), labor_cost: str(m.labor_cost), bought_at: m.bought_at ?? "", km: m.km != null ? str(m.km) : "" }
      : { ...EMPTY, date: todayISO(), vehicle_id: vehicleId || (active.length === 1 ? active[0].id : "") });
    setEditing(m ? m.id : "new"); setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id) { setError("Escolha o veículo."); return; }
    if ([partV, laborV].some((n) => Number.isNaN(n) || n < 0)) { setError("Confira os valores."); return; }
    if (!(partV + laborV > 0)) { setError("Informe o valor da peça ou da mão de obra."); return; }
    const kmV = form.km.trim() ? parseMoney(form.km) : null;
    if (kmV !== null && (Number.isNaN(kmV) || kmV < 0)) { setError("Confira o km do veículo."); return; }
    if (form.date > todayISO()) { setError("A data não pode ser no futuro."); return; }
    setBusy(true);
    const payload = { date: form.date, vehicle_id: form.vehicle_id, shop: form.shop.trim().slice(0, 80) || null, part: form.part.trim() || "Manutenção", part_cost: partV, labor_cost: laborV, bought_at: form.bought_at.trim().slice(0, 80) || null, km: kmV };
    const res = editing === "new" ? await db.from("driver_maintenance").insert({ ...payload, user_id: userId }) : await db.from("driver_maintenance").update(payload).eq("id", editing as string);
    setBusy(false);
    if (res.error) { setError("Não foi possível salvar o gasto."); return; }
    setEditing(null); setForm(EMPTY); onChanged();
  }

  async function remove(m: Maintenance) {
    if (!window.confirm(`Excluir a manutenção de ${formatDateBR(m.date)}?${m.tx_id ? " O lançamento que você mandou para o financeiro continua lá." : ""}`)) return;
    const res = await db.from("driver_maintenance").delete().eq("id", m.id);
    if (res.error) setError("Não foi possível excluir."); else onChanged();
  }

  // Manda o gasto para o financeiro como despesa (categoria Transporte › Manutenção do veículo, se existir).
  async function launch(m: Maintenance) {
    setError(null);
    const cat = await db.from("categories").select("id").eq("is_default", true).is("user_id", null).ilike("name", "Manutenção do veículo").limit(1).maybeSingle();
    const tx = await db.from("transactions").insert({
      user_id: userId, description: `Mecânica${m.shop ? `: ${m.shop}` : ""}`.slice(0, 120), amount: maintenanceCost(m), type: "expense", date: m.date,
      category_id: (cat.data as { id: string } | null)?.id ?? null, origin: "manual", is_business: false,
    }).select("id").single();
    if (tx.error || !tx.data) { setError("Não foi possível lançar no financeiro."); return; }
    await db.from("driver_maintenance").update({ tx_id: (tx.data as { id: string }).id }).eq("id", m.id);
    window.dispatchEvent(new Event("jakash:changed"));
    onChanged();
  }

  return (
    <div className="space-y-4">
      <Card className="!p-4 !bg-red-50 dark:!bg-red-500/10">
        <p className="text-xs font-bold text-red-600 dark:text-red-300">Gasto com mecânica no período</p>
        <p className="text-2xl font-extrabold">{brl(total)}</p>
        {byVehicle.length > 1 && (
          <ul className="mt-2 text-sm space-y-0.5">
            {byVehicle.map((b) => <li key={b.id ?? "x"} className="flex justify-between gap-2"><span className="truncate">{vName(b.id)}</span><span className="font-bold">{brl(b.total)}</span></li>)}
          </ul>
        )}
        <p className="text-[11px] text-gray-500 mt-1">Entra nas despesas e no lucro líquido dos Relatórios.</p>
      </Card>

      {reportOnly ? null : editing ? (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-lg font-extrabold">{editing === "new" ? "Nova manutenção" : "Editar gasto"}</h2>
            <div><Label>Veículo *</Label>
              <select className={inputCls} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">{active.length ? "Selecionar veículo" : "Nenhum veículo cadastrado"}</option>
                {active.map((v) => <option key={v.id} value={v.id}>{VEHICLE_KINDS[v.kind]} · {v.name}{v.plate ? ` · ${plateLabel(v.plate)}` : ""}</option>)}
              </select>
              {onAddVehicle && <button type="button" onClick={onAddVehicle} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-brand-dark dark:text-brand-soft"><Plus size={12} /> {active.length ? "Cadastrar outro veículo" : "Cadastrar meu veículo"}</button>}
            </div>
            <div><Label>Nome da mecânica</Label><input className={inputCls} value={form.shop} onChange={(e) => setForm({ ...form, shop: e.target.value })} placeholder="Ex.: Auto Center do Zé" maxLength={80} /></div>
            <div>
              <Label>Data *</Label>
              <div className="flex gap-1.5 mb-1.5">
                {([["Hoje", 0], ["Ontem", 1]] as const).map(([l, n]) => {
                  const v = isoDaysAgo(n);
                  return <button key={l} type="button" onClick={() => setForm({ ...form, date: v })} className={`rounded-full px-3 py-1 text-xs font-bold ${form.date === v ? "bg-brand-dark text-white dark:bg-brand-vivid" : "bg-gray-100 dark:bg-[#1E1E1E] text-gray-500"}`}>{l}</button>;
                })}
              </div>
              <input type="date" className={inputCls} value={form.date} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço da peça (R$)</Label><input className={inputCls} inputMode="decimal" value={form.part_cost} onChange={(e) => setForm({ ...form, part_cost: e.target.value })} placeholder="0,00" /></div>
              <div><Label>Mão de obra (opcional)</Label><input className={inputCls} inputMode="decimal" value={form.labor_cost} onChange={(e) => setForm({ ...form, labor_cost: e.target.value })} placeholder="0,00" /></div>
            </div>
            <div><Label>Onde a peça foi comprada</Label><input className={inputCls} value={form.bought_at} onChange={(e) => setForm({ ...form, bought_at: e.target.value })} placeholder="Ex.: Loja do Marcão, Mercado Livre" maxLength={80} /></div>
            <div><Label>Km do veículo na troca</Label><input className={inputCls} inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} placeholder="Ex.: 85000" /></div>
            <p className="text-sm font-extrabold">Total: {brl(formTotal)}</p>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <button type="button" className={btnGhostCls + " flex-1 !py-3"} onClick={() => { setEditing(null); setError(null); }}>Cancelar</button>
              <button className={btnCls + " flex-1"} disabled={busy}>{busy ? "Salvando..." : "Salvar manutenção"}</button>
            </div>
          </form>
        </Card>
      ) : (
        <button className={btnCls + " w-full"} onClick={() => open(null)}><Plus size={16} /> Adicionar manutenção</button>
      )}

      {!editing && <ErrorNote message={error} />}
      {shown.length === 0 ? <Card><Empty>Nenhum gasto com mecânica neste período.</Empty></Card> : (
        <div className="space-y-2">
          {shown.map((m) => (
            <Card key={m.id} className="!p-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-red-500/10 inline-flex items-center justify-center text-red-600 shrink-0"><Wrench size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold truncate">{m.shop ?? "Manutenção"}</p>
                  <p className="text-xs text-gray-500">{formatDateBR(m.date)} · {vName(m.vehicle_id)}</p>
                  <p className="text-xs text-gray-500">{m.part && m.part !== "Manutenção" ? `${m.part} · ` : ""}Peça {brl(m.part_cost)}{m.labor_cost > 0 ? ` · mão de obra ${brl(m.labor_cost)}` : ""}</p>
                  {(m.bought_at || m.km != null) && <p className="text-xs text-gray-500">{m.bought_at ? `Comprada em ${m.bought_at}` : ""}{m.bought_at && m.km != null ? " · " : ""}{m.km != null ? `${m.km.toLocaleString("pt-BR")} km` : ""}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold text-red-600 dark:text-red-400">{brl(maintenanceCost(m))}</p>
                  {!reportOnly && <div className="flex gap-2 justify-end mt-1 text-gray-400">
                    <button aria-label="Editar gasto" onClick={() => open(m)}><Pencil size={15} /></button>
                    <button aria-label="Excluir gasto" onClick={() => remove(m)}><Trash2 size={15} /></button>
                  </div>}
                </div>
              </div>
              {!reportOnly && <div className="flex justify-end mt-2">
                {m.tx_id ? <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Lançado no financeiro</span>
                  : <button type="button" onClick={() => launch(m)} className="text-[11px] font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1"><Send size={12} /> Lançar no financeiro</button>}
              </div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Archive, Car, Pencil, Plus } from "lucide-react";
import { brl, parseMoney } from "@/lib/format";
import { FUELS, flexAdvice, isFuel, type FuelKind, type Vehicle } from "@/lib/driver";
import { Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

type Db = { from: (t: string) => { insert: (v: object) => PromiseLike<{ error: unknown }>; update: (v: object) => { eq: (c: string, v: string) => PromiseLike<{ error: unknown }> } } };

const EMPTY = { name: "", fuel: "flex" as FuelKind, efficiency: "", fuel_price: "", efficiency_alt: "", fuel_price_alt: "", cost_per_km: "", daily_rent: "" };
const toStr = (n: number) => (n ? String(n).replace(".", ",") : "");
const dec = (n: number) => String(n).replace(".", ",");

/** Carro flex: diz qual combustível sai mais barato por km com os preços cadastrados. */
function FlexTip({ v }: { v: Vehicle }) {
  const a = flexAdvice(v);
  if (!a) return null;
  return <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Com esses preços, {a.best} compensa: {brl(a[a.best])}/km contra {brl(a[a.best === "etanol" ? "gasolina" : "etanol"])}/km.</p>;
}

export function VehiclesPanel({ supabase, userId, vehicles, onChanged, startNew = false }: { supabase: unknown; userId: string; vehicles: Vehicle[]; onChanged: () => void; startNew?: boolean }) {
  const db = supabase as Db;
  const [editing, setEditing] = useState<string | "new" | null>(startNew || !vehicles.length ? "new" : null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openEdit(v: Vehicle) {
    setForm({ name: v.name, fuel: v.fuel, efficiency: toStr(v.efficiency), fuel_price: toStr(v.fuel_price), efficiency_alt: toStr(v.efficiency_alt ?? 0), fuel_price_alt: toStr(v.fuel_price_alt ?? 0), cost_per_km: toStr(v.cost_per_km), daily_rent: toStr(v.daily_rent) });
    setEditing(v.id); setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const eff = parseMoney(form.efficiency);
    const price = form.fuel_price.trim() ? parseMoney(form.fuel_price) : 0;
    const cpk = form.cost_per_km.trim() ? parseMoney(form.cost_per_km) : 0;
    const rent = form.daily_rent.trim() ? parseMoney(form.daily_rent) : 0;
    const flex = form.fuel === "flex";
    const effAlt = flex ? parseMoney(form.efficiency_alt) : null;
    const priceAlt = flex && form.fuel_price_alt.trim() ? parseMoney(form.fuel_price_alt) : null;
    if (!form.name.trim()) { setError("Dê um nome para o carro (ex.: Onix prata)."); return; }
    if (!(eff > 0 && eff <= 100)) { setError(flex ? "Informe quantos km o carro faz com 1 litro de gasolina (ex.: 12)." : `Informe a média do carro em ${FUELS[form.fuel].unit} (ex.: 12).`); return; }
    if (flex && !(effAlt !== null && effAlt > 0 && effAlt <= 100)) { setError("Informe quantos km o carro faz com 1 litro de etanol (ex.: 8,5)."); return; }
    if ([price, cpk, rent, priceAlt ?? 0].some((n) => Number.isNaN(n) || n < 0)) { setError("Confira os valores."); return; }
    setBusy(true);
    const payload = { name: form.name.trim().slice(0, 60), fuel: form.fuel, efficiency: eff, fuel_price: price, efficiency_alt: effAlt, fuel_price_alt: priceAlt, cost_per_km: cpk, daily_rent: rent };
    const res = editing === "new" ? await db.from("driver_vehicles").insert({ ...payload, user_id: userId }) : await db.from("driver_vehicles").update(payload).eq("id", editing as string);
    setBusy(false);
    if (res.error) { setError("Não foi possível salvar o carro."); return; }
    setEditing(null); setForm(EMPTY); setError(null); onChanged();
  }

  async function archive(v: Vehicle) {
    if (!window.confirm(`Tirar "${v.name}" da lista? Os dias já registrados continuam.`)) return;
    const res = await db.from("driver_vehicles").update({ archived: true }).eq("id", v.id);
    if (res.error) setError("Não foi possível arquivar."); else onChanged();
  }

  const unit = FUELS[form.fuel].unit;
  const active = vehicles.filter((v) => !v.archived);

  return (
    <div className="space-y-4">
      {active.length === 0 && editing !== "new" && <Card><Empty>Cadastre seu carro para o app calcular o combustível e o lucro de cada dia.</Empty></Card>}
      {active.map((v) => (
        <Card key={v.id} className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-brand-dark/10 dark:bg-white/5 inline-flex items-center justify-center text-brand-dark dark:text-brand-soft"><Car size={20} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold truncate">{v.name}</p>
              {v.fuel === "flex" ? (
                <p className="text-xs text-gray-500">Flex · gasolina {dec(v.efficiency)} km/l{v.fuel_price ? ` a ${brl(v.fuel_price)}` : ""} · etanol {dec(v.efficiency_alt ?? 0)} km/l{v.fuel_price_alt ? ` a ${brl(v.fuel_price_alt)}` : ""}</p>
              ) : (
                <p className="text-xs text-gray-500">{FUELS[v.fuel].label} · {dec(v.efficiency)} {FUELS[v.fuel].unit} · {brl(v.fuel_price)} ({FUELS[v.fuel].price.replace("R$ ", "")})</p>
              )}
              <FlexTip v={v} />
              {(v.cost_per_km > 0 || v.daily_rent > 0) && <p className="text-xs text-gray-400">{v.cost_per_km > 0 ? `Manutenção ${brl(v.cost_per_km)}/km` : ""}{v.cost_per_km > 0 && v.daily_rent > 0 ? " · " : ""}{v.daily_rent > 0 ? `Aluguel ${brl(v.daily_rent)}/dia` : ""}</p>}
            </div>
            <button aria-label="Editar carro" onClick={() => openEdit(v)} className="text-gray-400"><Pencil size={16} /></button>
            <button aria-label="Arquivar carro" onClick={() => archive(v)} className="text-gray-400"><Archive size={16} /></button>
          </div>
        </Card>
      ))}

      {editing ? (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-lg font-extrabold">{editing === "new" ? "Novo carro" : "Editar carro"}</h2>
            <div><Label>Nome</Label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Onix prata" maxLength={60} /></div>
            <div><Label>Combustível</Label>
              <select className={inputCls} value={form.fuel} onChange={(e) => isFuel(e.target.value) && setForm({ ...form, fuel: e.target.value })}>
                {(Object.keys(FUELS) as FuelKind[]).map((k) => <option key={k} value={k}>{FUELS[k].label}</option>)}
              </select></div>
            {form.fuel === "flex" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Média na gasolina (km/l)</Label><input className={inputCls} inputMode="decimal" value={form.efficiency} onChange={(e) => setForm({ ...form, efficiency: e.target.value })} placeholder="Ex.: 12" /></div>
                  <div><Label>Preço da gasolina (R$/l)</Label><input className={inputCls} inputMode="decimal" value={form.fuel_price} onChange={(e) => setForm({ ...form, fuel_price: e.target.value })} placeholder="Ex.: 6,19" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Média no etanol (km/l)</Label><input className={inputCls} inputMode="decimal" value={form.efficiency_alt} onChange={(e) => setForm({ ...form, efficiency_alt: e.target.value })} placeholder="Ex.: 8,5" /></div>
                  <div><Label>Preço do etanol (R$/l)</Label><input className={inputCls} inputMode="decimal" value={form.fuel_price_alt} onChange={(e) => setForm({ ...form, fuel_price_alt: e.target.value })} placeholder="Ex.: 4,29" /></div>
                </div>
                <p className="text-[11px] text-gray-400">Ao registrar o dia, você só escolhe se rodou com gasolina ou etanol. O resto o app já sabe.</p>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Média ({unit})</Label><input className={inputCls} inputMode="decimal" value={form.efficiency} onChange={(e) => setForm({ ...form, efficiency: e.target.value })} placeholder={form.fuel === "eletrico" ? "Ex.: 6,5" : "Ex.: 12"} /></div>
                <div><Label>{FUELS[form.fuel].price}</Label><input className={inputCls} inputMode="decimal" value={form.fuel_price} onChange={(e) => setForm({ ...form, fuel_price: e.target.value })} placeholder="Ex.: 6,19" /></div>
              </div>
            )}
            <details className="rounded-2xl border border-white/70 dark:border-white/5 px-4 py-3">
              <summary className="text-sm font-bold cursor-pointer">Custos do carro (opcional, deixa o lucro mais real)</summary>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><Label>Manutenção, pneu e seguro (R$ por km)</Label><input className={inputCls} inputMode="decimal" value={form.cost_per_km} onChange={(e) => setForm({ ...form, cost_per_km: e.target.value })} placeholder="Ex.: 0,15" /></div>
                <div><Label>Aluguel do carro (R$ por dia)</Label><input className={inputCls} inputMode="decimal" value={form.daily_rent} onChange={(e) => setForm({ ...form, daily_rent: e.target.value })} placeholder="Ex.: 90" /></div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Dica: some o que gasta por mês com revisão, pneus e seguro e divida pelos km do mês.</p>
            </details>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              {active.length > 0 && <button type="button" className={btnGhostCls + " flex-1 !py-3"} onClick={() => { setEditing(null); setError(null); }}>Cancelar</button>}
              <button className={btnCls + " flex-1"} disabled={busy}>{busy ? "Salvando..." : "Salvar carro"}</button>
            </div>
          </form>
        </Card>
      ) : (
        <button className={btnGhostCls + " w-full !py-3"} onClick={() => { setForm(EMPTY); setEditing("new"); setError(null); }}><Plus size={14} /> {active.length ? "Adicionar outro carro" : "Adicionar carro"}</button>
      )}
    </div>
  );
}

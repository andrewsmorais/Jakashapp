"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { brl, parseMoney, todayISO } from "@/lib/format";
import { FUELS, flexAdvice, hoursLabel, kmOf, turnoMissing, turnoSummary, vehicleFuelFor, workedHours, type DayFuel, type Earning, type Shift, type Vehicle } from "@/lib/driver";
import { PLATFORMS, platformKeyFromName, platformOf, quantityLabel } from "@/lib/driverPlatforms";
import { PlatformBadge } from "@/components/driver/PlatformBadge";
import { Card, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

type Db = { from: (t: string) => { insert: (v: object) => PromiseLike<{ error: unknown }>; update: (v: object) => { eq: (c: string, v: string) => PromiseLike<{ error: unknown }> } } };
// Consultas de apoio (turno do mesmo dia, último KM do veículo); tipadas de forma solta.
type Query = PromiseLike<{ data: unknown }> & { eq: (c: string, v: string) => Query; neq: (c: string, v: string) => Query; order: (c: string, o: { ascending: boolean }) => Query; limit: (n: number) => Query; not: (c: string, op: string, v: null) => Query };
type DbRead = { from: (t: string) => { select: (c: string) => Query } };

type EarnDraft = { amount: string; hours: string; trips: string };
const str = (n: number | null | undefined) => (n ? String(n).replace(".", ",") : "");
const money = (s: string) => (s.trim() ? parseMoney(s) : 0);
const optNum = (s: string) => (s.trim() ? parseMoney(s) : null);
/** Hodômetro: aceita "45.210" (ponto de milhar) e "45210,5". */
const kmNum = (s: string) => (s.trim() ? parseMoney(s.replace(/\./g, "")) : null);
const MAX_ODOMETER = 9_999_999;

// Combustível do turno (o carro flex escolhe gasolina ou etanol).
const DAY_FUELS: DayFuel[] = ["gasolina", "etanol", "diesel", "gnv", "eletrico"];

/** Último turno registrado: o próximo já começa com o mesmo veículo, combustível e KM inicial = KM final dele. */
export type LastUsed = { vehicle_id: string | null; fuel: string | null; km_end?: number | string | null } | null;

/** Combustível, consumo e preço que o veículo sugere para o turno. */
function suggest(v: Vehicle | null, f: DayFuel): { efficiency: number; price: number } | null {
  if (!v) return null;
  if (v.fuel === "flex") return f === "etanol" || f === "gasolina" ? vehicleFuelFor(v, f) : null;
  return v.fuel === f ? { efficiency: v.efficiency, price: v.fuel_price } : null;
}

export function ShiftForm({ supabase, userId, vehicles, editing, lastUsed, onSaved, onCancel, onAddVehicle }: {
  supabase: unknown; userId: string; vehicles: Vehicle[]; editing: Shift | null; lastUsed?: LastUsed;
  onSaved: () => void; onCancel?: () => void; onAddVehicle?: () => void;
}) {
  const db = supabase as Db;
  const active = vehicles.filter((v) => !v.archived || v.id === editing?.vehicle_id);
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const lastActive = lastUsed?.vehicle_id && active.some((v) => v.id === lastUsed.vehicle_id) ? lastUsed.vehicle_id : null;
  const [vehicleId, setVehicleId] = useState(editing ? editing.vehicle_id ?? "" : lastActive ?? active[0]?.id ?? "");
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  const initialFuel = (): DayFuel => {
    const saved = editing ? editing.fuel : lastUsed?.vehicle_id === vehicleId ? lastUsed?.fuel : null;
    if (saved && saved !== "flex" && DAY_FUELS.includes(saved as DayFuel)) return saved as DayFuel;
    if (vehicle && vehicle.fuel !== "flex") return vehicle.fuel;
    return "gasolina";
  };
  const [fuel, setFuel] = useState<DayFuel>(initialFuel);
  const first = editing ? null : suggest(vehicle, fuel);
  const [efficiency, setEfficiency] = useState(str(editing ? editing.efficiency : first?.efficiency));
  const [price, setPrice] = useState(str(editing ? editing.fuel_price : first?.price));

  const [start, setStart] = useState((editing?.start_time ?? "").slice(0, 5));
  const [end, setEnd] = useState((editing?.end_time ?? "").slice(0, 5));
  const [pause, setPause] = useState(editing?.break_minutes ? String(editing.break_minutes) : "");
  const lastKm = !editing && lastUsed?.vehicle_id === vehicleId && lastUsed?.km_end != null ? Number(lastUsed.km_end) : null;
  const [kmStart, setKmStart] = useState(editing ? str(editing.km_start) : lastKm ? str(lastKm) : "");
  const [kmStartTouched, setKmStartTouched] = useState(Boolean(editing));
  // Aluguel do carro conta uma vez por dia: se já existe outro turno deste veículo nesta data, este não cobra de novo.
  const [rentTaken, setRentTaken] = useState(false);
  const [kmEnd, setKmEnd] = useState(str(editing?.km_end));

  const [earn, setEarn] = useState<Record<string, EarnDraft>>(() => Object.fromEntries((editing?.earnings ?? []).map((e) => [e.platform, { amount: str(e.amount), hours: str(e.hours), trips: str(e.trips) }])));
  const [order, setOrder] = useState<string[]>(() => (editing?.earnings ?? []).map((e) => e.platform));
  const [custom, setCustom] = useState("");
  const [tips, setTips] = useState(str(editing?.tips));
  const [costs, setCosts] = useState({ tolls: str(editing?.tolls), food: str(editing?.food), wash: str(editing?.wash), parking: str(editing?.parking), other_cost: str(editing?.other_cost) });
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Trocar de veículo ou de combustível preenche consumo e preço com o cadastro do veículo (dá para mudar no turno).
  function refill(v: Vehicle | null, f: DayFuel) {
    const s = suggest(v, f);
    if (s) { setEfficiency(str(s.efficiency)); setPrice(str(s.price)); }
  }
  function pickVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id) ?? null;
    const f: DayFuel = v && v.fuel !== "flex" ? v.fuel : fuel === "etanol" ? "etanol" : "gasolina";
    setFuel(f);
    refill(v, f);
  }
  // Combustível que não é o do veículo (ex.: diesel num flex): pede preço e consumo de novo.
  function pickFuel(f: DayFuel) {
    setFuel(f);
    if (suggest(vehicle, f)) refill(vehicle, f);
    else { setPrice(""); setEfficiency(""); }
  }

  // Turno novo: KM inicial = KM final do último turno deste veículo (até a pessoa digitar outro).
  useEffect(() => {
    if (editing || kmStartTouched || !vehicleId) return;
    let alive = true;
    (supabase as DbRead).from("driver_shifts").select("km_end").eq("vehicle_id", vehicleId).not("km_end", "is", null)
      .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => {
        if (!alive) return;
        const row = Array.isArray(data) ? (data[0] as { km_end?: number | string | null } | undefined) : undefined;
        setKmStart(row?.km_end != null ? str(Number(row.km_end)) : "");
      });
    return () => { alive = false; };
  }, [supabase, editing, kmStartTouched, vehicleId]);

  // Outro turno do mesmo veículo no mesmo dia já cobra o aluguel diário.
  useEffect(() => {
    if (!vehicleId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setRentTaken(false); return; }
    let alive = true;
    let q = (supabase as DbRead).from("driver_shifts").select("id").eq("vehicle_id", vehicleId).eq("date", date);
    if (editing) q = q.neq("id", editing.id);
    q.limit(1).then(({ data }) => { if (alive) setRentTaken(Array.isArray(data) && data.length > 0); });
    return () => { alive = false; };
  }, [supabase, vehicleId, date, editing]);

  function toggle(key: string) {
    if (earn[key]) {
      const next = { ...earn }; delete next[key];
      setEarn(next); setOrder(order.filter((k) => k !== key));
    } else {
      setEarn({ ...earn, [key]: { amount: "", hours: "", trips: "" } }); setOrder([...order, key]);
    }
  }
  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    const key = platformKeyFromName(name);
    if (!earn[key]) toggle(key);
    setCustom("");
  }

  const earnings: Earning[] = order.filter((k) => earn[k]).map((k) => ({
    platform: k, amount: money(earn[k].amount),
    hours: earn[k].hours.trim() ? money(earn[k].hours) : null, trips: earn[k].trips.trim() ? Math.round(money(earn[k].trips)) : null,
  }));

  // Manutenção e aluguel do carro: dia antigo do mesmo carro mantém o que foi gravado; senão vem do cadastro.
  const sameCar = Boolean(editing && editing.vehicle_id === vehicleId);
  const draft: Shift = {
    id: editing?.id ?? "novo", date, vehicle_id: vehicleId || null,
    start_time: start || null, end_time: end || null, break_minutes: Math.round(money(pause)) || 0,
    km_start: kmNum(kmStart), km_end: kmNum(kmEnd), km: 0,
    fuel, efficiency: optNum(efficiency), fuel_price: optNum(price),
    cost_per_km: sameCar ? editing!.cost_per_km : vehicle?.cost_per_km ?? 0,
    rent: sameCar && editing!.rent > 0 ? editing!.rent : rentTaken ? 0 : vehicle?.daily_rent ?? 0,
    earnings, tips: money(tips),
    tolls: money(costs.tolls), parking: money(costs.parking), wash: money(costs.wash), food: money(costs.food), other_cost: money(costs.other_cost),
    notes: notes.trim() || null, income_tx_id: editing?.income_tx_id ?? null, expense_tx_id: editing?.expense_tx_id ?? null,
  };
  draft.km = kmOf(draft);
  const r = turnoSummary(draft);
  const hours = workedHours(draft.start_time, draft.end_time, draft.break_minutes);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const miss = turnoMissing(draft);
    setMissing(miss);
    if (miss.length) { setError(`Preencha: ${miss.join(", ")}.`); return; }
    const nums = [draft.km_start!, draft.km_end!, draft.efficiency!, draft.fuel_price!, draft.tips, draft.tolls, draft.parking, draft.wash, draft.food, draft.other_cost, draft.break_minutes, ...earnings.map((x) => x.amount), ...earnings.map((x) => x.hours ?? 0)];
    if (nums.some((n) => Number.isNaN(n) || n < 0)) { setError("Confira os valores: use só números (ex.: 150,50)."); return; }
    if (date > todayISO()) { setError("A data do turno não pode ser no futuro."); return; }
    if (draft.km_start! > MAX_ODOMETER || draft.km_end! > MAX_ODOMETER) { setError("Confira o KM: o hodômetro vai até 9.999.999."); return; }
    if (earnings.some((x) => (x.hours ?? 0) > 24)) { setError("Confira as horas de cada plataforma (no máximo 24)."); return; }
    if (draft.km_end! < draft.km_start!) { setError("O KM final precisa ser maior que o KM inicial."); return; }
    if (draft.km > 3000) { setError("Mais de 3.000 km no turno. Confira o KM inicial e o final."); return; }
    if (draft.efficiency! > 100) { setError("Confira o consumo (km por litro)."); return; }
    if (draft.fuel_price! > 100) { setError("Confira o preço do combustível."); return; }
    setBusy(true);
    const { id: _id, income_tx_id: _i, expense_tx_id: _x, ...row } = draft;
    void _id; void _i; void _x;
    const payload = { ...row, updated_at: new Date().toISOString() };
    const res = editing ? await db.from("driver_shifts").update(payload).eq("id", editing.id) : await db.from("driver_shifts").insert({ ...payload, user_id: userId });
    setBusy(false);
    if (res.error) { setError("Não foi possível salvar o turno. Confira os valores e tente de novo."); return; }
    onSaved();
  }

  const bad = (label: string) => missing.includes(label);
  const ring = (label: string) => (bad(label) ? " !border-red-400 dark:!border-red-500" : "");
  const unit = FUELS[fuel].unit;
  const advice = vehicle ? flexAdvice(vehicle) : null;

  if (!active.length && !editing) {
    return (
      <Card className="space-y-3">
        <p className="font-extrabold">Cadastre um veículo primeiro</p>
        <p className="text-sm text-gray-500">O turno precisa do veículo para calcular o combustível e o lucro por km.</p>
        <div className="flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className={btnGhostCls + " flex-1 !py-3"}>Voltar</button>}
          {onAddVehicle && <button type="button" onClick={onAddVehicle} className={btnCls + " flex-1"}><Plus size={14} /> Adicionar veículo</button>}
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Card className="space-y-3">
        <p className="font-extrabold">{editing ? "Editar turno" : "Novo turno"}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Veículo *</Label>
            <select className={inputCls + ring("veículo")} value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
              <option value="">Escolha</option>
              {active.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select></div>
          <div><Label>Data *</Label><input type="date" className={inputCls + ring("data")} value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>KM inicial *</Label><input className={inputCls + ring("KM inicial")} inputMode="decimal" value={kmStart} onChange={(e) => { setKmStart(e.target.value); setKmStartTouched(true); }} placeholder="Ex.: 45210" /></div>
          <div><Label>KM final *</Label><input className={inputCls + ring("KM final")} inputMode="decimal" value={kmEnd} onChange={(e) => setKmEnd(e.target.value)} placeholder="Ex.: 45390" /></div>
        </div>
        {editing && editing.km_start == null && <p className="text-[11px] text-gray-400">Turno antigo: informe o KM inicial e o final do hodômetro ({editing.km} km rodados).</p>}
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Início *</Label><input type="time" className={inputCls + ring("hora de início")} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>Fim *</Label><input type="time" className={inputCls + ring("hora de fim")} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div><Label>Pausa (min)</Label><input className={inputCls} inputMode="numeric" value={pause} onChange={(e) => setPause(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0" /></div>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="font-extrabold">Combustível</p>
        <div className="flex flex-wrap gap-2">
          {DAY_FUELS.map((f) => (
            <button key={f} type="button" onClick={() => pickFuel(f)} aria-pressed={fuel === f}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${fuel === f ? "bg-brand-dark text-white dark:bg-brand-vivid" : "bg-white/70 dark:bg-[#1E1E1E] text-gray-500"}`}>
              {FUELS[f].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{FUELS[fuel].price} *</Label><input className={inputCls + ring("preço do combustível")} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 6,19" /></div>
          <div><Label>Consumo ({unit}) *</Label><input className={inputCls + ring("consumo (km/L)")} inputMode="decimal" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} placeholder="Ex.: 12" /></div>
        </div>
        {vehicle && <p className="text-[11px] text-gray-400">Preço e consumo vêm do cadastro de {vehicle.name}; dá para ajustar só neste turno.</p>}
        {advice && <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Com os preços cadastrados, {advice.best} sai mais barato ({brl(advice[advice.best])}/km).</p>}
      </Card>

      <Card className="space-y-3">
        <p className="font-extrabold">Fontes de ganho *</p>
        <p className="text-xs text-gray-500 -mt-2">Marque uma ou mais plataformas do turno e informe o valor e a quantidade de cada uma.</p>
        <div className={`flex flex-wrap gap-2 rounded-2xl ${bad("pelo menos uma fonte de ganho") ? "ring-2 ring-red-400 p-1" : ""}`}>
          {PLATFORMS.map((p) => {
            const on = Boolean(earn[p.key]);
            return (
              <button key={p.key} type="button" onClick={() => toggle(p.key)} aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-xs font-bold border ${on ? "border-brand-dark dark:border-brand-vivid bg-brand-dark/10 dark:bg-brand-vivid/20" : "border-gray-200 dark:border-white/10 text-gray-500"}`}>
                <PlatformBadge platform={p.key} size={24} /> {p.name}
              </button>
            );
          })}
          {order.filter((k) => !PLATFORMS.some((p) => p.key === k)).map((k) => (
            <button key={k} type="button" onClick={() => toggle(k)} aria-pressed className="inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-xs font-bold border border-brand-dark dark:border-brand-vivid bg-brand-dark/10 dark:bg-brand-vivid/20">
              <PlatformBadge platform={k} size={24} /> {platformOf(k).name} <X size={12} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="Outra plataforma (ex.: Loggi)" maxLength={30} />
          <button type="button" onClick={addCustom} className={btnGhostCls + " shrink-0"}><Plus size={14} /> Incluir</button>
        </div>

        {order.filter((k) => earn[k]).map((k) => {
          const d = earn[k];
          const lacks = bad("valor ganho e quantidade em cada fonte");
          return (
            <div key={k} className="rounded-2xl border border-white/70 dark:border-white/5 p-3">
              <div className="flex items-center gap-2 mb-2"><PlatformBadge platform={k} size={26} /><span className="font-bold text-sm">{platformOf(k).name}</span></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Valor ganho *</Label><input className={inputCls + (lacks && !(money(d.amount) > 0) ? " !border-red-400" : "")} inputMode="decimal" value={d.amount} onChange={(e) => setEarn({ ...earn, [k]: { ...d, amount: e.target.value } })} placeholder="0,00" /></div>
                <div><Label>{quantityLabel(k)} *</Label><input className={inputCls + (lacks && !(money(d.trips) > 0) ? " !border-red-400" : "")} inputMode="numeric" value={d.trips} onChange={(e) => setEarn({ ...earn, [k]: { ...d, trips: e.target.value.replace(/\D/g, "").slice(0, 4) } })} placeholder="0" /></div>
                <div><Label>Horas</Label><input className={inputCls} inputMode="decimal" value={d.hours} onChange={(e) => setEarn({ ...earn, [k]: { ...d, hours: e.target.value } })} placeholder={order.length > 1 ? "Ex.: 3,5" : "Turno todo"} /></div>
              </div>
            </div>
          );
        })}
        <div><Label>Gorjetas (R$, opcional)</Label><input className={inputCls} inputMode="decimal" value={tips} onChange={(e) => setTips(e.target.value)} placeholder="0,00" /></div>
      </Card>

      <Card className="space-y-3">
        <p className="font-extrabold">Outras despesas <span className="font-normal text-xs text-gray-400">(opcional)</span></p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([["tolls", "Pedágio"], ["food", "Alimentação"], ["wash", "Lavagem"], ["parking", "Estacionamento"], ["other_cost", "Outros"]] as const).map(([k, l]) => (
            <div key={k}><Label>{l} (R$)</Label><input className={inputCls} inputMode="decimal" value={costs[k]} onChange={(e) => setCosts({ ...costs, [k]: e.target.value })} placeholder="0,00" /></div>
          ))}
        </div>
        <div><Label>Observação</Label><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ex.: chuva, evento no estádio" /></div>
      </Card>

      <Card className="space-y-3">
        <p className="font-extrabold">Resultado do turno</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-3"><p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Ganhos</p><p className="font-extrabold">{brl(r.earnings)}</p></div>
          <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 p-3"><p className="text-[11px] font-bold text-red-600 dark:text-red-300">Despesas</p><p className="font-extrabold">{brl(r.expenses)}</p></div>
          <div className="rounded-2xl bg-brand-dark/10 dark:bg-brand-vivid/20 p-3"><p className="text-[11px] font-bold text-brand-dark dark:text-brand-soft">Lucro líquido</p><p className={`font-extrabold ${r.net < 0 ? "text-red-600" : ""}`}>{brl(r.net)}</p></div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">KM rodados</dt><dd className="text-right font-bold">{r.km ? `${r.km.toLocaleString("pt-BR")} km` : "—"}</dd>
          <dt className="text-gray-500">{fuel === "gnv" ? "m³" : fuel === "eletrico" ? "kWh" : "Litros"} gastos</dt><dd className="text-right font-bold">{r.liters ? r.liters.toLocaleString("pt-BR") : "—"}</dd>
          <dt className="text-gray-500">Combustível</dt><dd className="text-right font-bold">{brl(r.fuel)}</dd>
          <dt className="text-gray-500">Outras despesas</dt><dd className="text-right font-bold">{brl(r.other)}</dd>
          <dt className="text-gray-500">Combustível por km</dt><dd className="text-right font-bold">{r.fuelPerKm === null ? "—" : brl(r.fuelPerKm)}</dd>
          <dt className="text-gray-500">Lucro por km</dt><dd className="text-right font-bold">{r.netPerKm === null ? "—" : brl(r.netPerKm)}</dd>
          <dt className="text-gray-500">Horas</dt><dd className="text-right font-bold">{hours ? hoursLabel(hours) : "—"}</dd>
        </dl>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button>}
          <button className={btnCls + " flex-1"} disabled={busy}>{busy ? "Salvando..." : editing ? "Salvar alterações" : "Salvar turno"}</button>
        </div>
      </Card>
    </form>
  );
}

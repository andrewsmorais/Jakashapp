"use client";

import { CheckCircle2, Pencil, Plus, Car, Send, Trash2 } from "lucide-react";
import { brl, formatDateBR } from "@/lib/format";
import { FUELS, hoursLabel, turnoSummary, workedHours, type Shift, type Vehicle } from "@/lib/driver";
import { platformOf, quantityLabel } from "@/lib/driverPlatforms";
import { PlatformBadge } from "@/components/driver/PlatformBadge";
import { Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

const km = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const dec = (n: number | null) => (n == null ? "—" : String(n).replace(".", ","));

/** Menu Turnos: botões, filtro por dia e o histórico (mais recente primeiro). */
export function TurnosPanel({ shifts, vehicles, day, onDay, onNew, onAddVehicle, onEdit, onDelete, onLaunch, loading, error, canLoadMore, onLoadMore }: {
  shifts: Shift[]; vehicles: Vehicle[]; day: string; onDay: (d: string) => void;
  onNew: () => void; onAddVehicle: () => void; onEdit: (s: Shift) => void; onDelete: (s: Shift) => void; onLaunch: (s: Shift) => void;
  loading: boolean; error: string | null; canLoadMore?: boolean; onLoadMore?: () => void;
}) {
  const vName = new Map(vehicles.map((v) => [v.id, v.name]));
  const list = [...shifts].sort((a, b) => b.date.localeCompare(a.date) || (b.start_time ?? "").localeCompare(a.start_time ?? ""));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onNew} className={btnCls}><Plus size={16} /> Novo turno</button>
        <button type="button" onClick={onAddVehicle} className={btnGhostCls + " !py-3"}><Car size={16} /> Adicionar veículo</button>
      </div>

      <Card className="!p-4">
        <Label>Filtrar por data</Label>
        <div className="flex gap-2">
          <input type="date" className={inputCls} value={day} onChange={(e) => onDay(e.target.value)} aria-label="Dia dos turnos" />
          {day && <button type="button" onClick={() => onDay("")} className={btnGhostCls + " shrink-0"}>Ver todos</button>}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">{day ? `Turnos de ${formatDateBR(day)}.` : "Mostrando os turnos mais recentes."}</p>
      </Card>

      <p className="font-extrabold">Histórico de turnos</p>
      <ErrorNote message={error} />
      {loading ? <Card><Empty>Carregando…</Empty></Card> : list.length === 0 ? (
        <Card><Empty>{day ? "Nenhum turno nesta data." : "Nenhum turno ainda. Toque em Novo turno para registrar o primeiro."}</Empty></Card>
      ) : list.map((s) => <TurnoCard key={s.id} s={s} vehicle={s.vehicle_id ? vName.get(s.vehicle_id) ?? null : null} onEdit={onEdit} onDelete={onDelete} onLaunch={onLaunch} />)}
      {!loading && canLoadMore && onLoadMore && <button type="button" onClick={onLoadMore} className={btnGhostCls + " w-full !py-3"}>Ver turnos mais antigos</button>}
    </div>
  );
}

function TurnoCard({ s, vehicle, onEdit, onDelete, onLaunch }: { s: Shift; vehicle: string | null; onEdit: (s: Shift) => void; onDelete: (s: Shift) => void; onLaunch: (s: Shift) => void }) {
  const r = turnoSummary(s);
  const h = workedHours(s.start_time, s.end_time, s.break_minutes);
  const fuel = s.fuel && s.fuel !== "flex" ? FUELS[s.fuel] : null;
  const unit = fuel?.unit ?? "km/l";
  return (
    <Card className="!p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-extrabold">{formatDateBR(s.date)}{vehicle ? <span className="font-normal text-gray-500"> · {vehicle}</span> : null}</p>
          <p className="text-xs text-gray-500">
            {s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} às ${s.end_time.slice(0, 5)}` : "Sem horário"}{h ? ` · ${hoursLabel(h)}` : ""}
          </p>
        </div>
        <span className="flex gap-3 text-gray-400 pt-1">
          <button aria-label="Editar turno" onClick={() => onEdit(s)}><Pencil size={15} /></button>
          <button aria-label="Excluir turno" onClick={() => onDelete(s)} className="hover:text-red-500"><Trash2 size={15} /></button>
        </span>
      </div>

      <div className="space-y-1.5">
        {s.earnings.map((e, i) => (
          <div key={`${e.platform}-${i}`} className="flex items-center gap-2 text-sm">
            <PlatformBadge platform={e.platform} size={24} />
            <span className="flex-1 min-w-0 truncate font-bold">{platformOf(e.platform).name}</span>
            <span className="text-xs text-gray-500">{e.trips ? `${e.trips} ${quantityLabel(e.platform, e.trips)}` : ""}</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{brl(e.amount)}</span>
          </div>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-gray-500">KM</dt>
        <dd className="text-right font-bold">{s.km_start != null && s.km_end != null ? `${km(s.km_start)} → ${km(s.km_end)} · ` : ""}{r.km.toLocaleString("pt-BR")} km</dd>
        <dt className="text-gray-500">Consumo e preço</dt>
        <dd className="text-right font-bold">{dec(s.efficiency)} {unit} · {s.fuel_price ? `${brl(s.fuel_price)}${fuel ? ` (${fuel.label.toLowerCase()})` : ""}` : "—"}</dd>
        <dt className="text-gray-500">Combustível por km</dt><dd className="text-right font-bold">{r.fuelPerKm === null ? "—" : brl(r.fuelPerKm)}</dd>
        <dt className="text-gray-500">Lucro por km</dt><dd className={`text-right font-bold ${r.netPerKm !== null && r.netPerKm < 0 ? "text-red-600" : ""}`}>{r.netPerKm === null ? "—" : brl(r.netPerKm)}</dd>
      </dl>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-2.5">
          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Ganhos</p>
          <p className="font-extrabold text-emerald-700 dark:text-emerald-300">{brl(r.earnings)}</p>
          {s.tips > 0 && <p className="text-[10px] text-gray-500">inclui {brl(s.tips)} de gorjeta</p>}
        </div>
        <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 p-2.5">
          <p className="text-[11px] font-bold text-red-600 dark:text-red-300">Despesas</p>
          <p className="font-extrabold text-red-600 dark:text-red-300">{brl(r.expenses)}</p>
          <p className="text-[10px] text-gray-500">comb. {brl(r.fuel)} · outras {brl(r.other)}</p>
        </div>
        <div className="rounded-2xl bg-brand-dark/10 dark:bg-brand-vivid/20 p-2.5">
          <p className="text-[11px] font-bold text-brand-dark dark:text-brand-soft">Lucro líquido</p>
          <p className={`font-extrabold ${r.net < 0 ? "text-red-600" : ""}`}>{brl(r.net)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        {s.income_tx_id ? <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Lançado no financeiro</span>
          : <button type="button" onClick={() => onLaunch(s)} className="text-[11px] font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1"><Send size={12} /> Lançar no financeiro</button>}
      </div>
    </Card>
  );
}

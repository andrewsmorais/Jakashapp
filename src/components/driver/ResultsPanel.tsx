"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileDown, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { brl, formatDateBR } from "@/lib/format";
import { hoursLabel, shiftMetrics, summarize, type Shift, type Vehicle } from "@/lib/driver";
import { platformOf, quantityLabel } from "@/lib/driverPlatforms";
import { driverCsv, driverFileName } from "@/lib/driverExport";
import { saveOrShareText } from "@/lib/nativeShare";
import { PlatformBadge } from "@/components/driver/PlatformBadge";
import { Card, Empty, ErrorNote, btnGhostCls } from "@/components/ui/page";

export type Period = { from: string; to: string };

const perH = (v: number | null) => (v === null ? "—" : `${brl(v)}/h`);
const perKm = (v: number | null) => (v === null ? "—" : `${brl(v)}/km`);

export function ResultsPanel({ shifts, vehicles, period, platform, vehicleId, onPlatform, onEdit, onDelete, onLaunch, error }: {
  shifts: Shift[]; vehicles: Vehicle[]; period: Period; platform: string | null; vehicleId: string;
  onPlatform: (p: string | null) => void; onEdit: (s: Shift) => void; onDelete: (s: Shift) => void; onLaunch: (s: Shift) => void; error: string | null;
}) {
  const filtered = useMemo(() => shifts.filter((s) => !vehicleId || s.vehicle_id === vehicleId), [shifts, vehicleId]);
  const used = useMemo(() => Array.from(new Set(filtered.flatMap((s) => s.earnings.map((e) => e.platform)))), [filtered]);
  const sum = useMemo(() => summarize(filtered, platform), [filtered, platform]);
  const all = useMemo(() => (platform ? summarize(filtered) : sum), [filtered, platform, sum]);
  const list = platform ? filtered.filter((s) => s.earnings.some((e) => e.platform === platform)) : filtered;
  const t = sum.total;
  const [exporting, setExporting] = useState(false);
  const vName = vehicles.find((v) => v.id === vehicleId)?.name ?? null;

  async function exportCsv() {
    setExporting(true);
    await saveOrShareText(driverFileName(period.from, period.to), driverCsv(list, vehicles, { ...period, platform, vehicleName: vName }, sum));
    setExporting(false);
  }
  const reportHref = `/motorista/relatorio?de=${period.from}&ate=${period.to}${platform ? `&p=${encodeURIComponent(platform)}` : ""}${vehicleId ? `&carro=${vehicleId}` : ""}`;

  return (
    <div className="space-y-4">
      {used.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button type="button" onClick={() => onPlatform(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border ${!platform ? "bg-brand-dark text-white border-brand-dark dark:bg-brand-vivid dark:border-brand-vivid" : "border-gray-200 dark:border-white/10 text-gray-500"}`}>Todas</button>
          {used.map((k) => (
            <button key={k} type="button" onClick={() => onPlatform(platform === k ? null : k)} aria-pressed={platform === k}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-bold border ${platform === k ? "border-brand-dark dark:border-brand-vivid bg-brand-dark/10 dark:bg-brand-vivid/20" : "border-gray-200 dark:border-white/10 text-gray-500"}`}>
              <PlatformBadge platform={k} size={22} /> {platformOf(k).name}
            </button>
          ))}
        </div>
      )}

      {sum.shifts === 0 ? <Card><Empty>Nenhum turno registrado neste período{platform ? " nesta plataforma" : ""}.</Empty></Card> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="!p-4 !bg-emerald-50 dark:!bg-emerald-500/10"><p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Ganho bruto</p><p className="text-2xl font-extrabold">{brl(t.gross)}</p><p className="text-xs text-gray-500">{perH(t.grossPerHour)} · {perKm(t.grossPerKm)}</p></Card>
            <Card className="!p-4 !bg-red-50 dark:!bg-red-500/10"><p className="text-xs font-bold text-red-600 dark:text-red-300">Despesas</p><p className="text-2xl font-extrabold">{brl(t.expenses)}</p><p className="text-xs text-gray-500">Despesa por km: {perKm(t.costPerKm)}</p></Card>
            <Card className="!p-4 !bg-brand-dark/10 dark:!bg-brand-vivid/20"><p className="text-xs font-bold text-brand-dark dark:text-brand-soft">Lucro líquido</p><p className={`text-2xl font-extrabold ${t.net < 0 ? "text-red-600" : ""}`}>{brl(t.net)}</p><p className="text-xs text-gray-500">{perH(t.netPerHour)} · {perKm(t.netPerKm)}</p></Card>
          </div>

          <Card className="!p-4">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-xs text-gray-500">Dias / turnos</dt><dd className="font-extrabold">{sum.days} / {sum.shifts}</dd></div>
              <div><dt className="text-xs text-gray-500">Horas</dt><dd className="font-extrabold">{t.hours ? hoursLabel(t.hours) : "—"}</dd></div>
              <div><dt className="text-xs text-gray-500">Km rodados</dt><dd className="font-extrabold">{t.km.toLocaleString("pt-BR")} km</dd></div>
              <div><dt className="text-xs text-gray-500">Corridas/entregas</dt><dd className="font-extrabold">{t.trips || "—"}</dd></div>
              <div><dt className="text-xs text-gray-500">Combustível</dt><dd className="font-extrabold">{brl(t.fuel)}</dd></div>
              <div><dt className="text-xs text-gray-500">Custo do carro</dt><dd className="font-extrabold">{brl(t.vehicle)}</dd></div>
              <div><dt className="text-xs text-gray-500">Outros gastos</dt><dd className="font-extrabold">{brl(t.extras)}</dd></div>
              <div><dt className="text-xs text-gray-500">Gorjetas</dt><dd className="font-extrabold">{brl(t.tips)}</dd></div>
            </dl>
            {platform && <p className="text-[11px] text-gray-400 mt-3">Com uma plataforma escolhida, horas, km e despesas de dias com mais de uma plataforma são divididos pelo que cada uma rendeu (ou pelas horas que você informou).</p>}
          </Card>

          {!platform && all.byPlatform.length > 1 && (
            <Card className="!p-4">
              <p className="font-extrabold mb-2">Qual plataforma rendeu mais</p>
              <div className="divide-y divide-gray-100 dark:divide-[#262626]">
                {all.byPlatform.map((p) => (
                  <button key={p.platform} type="button" onClick={() => onPlatform(p.platform)} className="w-full flex items-center gap-3 py-2.5 text-left">
                    <PlatformBadge platform={p.platform} size={32} />
                    <span className="flex-1 min-w-0"><span className="block font-bold text-sm truncate">{platformOf(p.platform).name}</span><span className="block text-xs text-gray-500">{p.days} {p.days === 1 ? "dia" : "dias"}{p.metrics.trips ? ` · ${p.metrics.trips} ${quantityLabel(p.platform, p.metrics.trips)}` : ""}</span></span>
                    <span className="text-right"><span className="block font-extrabold text-sm">{brl(p.metrics.gross)}</span><span className="block text-[11px] text-gray-500">{p.estimatedHours ? "≈ " : ""}{perH(p.metrics.grossPerHour)} · {perKm(p.metrics.grossPerKm)}</span></span>
                  </button>
                ))}
              </div>
              {all.byPlatform.some((p) => p.estimatedHours) && <p className="text-[11px] text-gray-400 mt-2">≈ estimado: em dias com mais de uma plataforma sem horas informadas, as horas foram divididas pelo que cada uma rendeu.</p>}
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} disabled={exporting} className={btnGhostCls}><FileDown size={14} /> {exporting ? "Gerando..." : "Exportar planilha"}</button>
            <Link href={reportHref} className={btnGhostCls}><Printer size={14} /> Relatório em PDF</Link>
          </div>

          <ErrorNote message={error} />
          <div className="space-y-2">
            {[...list].sort((a, b) => b.date.localeCompare(a.date)).map((s) => {
              const m = shiftMetrics(s);
              return (
                <Card key={s.id} className="!p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex -space-x-2 shrink-0 pt-0.5">{Array.from(new Set(s.earnings.map((e) => e.platform))).slice(0, 3).map((k) => <PlatformBadge key={k} platform={k} size={28} />)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-sm">{formatDateBR(s.date)}{s.start_time && s.end_time ? <span className="font-normal text-gray-500"> · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span> : null}</p>
                      <p className="text-xs text-gray-500">{m.hours ? hoursLabel(m.hours) + " · " : ""}{m.km} km · bruto {brl(m.gross)} · despesas {brl(m.expenses)}</p>
                      <p className={`text-sm font-extrabold ${m.net < 0 ? "text-red-600" : "text-brand-dark dark:text-brand-soft"}`}>Lucro {brl(m.net)}{m.netPerHour !== null ? <span className="text-xs font-bold text-gray-500"> · {brl(m.netPerHour)}/h</span> : null}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-gray-400">
                      <span className="flex gap-3">
                        <button aria-label="Editar dia" onClick={() => onEdit(s)}><Pencil size={15} /></button>
                        <button aria-label="Excluir dia" onClick={() => onDelete(s)} className="hover:text-red-500"><Trash2 size={15} /></button>
                      </span>
                      {s.income_tx_id ? <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> No financeiro</span>
                        : <button type="button" onClick={() => onLaunch(s)} className="text-[11px] font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1"><Send size={12} /> Lançar</button>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { CalendarDays } from "lucide-react";
import { formatDateBR } from "@/lib/format";
import type { Period, PeriodPreset } from "@/lib/period";
import { Label, inputCls } from "@/components/ui/page";

const BASE: [PeriodPreset, string][] = [["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"], ["custom", "Escolher datas"]];

// Botões de período (Hoje, Esta semana, Este mês, Escolher datas) usados em todas as telas com registros.
// `withAll` acrescenta "Tudo" no começo (ex.: contas a pagar, onde o padrão é ver todas).
export function PeriodFilter({ preset, onPreset, custom, onCustom, period, withAll = false, className = "" }: {
  preset: PeriodPreset; onPreset: (p: PeriodPreset) => void;
  custom: Period; onCustom: (p: Period) => void;
  period: Period; withAll?: boolean; className?: string;
}) {
  const options: [PeriodPreset, string][] = withAll ? [["tudo", "Tudo"], ...BASE] : BASE;
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5" role="group" aria-label="Período">
        {options.map(([k, l]) => (
          <button key={k} type="button" onClick={() => onPreset(k)} aria-pressed={preset === k}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${preset === k ? "bg-brand-dark text-white dark:bg-brand-vivid" : "glass-btn border text-gray-500"}`}>{l}</button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>De</Label><input type="date" className={inputCls} value={custom.from} onChange={(e) => e.target.value && onCustom({ ...custom, from: e.target.value })} /></div>
          <div><Label>Até</Label><input type="date" className={inputCls} value={custom.to} onChange={(e) => e.target.value && onCustom({ ...custom, to: e.target.value })} /></div>
        </div>
      )}
      {preset !== "tudo" && (
        <p className="text-xs text-gray-400 flex items-center gap-1"><CalendarDays size={12} />
          {period.from === period.to ? formatDateBR(period.from) : `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`}</p>
      )}
    </div>
  );
}

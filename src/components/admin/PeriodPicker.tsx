"use client";

import { useState } from "react";

type Mode = "day" | "month" | "year" | "range";

interface PeriodPickerProps {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}

const PRESETS = [
  { label: "Hoje", fn: () => { const d = new Date(); return [d, d]; } },
  { label: "7 dias", fn: () => { const d = new Date(); const f = new Date(d); f.setDate(d.getDate() - 6); return [f, d]; } },
  { label: "30 dias", fn: () => { const d = new Date(); const f = new Date(d); f.setDate(d.getDate() - 29); return [f, d]; } },
  { label: "Este mês", fn: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), d]; } },
  { label: "Mês passado", fn: () => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() - 1, 1); return [m, new Date(d.getFullYear(), d.getMonth(), 0)]; } },
  { label: "Este ano", fn: () => { const d = new Date(); return [new Date(d.getFullYear(), 0, 1), d]; } },
];

export function PeriodPicker({ from: initialFrom, to: initialTo, onApply }: PeriodPickerProps) {
  const [mode, setMode] = useState<Mode>("range");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const toDate = (s: string) => new Date(s + "T00:00:00");
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const apply = (f: Date, t: Date) => {
    onApply(fmt(f), fmt(t));
  };

  return (
    <div className="flex flex-col gap-3 bg-white dark:bg-[#1A1A1A] rounded-2xl p-4 border border-gray-200 dark:border-[#262626]">
      {/* Mode tabs */}
      <div className="flex gap-2 mb-2">
        {(["day", "month", "year", "range"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              mode === m
                ? "bg-brand-dark dark:bg-brand-soft text-white"
                : "bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333]"
            }`}
          >
            {m === "day" ? "Dia" : m === "month" ? "Mês" : m === "year" ? "Ano" : "Período"}
          </button>
        ))}
      </div>

      {/* Mode-specific inputs */}
      <div className="flex gap-2 items-end">
        {mode === "day" && (
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setTo(e.target.value);
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-[#262626] bg-white dark:bg-[#0B0B0B] text-sm"
          />
        )}
        {mode === "month" && (
          <input
            type="month"
            value={from.slice(0, 7)}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-");
              const d = new Date(parseInt(y), parseInt(m) - 1, 1);
              const endD = new Date(parseInt(y), parseInt(m), 0);
              setFrom(fmt(d));
              setTo(fmt(endD));
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-[#262626] bg-white dark:bg-[#0B0B0B] text-sm"
          />
        )}
        {mode === "year" && (
          <input
            type="number"
            min="2020"
            max="2099"
            value={from.slice(0, 4)}
            onChange={(e) => {
              const y = parseInt(e.target.value);
              setFrom(fmt(new Date(y, 0, 1)));
              setTo(fmt(new Date(y, 11, 31)));
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-[#262626] bg-white dark:bg-[#0B0B0B] text-sm"
            placeholder="YYYY"
          />
        )}
        {mode === "range" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-[#262626] bg-white dark:bg-[#0B0B0B] text-sm"
            />
            <span className="text-gray-400">até</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-[#262626] bg-white dark:bg-[#0B0B0B] text-sm"
            />
          </>
        )}
        <button
          onClick={() => apply(toDate(from), toDate(to))}
          className="px-4 py-2 rounded-lg bg-brand-dark dark:bg-brand-soft text-white font-bold text-sm hover:opacity-90"
        >
          OK
        </button>
      </div>

      {/* Presets */}
      <div className="flex gap-1.5 flex-wrap pt-2 border-t border-gray-200 dark:border-[#262626]">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              const [f, t] = preset.fn();
              apply(f, t);
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/page";

// `delta` = variação % vs. mês anterior (null = sem base de comparação). `invert` = subir é ruim (ex.: churn).
export function KpiCard({ icon: Icon, label, value, hint, delta, invert = false }: {
  icon: LucideIcon; label: string; value: string; hint?: string; delta?: number | null; invert?: boolean;
}) {
  const up = (delta ?? 0) > 0;
  const good = delta === null || delta === undefined || delta === 0 ? null : invert ? !up : up;
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</span>
        <Icon size={18} className="text-brand-dark dark:text-brand-soft" />
      </div>
      <p className="text-2xl font-extrabold mt-2 tabular-nums">{value}</p>
      <div className="flex items-center gap-2 mt-1 min-h-[1.25rem]">
        {good !== null && delta !== null && delta !== undefined && (
          <span className={`inline-flex items-center text-xs font-bold ${good ? "text-emerald-600" : "text-red-500"}`}>
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
    </Card>
  );
}

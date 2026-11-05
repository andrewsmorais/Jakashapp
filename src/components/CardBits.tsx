"use client";

import { STATUS_LABEL, type InvoiceStatus } from "@/lib/cards";

const TONE: Record<InvoiceStatus, string> = {
  paga: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  vencida: "bg-red-500/15 text-red-600 dark:text-red-300",
  fechada: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  aberta: "bg-brand-dark/10 text-brand-dark dark:bg-brand-vivid/20 dark:text-brand-soft",
  vazia: "bg-gray-100 text-gray-500 dark:bg-[#262626] dark:text-gray-400",
};

export function InvoiceChip({ status }: { status: InvoiceStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

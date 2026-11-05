"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { monthLabel } from "@/lib/format";
import type { InsightItem } from "@/lib/insights";
import { Card } from "@/components/ui/page";

type Data = { month: string; items: InsightItem[]; source: "ai" | "rules" };

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: só não lembra */ } };

// Resumo do mês anterior: três pontos que mudaram. Os números vêm do cálculo; a IA só escreve a dica.
export function MonthlyInsight() {
  const { userId, ready } = useSupabase();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    const today = new Date().toISOString().slice(0, 10);
    if (safeGet("jakash:insight:none") === today) return; // hoje já vimos que não há resumo para mostrar
    let off = false;
    fetch("/api/insights").then((r) => r.json()).then((d: { insight?: Data | null }) => {
      if (off) return;
      if (d.insight && !safeGet(`jakash:insight:hide:${d.insight.month}`)) setData(d.insight);
      else if (!d.insight) safeSet("jakash:insight:none", today);
    }).catch(() => { /* sem rede: tenta no próximo acesso */ });
    return () => { off = true; };
  }, [ready, userId]);

  if (!data) return null;
  const hide = () => { safeSet(`jakash:insight:hide:${data.month}`, "1"); setData(null); };

  return (
    <Card className="mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-2xl bg-amber-400/15 text-amber-500 flex items-center justify-center"><Lightbulb size={20} /></span>
          <div className="min-w-0">
            <p className="font-extrabold">3 coisas que mudaram no seu mês</p>
            <p className="text-xs text-gray-500 capitalize">{monthLabel(data.month)}</p>
          </div>
        </div>
        <button type="button" onClick={hide} aria-label="Ocultar este resumo" className="text-gray-400 hover:text-gray-600 shrink-0"><X size={18} /></button>
      </div>
      <ol className="space-y-3">
        {data.items.map((it, i) => (
          <li key={i} className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3.5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{it.title}</p>
            <p className="text-sm font-bold mt-0.5">{it.fact}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{it.tip}</p>
          </li>
        ))}
      </ol>
      {data.source === "ai" && <p className="text-[10px] text-gray-400 mt-3">Dicas escritas por IA a partir dos seus números.</p>}
    </Card>
  );
}

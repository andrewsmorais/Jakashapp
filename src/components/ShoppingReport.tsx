"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, ShoppingCart } from "lucide-react";
import { brl, formatDateBR } from "@/lib/format";
import { defaultCustom, periodFor, type Period, type PeriodPreset } from "@/lib/period";
import { itemTotal, quantityLabel } from "@/lib/shopping";
import { PeriodFilter } from "@/components/PeriodFilter";
import { Card, Empty, ErrorNote } from "@/components/ui/page";

type RItem = { id: string; name: string; quantity: number; unit: string | null; est_price: number | null; checked: boolean; extra: boolean };
type RList = { id: string; name: string; status: "open" | "done"; list_date: string; budget: number | null; transaction_id: string | null; items: RItem[]; paid: number | null };

// Relatório do Supermercado: as compras (listas) de um dia ou período, com meta, gasto e o que foi ou não pego.
export function ShoppingReport({ supabase, isBiz, money }: { supabase: SupabaseClient; isBiz: boolean; money: (s: string) => string }) {
  const [preset, setPreset] = useState<PeriodPreset>("mes");
  const [custom, setCustom] = useState<Period>(defaultCustom());
  const period = useMemo(() => periodFor(preset, custom), [preset, custom]);
  const [lists, setLists] = useState<RList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("shopping_lists")
      .select("id,name,status,list_date,budget,transaction_id,shopping_items(id,name,quantity,unit,est_price,checked,extra,position)")
      .eq("is_business", isBiz).gte("list_date", period.from).lte("list_date", period.to)
      .order("list_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
    if (err) { setError("Não foi possível carregar o relatório."); setLoading(false); return; }
    const rows = (data ?? []) as unknown as (Omit<RList, "items" | "paid" | "budget"> & { budget: number | string | null; shopping_items: (Omit<RItem, "quantity" | "est_price"> & { quantity: number | string; est_price: number | string | null; position: number })[] })[];
    const txIds = rows.map((r) => r.transaction_id).filter((x): x is string => Boolean(x));
    const paid = new Map<string, number>();
    if (txIds.length) {
      const tx = await supabase.from("transactions").select("id,amount").in("id", txIds);
      for (const t of (tx.data ?? []) as { id: string; amount: number | string }[]) paid.set(t.id, Number(t.amount));
    }
    setLists(rows.map((r) => ({
      id: r.id, name: r.name, status: r.status, list_date: r.list_date, transaction_id: r.transaction_id,
      budget: r.budget == null ? null : Number(r.budget),
      paid: r.transaction_id ? paid.get(r.transaction_id) ?? null : null,
      items: [...r.shopping_items].sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, name: i.name, unit: i.unit, checked: i.checked, extra: Boolean(i.extra), quantity: Number(i.quantity), est_price: i.est_price == null ? null : Number(i.est_price) })),
    })));
    setError(null);
    setLoading(false);
  }, [supabase, isBiz, period.from, period.to]);

  useEffect(() => { void load(); }, [load]);

  const cartOf = (l: RList) => Math.round(l.items.filter((i) => i.checked).reduce((s, i) => s + itemTotal(i), 0) * 100) / 100;
  const spentOf = (l: RList) => l.paid ?? cartOf(l);
  const done = lists.filter((l) => l.status === "done");
  const totalSpent = Math.round(lists.filter((l) => l.status === "done" || cartOf(l) > 0).reduce((s, l) => s + spentOf(l), 0) * 100) / 100;

  return (
    <div className="space-y-4">
      <Card className="!p-4"><PeriodFilter preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} period={period} /></Card>
      <ErrorNote message={error} />
      {loading ? <Card><Empty>Carregando…</Empty></Card> : lists.length === 0 ? <Card><Empty>Nenhuma lista de supermercado neste período.</Empty></Card> : (
        <>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Card className="!p-3"><p className="text-[11px] font-bold text-gray-500">Listas no período</p><p className="text-xl font-extrabold">{lists.length}</p><p className="text-[11px] text-gray-500">{done.length} finalizada(s)</p></Card>
            <Card className="!p-3"><p className="text-[11px] font-bold text-gray-500">Gasto no período</p><p className="text-xl font-extrabold">{money(brl(totalSpent))}</p></Card>
          </div>
          {lists.map((l) => {
            const got = l.items.filter((i) => i.checked).length;
            const spent = spentOf(l);
            const diff = l.budget != null ? Math.round((l.budget - spent) * 100) / 100 : null;
            const isOpen = open === l.id;
            return (
              <Card key={l.id} className="!p-4">
                <button type="button" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen} className="w-full flex items-start gap-3 text-left">
                  <span className="w-10 h-10 rounded-2xl bg-brand-dark/10 dark:bg-white/5 inline-flex items-center justify-center text-brand-dark dark:text-brand-soft shrink-0"><ShoppingCart size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-extrabold truncate">{l.name}</span>
                    <span className="block text-xs text-gray-500">{formatDateBR(l.list_date)} · {got} de {l.items.length} itens pegos</span>
                    <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${l.status === "done" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>{l.status === "done" ? "Finalizada" : "Em andamento"}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-extrabold">{money(brl(spent))}</span>
                    {l.budget != null && <span className="block text-[11px] text-gray-500">meta {money(brl(l.budget))}</span>}
                    {diff != null && spent > 0 && <span className={`block text-[11px] font-bold ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{diff < 0 ? `${money(brl(-diff))} acima` : `${money(brl(diff))} abaixo`}</span>}
                  </span>
                  <ChevronDown size={16} className={`text-gray-400 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <ul className="mt-3 border-t border-gray-100 dark:border-white/5 pt-2 text-sm">
                    {l.items.length === 0 ? <li className="text-xs text-gray-400 py-1">Lista sem itens.</li> : l.items.map((i) => (
                      <li key={i.id} className={`flex justify-between gap-2 py-1 ${i.checked ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                        <span className="truncate">{i.name}{quantityLabel(i) && <span className="ml-2 text-xs text-gray-500">{quantityLabel(i)}</span>}{i.extra && <span className="ml-2 text-[10px] font-bold text-amber-600">fora da lista</span>}</span>
                        <span className="shrink-0 font-bold">{i.checked && i.est_price != null ? money(brl(itemTotal(i))) : i.checked ? "pegou" : "faltou"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

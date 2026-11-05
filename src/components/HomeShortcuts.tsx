"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ShoppingCart, TrendingDown } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useHideValues } from "@/lib/useHideValues";
import { brl } from "@/lib/format";

// Atalhos do Início: itens abertos da lista de compras e quanto falta nas dívidas. Se algo falhar (ou a pessoa não tem nada
// cadastrado), o cartão simplesmente não aparece: o Início nunca quebra por causa deles.
export function HomeShortcuts() {
  const { supabase, userId, ready } = useSupabase();
  const { money } = useHideValues();
  const [toBuy, setToBuy] = useState(0);
  const [owed, setOwed] = useState<{ total: number; count: number } | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    let off = false;
    const load = async () => {
      try {
        const [l, d] = await Promise.all([
          supabase.from("shopping_lists").select("id").eq("status", "open"),
          supabase.from("debts").select("balance,status").eq("archived", false).neq("status", "quitada"),
        ]);
        if (off) return;
        const ids = ((l.data ?? []) as { id: string }[]).map((x) => x.id);
        if (!l.error && ids.length > 0) {
          const { count } = await supabase.from("shopping_items").select("id", { count: "exact", head: true }).in("list_id", ids).eq("checked", false);
          if (!off) setToBuy(count ?? 0);
        } else if (!off) setToBuy(0);
        const rows = ((d.data ?? []) as { balance: number | string }[]).filter((x) => Number(x.balance) > 0);
        setOwed(!d.error && rows.length > 0 ? { total: rows.reduce((s, x) => s + Number(x.balance), 0), count: rows.length } : null);
      } catch { /* sem atalhos */ }
    };
    load();
    window.addEventListener("jakash:changed", load);
    return () => { off = true; window.removeEventListener("jakash:changed", load); };
  }, [ready, userId, supabase]);

  if (toBuy === 0 && !owed) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      {toBuy > 0 && (
        <Link href="/comprar" className="flex items-center justify-between rounded-2xl bg-white/75 dark:bg-[#161616] border border-white/80 dark:border-white/5 px-4 py-3">
          <span className="flex items-center gap-3"><ShoppingCart size={20} className="text-brand-dark dark:text-brand-soft" /><span><span className="block font-extrabold text-sm">Lista de compras</span><span className="block text-xs text-gray-500">{toBuy} {toBuy === 1 ? "item falta" : "itens faltam"} comprar</span></span></span>
          <ChevronRight size={18} className="text-gray-300" />
        </Link>
      )}
      {owed && (
        <Link href="/dividas" className="flex items-center justify-between rounded-2xl bg-white/75 dark:bg-[#161616] border border-white/80 dark:border-white/5 px-4 py-3">
          <span className="flex items-center gap-3"><TrendingDown size={20} className="text-brand-dark dark:text-brand-soft" /><span><span className="block font-extrabold text-sm">Sair do vermelho</span><span className="block text-xs text-gray-500">Falta {money(brl(owed.total))} em {owed.count} {owed.count === 1 ? "dívida" : "dívidas"}</span></span></span>
          <ChevronRight size={18} className="text-gray-300" />
        </Link>
      )}
    </div>
  );
}

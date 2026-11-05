"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/lib/useSupabase";
import type { InvoiceRow } from "@/lib/cards";

export type Card = {
  id: string;
  user_id: string;
  name: string;
  brand: string;
  credit_limit: number;
  closing_day: number;
  due_day: number;
  pay_account_id: string | null;
  archived: boolean;
  kind: "credito" | "debito";
  institution: string | null;
};

// Cartões da casa + resumo das faturas (um registro por cartão/mês). Recarrega com "jakash:changed".
export function useCards() {
  const { supabase, userId, ready } = useSupabase();
  const [cards, setCards] = useState<Card[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from("credit_cards").select("id,user_id,name,brand,credit_limit,closing_day,due_day,pay_account_id,archived,kind,institution").order("created_at"),
      supabase.rpc("card_invoice_summary"),
    ]);
    setError(Boolean(c.error || s.error));
    setCards(((c.data ?? []) as Card[]).map((x) => ({ ...x, credit_limit: Number(x.credit_limit) })));
    setInvoices(
      ((s.data ?? []) as { card_id: string; invoice_month: string; total: number | string; paid: number | string }[]).map((x) => ({
        card_id: x.card_id,
        invoice_month: x.invoice_month,
        total: Number(x.total),
        paid: Number(x.paid),
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  return { cards, invoices, loading, error, reload: load };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { useSupabase } from "@/lib/useSupabase";

export type SupplierOption = { id: string; name: string; archived: boolean };

// Fornecedores do MEI para os seletores de "Fornecedor" (lançamento rápido e contas a pagar).
// `enabled` falso = nem consulta (quem usa só o lado pessoal nunca vê nada disso). Se a consulta falhar, a lista fica vazia
// e o seletor não aparece. `active` são os que dá para escolher; `byId` inclui os arquivados, para mostrar o nome em contas antigas.
export function useMeiSuppliers(
  supabase: ReturnType<typeof useSupabase>["supabase"],
  userId: string | null,
  enabled: boolean,
) {
  const [list, setList] = useState<SupplierOption[]>([]);

  useEffect(() => {
    if (!enabled || !userId) { setList([]); return; }
    let off = false;
    supabase.from("mei_suppliers").select("id,name,archived").order("name").then(({ data, error }) => {
      if (!off) setList(error ? [] : ((data ?? []) as SupplierOption[]));
    });
    return () => { off = true; };
  }, [supabase, userId, enabled]);

  const active = useMemo(() => list.filter((s) => !s.archived), [list]);
  const byId = useMemo(() => new Map(list.map((s) => [s.id, s])), [list]);
  return { active, byId };
}

"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/lib/useSupabase";

// Tipo de uso do perfil. Desde 06/11/2026 o app é só para uso pessoal: nada de empresa/MEI aparece (isMei é sempre false),
// mesmo para quem tinha escolhido "empresarial" ou "ambos" antes.
export function useUsageType() {
  const { supabase, userId, ready } = useSupabase();
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    let off = false;
    supabase.from("profiles").select("usage_type").eq("id", userId).maybeSingle().then(({ data }) => {
      if (!off) setUsage((data?.usage_type as string | undefined) ?? "pessoal");
    });
    return () => { off = true; };
  }, [ready, userId, supabase]);

  return { usage, isMei: false as boolean };
}

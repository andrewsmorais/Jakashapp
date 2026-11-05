"use client";

import { useEffect } from "react";
import { useSupabase } from "@/lib/useSupabase";
import { applyAccent, isAccent, storedAccent } from "@/lib/accent";

// Aplica a cor de destaque salva no perfil. Quem já tinha escolhido uma cor neste aparelho (antes de ela ir para o perfil)
// tem essa escolha gravada na conta na primeira vez.
export function AccentSync() {
  const { supabase, userId, ready } = useSupabase();

  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    supabase.from("profiles").select("accent").eq("id", userId).maybeSingle().then(({ data, error }) => {
      if (cancelled || error || !data) return;
      if (isAccent(data.accent)) {
        if (data.accent !== storedAccent() || document.documentElement.dataset.accent !== data.accent) applyAccent(data.accent);
      } else {
        const local = storedAccent();
        if (local) supabase.from("profiles").update({ accent: local }).eq("id", userId).then(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [ready, userId, supabase]);

  return null;
}

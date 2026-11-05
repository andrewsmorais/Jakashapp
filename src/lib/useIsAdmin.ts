"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/lib/useSupabase";

// Só para mostrar/esconder o atalho no menu. A proteção de verdade é no servidor (requireAdmin).
export function useIsAdmin() {
  const { supabase, userId, ready } = useSupabase();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;
    let off = false;
    supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle().then(({ data }) => {
      if (!off) setIsAdmin(data?.is_admin === true);
    });
    return () => { off = true; };
  }, [ready, userId, supabase]);

  return isAdmin;
}

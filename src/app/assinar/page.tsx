"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useIsNative } from "@/lib/useIsNative";
import { IOS_IAP_ENABLED } from "@/lib/native";
import { TRIAL_DAYS } from "@/lib/plans";
import { PlanPicker } from "@/components/PlanPicker";

// Depois do cadastro (ou do login de quem ainda não assinou), a pessoa cai aqui: sem escolher o Mensal ou o Anual
// não entra no app. O middleware manda para cá; esta tela só libera quando o banco (has_app_access) disser que pode.
export default function AssinarPage() {
  const router = useRouter();
  const { supabase, userId, ready } = useSupabase();
  const { native, checked } = useIsNative();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const check = useCallback(async (manual = false) => {
    const { data } = await supabase.rpc("has_app_access");
    if (data === true) { router.replace("/dashboard"); router.refresh(); return; }
    if (manual) setMsg("Ainda não encontramos a sua assinatura. Se acabou de assinar no iPhone, espere alguns segundos e tente de novo.");
  }, [supabase, router]);

  useEffect(() => {
    if (!ready) return;
    if (!userId) { router.replace("/login?next=/assinar"); return; }
    void check();
    supabase.from("profiles").select("full_name").maybeSingle().then(({ data }) => setName(((data?.full_name as string | null) ?? "").split(" ")[0]));
  }, [ready, userId, check, supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const iap = native && IOS_IAP_ENABLED;

  return (
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-black px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jacare.jpg" alt="Jakash" width={44} height={44} className="w-11 h-11 rounded-2xl object-cover" />
          <span className="font-bold text-xl">Jakash</span>
        </div>
        <h1 className="text-2xl font-extrabold">{name ? `${name}, escolha seu plano` : "Escolha seu plano"}</h1>
        <p className="text-gray-500 mt-1 mb-6">Os dois começam com {TRIAL_DAYS} dias grátis. Para usar o app, escolha um deles.</p>

        {!checked || !userId ? <p className="text-center text-sm text-gray-400 py-10">Carregando…</p>
          : native && !iap ? (
            <p className="rounded-[24px] bg-white dark:bg-[#161616] p-5 text-sm text-gray-600 dark:text-gray-300">
              A assinatura ainda não está disponível neste aparelho. Tente de novo mais tarde.
            </p>
          ) : (
            <PlanPicker userId={userId} mode={iap ? "iap" : "web"} onPurchased={() => void check(true)} onRecheck={() => void check(true)} />
          )}
        {msg && <p role="status" className="mt-4 text-sm font-bold text-amber-700 dark:text-amber-300">{msg}</p>}

        <div className="mt-8 flex flex-col items-center gap-3 text-sm">
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2 font-bold text-gray-500"><LogOut size={16} /> Sair desta conta</button>
          <Link href="/configuracoes/dados" className="text-xs text-gray-400 underline">Excluir minha conta</Link>
        </div>
      </div>
    </div>
  );
}

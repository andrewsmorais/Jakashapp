"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, authBtn, authInput, Divider, AppleButton, GoogleButton, Notice } from "@/components/auth/AuthShell";
import { authError, LOGIN_BYPASS, safeNext } from "@/lib/authUtil";
import { useIsNative } from "@/lib/useIsNative";
import { signInWithAppleNative, signInWithGoogleNative } from "@/lib/nativeAuth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { native } = useIsNative();
  // No app o login é obrigatório: o atalho de entrar com campos vazios fica desligado.
  const bypass = LOGIN_BYPASS && !native;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("erro") ? "Não foi possível entrar. Tente novamente." : "");
  const info = params.get("msg") === "senha-atualizada" ? "Senha atualizada. Entre com a nova senha." : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (bypass && !email.trim() && !password) { router.replace(next); return; }
    setBusy(true); setError("");
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setError(authError(err.message)); setBusy(false); return; }
    router.replace(next);
    router.refresh();
  }

  async function social(provider: "google" | "apple") {
    setBusy(true); setError("");
    if (native) {
      const supabase = createClient();
      const r = provider === "apple" ? await signInWithAppleNative(supabase) : await signInWithGoogleNative(supabase, next);
      if (!r.ok && !r.cancelled) setError(r.message ? authError(r.message) : "Não foi possível entrar. Tente novamente.");
      // Apple: a sessão já existe aqui. Google: o login termina quando o app recebe o link jakash://.
      if (r.ok && provider === "apple") { router.replace(next); router.refresh(); return; }
      setBusy(false);
      return;
    }
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) { setError(authError(err.message)); setBusy(false); }
  }

  return (
    <AuthShell title="Acesse sua conta">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-1.5">E-mail</label>
          <input id="email" type="email" required={!bypass} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} placeholder="seu@email.com" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1.5">Senha</label>
          <input id="password" type="password" required={!bypass} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} placeholder="••••••••" />
        </div>
        <div className="flex justify-end">
          <Link href="/esqueci-senha" className="text-sm text-[#00A152] font-medium hover:underline">Esqueci minha senha</Link>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {info && <Notice kind="ok">{info}</Notice>}
        <button type="submit" disabled={busy} className={authBtn}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
      <Divider />
      <div className="space-y-3">
        <GoogleButton onClick={() => social("google")} busy={busy} />
        <AppleButton onClick={() => social("apple")} busy={busy} />
      </div>
      <div className="mt-8 text-center text-sm font-medium text-gray-500">
        Não tem uma conta? <Link href="/cadastro" className="text-[#00A152] hover:underline">Criar conta</Link>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

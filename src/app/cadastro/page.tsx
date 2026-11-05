"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, authBtn, authInput, Divider, AppleButton, GoogleButton, Notice } from "@/components/auth/AuthShell";
import { authError } from "@/lib/authUtil";
import { useIsNative } from "@/lib/useIsNative";
import { signInWithAppleNative, signInWithGoogleNative } from "@/lib/nativeAuth";

export default function CadastroPage() {
  const router = useRouter();
  const { native } = useIsNative();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("A senha precisa ter pelo menos 8 caracteres."); return; }
    setBusy(true); setError("");
    const { data, error: err } = await createClient().auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (err) { setError(authError(err.message)); setBusy(false); return; }
    if (data.session) { router.replace("/dashboard"); router.refresh(); return; }
    setSent(true); setBusy(false);
  }

  async function social(provider: "google" | "apple") {
    setBusy(true); setError("");
    if (native) {
      const supabase = createClient();
      const r = provider === "apple" ? await signInWithAppleNative(supabase) : await signInWithGoogleNative(supabase, "/dashboard");
      if (!r.ok && !r.cancelled) setError(r.message ? authError(r.message) : "Não foi possível entrar. Tente novamente.");
      if (r.ok && provider === "apple") { router.replace("/dashboard"); router.refresh(); return; }
      setBusy(false);
      return;
    }
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (err) { setError(authError(err.message)); setBusy(false); }
  }

  if (sent) {
    return (
      <AuthShell title="Confira seu e-mail">
        <p className="text-center text-gray-600">Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para ativar a conta. Se não achar, olhe o spam.{native && " Depois de confirmar, volte para o app e entre com o seu e-mail e a senha."}</p>
        <div className="mt-8 text-center text-sm font-medium text-gray-500"><Link href="/login" className="text-[#00A152] hover:underline">Voltar para o login</Link></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crie sua conta">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-600 mb-1.5">Nome completo</label>
          <input id="name" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={authInput} placeholder="Seu nome" />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-1.5">E-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} placeholder="seu@email.com" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1.5">Senha (mínimo 8 caracteres)</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} placeholder="••••••••" />
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <button type="submit" disabled={busy} className={authBtn}>{busy ? "Criando..." : "Cadastrar"}</button>
      </form>
      <Divider />
      <div className="space-y-3">
        <GoogleButton onClick={() => social("google")} busy={busy} />
        <AppleButton onClick={() => social("apple")} busy={busy} />
      </div>
      <div className="mt-8 text-center text-sm font-medium text-gray-500">
        Já tem uma conta? <Link href="/login" className="text-[#00A152] hover:underline">Entrar</Link>
      </div>
    </AuthShell>
  );
}

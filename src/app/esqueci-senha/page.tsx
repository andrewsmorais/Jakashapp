"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, authBtn, authInput, Notice } from "@/components/auth/AuthShell";
import { authError } from "@/lib/authUtil";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });
    setBusy(false);
    // Mesma resposta exista a conta ou não (não revela quais e-mails têm cadastro); só erros de limite aparecem.
    if (err && /rate|too many|security purposes/i.test(err.message)) { setError(authError(err.message)); return; }
    setSent(true);
  }

  return (
    <AuthShell title="Recuperar senha">
      {sent ? (
        <>
          <Notice kind="ok">Se esse e-mail tiver conta, enviamos um link para criar uma nova senha. Ele vale por pouco tempo; olhe também o spam.</Notice>
          <div className="mt-8 text-center text-sm font-medium text-gray-500"><Link href="/login" className="text-[#00A152] hover:underline">Voltar para o login</Link></div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm text-gray-600">Digite o e-mail da sua conta. Vamos mandar um link para você criar uma nova senha.</p>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-1.5">E-mail</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} placeholder="seu@email.com" />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <button type="submit" disabled={busy} className={authBtn}>{busy ? "Enviando..." : "Enviar link"}</button>
          <div className="text-center text-sm font-medium text-gray-500"><Link href="/login" className="text-[#00A152] hover:underline">Voltar para o login</Link></div>
        </form>
      )}
    </AuthShell>
  );
}

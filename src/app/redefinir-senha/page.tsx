"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, authBtn, authInput, Notice } from "@/components/auth/AuthShell";
import { authError } from "@/lib/authUtil";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setOk(Boolean(data.user)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não são iguais."); return; }
    setBusy(true); setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(authError(err.message)); setBusy(false); return; }
    await supabase.auth.signOut();
    router.replace("/login?msg=senha-atualizada");
  }

  if (ok === null) return <AuthShell title="Nova senha"><p className="text-center text-gray-500">Carregando...</p></AuthShell>;
  if (!ok) {
    return (
      <AuthShell title="Link inválido">
        <p className="text-center text-gray-600">Esse link expirou ou já foi usado. Peça um novo.</p>
        <div className="mt-8 text-center text-sm font-medium"><Link href="/esqueci-senha" className="text-[#00A152] hover:underline">Enviar novo link</Link></div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Nova senha">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="p1" className="block text-sm font-medium text-gray-600 mb-1.5">Nova senha (mínimo 8 caracteres)</label>
          <input id="p1" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} />
        </div>
        <div>
          <label htmlFor="p2" className="block text-sm font-medium text-gray-600 mb-1.5">Repita a senha</label>
          <input id="p2" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInput} />
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <button type="submit" disabled={busy} className={authBtn}>{busy ? "Salvando..." : "Salvar nova senha"}</button>
      </form>
    </AuthShell>
  );
}

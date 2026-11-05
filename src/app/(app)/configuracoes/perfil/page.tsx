"use client";

import { useEffect, useState } from "react";
import { Lock, Pencil } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { formatDateBR } from "@/lib/format";
import { BackTitle, Card, Label, ErrorNote, inputCls, btnCls } from "@/components/ui/page";

// yyyy-mm-dd (valor do <input type="date">) <-> "—"/formatado para exibição.
function toInputDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function PerfilPage() {
  const { supabase, userId, ready } = useSupabase();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editingBirth, setEditingBirth] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [birthDraft, setBirthDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("profiles").select("full_name,birth_date").maybeSingle().then(({ data }) => {
      setName(data?.full_name ?? "");
      setBirth(data?.birth_date ?? null);
    });
  }, [ready, userId, supabase]);

  async function saveName() {
    const clean = nameDraft.trim();
    if (clean.length < 2) { setError("Informe seu nome completo."); return; }
    const { error: err } = await supabase.from("profiles").update({ full_name: clean.slice(0, 80) }).eq("id", userId);
    if (err) { setError("Não foi possível salvar."); return; }
    setName(clean); setError(null); setEditingName(false); setMsg("Nome atualizado.");
  }

  const today = new Date().toISOString().slice(0, 10);
  async function saveBirth() {
    if (birthDraft && (birthDraft > today || birthDraft < "1900-01-01")) { setError("Data de nascimento inválida."); return; }
    const { error: err } = await supabase.from("profiles").update({ birth_date: birthDraft || null }).eq("id", userId);
    if (err) { setError("Não foi possível salvar."); return; }
    setBirth(birthDraft || null); setError(null); setEditingBirth(false); setMsg("Data de nascimento atualizada.");
  }

  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "J";

  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Meu perfil" subtitle="Atualize suas informações pessoais." href="/configuracoes" />
      <Card className="mb-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft text-xl font-extrabold flex items-center justify-center">{initials}</div>
        <p className="text-sm text-gray-500">A foto de perfil chega em uma próxima versão.</p>
      </Card>
      <Card className="divide-y divide-gray-100 dark:divide-[#262626] !py-2">
        <div className="py-4">
          <Label>Nome completo</Label>
          {editingName ? (
            <div className="flex gap-2"><input autoFocus className={inputCls} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Seu nome completo" /><button onClick={saveName} className={btnCls}>Salvar</button></div>
          ) : (
            <div className="flex items-center justify-between"><p className="font-bold">{name || "—"}</p><button onClick={() => { setNameDraft(name); setEditingName(true); }} aria-label="Editar nome" className="text-gray-400"><Pencil size={16} /></button></div>
          )}
        </div>
        <div className="py-4">
          <Label>Data de nascimento</Label>
          {editingBirth ? (
            <div className="flex gap-2"><input autoFocus type="date" max={today} className={inputCls} value={birthDraft} onChange={(e) => setBirthDraft(e.target.value)} /><button onClick={saveBirth} className={btnCls}>Salvar</button></div>
          ) : (
            <div className="flex items-center justify-between"><p className="font-bold">{birth ? formatDateBR(birth) : "—"}</p><button onClick={() => { setBirthDraft(toInputDate(birth)); setEditingBirth(true); }} aria-label="Editar data de nascimento" className="text-gray-400"><Pencil size={16} /></button></div>
          )}
        </div>
        <div className="py-4"><Label>E-mail <Lock size={11} className="inline ml-1" /></Label><p className="font-bold break-all">{email || "—"}</p><p className="text-xs text-gray-400 mt-1">Para alterar, entre em contato com o suporte.</p></div>
      </Card>
      <ErrorNote message={error} />
      {msg && <p className="text-sm text-emerald-600 font-bold mt-3">{msg}</p>}
    </div>
  );
}

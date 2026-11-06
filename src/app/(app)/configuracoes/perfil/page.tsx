"use client";

import { useEffect, useState } from "react";
import { Camera, ImageIcon, Lock, Pencil } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { formatDateBR } from "@/lib/format";
import { BackTitle, Card, Label, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { avatarUrl, removeAvatar, uploadAvatar } from "@/lib/avatar";
import { UserAvatar } from "@/components/UserAvatar";

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
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("profiles").select("full_name,birth_date,avatar_path").maybeSingle().then(async ({ data }) => {
      setName(data?.full_name ?? "");
      setBirth(data?.birth_date ?? null);
      const p = (data?.avatar_path as string | null) ?? null;
      setPhotoPath(p);
      setPhotoUrl(await avatarUrl(supabase, p));
    });
  }, [ready, userId, supabase]);

  // Grava e confere: sem a confirmação de que a linha mudou, não diz "atualizado".
  async function saveProfile(patch: { full_name?: string; birth_date?: string | null }): Promise<boolean> {
    setMsg(null);
    if (!userId) { setError("Entre na sua conta para salvar."); return false; }
    const { data, error: err } = await supabase.from("profiles").update(patch).eq("id", userId).select("full_name,birth_date").maybeSingle();
    if (err || !data) { setError("Não foi possível salvar. Tente de novo."); return false; }
    setName(data.full_name ?? ""); setBirth(data.birth_date ?? null); setError(null);
    window.dispatchEvent(new Event("jakash:changed"));
    return true;
  }

  async function saveName() {
    const clean = nameDraft.trim().replace(/\s+/g, " ");
    if (clean.length < 2) { setError("Informe seu nome."); return; }
    if (await saveProfile({ full_name: clean.slice(0, 80) })) { setEditingName(false); setMsg("Nome atualizado."); }
  }

  const today = new Date().toISOString().slice(0, 10);
  async function saveBirth() {
    if (birthDraft && (birthDraft > today || birthDraft < "1900-01-01")) { setError("Data de nascimento inválida."); return; }
    if (await saveProfile({ birth_date: birthDraft || null })) { setEditingBirth(false); setMsg("Data de nascimento atualizada."); }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || !userId) return;
    setPhotoBusy(true); setError(null); setMsg(null);
    try {
      const p = await uploadAvatar(supabase, userId, file, photoPath);
      setPhotoPath(p); setPhotoUrl(await avatarUrl(supabase, p)); setMsg("Foto atualizada.");
      window.dispatchEvent(new Event("jakash:changed"));
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar a foto."); }
    setPhotoBusy(false);
  }

  async function dropPhoto() {
    if (!photoPath || !userId) return;
    setPhotoBusy(true); setError(null); setMsg(null);
    try { await removeAvatar(supabase, userId, photoPath); setPhotoPath(null); setPhotoUrl(null); setMsg("Foto removida."); window.dispatchEvent(new Event("jakash:changed")); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível tirar a foto."); }
    setPhotoBusy(false);
  }


  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Meu perfil" subtitle="Atualize suas informações pessoais." href="/configuracoes" />
      <Card className="mb-4 flex items-center gap-4">
        <UserAvatar name={name} url={photoUrl} size={72} />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="font-extrabold">Foto de perfil</p>
          <div className="flex flex-wrap gap-2">
            <label className={btnGhostCls + " !py-2 !px-3 !text-xs cursor-pointer" + (photoBusy ? " opacity-60 pointer-events-none" : "")}>
              <Camera size={14} /> Tirar foto
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <label className={btnGhostCls + " !py-2 !px-3 !text-xs cursor-pointer" + (photoBusy ? " opacity-60 pointer-events-none" : "")}>
              <ImageIcon size={14} /> Escolher da galeria
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {photoPath && <button type="button" onClick={dropPhoto} disabled={photoBusy} className="text-xs font-bold text-red-500 px-1">Tirar foto</button>}
          </div>
          {photoBusy && <p className="text-xs text-gray-400">Enviando…</p>}
        </div>
      </Card>
      <Card className="divide-y divide-gray-100 dark:divide-[#262626] !py-2">
        <div className="py-4">
          <Label>Nome completo</Label>
          {editingName ? (
            <div className="flex gap-2"><input autoFocus className={inputCls} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Seu nome completo" /><button onClick={saveName} className={btnCls}>Salvar</button><button onClick={() => { setEditingName(false); setError(null); }} className="text-sm font-bold text-gray-500 px-2">Cancelar</button></div>
          ) : (
            <div className="flex items-center justify-between"><p className="font-bold">{name || "—"}</p><button onClick={() => { setNameDraft(name); setEditingName(true); }} aria-label="Editar nome" className="text-gray-400"><Pencil size={16} /></button></div>
          )}
        </div>
        <div className="py-4">
          <Label>Data de nascimento</Label>
          {editingBirth ? (
            <div className="flex gap-2"><input autoFocus type="date" max={today} className={inputCls} value={birthDraft} onChange={(e) => setBirthDraft(e.target.value)} /><button onClick={saveBirth} className={btnCls}>Salvar</button><button onClick={() => { setEditingBirth(false); setError(null); }} className="text-sm font-bold text-gray-500 px-2">Cancelar</button></div>
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

"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, Camera, Car, Pencil, Plus } from "lucide-react";
import { brl } from "@/lib/format";
import { FUELS, VEHICLE_KINDS, flexAdvice, normalizePlate, plateLabel, type Vehicle, type VehicleKind } from "@/lib/driver";
import { uploadReceipt } from "@/lib/receipts";
import { Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

// A foto do carro fica no mesmo armazenamento privado dos comprovantes, na pasta do próprio usuário.
const BUCKET = "receipts";
const EMPTY: { name: string; plate: string; kind: VehicleKind } = { name: "", plate: "", kind: "carro" };
const dec = (n: number) => String(n).replace(".", ",");

/** Carro flex: diz qual combustível sai mais barato por km com os preços cadastrados (só carros antigos que têm esses dados). */
function FlexTip({ v }: { v: Vehicle }) {
  const a = flexAdvice(v);
  if (!a) return null;
  return <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Com esses preços, {a.best} compensa: {brl(a[a.best])}/km contra {brl(a[a.best === "etanol" ? "gasolina" : "etanol"])}/km.</p>;
}

export function VehiclesPanel({ supabase, userId, vehicles, onChanged, startNew = false }: { supabase: unknown; userId: string; vehicles: Vehicle[]; onChanged: () => void; startNew?: boolean }) {
  const db = supabase as SupabaseClient;
  const [editing, setEditing] = useState<string | "new" | null>(startNew || !vehicles.length ? "new" : null);
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = vehicles.filter((v) => !v.archived);
  const current = editing && editing !== "new" ? vehicles.find((v) => v.id === editing) ?? null : null;

  // Links temporários para mostrar as fotos (o armazenamento é privado).
  const photoKey = active.map((v) => v.photo_path ?? "").join("|");
  useEffect(() => {
    const paths = active.map((v) => v.photo_path).filter((p): p is string => Boolean(p));
    if (!paths.length) { setUrls({}); return; }
    db.storage.from(BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      setUrls(Object.fromEntries((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : []))));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey, db]);

  // Prévia da foto escolhida, antes de salvar.
  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  function open(v: Vehicle | null) {
    setForm(v ? { name: v.name, plate: v.plate ? plateLabel(v.plate) : "", kind: v.kind } : EMPTY);
    setPhoto(null); setDropPhoto(false); setError(null);
    setEditing(v ? v.id : "new");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const plate = normalizePlate(form.plate);
    if (!name) { setError("Informe o nome do veículo (ex.: Onix prata)."); return; }
    const bike = form.kind === "bicicleta"; // bicicleta não tem placa
    if (!bike && !plate) { setError("Informe a placa (ex.: ABC-1234 ou ABC1D23)."); return; }
    if (bike && form.plate.trim() && !plate) { setError("A placa não parece certa. Deixe em branco se não tiver."); return; }
    setBusy(true);
    let photo_path: string | null | undefined; // undefined = não mexe na foto
    if (photo) {
      try { photo_path = (await uploadReceipt(db, userId, photo)).path; }
      catch (err) { setBusy(false); setError(err instanceof Error ? err.message.replace("comprovante", "foto") : "Não foi possível enviar a foto."); return; }
    } else if (dropPhoto) photo_path = null;
    const payload = { name: name.slice(0, 60), kind: form.kind, plate: plate ?? null, ...(photo_path !== undefined ? { photo_path } : {}) };
    const res = editing === "new" ? await db.from("driver_vehicles").insert({ ...payload, user_id: userId }) : await db.from("driver_vehicles").update(payload).eq("id", editing as string);
    setBusy(false);
    if (res.error) {
      if (photo_path) await db.storage.from(BUCKET).remove([photo_path]);
      setError("Não foi possível salvar o veículo.");
      return;
    }
    // Trocou ou tirou a foto: apaga a antiga.
    if (photo_path !== undefined && current?.photo_path && current.photo_path !== photo_path) await db.storage.from(BUCKET).remove([current.photo_path]);
    setEditing(null); setForm(EMPTY); setPhoto(null); setDropPhoto(false); setError(null); onChanged();
  }

  async function archive(v: Vehicle) {
    if (!window.confirm(`Tirar "${v.name}" da lista? Os dias já registrados continuam.`)) return;
    const res = await db.from("driver_vehicles").update({ archived: true }).eq("id", v.id);
    if (res.error) setError("Não foi possível arquivar."); else onChanged();
  }

  const shownPhoto = preview ?? (!dropPhoto && current?.photo_path ? urls[current.photo_path] : undefined);

  return (
    <div className="space-y-4">
      {active.length === 0 && editing !== "new" && <Card><Empty>Cadastre seu veículo para registrar os dias de trabalho.</Empty></Card>}
      {active.map((v) => (
        <Card key={v.id} className="!p-4">
          <div className="flex items-center gap-3">
            {v.photo_path && urls[v.photo_path]
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={urls[v.photo_path]} alt={`Foto de ${v.name}`} className="w-14 h-14 rounded-2xl object-cover shrink-0" />
              : <span className="w-14 h-14 rounded-2xl bg-brand-dark/10 dark:bg-white/5 inline-flex items-center justify-center text-brand-dark dark:text-brand-soft shrink-0"><Car size={22} /></span>}
            <div className="flex-1 min-w-0">
              <p className="font-extrabold truncate">{v.name}</p>
              <p className="text-xs text-gray-500">{VEHICLE_KINDS[v.kind]}</p>
              {v.plate && <p className="inline-block mt-0.5 rounded-md border border-gray-300 dark:border-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wider">{plateLabel(v.plate)}</p>}
              {v.efficiency > 0 && (v.fuel === "flex"
                ? <p className="text-xs text-gray-500">Flex · gasolina {dec(v.efficiency)} km/l · etanol {dec(v.efficiency_alt ?? 0)} km/l</p>
                : <p className="text-xs text-gray-500">{FUELS[v.fuel].label} · {dec(v.efficiency)} {FUELS[v.fuel].unit}</p>)}
              <FlexTip v={v} />
            </div>
            <button aria-label="Editar veículo" onClick={() => open(v)} className="text-gray-400"><Pencil size={16} /></button>
            <button aria-label="Arquivar veículo" onClick={() => archive(v)} className="text-gray-400"><Archive size={16} /></button>
          </div>
        </Card>
      ))}

      {editing ? (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-lg font-extrabold">{editing === "new" ? "Novo veículo" : "Editar veículo"}</h2>
            <div><Label>Nome do veículo *</Label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Onix prata" maxLength={60} /></div>
            <div><Label>{form.kind === "bicicleta" ? "Placa (se tiver)" : "Placa *"}</Label><input className={inputCls + " uppercase tracking-wider"} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase().slice(0, 8) })} placeholder="ABC-1234 ou ABC1D23" autoCapitalize="characters" /></div>
            <div>
              <Label>Tipo de veículo *</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de veículo">
                {(Object.keys(VEHICLE_KINDS) as VehicleKind[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm({ ...form, kind: k })}
                    className={`rounded-full px-3.5 py-2 text-sm font-bold ${form.kind === k ? "glass-shine bg-brand-dark text-white dark:bg-brand-vivid" : "glass-btn border text-gray-500"}`}>{VEHICLE_KINDS[k]}</button>
                ))}
              </div>
            </div>
            <div>
              <Label>Foto do veículo (opcional)</Label>
              <div className="flex items-center gap-3">
                {shownPhoto
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={shownPhoto} alt="Foto do veículo" className="w-16 h-16 rounded-2xl object-cover" />
                  : <span className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-[#1E1E1E] inline-flex items-center justify-center text-gray-400"><Car size={24} /></span>}
                <label className={btnGhostCls + " !py-2.5 cursor-pointer"}>
                  <Camera size={14} /> {shownPhoto ? "Trocar foto" : "Adicionar foto"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setDropPhoto(false); e.target.value = ""; }} />
                </label>
                {shownPhoto && <button type="button" onClick={() => { setPhoto(null); setDropPhoto(true); }} className="text-xs font-bold text-red-500">Tirar</button>}
              </div>
            </div>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              {active.length > 0 && <button type="button" className={btnGhostCls + " flex-1 !py-3"} onClick={() => { setEditing(null); setError(null); setPhoto(null); }}>Cancelar</button>}
              <button className={btnCls + " flex-1"} disabled={busy}>{busy ? "Salvando..." : "Salvar veículo"}</button>
            </div>
          </form>
        </Card>
      ) : (
        <button className={btnGhostCls + " w-full !py-3"} onClick={() => open(null)}><Plus size={14} /> {active.length ? "Adicionar outro veículo" : "Adicionar veículo"}</button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { INSTITUTIONS, nameInitials, resolveInstitution } from "@/lib/institutions";
import { imageToLogo } from "@/lib/logoImage";
import { Label, inputCls } from "@/components/ui/page";

// Selo da instituição: imagem enviada pela pessoa; senão cor oficial + iniciais (não é o logotipo oficial).
export function InstitutionBadge({ institution, name, logo, size = 48, className = "" }: { institution?: string | null; name?: string | null; logo?: string | null; size?: number; className?: string }) {
  const radius = Math.round(size * 0.3);
  if (logo && logo.startsWith("data:image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" aria-hidden="true" width={size} height={size} className={`shrink-0 object-cover ${className}`} style={{ width: size, height: size, borderRadius: radius }} />;
  }
  const inst = resolveInstitution(institution, name);
  const label = inst?.initials ?? nameInitials(name);
  const long = label.length >= 3;
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 inline-flex items-center justify-center font-extrabold select-none ${className}`}
      style={{
        width: size, height: size, borderRadius: radius,
        background: inst?.color ?? "rgba(91,91,240,0.12)", color: inst?.fg ?? "#5B5BF0",
        fontSize: Math.round(size * (long ? 0.3 : 0.38)), letterSpacing: "-0.02em",
      }}
    >
      {label}
    </span>
  );
}

export function InstitutionSelect({ value, onChange, name, logo, onLogoChange }: { value: string; onChange: (v: string) => void; name?: string; logo?: string | null; onLogoChange?: (v: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setErr(null), [logo]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !onLogoChange) return;
    setBusy(true);
    try { onLogoChange(await imageToLogo(f)); } catch (x) { setErr(x instanceof Error ? x.message : "Não consegui usar esta imagem."); }
    setBusy(false);
  }

  return (
    <div>
      <Label>Banco ou instituição (opcional)</Label>
      <div className="flex items-center gap-3">
        <InstitutionBadge institution={value} name={name} logo={logo} size={40} />
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Escolher automaticamente pelo nome</option>
          {INSTITUTIONS.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
        </select>
      </div>
      {onLogoChange && (
        <div className="flex items-center gap-3 mt-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="text-xs font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1 disabled:opacity-50">
            <ImagePlus size={14} /> {busy ? "Preparando..." : logo ? "Trocar imagem" : "Usar uma imagem própria"}
          </button>
          {logo && <button type="button" onClick={() => onLogoChange(null)} className="text-xs font-bold text-gray-400 inline-flex items-center gap-1"><X size={13} /> Tirar imagem</button>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/*" className="hidden" onChange={pick} />
        </div>
      )}
      {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
      <p className="text-[11px] text-gray-400 mt-1">Sem imagem, o selo usa a cor e as iniciais da instituição (não é o logotipo oficial). A imagem que você enviar aparece só para você e quem divide as finanças com você.</p>
    </div>
  );
}

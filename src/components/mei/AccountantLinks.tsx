"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, MessageCircle } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { formatDateBR } from "@/lib/format";
import { Card, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type LinkRow = { id: string; label: string | null; expires_at: string; revoked_at: string | null; last_seen_at: string | null; created_at: string };

// Acesso só de leitura para o contador: um link com validade que mostra apenas os lançamentos marcados como da empresa.
export function AccountantLinks() {
  const { supabase, userId, ready } = useSupabase();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(30);
  const [fresh, setFresh] = useState<{ url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("accountant_links").select("id,label,expires_at,revoked_at,last_seen_at,created_at").order("created_at", { ascending: false }).limit(20);
    setLinks((data ?? []) as LinkRow[]);
  }, [supabase]);
  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);

  async function create() {
    setBusy(true);
    setError(null);
    setFresh(null);
    const res = await fetch("/api/contador/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim() || undefined, days }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Não foi possível criar o link."); return; }
    setFresh({ url: body.url });
    setLabel("");
    load();
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/contador/links?id=${id}`, { method: "DELETE" });
    if (!res.ok) setError("Não foi possível revogar."); else load();
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Não consegui copiar. Selecione o link e copie manualmente."); }
  }

  const state = (l: LinkRow) => (l.revoked_at ? "Revogado" : new Date(l.expires_at).getTime() < Date.now() ? "Vencido" : "Ativo");

  return (
    <Card>
      <h2 className="font-extrabold text-lg">Link para o contador</h2>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Seu contador vê os lançamentos da empresa, o total por mês e o limite do MEI, só para leitura e sem criar conta. O link vence sozinho e você pode cancelar quando quiser. Quem tiver o link consegue ver esses dados, então envie só para quem for de confiança.</p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
        <div><Label>Para quem (opcional)</Label><input className={inputCls} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Contabilidade Silva" /></div>
        <div><Label>Validade</Label>
          <select className={inputCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
          </select></div>
        <button type="button" className={btnCls} onClick={create} disabled={busy}><Link2 size={16} /> {busy ? "Criando…" : "Criar link"}</button>
      </div>
      <ErrorNote message={error} />

      {fresh && (
        <div className="mt-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-4">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-2">Link criado. Copie agora: por segurança ele não aparece de novo.</p>
          <input readOnly className={inputCls + " font-mono text-xs"} value={fresh.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link do contador" />
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className={btnCls} onClick={() => copy(fresh.url)}><Copy size={16} /> {copied ? "Copiado!" : "Copiar link"}</button>
            <a className={btnGhostCls + " !py-2.5 !px-4"} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent("Segue o acesso de leitura aos lançamentos da minha empresa: " + fresh.url)}`}><MessageCircle size={14} /> Enviar no WhatsApp</a>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-[#262626] mt-4">
          {links.map((l) => (
            <li key={l.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{l.label || "Link do contador"} <span className={`ml-1 text-[10px] rounded-full px-2 py-0.5 ${state(l) === "Ativo" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-[#262626]"}`}>{state(l)}</span></p>
                <p className="text-xs text-gray-500">Vence em {formatDateBR(l.expires_at.slice(0, 10))}{l.last_seen_at ? ` · último acesso ${formatDateBR(l.last_seen_at.slice(0, 10))}` : " · ainda não acessado"}</p>
              </div>
              {state(l) === "Ativo" && <button type="button" className={btnGhostCls + " shrink-0"} onClick={() => revoke(l.id)}>Revogar</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

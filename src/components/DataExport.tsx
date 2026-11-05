"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { usePartnership } from "@/lib/usePartnership";
import { useUsageType } from "@/lib/useUsageType";
import { useIsNative } from "@/lib/useIsNative";
import { todayISO } from "@/lib/format";
import { saveOrShareFile } from "@/lib/nativeShare";
import {
  DEFAULT_OPTIONS, availableItems, effectiveItems, progressText, runExport, validateOptions,
  type ClientLike, type ExportFormat, type ExportItemId, type ExportOptions, type ExportResult, type Progress, type Scope,
} from "@/lib/dataExport";
import { Card, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "ambos", label: "Ambos" },
  { id: "pessoal", label: "Pessoal" },
  { id: "empresa", label: "Empresa" },
];

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "csv", label: "Planilhas CSV (um arquivo por item, em .zip)", hint: "Abre no Excel e no Numbers." },
  { id: "json", label: "JSON (tudo num arquivo)", hint: "Para guardar ou usar em outro sistema." },
];

const fmt = (n: number) => n.toLocaleString("pt-BR");

export default function DataExport() {
  const { supabase, userId, ready } = useSupabase();
  const { isMei } = useUsageType();
  const { data: partnership, error: partnershipError } = usePartnership();
  const { native } = useIsNative();

  const [opts, setOpts] = useState<ExportOptions>(() => DEFAULT_OPTIONS(false));
  const [touchedItems, setTouchedItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const signal = useRef({ aborted: false });

  const items = useMemo(() => availableItems(isMei), [isMei]);
  // Perfil de empresa carrega depois: enquanto a pessoa não mexeu nos itens, "todos" acompanha o que está disponível.
  const picked = touchedItems ? opts.items : items.map((i) => i.id);
  const effective: ExportOptions = { ...opts, items: picked, scope: isMei ? opts.scope : "ambos" };

  const shared = partnership?.state === "accepted";
  const showHousehold = shared || partnershipError;
  const members = useMemo(() => {
    const out: Record<string, string> = {};
    if (partnership?.state === "accepted") for (const m of [partnership.me, ...partnership.others]) out[m.id] = m.name;
    return out;
  }, [partnership]);

  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const setItems = (ids: ExportItemId[]) => { setTouchedItems(true); set({ items: ids }); };
  const toggle = (id: ExportItemId, on: boolean) => setItems(on ? [...picked, id] : picked.filter((x) => x !== id));

  const problem = validateOptions(effective, { isMei });
  const count = effectiveItems(effective, { isMei }).length;

  async function deliver(r: ExportResult): Promise<boolean> {
    return saveOrShareFile(r.fileName, r.data, r.mime);
  }

  async function start() {
    if (!userId || problem) { setError(problem ?? "Entre na sua conta para exportar."); return; }
    setBusy(true); setError(null); setNote(null); setResult(null); setDone({}); setProgress(null);
    signal.current = { aborted: false };
    try {
      const now = new Date();
      const r = await runExport(
        supabase as unknown as ClientLike,
        effective,
        { userId, members, isMei, today: todayISO(), now },
        (p) => { setProgress(p); if (p.done) setDone((d) => ({ ...d, [p.label]: p.count })); },
        signal.current,
      );
      setResult(r);
      const ok = await deliver(r);
      setNote(ok ? (native ? "Escolha onde salvar o arquivo." : "Arquivo baixado.") : "Não foi possível salvar o arquivo. Toque em baixar de novo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar. Tente de novo.");
    } finally {
      setBusy(false); setProgress(null);
    }
  }

  async function again() {
    if (!result) return;
    const ok = await deliver(result);
    setNote(ok ? (native ? "Escolha onde salvar o arquivo." : "Arquivo baixado.") : "Não foi possível salvar o arquivo.");
  }

  const ActionIcon = native ? Share2 : Download;

  return (
    <Card className="mb-4">
      <h2 className="text-lg font-extrabold">Exportar meus dados</h2>
      <p className="text-xs text-gray-500 mt-0.5">Baixe tudo que você tem no Jakash. Escolha o que levar.</p>

      <fieldset disabled={busy} className="mt-4 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>O que exportar</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setItems(items.map((i) => i.id))} className={btnGhostCls}>Marcar todos</button>
              <button type="button" onClick={() => setItems([])} className={btnGhostCls}>Nenhum</button>
            </div>
          </div>
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id}>
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-white/5 px-4 py-3 text-sm">
                  <span>
                    <span className="block font-bold">{i.label}</span>
                    <span className="block text-xs text-gray-500">{i.hint}</span>
                  </span>
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-dark" checked={picked.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Label>Filtros</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>De</Label>
              <input type="date" className={inputCls} value={opts.from ?? ""} max={opts.to ?? undefined} onChange={(e) => set({ from: e.target.value || null })} />
            </div>
            <div>
              <Label>Até</Label>
              <input type="date" className={inputCls} value={opts.to ?? ""} min={opts.from ?? undefined} onChange={(e) => set({ to: e.target.value || null })} />
            </div>
          </div>
          <p className="text-xs text-gray-500">Sem datas, exporta tudo. O período vale para o que tem data, como lançamentos e contas a pagar.</p>

          {isMei && (
            <div>
              <Label>Tipo</Label>
              <div className="grid grid-cols-3 gap-2">
                {SCOPES.map((s) => (
                  <button
                    key={s.id} type="button" onClick={() => set({ scope: s.id })} aria-pressed={opts.scope === s.id}
                    className={`rounded-2xl border px-3 py-2 text-sm font-bold ${opts.scope === s.id ? "border-brand-dark bg-brand-dark/10 text-brand-dark dark:text-brand-soft" : "border-gray-100 dark:border-white/5 text-gray-600 dark:text-gray-300"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showHousehold && (
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-white/5 px-4 py-3 text-sm">
              <span>
                <span className="block font-bold">Incluir dados das outras pessoas da casa</span>
                <span className="block text-xs text-gray-500">Desligado, só os seus dados.</span>
              </span>
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-dark" checked={opts.household} onChange={(e) => set({ household: e.target.checked })} />
            </label>
          )}
        </div>

        <div>
          <Label>Formato</Label>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <label key={f.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-white/5 px-4 py-3 text-sm">
                <span>
                  <span className="block font-bold">{f.label}</span>
                  <span className="block text-xs text-gray-500">{f.hint}</span>
                </span>
                <input type="radio" name="export-format" className="h-5 w-5 shrink-0 accent-brand-dark" checked={opts.format === f.id} onChange={() => set({ format: f.id })} />
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={start} disabled={busy || !ready || !userId || Boolean(problem)} className={btnCls + " flex-1"}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ActionIcon size={16} />}
          {busy ? "Exportando..." : native ? "Exportar e compartilhar" : "Exportar"}
        </button>
        {busy && <button type="button" onClick={() => { signal.current.aborted = true; }} className={btnGhostCls + " !py-2.5"}>Cancelar</button>}
      </div>
      {!busy && count === 0 && <p className="text-xs text-gray-500 mt-2">Escolha ao menos um item.</p>}
      {!busy && count > 0 && problem && <p className="text-xs text-red-500 mt-2">{problem}</p>}

      {busy && progress && (
        <div className="mt-4 text-sm" role="status" aria-live="polite">
          <p className="font-bold">{progressText(progress)}</p>
          <p className="text-xs text-gray-500">Passo {progress.step} de {progress.steps}</p>
          {Object.keys(done).length > 0 && (
            <ul className="mt-2 text-xs text-gray-500 space-y-0.5">
              {Object.entries(done).map(([label, n]) => <li key={label}>{label}: {fmt(n)} lidos</li>)}
            </ul>
          )}
        </div>
      )}

      <ErrorNote message={error} />

      {result && !busy && (
        <div className="mt-4 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4 text-sm">
          <p className="font-extrabold">{fmt(result.totalRows)} {result.totalRows === 1 ? "linha exportada" : "linhas exportadas"}</p>
          <p className="text-xs text-gray-500 mb-2">{result.fileName}</p>
          <ul className="space-y-1">
            {result.summary.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span>{s.title}</span>
                <span className="font-bold tabular-nums">{fmt(s.count)}</span>
              </li>
            ))}
          </ul>
          {result.summary.some((s) => s.capped) && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">Alguns itens passaram de 50.000 linhas e foram cortados. Use o período para exportar o resto.</p>
          )}
          {note && <p className="text-xs text-emerald-600 font-bold mt-3">{note}</p>}
          <button type="button" onClick={again} className={btnGhostCls + " mt-3"}><ActionIcon size={14} /> {native ? "Compartilhar de novo" : "Baixar de novo"}</button>
        </div>
      )}
    </Card>
  );
}

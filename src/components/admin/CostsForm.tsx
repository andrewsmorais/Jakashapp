"use client";

import { useEffect, useState } from "react";
import { Card, ErrorNote, Label, btnCls, inputCls } from "@/components/ui/page";
import { currentMonth, parseMoney } from "@/lib/format";
import type { CostRow } from "@/lib/adminMetrics";

const FIELDS: { key: keyof Omit<CostRow, "month" | "notes">; label: string; hint?: string }[] = [
  { key: "vercel", label: "Vercel" },
  { key: "supabase", label: "Supabase" },
  { key: "ai", label: "IA (OpenAI)" },
  { key: "domain", label: "Domínio" },
  { key: "payment_fees", label: "Taxas Asaas (só se não vier do Asaas)" },
  { key: "taxes", label: "Impostos" },
  { key: "other", label: "Outros" },
];

const fmt = (v: number | undefined) => (v ? String(v).replace(".", ",") : "");

export function CostsForm({ costs, onSaved }: { costs: CostRow[]; onSaved: () => void }) {
  const [month, setMonth] = useState(currentMonth());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Ao trocar de mês, carrega o que já foi lançado.
  useEffect(() => {
    const row = costs.find((c) => c.month.slice(0, 7) === month);
    setVals(Object.fromEntries(FIELDS.map((f) => [f.key, fmt(row?.[f.key] as number | undefined)])));
    setNotes(row?.notes ?? "");
    setSaved(false);
  }, [month, costs]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const body: Record<string, unknown> = { month, notes };
    for (const f of FIELDS) {
      const raw = vals[f.key] ?? "";
      const n = raw.trim() === "" ? 0 : parseMoney(raw);
      if (Number.isNaN(n) || n < 0) { setError(`Valor inválido em "${f.label}".`); return; }
      body[f.key] = n;
    }
    setSaving(true);
    const res = await fetch("/api/admin/costs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Não foi possível salvar.");
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <Card>
      <h2 className="font-extrabold text-lg mb-1">Custos do mês</h2>
      <p className="text-xs text-gray-500 mb-4">Lance o que pagou (R$). Alimenta custo operacional, lucro bruto e lucro líquido.</p>
      <form onSubmit={save} className="space-y-4">
        <div className="max-w-[12rem]">
          <Label>Mês</Label>
          <input type="month" className={inputCls} value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <input
                className={inputCls} inputMode="decimal" placeholder="0,00"
                value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div>
          <Label>Observações (opcional)</Label>
          <input className={inputCls} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button className={btnCls} disabled={saving} type="submit">{saving ? "Salvando…" : "Salvar custos"}</button>
          {saved && <span className="text-sm font-bold text-emerald-600">Salvo.</span>}
        </div>
        <ErrorNote message={error} />
      </form>
    </Card>
  );
}

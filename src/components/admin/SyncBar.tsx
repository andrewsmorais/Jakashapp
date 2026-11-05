"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, ErrorNote, btnCls, btnGhostCls } from "@/components/ui/page";
import type { SyncState } from "@/lib/adminMetrics";

type Cursor = { s: number; o: number };
type SyncResponse = { ok: boolean; done: boolean; cursor?: Cursor; scanned: number; inserted: number; feesFilled: number; error?: string };

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

// Sincroniza com a API do Asaas: "completo" importa todo o histórico (1ª vez); "conferir" olha os últimos 60 dias.
export function SyncBar({ sync, onDone }: { sync: SyncState; onDone: () => void }) {
  const [busy, setBusy] = useState<null | "full" | "recent">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(full: boolean) {
    setBusy(full ? "full" : "recent");
    setError(null);
    setInfo(null);
    let cursor: Cursor | undefined;
    let scanned = 0, inserted = 0, fees = 0;
    try {
      // O servidor tem limite de tempo por chamada: se não terminar, devolve o ponto de retomada e chamamos de novo.
      for (let i = 0; i < 40; i++) {
        const res = await fetch("/api/admin/sync", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full, cursor }),
        });
        const j = (await res.json().catch(() => ({}))) as SyncResponse;
        scanned += j.scanned ?? 0; inserted += j.inserted ?? 0; fees += j.feesFilled ?? 0;
        if (!res.ok || !j.ok) { setError(j.error ?? "Não foi possível sincronizar com o Asaas."); return; }
        if (j.done) break;
        cursor = j.cursor;
      }
      setInfo(`${scanned} cobrança(s) conferida(s), ${inserted} nova(s), ${fees} taxa(s) preenchida(s).`);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  const last = when(sync?.last_sync_at);
  return (
    <Card className="!p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-extrabold text-sm">Dados do Asaas</p>
          <p className="text-xs text-gray-500">
            {last ? `Última sincronização: ${last}.` : "Ainda não sincronizado. Importe o histórico para o painel não começar zerado."}
            {" "}O webhook atualiza em tempo real; aqui você confere com a API do Asaas.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" className={btnGhostCls} disabled={busy !== null} onClick={() => run(false)}>
            <RefreshCw size={14} className={busy === "recent" ? "animate-spin" : ""} /> Conferir
          </button>
          <button type="button" className={btnCls + " !py-2"} disabled={busy !== null} onClick={() => run(true)}>
            <RefreshCw size={14} className={busy === "full" ? "animate-spin" : ""} /> {sync?.last_full_sync_at ? "Reimportar tudo" : "Importar histórico"}
          </button>
        </div>
      </div>
      {info && <p className="text-xs font-bold text-emerald-600 mt-2">{info}</p>}
      <ErrorNote message={error} />
    </Card>
  );
}

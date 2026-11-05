"use client";

import { removeAllReceipts } from "@/lib/receipts";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw, UserX, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { BackTitle, Card, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import DataExport from "@/components/DataExport";

const RESET_OPTIONS = [
  { id: "transactions", label: "Lançamentos" },
  { id: "bills", label: "Contas a pagar e receber" },
  { id: "debts", label: "Dívidas" },
  { id: "goals", label: "Objetivos" },
  { id: "budgets", label: "Limites de gastos" },
  { id: "accounts", label: "Contas bancárias" },
  { id: "credit_cards", label: "Cartões de crédito e débito (com as compras e pagamentos)" },
  { id: "investments", label: "Investimentos" },
] as const;

type Modal = null | "reset" | "delete";

export default function DadosPage() {
  const router = useRouter();
  const { supabase, userId } = useSupabase();
  const [modal, setModal] = useState<Modal>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [apple, setApple] = useState(false); // assina pela App Store: a Apple cobra, o Jakash não consegue cancelar

  useEffect(() => {
    fetch("/api/plan", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => setApple(j?.billingProvider === "apple" && ["active", "past_due"].includes(j?.status))).catch(() => undefined);
  }, []);

  async function doReset() {
    if (confirm.trim().toUpperCase() !== "APAGAR" || picked.length === 0) { setError("Escolha o que apagar e digite APAGAR."); return; }
    setBusy(true); setError(null);
    // Lançamentos e cartões levam junto os pagamentos de fatura (que dependem das compras).
    const tables = picked.includes("transactions") && !picked.includes("credit_cards") ? [...picked, "card_invoice_payments"] : picked;
    for (const table of tables) {
      const { error: err } = await supabase.from(table).delete().eq("user_id", userId);
      if (err) { setError("Não foi possível apagar tudo. Tente de novo."); setBusy(false); return; }
    }
    if (userId && picked.includes("transactions")) await removeAllReceipts(supabase, userId).catch(() => {});
    setBusy(false); setModal(null); setPicked([]); setConfirm("");
    setMsg("Dados apagados.");
    window.dispatchEvent(new Event("jakash:changed"));
  }

  async function doDelete() {
    setBusy(true); setError(null);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Não foi possível excluir agora."); setBusy(false); return; }
    await supabase.auth.signOut();
    router.replace("/");
  }

  const rows = [
    { icon: RotateCcw, title: "Começar do zero", desc: "Escolha o que apagar dos seus dados financeiros.", onClick: () => { setModal("reset"); setError(null); setConfirm(""); } },
    { icon: UserX, title: "Excluir minha conta", desc: "Apaga sua conta e todos os dados, de forma definitiva.", onClick: () => { setModal("delete"); setError(null); setConfirm(""); } },
  ];

  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Dados" subtitle="Seus dados são seus: exporte ou apague quando quiser." href="/configuracoes" />
      <DataExport />
      <Card className="!p-2">
        <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
          {rows.map((r) => (
            <li key={r.title}>
              <button onClick={r.onClick} className="w-full flex items-center gap-4 px-3 py-4 text-left rounded-2xl hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E]">
                <div className="w-11 h-11 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft flex items-center justify-center shrink-0"><r.icon size={20} /></div>
                <div className="flex-1"><p className="font-extrabold">{r.title}</p><p className="text-xs text-gray-500">{r.desc}</p></div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {!modal && <ErrorNote message={error} />}
      {msg && <p className="text-sm text-emerald-600 font-bold mt-3">{msg}</p>}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">{modal === "reset" ? "Começar do zero" : "Excluir minha conta"}</h2>
              <button onClick={() => setModal(null)} aria-label="Fechar" className="text-gray-400"><X size={20} /></button>
            </div>
            {modal === "reset" ? (
              <>
                <p className="text-sm text-gray-500">Escolha o que apagar. Isso não pode ser desfeito.</p>
                <div className="space-y-2">{RESET_OPTIONS.map((o) => (
                  <label key={o.id} className="flex items-center justify-between rounded-2xl border border-gray-100 dark:border-white/5 px-4 py-3 text-sm font-bold">
                    {o.label}
                    <input type="checkbox" className="h-5 w-5 accent-brand-dark" checked={picked.includes(o.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))} />
                  </label>
                ))}</div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">Sua conta, seus lançamentos e todos os dados serão apagados de forma definitiva{apple ? "" : ", e a assinatura será cancelada"}. Não há como recuperar.</p>
                {apple && <p className="text-sm font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-2xl p-3">Sua assinatura é da App Store e não é cancelada ao excluir a conta. Para não ser cobrado de novo, cancele em Ajustes do iPhone › seu nome › Assinaturas.</p>}
              </>
            )}
            <div><Label>Digite {modal === "reset" ? "APAGAR" : "EXCLUIR"} para confirmar</Label><input className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button>
              <button onClick={modal === "reset" ? doReset : doDelete} disabled={busy} className={btnCls + " flex-1 !bg-none !bg-red-500 !shadow-none"}>{busy ? "Aguarde..." : modal === "reset" ? "Apagar" : "Excluir conta"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

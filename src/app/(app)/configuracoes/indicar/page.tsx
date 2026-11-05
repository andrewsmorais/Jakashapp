"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, MessageCircle } from "lucide-react";
import { useIsNative } from "@/lib/useIsNative";
import { BackTitle, Card, Empty, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type Info = { code: string; link: string; stats: { signedUp: number; subscribed: number; rewarded: number }; autoReward: boolean };

export default function IndicarPage() {
  const { native } = useIsNative();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referral").then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setInfo(d as Info); else setError(d.error || "Não foi possível carregar sua indicação.");
    }).catch(() => setError("Sem conexão. Tente de novo."));
  }, []);

  async function copy() {
    if (!info) return;
    try { await navigator.clipboard.writeText(info.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Não consegui copiar. Selecione o link e copie manualmente."); }
  }

  const share = info ? `https://wa.me/?text=${encodeURIComponent(`Estou usando o Jakash para organizar meu dinheiro. Entra por aqui: ${info.link}`)}` : "#";

  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-6">
      <BackTitle title="Indicar amigos" subtitle={!native && info?.autoReward ? "Você e seu amigo ganham 1 mês grátis quando ele assinar." : "Convide amigos e acompanhe as indicações."} href="/menu" />
      <ErrorNote message={error} />
      {!info && !error && <Empty>Carregando…</Empty>}
      {info && (
        <>
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-11 h-11 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft flex items-center justify-center"><Gift size={22} /></span>
              <div><p className="font-extrabold">Seu link de indicação</p><p className="text-xs text-gray-500">Código <b className="tracking-widest">{info.code}</b></p></div>
            </div>
            <input readOnly className={inputCls + " font-mono text-xs"} value={info.link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de indicação" />
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className={btnCls} onClick={copy}>{copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar link</>}</button>
              <a className={btnGhostCls + " !py-2.5 !px-4"} href={share} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Enviar no WhatsApp</a>
            </div>
          </Card>

          {!native && <Card>
            <h2 className="font-extrabold text-lg mb-3">Suas indicações</h2>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><dd className="text-2xl font-extrabold">{info.stats.signedUp}</dd><dt className="text-xs text-gray-500">cadastraram</dt></div>
              <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><dd className="text-2xl font-extrabold">{info.stats.subscribed}</dd><dt className="text-xs text-gray-500">assinaram</dt></div>
              <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><dd className="text-2xl font-extrabold">{info.stats.rewarded}</dd><dt className="text-xs text-gray-500">com mês grátis</dt></div>
            </dl>
          </Card>}

          {!native && <Card>
            <h2 className="font-extrabold text-lg mb-2">Como funciona</h2>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              <li>Seu amigo cria a conta pelo seu link.</li>
              <li>Quando ele paga a primeira mensalidade, a indicação conta como “assinou”.</li>
              <li>{info.autoReward ? "Vocês dois ganham 1 mês grátis: a próxima cobrança de cada um é adiada em um mês." : "O mês grátis para os dois ainda não é aplicado automaticamente. Sua indicação fica registrada aqui."}</li>
            </ol>
            <p className="text-xs text-gray-400 mt-3">A indicação só vale para quem criou a conta há poucos dias e entrou pelo seu link. Não vale indicar a si mesmo.</p>
          </Card>}
        </>
      )}
    </div>
  );
}

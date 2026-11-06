"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, LifeBuoy, Mail, MessageCircle, Send } from "lucide-react";
import { BackTitle, Card, ErrorNote, inputCls, btnCls } from "@/components/ui/page";
import { ChatText } from "@/components/chat/ChatText";

// Contatos vêm de variáveis de ambiente (a equipe define os números e e-mails no deploy).
const WA = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
const EMAIL = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();

type Msg = { role: "user" | "assistant"; content: string; handoff?: boolean };
const SUGGESTIONS = ["Como lanço uma despesa?", "Como guardo dinheiro para um objetivo?", "Como pago a fatura do cartão?", "Como cancelo a assinatura?"];
const IDLE_MS = 5 * 60_000; // sem resposta por 5 minutos: o chat é encerrado

export default function FaleConoscoPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/suporte/chat").then((r) => r.json()).then((d) => setEnabled(d.enabled !== false)).catch(() => undefined); }, []);
  // Encerra depois de 5 minutos parado (conta de novo a cada mensagem, da pessoa ou do chat).
  useEffect(() => {
    if (closed || busy || messages.length === 0) return;
    const t = setTimeout(() => setClosed(true), IDLE_MS);
    return () => clearTimeout(t);
  }, [messages, busy, closed]);
  function restart() { setMessages([]); setClosed(false); setError(null); setInput(""); }
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || closed) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
    setMessages((p) => [...p, { role: "user", content }]);
    setInput(""); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/suporte/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, history }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Não foi possível responder agora.");
      else setMessages((p) => [...p, { role: "assistant", content: data.reply, handoff: Boolean(data.handoff) }]);
    } catch { setError("Sem conexão. Tente de novo."); }
    setBusy(false);
  }

  const contactCls = "flex items-center gap-4 px-3 py-4 rounded-2xl hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E]";
  const iconCls = "w-11 h-11 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft flex items-center justify-center shrink-0";

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <BackTitle title="Fale conosco" subtitle="Tire dúvidas de como usar o app ou fale com a equipe." href="/configuracoes" />

      <Card className="!p-2 mb-4">
        <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
          <li>
            {EMAIL ? (
              <a href={`mailto:${EMAIL}`} className={contactCls}>
                <div className={iconCls}><Mail size={20} /></div>
                <div className="min-w-0 flex-1"><p className="font-extrabold">E-mail</p><p className="text-xs text-gray-500 break-all">{EMAIL}</p></div>
                <ExternalLink size={16} className="text-gray-300" />
              </a>
            ) : (
              <div className={contactCls + " opacity-60"}><div className={iconCls}><Mail size={20} /></div><div className="flex-1"><p className="font-extrabold">E-mail</p><p className="text-xs text-gray-500">Em breve.</p></div></div>
            )}
          </li>
        </ul>
      </Card>

      <Card className="!p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={iconCls}><LifeBuoy size={20} /></div>
          <div><p className="font-extrabold">Chat de ajuda</p><p className="text-xs text-gray-500">Pergunte como usar qualquer parte do app. Para consultar os seus números, use o Chat da Jaki.</p></div>
        </div>

        {!enabled ? <p className="text-sm text-gray-500">O chat de ajuda será liberado em breve. Por enquanto, fale com a gente pelo WhatsApp ou e-mail.</p> : (
          <>
            {messages.length === 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300">{s}</button>)}
              </div>
            )}
            <div className="space-y-2 mb-3" aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "ml-auto bg-brand-dark text-white dark:bg-brand-vivid" : "bg-gray-100 dark:bg-[#1E1E1E]"}`}>
                  {m.role === "user" ? m.content : <ChatText text={m.content} />}
                  {m.handoff && (
                    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <p className="text-xs font-bold mb-2">Fale com a nossa equipe</p>
                      {WA ? (
                        <a href={`https://wa.me/${WA}?text=${encodeURIComponent("Olá! Preciso de ajuda com o Jakash.")}`} target="_blank" rel="noopener noreferrer" className={btnCls + " w-full !py-2.5 !text-sm"}><MessageCircle size={16} /> Chamar no WhatsApp</a>
                      ) : EMAIL ? (
                        <a href={`mailto:${EMAIL}`} className={btnCls + " w-full !py-2.5 !text-sm"}><Mail size={16} /> Enviar e-mail</a>
                      ) : <p className="text-xs text-gray-500">O contato da equipe será liberado em breve.</p>}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="rounded-2xl px-3.5 py-2.5 text-sm bg-gray-100 dark:bg-[#1E1E1E] text-gray-500 w-fit">Digitando…</div>}
              <div ref={endRef} />
            </div>
            <ErrorNote message={error} />
            {closed ? (
              <div className="rounded-2xl bg-gray-100 dark:bg-[#1E1E1E] p-4 text-center space-y-2">
                <p className="text-sm font-bold">Chat encerrado por falta de resposta.</p>
                <button type="button" onClick={restart} className={btnCls + " !py-2.5"}>Começar nova conversa</button>
              </div>
            ) : (
            <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2">
              <input className={inputCls} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex.: como adiciono um veículo?" maxLength={500} aria-label="Sua dúvida" />
              <button type="submit" className={btnCls + " shrink-0"} disabled={busy || !input.trim()} aria-label="Enviar"><Send size={16} /></button>
            </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check, Send, Target, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR } from "@/lib/format";
import type { CatRow } from "@/lib/categories";
import { CHAT_PAGES, type ChatAction } from "@/lib/chatActions";
import { ChatText } from "@/components/chat/ChatText";
import { BackTitle, Disclaimer } from "@/components/ui/page";

type Msg = {
  id: string; role: "user" | "assistant"; content: string;
  actions?: ChatAction[]; done?: number[]; state?: "pending" | "saved" | "discarded"; error?: boolean;
};

const SUGGESTIONS = [
  "Quanto gastei este mês?",
  "Em que categoria gastei mais?",
  "Quais contas vencem nos próximos dias?",
  "Como estou nos meus limites?",
  "Gastei 35 no almoço hoje",
  "Quero juntar 5 mil para uma viagem",
  "Onde vejo minhas faturas?",
];

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
const isWrite = (a: ChatAction) => a.type !== "navigate";

export default function ChatPage() {
  const { supabase, userId, ready } = useSupabase();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [h, c, r] = await Promise.all([
      supabase.from("chat_history").select("id,message_role,content,created_at").order("created_at", { ascending: false }).limit(40),
      supabase.from("categories").select("id,name,type,parent_id"),
      fetch("/api/chat").then((x) => (x.ok ? x.json() : null)).catch(() => null),
    ]);
    setMessages(((h.data ?? []) as { id: string; message_role: "user" | "assistant"; content: string }[]).reverse().map((x) => ({ id: x.id, role: x.message_role, content: x.content })));
    setCats((c.data ?? []) as CatRow[]);
    if (r) { setRemaining(r.remaining); setEnabled(r.enabled !== false); }
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = messages.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
    setMessages((p) => [...p, { id: uid(), role: "user", content }]);
    setInput("");
    setNote(null);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, history }) });
      const data = await res.json().catch(() => ({}));
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (!res.ok) {
        setMessages((p) => [...p, { id: uid(), role: "assistant", content: data.error || "Não consegui responder agora.", error: true }]);
      } else {
        const actions = (Array.isArray(data.actions) ? data.actions : []) as ChatAction[];
        const writes = actions.some(isWrite);
        setMessages((p) => [...p, { id: uid(), role: "assistant", content: data.reply, actions: actions.length ? actions : undefined, done: [], state: writes ? "pending" : undefined }]);
      }
    } catch {
      setMessages((p) => [...p, { id: uid(), role: "assistant", content: "Sem conexão. Tente de novo.", error: true }]);
    }
    setBusy(false);
  }

  // Grava na ordem, com a sessão da pessoa (o RLS vale). Se um item falhar, os que já foram salvos não são repetidos ao tentar de novo.
  async function confirm(msg: Msg) {
    if (!msg.actions || !userId) return;
    const done = new Set(msg.done ?? []);
    setNote(null);
    for (let i = 0; i < msg.actions.length; i++) {
      const a = msg.actions[i];
      if (!isWrite(a) || done.has(i)) continue;
      let error: unknown = null;
      if (a.type === "transaction") {
        const category_id = cats.find((c) => !c.parent_id && c.type === a.flow && c.name.toLowerCase() === (a.category ?? "").toLowerCase())?.id ?? null;
        ({ error } = await supabase.from("transactions").insert({ user_id: userId, description: a.description, amount: a.amount, type: a.flow, date: a.date, origin: "manual", category_id }));
      } else if (a.type === "bill") {
        ({ error } = await supabase.from("bills").insert({ user_id: userId, description: a.description, amount: a.amount, due_date: a.due_date, type: a.kind, recurrence: a.recurrence }));
      } else if (a.type === "goal") {
        ({ error } = await supabase.from("goals").insert({ user_id: userId, name: a.name, type: "custom", target_amount: a.target_amount, current_amount: 0, deadline: a.deadline ?? null }));
      }
      if (error) {
        setNote("Não foi possível salvar tudo. Tente confirmar de novo: o que já foi salvo não se repete.");
        setMessages((p) => p.map((m) => (m.id === msg.id ? { ...m, done: Array.from(done) } : m)));
        return;
      }
      done.add(i);
    }
    setMessages((p) => p.map((m) => (m.id === msg.id ? { ...m, done: Array.from(done), state: "saved" } : m)));
    window.dispatchEvent(new Event("jakash:changed"));
  }

  const discard = (msg: Msg) => setMessages((p) => p.map((m) => (m.id === msg.id ? { ...m, state: "discarded" } : m)));

  function ActionCard({ a }: { a: ChatAction }) {
    if (a.type === "transaction") {
      return (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0"><span className="block font-bold truncate">{a.description}</span><span className="block text-gray-500">{formatDateBR(a.date)} · {a.category || "Sem categoria"}</span></span>
          <span className={`font-extrabold shrink-0 ${a.flow === "income" ? "text-emerald-500" : "text-red-500"}`}>{a.flow === "income" ? "+" : "-"}{brl(a.amount)}</span>
        </div>
      );
    }
    if (a.type === "bill") {
      return (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0"><span className="block font-bold truncate flex items-center gap-1"><CalendarClock size={12} className="shrink-0" />{a.description}</span>
            <span className="block text-gray-500">Conta a {a.kind === "income" ? "receber" : "pagar"} · vence {formatDateBR(a.due_date)}{a.recurrence === "monthly" ? " · todo mês" : ""}</span></span>
          <span className={`font-extrabold shrink-0 ${a.kind === "income" ? "text-emerald-500" : "text-red-500"}`}>{brl(a.amount)}</span>
        </div>
      );
    }
    if (a.type === "goal") {
      return (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0"><span className="block font-bold truncate flex items-center gap-1"><Target size={12} className="shrink-0" />{a.name}</span>
            <span className="block text-gray-500">Objetivo{a.deadline ? ` · até ${formatDateBR(a.deadline)}` : ""}</span></span>
          <span className="font-extrabold shrink-0">{brl(a.target_amount)}</span>
        </div>
      );
    }
    const page = CHAT_PAGES[a.page];
    return (
      <Link href={page.path} className="inline-flex items-center gap-1.5 rounded-full bg-brand-dark/10 dark:bg-white/10 px-3.5 py-2 text-xs font-bold text-brand-dark dark:text-brand-soft hover:opacity-80" aria-label={`Abrir ${page.label}`}>
        Abrir {page.label} <ArrowRight size={13} />
      </Link>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-4">
      <BackTitle title="Chat IA" subtitle="Pergunte sobre suas finanças, registre gastos, crie contas e objetivos ou peça para abrir uma tela." />

      <div className="flex flex-col h-[calc(100dvh-17rem)] md:h-[calc(100vh-15rem)] rounded-[28px] bg-white/60 dark:bg-[#121212] border border-white/80 dark:border-white/5 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-500 pt-6">
              <p className="font-extrabold text-base text-gray-800 dark:text-gray-100 mb-1">Oi! Eu sou a Jaki 👋</p>
              <p>Eu olho os seus números e respondo. Também posso lançar gastos, criar contas e objetivos e abrir telas: é só pedir.</p>
            </div>
          )}
          {messages.map((m) => {
            const writes = m.actions?.filter(isWrite) ?? [];
            const navs = m.actions?.filter((a) => !isWrite(a)) ?? [];
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm break-words ${
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-gradient-to-r from-brand-dark to-brand-accent dark:from-brand-vivid dark:to-brand-vivid text-white rounded-br-md"
                    : `bg-white dark:bg-[#1E1E1E] border border-gray-100 dark:border-white/5 rounded-bl-md ${m.error ? "text-red-500" : ""}`
                }`}>
                  {m.role === "assistant" ? <ChatText text={m.content} /> : m.content}
                  {writes.length > 0 && (
                    <div className="mt-3 rounded-xl bg-brand-dark/5 dark:bg-black/30 p-3 space-y-2">
                      {m.actions!.map((a, i) => (isWrite(a) ? <div key={i}><ActionCard a={a} /></div> : null))}
                      {m.state === "pending" ? (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => confirm(m)} className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-emerald-500 text-white font-bold py-2 text-xs"><Check size={14} /> Confirmar</button>
                          <button onClick={() => discard(m)} className="flex-1 inline-flex items-center justify-center gap-1 rounded-full border border-gray-300 dark:border-white/10 font-bold py-2 text-xs text-gray-500"><X size={14} /> Descartar</button>
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-gray-500 pt-1">{m.state === "saved" ? "✓ Salvo" : "Descartado"}</p>
                      )}
                    </div>
                  )}
                  {navs.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.actions!.map((a, i) => (!isWrite(a) ? <div key={i}><ActionCard a={a} /></div> : null))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-white dark:bg-[#1E1E1E] border border-gray-100 dark:border-white/5 px-4 py-3 flex gap-1.5">
              {[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}
            </div></div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/80 dark:border-white/5 p-3 space-y-2 bg-white/70 dark:bg-[#161616]">
          {note && <p className="text-xs text-red-500 font-medium">{note}</p>}
          {!enabled && <p className="text-xs text-amber-600 font-medium">O Chat IA ainda não está ativado neste ambiente.</p>}
          {messages.length < 4 && enabled && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={busy} className="shrink-0 rounded-full border border-brand-dark/20 dark:border-white/10 px-3 py-1.5 text-xs font-bold text-brand-dark dark:text-brand-soft disabled:opacity-50">{s}</button>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
            <input
              value={input} onChange={(e) => setInput(e.target.value.slice(0, 500))} disabled={busy || !enabled}
              placeholder="Escreva uma pergunta, um gasto ou um pedido..."
              className="flex-1 rounded-full border border-white/70 dark:border-white/5 bg-white dark:bg-[#1E1E1E] px-4 py-3 text-sm focus:outline-none focus:border-brand-dark focus:ring-2 focus:ring-brand-dark/20"
            />
            <button type="submit" disabled={busy || !enabled || !input.trim()} aria-label="Enviar" className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-r from-brand-dark to-brand-accent dark:from-brand-vivid dark:to-brand-vivid text-white flex items-center justify-center disabled:opacity-40"><Send size={18} /></button>
          </form>
          <p className="text-[11px] text-gray-400 text-center">{remaining !== null ? `${remaining} mensagens restantes hoje · ` : ""}A Jaki pode errar. Confira antes de salvar.</p>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

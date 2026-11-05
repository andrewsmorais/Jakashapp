"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Mic, Square, TriangleAlert } from "lucide-react";
import type { CatRow } from "@/lib/categories";
import { brl, todayISO } from "@/lib/format";
import { lightImpact, successHaptic } from "@/lib/haptics";
import { useIsNative } from "@/lib/useIsNative";
import { detectVoiceMethod, startVoice, voiceErrorText, type VoiceErrorCode, type VoiceMethod, type VoiceSession } from "@/lib/voiceInput";
import type { VoiceItem } from "@/lib/voiceParse";

// Botão do microfone dentro de "Novo lançamento". Ouve, entende a frase e entrega um RASCUNHO para o formulário.
// Nunca salva nada: quem confere e toca em Salvar é a pessoa.

type Phase = "idle" | "listening" | "sending" | "understanding" | "done" | "warn" | "error";

const HINT = "Tente: “gastei 50 no almoço”.";

export function VoiceEntry({ cats, resetKey, onDraft, onQueue }: {
  cats: CatRow[];
  /** muda quando a janela abre de novo: limpa o estado da voz */
  resetKey: unknown;
  onDraft: (item: VoiceItem) => void;
  /** itens "Também entendi" que a pessoa quer abrir depois de salvar este */
  onQueue: (items: VoiceItem[]) => void;
}) {
  const { native } = useIsNative();
  const [method, setMethod] = useState<VoiceMethod>("none");
  const [phase, setPhase] = useState<Phase>("idle");
  const [partial, setPartial] = useState("");
  const [heard, setHeard] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [hasLevel, setHasLevel] = useState(false);
  const [extras, setExtras] = useState<VoiceItem[]>([]);
  const [queued, setQueued] = useState<number[]>([]);
  const session = useRef<VoiceSession | null>(null);
  const run = useRef(0); // descarta respostas de uma tentativa antiga
  const catsRef = useRef(cats);
  catsRef.current = cats;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;

  useEffect(() => { setMethod(detectVoiceMethod()); }, []);

  const cancel = useCallback(() => {
    run.current++;
    session.current?.cancel();
    session.current = null;
  }, []);

  // Fechou ou reabriu a janela: para de ouvir e limpa.
  useEffect(() => {
    cancel();
    setPhase("idle"); setPartial(""); setHeard(""); setMessage(null); setLevel(0); setExtras([]); setQueued([]);
    onQueue([]);
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (method === "none") return null;

  const fail = (code: VoiceErrorCode, serverMsg?: string) => {
    setPhase("error");
    setMessage(code === "limit" || code === "not-allowed-plan" ? serverMsg || voiceErrorText(code, native) : voiceErrorText(code, native));
    setLevel(0);
  };

  async function understand(text: string, myRun: number) {
    setPhase("understanding");
    setHeard(text);
    setPartial("");
    const { parseVoice, mergeAiDraft } = await import("@/lib/voiceParse");
    const list = catsRef.current;
    const local = parseVoice(text, { today: todayISO(), categories: list });
    let item = local.items[0];
    let note: string | null = null;

    if (local.needsAi) {
      try {
        const names = Array.from(new Set(list.map((c) => c.name))).slice(0, 80);
        const res = await fetch("/api/voice/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, categories: names }) });
        const data = (await res.json().catch(() => ({}))) as { draft?: Parameters<typeof mergeAiDraft>[1]; error?: string };
        if (myRun !== run.current) return;
        if (res.ok && data.draft) item = mergeAiDraft(item, data.draft, list);
        else note = res.status === 402 || res.status === 429 ? `${data.error ?? "A IA não está disponível agora."} Preenchi o que entendi.` : "Não consegui usar a IA agora. Preenchi o que entendi.";
      } catch {
        if (myRun !== run.current) return;
        note = "Sem conexão com a IA. Preenchi o que entendi.";
      }
    }
    if (myRun !== run.current) return;

    const understoodSomething = item.amount !== null || Boolean(item.description) || item.type !== null || item.categoryId !== null;
    if (!understoodSomething) { setPhase("error"); setMessage(`Não entendi o valor. ${HINT}`); return; }

    onDraftRef.current(item);
    setExtras(local.items.slice(1).filter((x) => x.amount !== null));
    setQueued([]); onQueue([]);
    if (item.amount === null) {
      setPhase("warn");
      setMessage(`Não entendi o valor. ${HINT}`);
    } else {
      setPhase("done");
      setMessage(note);
      void successHaptic();
    }
  }

  async function begin() {
    cancel();
    const myRun = ++run.current;
    setPhase("listening"); setPartial(""); setHeard(""); setMessage(null); setLevel(0); setHasLevel(false); setExtras([]); setQueued([]);
    onQueue([]);
    void lightImpact();
    const s = await startVoice(method, {
      onPartial: (t) => { if (myRun === run.current) setPartial(t); },
      onLevel: (l) => { if (myRun === run.current) { setHasLevel(true); setLevel(l); } },
      onPhase: (p) => { if (myRun === run.current) setPhase(p === "sending" ? "sending" : "listening"); },
      onFinal: (t) => { if (myRun === run.current) { session.current = null; setLevel(0); void understand(t, myRun); } },
      onError: (code, msg) => { if (myRun === run.current) { session.current = null; fail(code, msg); } },
    });
    if (myRun !== run.current) { s.cancel(); return; }
    session.current = s;
  }

  const listening = phase === "listening";
  const busy = phase === "sending" || phase === "understanding";

  function onTap() {
    if (listening) { session.current?.stop(); return; }
    if (busy) return;
    void begin();
  }

  function toggleQueue(i: number) {
    const next = queued.includes(i) ? queued.filter((x) => x !== i) : [...queued, i].sort((a, b) => a - b);
    setQueued(next);
    onQueue(next.map((k) => extras[k]));
  }

  const label = listening ? "Parar de ouvir" : busy ? "Entendendo sua voz" : phase === "idle" ? "Falar o lançamento" : "Falar de novo";
  const title = listening ? "Ouvindo..." : phase === "sending" ? "Enviando o áudio..." : phase === "understanding" ? "Entendendo..." : phase === "idle" ? "Falar o lançamento" : "Falar de novo";
  const sub = listening ? "Toque para parar" : busy ? "Só um instante" : phase === "idle"
    ? (method === "record" ? "Ex.: “gastei 50 no almoço”. O áudio é transcrito e não fica guardado." : "Ex.: “gastei 50 no almoço”")
    : "Você confere tudo antes de salvar";

  return (
    <div className="space-y-2">
      <button type="button" onClick={onTap} disabled={busy} aria-label={label} aria-pressed={listening}
        className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors disabled:opacity-80 ${listening ? "border-brand-dark bg-brand-dark/10 dark:border-brand-vivid dark:bg-brand-vivid/10" : "border-brand-dark/30 dark:border-white/15 hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E]"}`}>
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true">
          {listening && (
            <span className={`absolute inset-0 rounded-full bg-brand-dark/25 dark:bg-brand-vivid/30 ${hasLevel ? "" : "motion-safe:animate-ping"}`}
              style={hasLevel ? { transform: `scale(${1 + level * 0.6})`, transition: "transform 90ms linear" } : undefined} />
          )}
          <span className={`relative flex h-11 w-11 items-center justify-center rounded-full text-white ${listening ? "bg-red-500" : "bg-gradient-to-r from-brand-dark to-brand-accent dark:from-brand-vivid dark:to-brand-vivid"}`}>
            {busy ? <LoaderCircle size={20} className="motion-safe:animate-spin" /> : listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">{title}</span>
          <span className="block text-xs text-gray-500">{sub}</span>
        </span>
      </button>

      <div role="status" aria-live="polite" className="space-y-1.5">
        {listening && partial && <p className="text-sm italic text-gray-600 dark:text-gray-300 px-1">“{partial}”</p>}
        {heard && !listening && (phase === "done" || phase === "warn" || phase === "understanding") && (
          <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300 px-1">
            {phase === "done" && <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />}
            <span>Entendi: <span className="font-bold">“{heard}”</span>{phase === "done" && <> Confira os campos destacados e toque em Salvar.</>}</span>
          </p>
        )}
        {message && (
          <p className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${phase === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            <TriangleAlert size={14} className="mt-0.5 shrink-0" /> <span>{message}</span>
          </p>
        )}
      </div>

      {extras.length > 0 && phase !== "listening" && (
        <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] px-3 py-2.5 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300">Também entendi:</p>
          <div className="flex flex-wrap gap-2">
            {extras.map((x, i) => {
              const on = queued.includes(i);
              return (
                <button key={i} type="button" onClick={() => toggleQueue(i)} aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-brand-dark bg-brand-dark text-white dark:border-brand-vivid dark:bg-brand-vivid" : "border-brand-dark/30 text-brand-dark dark:border-white/15 dark:text-brand-soft"}`}>
                  {on && <Check size={12} />}
                  {x.description || "Sem descrição"} {brl(x.amount ?? 0)} · {on ? "abre depois de salvar" : "adicionar depois"}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

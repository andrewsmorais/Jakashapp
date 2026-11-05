"use client";

import { isNativeApp } from "@/lib/native";

// Entrada de voz do "Novo lançamento". Três caminhos, do mais barato ao mais caro:
//  1. "native": reconhecimento de fala da Apple dentro do app iOS (plugin Capacitor; no aparelho quando o iPhone permite). Grátis.
//  2. "web": Web Speech API do navegador (Chrome, Edge, Safari...). Grátis.
//  3. "record": grava até 20 s com MediaRecorder e manda para /api/voice/transcribe (OpenAI). Só quando 1 e 2 não existem (ex.: Firefox). Pago.
// O áudio nunca é guardado: no caminho 3 ele só vai ao servidor para ser transcrito e é descartado.

export type VoiceMethod = "native" | "web" | "record" | "none";

export type VoiceErrorCode =
  | "denied" // permissão negada
  | "no-speech" // não ouviu nada
  | "audio-capture" // sem microfone
  | "network" // sem conexão com o serviço de voz
  | "unsupported"
  | "too-big"
  | "limit" // limite diário da IA
  | "not-allowed-plan" // assinatura não ativa
  | "failed";

export type VoiceEvents = {
  onPartial: (text: string) => void;
  onLevel: (level: number) => void; // 0..1
  onPhase: (phase: "listening" | "sending") => void;
  onFinal: (text: string) => void;
  onError: (code: VoiceErrorCode, message?: string) => void;
};

export type VoiceSession = {
  /** Termina de ouvir e entrega o que entendeu (onFinal). */
  stop: () => void;
  /** Cancela sem entregar nada. */
  cancel: () => void;
};

export const VOICE_LANG = "pt-BR";
export const MAX_LISTEN_MS = 30_000; // reconhecimento ao vivo
export const MAX_RECORD_MS = 20_000; // gravação do caminho pago
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const SILENCE_AFTER_SPEECH_MS = 1800;
const NO_SPEECH_MS = 9000;

// ---------- tipos mínimos da Web Speech API (o TypeScript do projeto não traz) ----------

type SRAlternative = { transcript: string };
type SRResult = { isFinal: boolean; length: number; [i: number]: SRAlternative };
type SREvent = { resultIndex: number; results: { length: number; [i: number]: SRResult } };
type SRErrorEvent = { error: string };
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function webSpeechCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function nativeSpeechAvailable(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isPluginAvailable?: (n: string) => boolean } }).Capacitor;
    return cap?.isPluginAvailable?.("SpeechRecognition") === true;
  } catch {
    return false;
  }
}

/**
 * Qual caminho usar neste aparelho. No app iOS, se a versão instalada ainda não tem o plugin de voz, devolve "none"
 * (não dá para cair no navegador: o app antigo não tem permissão de microfone e o iOS fecharia o app).
 */
export function detectVoiceMethod(): VoiceMethod {
  if (typeof window === "undefined") return "none";
  if (isNativeApp()) return nativeSpeechAvailable() ? "native" : "none";
  if (webSpeechCtor()) return "web";
  if (canRecord()) return "record";
  return "none";
}

const once = <A extends unknown[]>(fn: (...a: A) => void) => {
  let done = false;
  return (...a: A) => { if (done) return; done = true; fn(...a); };
};

// ---------- 1) app iOS ----------

async function startNative(ev: VoiceEvents): Promise<VoiceSession> {
  const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");
  const avail = await SpeechRecognition.available().catch(() => ({ available: false }));
  if (!avail.available) { ev.onError("unsupported"); return { stop() {}, cancel() {} }; }

  let perm = await SpeechRecognition.checkPermissions().catch(() => null);
  if (perm?.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions().catch(() => null);
  if (perm?.speechRecognition !== "granted") { ev.onError("denied"); return { stop() {}, cancel() {} }; }

  // Reconhecimento no próprio iPhone quando o aparelho tem o idioma baixado; senão a Apple usa o serviço dela (também grátis).
  const onDevice = await SpeechRecognition
    .isOnDeviceRecognitionAvailable({ language: VOICE_LANG, preferLegacyRecognizer: true })
    .then((r) => r.available).catch(() => false);

  let last = "";
  let finished = false;
  let cancelled = false;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  const max: { id?: ReturnType<typeof setTimeout> } = {};
  const handles: { remove: () => Promise<void> }[] = [];

  const cleanup = () => {
    clearTimeout(silenceTimer);
    clearTimeout(max.id);
    for (const h of handles) void h.remove().catch(() => {});
    handles.length = 0;
  };
  const deliver = once(() => {
    cleanup();
    if (cancelled) return;
    if (last.trim()) ev.onFinal(last.trim());
    else ev.onError("no-speech");
  });
  const finish = async () => {
    if (finished) return;
    finished = true;
    clearTimeout(silenceTimer);
    try { await SpeechRecognition.stop(); } catch { /* já tinha parado */ }
    if (!last.trim()) {
      const lp = await SpeechRecognition.getLastPartialResult().catch(() => null);
      if (lp?.available && lp.text) last = lp.text;
    }
    // dá um instante para o último resultado chegar
    setTimeout(deliver, 350);
  };
  const armSilence = (ms: number) => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => void finish(), ms);
  };

  handles.push(await SpeechRecognition.addListener("partialResults", (e) => {
    const t = (e.matches?.[0] ?? e.accumulatedText ?? "").trim();
    if (!t) return;
    last = t;
    ev.onPartial(t);
    armSilence(SILENCE_AFTER_SPEECH_MS);
  }));
  handles.push(await SpeechRecognition.addListener("audioLevel", (e) => ev.onLevel(Math.max(0, Math.min(1, e.level)))));
  handles.push(await SpeechRecognition.addListener("listeningState", (e) => {
    if ((e.state === "stopped" || e.status === "stopped") && !finished) { finished = true; clearTimeout(silenceTimer); setTimeout(deliver, 250); }
  }));
  handles.push(await SpeechRecognition.addListener("error", (e) => {
    if (finished && last.trim()) return;
    finished = true;
    cleanup();
    if (cancelled) return;
    const code = String(e.code || "");
    if (/NO_SPEECH|no.?speech/i.test(code)) ev.onError("no-speech");
    else if (/PERMISSION|DENIED/i.test(code)) ev.onError("denied");
    else if (/NETWORK/i.test(code)) ev.onError("network");
    else if (last.trim()) ev.onFinal(last.trim());
    else ev.onError("failed", e.message);
  }));

  try {
    ev.onPhase("listening");
    await SpeechRecognition.start({
      language: VOICE_LANG,
      maxResults: 1,
      partialResults: true,
      addPunctuation: false,
      useOnDeviceRecognition: onDevice,
      preferLegacyRecognizer: true,
    });
  } catch (err) {
    cleanup();
    const msg = err instanceof Error ? err.message : String(err);
    ev.onError(/permission|denied/i.test(msg) ? "denied" : "failed", msg);
    return { stop() {}, cancel() {} };
  }
  armSilence(NO_SPEECH_MS);
  max.id = setTimeout(() => void finish(), MAX_LISTEN_MS);

  return {
    stop: () => void finish(),
    cancel: () => {
      cancelled = true;
      finished = true;
      cleanup();
      void SpeechRecognition.stop().catch(() => {});
    },
  };
}

// ---------- 2) navegador (Web Speech API) ----------

function startWeb(ev: VoiceEvents): VoiceSession {
  const Ctor = webSpeechCtor();
  if (!Ctor) { ev.onError("unsupported"); return { stop() {}, cancel() {} }; }
  const rec = new Ctor();
  rec.lang = VOICE_LANG;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let last = "";
  let cancelled = false;
  let failed = false;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  const maxTimer = setTimeout(() => { try { rec.stop(); } catch { /* ok */ } }, MAX_LISTEN_MS);
  const clear = () => { clearTimeout(silenceTimer); clearTimeout(maxTimer); };
  const arm = (ms: number) => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { try { rec.stop(); } catch { /* ok */ } }, ms);
  };

  rec.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";
    text = text.trim();
    if (!text) return;
    last = text;
    ev.onPartial(text);
    arm(SILENCE_AFTER_SPEECH_MS);
  };
  rec.onerror = (e) => {
    failed = true;
    clear();
    if (cancelled) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") ev.onError("denied");
    else if (e.error === "no-speech") ev.onError("no-speech");
    else if (e.error === "audio-capture") ev.onError("audio-capture");
    else if (e.error === "network") ev.onError("network");
    else if (e.error === "aborted") { /* cancelado por nós */ }
    else ev.onError("failed", e.error);
  };
  rec.onend = () => {
    clear();
    if (cancelled || failed) return;
    if (last.trim()) ev.onFinal(last.trim());
    else ev.onError("no-speech");
  };

  try {
    rec.start();
    ev.onPhase("listening");
    arm(NO_SPEECH_MS);
  } catch (err) {
    clear();
    ev.onError("failed", err instanceof Error ? err.message : undefined);
  }
  return {
    stop: () => { try { rec.stop(); } catch { /* ok */ } },
    cancel: () => { cancelled = true; clear(); try { rec.abort(); } catch { /* ok */ } },
  };
}

// ---------- 3) gravação + /api/voice/transcribe (pago) ----------

function pickMime(): string {
  const list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* tenta o próximo */ }
  }
  return "";
}

async function startRecord(ev: VoiceEvents): Promise<VoiceSession> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    ev.onError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "audio-capture" : "failed");
    return { stop() {}, cancel() {} };
  }

  const mime = pickMime();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24_000 });
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    ev.onError("unsupported");
    return { stop() {}, cancel() {} };
  }

  const chunks: Blob[] = [];
  let cancelled = false;
  let analyser: AnalyserNode | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  let spoke = false;
  let quietSince = 0;
  const startedAt = Date.now();

  const stopAll = () => {
    cancelAnimationFrame(raf);
    clearTimeout(maxTimer);
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => {});
  };
  const maxTimer = setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch { /* ok */ } }, MAX_RECORD_MS);

  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
        const level = Math.min(1, peak / 64);
        ev.onLevel(level);
        const now = Date.now();
        if (level > 0.12) { spoke = true; quietSince = 0; }
        else if (spoke) {
          if (!quietSince) quietSince = now;
          else if (now - quietSince > SILENCE_AFTER_SPEECH_MS && rec.state === "recording") { try { rec.stop(); } catch { /* ok */ } return; }
        } else if (now - startedAt > NO_SPEECH_MS && rec.state === "recording") { try { rec.stop(); } catch { /* ok */ } return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
  } catch { /* sem medidor de nível: segue só com o tempo máximo */ }

  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  rec.onerror = () => { stopAll(); if (!cancelled) ev.onError("failed"); };
  rec.onstop = async () => {
    stopAll();
    if (cancelled) return;
    const type = rec.mimeType || mime || "audio/webm";
    const blob = new Blob(chunks, { type });
    if (!spoke && blob.size < 2000) { ev.onError("no-speech"); return; }
    if (blob.size > MAX_AUDIO_BYTES) { ev.onError("too-big"); return; }
    ev.onPhase("sending");
    try {
      const fd = new FormData();
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, `voz.${ext}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (cancelled) return;
      if (res.status === 402 || res.status === 403) { ev.onError("not-allowed-plan", data.error); return; }
      if (res.status === 429) { ev.onError("limit", data.error); return; }
      if (res.status === 413) { ev.onError("too-big", data.error); return; }
      if (!res.ok) { ev.onError("failed", data.error); return; }
      const text = (data.text ?? "").trim();
      if (!text) ev.onError("no-speech");
      else ev.onFinal(text);
    } catch {
      if (!cancelled) ev.onError("network");
    }
  };

  rec.start(250);
  ev.onPhase("listening");
  return {
    stop: () => { try { if (rec.state !== "inactive") rec.stop(); } catch { /* ok */ } },
    cancel: () => { cancelled = true; stopAll(); try { if (rec.state !== "inactive") rec.stop(); } catch { /* ok */ } },
  };
}

/** Começa a ouvir. Chame direto do toque no microfone (os navegadores exigem um gesto da pessoa). */
export async function startVoice(method: VoiceMethod, ev: VoiceEvents): Promise<VoiceSession> {
  try {
    if (method === "native") return await startNative(ev);
    if (method === "web") return startWeb(ev);
    if (method === "record") return await startRecord(ev);
  } catch (err) {
    ev.onError("failed", err instanceof Error ? err.message : undefined);
    return { stop() {}, cancel() {} };
  }
  ev.onError("unsupported");
  return { stop() {}, cancel() {} };
}

/** Texto curto, em português, para cada erro (a tela mostra isto). */
export function voiceErrorText(code: VoiceErrorCode, native: boolean): string {
  switch (code) {
    case "denied":
      return native
        ? "O Jakash não tem acesso ao microfone ou à fala. Abra Ajustes do iPhone, toque em Jakash e ative Microfone e Reconhecimento de Fala."
        : "O navegador bloqueou o microfone. Toque no cadeado ao lado do endereço do site, permita o microfone e tente de novo.";
    case "no-speech": return "Não ouvi nada. Toque no microfone e fale perto do aparelho.";
    case "audio-capture": return "Não encontrei um microfone neste aparelho.";
    case "network": return "Sem conexão com o serviço de voz. Verifique a internet ou digite o lançamento.";
    case "unsupported": return "Este aparelho não consegue ouvir sua voz aqui. Digite o lançamento.";
    case "too-big": return "O áudio ficou grande demais. Fale uma frase curta.";
    case "limit": return "Você usou o limite diário de voz e IA. Amanhã tem mais, ou digite o lançamento.";
    case "not-allowed-plan": return "A voz neste navegador faz parte da assinatura ativa. Use o Chrome, o Edge ou o Safari, ou digite o lançamento.";
    default: return "Não consegui ouvir agora. Tente de novo ou digite o lançamento.";
  }
}

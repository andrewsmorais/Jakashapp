import { safeNext } from "@/lib/authUtil";

// Detecção do app nativo (casca Capacitor do iOS). O site continua igual no navegador:
// nada aqui roda fora do app, e os plugins nativos só são carregados (import dinâmico) quando isNativeApp() é true.

/** O app acrescenta "JakashApp/<versão> (iOS)" ao User-Agent (capacitor.config.ts: appendUserAgent). */
export const NATIVE_UA_MARK = "JakashApp/";

/** Domínio fixo do site (o app sempre carrega o site de produção). */
export const NATIVE_SITE = "https://www.jakash.app";

/** Esquema de URL registrado no Info.plist do app (volta do login com Google). */
export const NATIVE_SCHEME = "jakash";

/** Servidor e middleware: reconhece o app pelo User-Agent. */
export function isNativeUserAgent(ua: string | null | undefined): boolean {
  return typeof ua === "string" && ua.includes(NATIVE_UA_MARK);
}

type CapacitorGlobal = { isNativePlatform?: () => boolean };

/** Navegador: true só dentro do app. No servidor (SSR) é sempre false; use useIsNative() em componentes. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (cap?.isNativePlatform?.() === true) return true;
    return isNativeUserAgent(window.navigator.userAgent);
  } catch {
    return false;
  }
}

/** Compra dentro do app (Apple IAP) liberada? Só vale com NEXT_PUBLIC_IOS_IAP=1 (lido no build/na Vercel). */
export const IOS_IAP_ENABLED = process.env.NEXT_PUBLIC_IOS_IAP === "1";

/** Código de troca do Supabase (PKCE) e `next` são os únicos dados que passam pelo link de volta ao app. */
const CODE_RE = /^[A-Za-z0-9._~-]{8,600}$/;

/** Monta o link jakash://auth/callback que a página /auth/native abre. Devolve null se o código não parece válido. */
export function buildNativeDeepLink(code: string | null | undefined, next: string | null | undefined): string | null {
  if (!code || !CODE_RE.test(code)) return null;
  const q = new URLSearchParams({ code, next: safeNext(next) });
  return `${NATIVE_SCHEME}://auth/callback?${q.toString()}`;
}

/**
 * Lê o link que o app recebeu (evento appUrlOpen) e devolve a URL do site que conclui o login.
 * Só aceita jakash://auth/callback com código válido; o destino passa pelo safeNext.
 */
export function parseNativeCallback(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== `${NATIVE_SCHEME}:`) return null;
  if (u.hostname !== "auth" || u.pathname.replace(/\/+$/, "") !== "/callback") return null;
  const code = u.searchParams.get("code");
  if (!code || !CODE_RE.test(code)) return null;
  const q = new URLSearchParams({ code, next: safeNext(u.searchParams.get("next")) });
  return `${NATIVE_SITE}/auth/callback?${q.toString()}`;
}

/** Só caminhos do próprio site (ex.: "/contas"); usado ao abrir o app por uma notificação. */
export function samePathOnly(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 500) return null;
  const clean = safeNext(url, "");
  return clean || null;
}

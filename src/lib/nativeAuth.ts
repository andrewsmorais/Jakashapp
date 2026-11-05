"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NATIVE_SITE } from "@/lib/native";
import { safeNext } from "@/lib/authUtil";

// Login social dentro do app iOS. O Google bloqueia OAuth dentro do WKWebView, e a Apple pede o login nativo.
// Os plugins nativos são carregados só quando estas funções rodam (import dinâmico), então o site comum não muda.

const CLIENT_ID = "com.jakash.app"; // o iOS ignora clientId/redirectURI, mas o tipo do plugin exige

export type NativeAuthResult = { ok: true } | { ok: false; cancelled?: boolean; message?: string };

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// A Apple devolve este erro quando a pessoa fecha a janela (código 1001 / "canceled").
const wasCancelled = (e: unknown) => /1001|cancel/i.test(String((e as { message?: string })?.message ?? e));

/** Entrar com a Apple de forma nativa: o token vai ao Supabase (nonce cru para o Supabase, SHA-256 para a Apple). */
export async function signInWithAppleNative(supabase: SupabaseClient): Promise<NativeAuthResult> {
  try {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const rawNonce = randomHex(16);
    const hashedNonce = await sha256Hex(rawNonce);
    const res = await SignInWithApple.authorize({
      clientId: CLIENT_ID,
      redirectURI: `${NATIVE_SITE}/auth/callback`,
      scopes: "email name",
      nonce: hashedNonce,
    });
    const r = res.response;
    if (!r?.identityToken) return { ok: false, message: "A Apple não devolveu o acesso. Tente de novo." };
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: r.identityToken, nonce: rawNonce });
    if (error) return { ok: false, message: error.message };
    // A Apple só manda o nome na primeira vez: guarda no perfil (melhor esforço).
    const name = [r.givenName, r.familyName].filter(Boolean).join(" ").trim();
    if (name && data.user) {
      await supabase.from("profiles").update({ full_name: name }).eq("id", data.user.id).then(() => undefined, () => undefined);
    }
    return { ok: true };
  } catch (e) {
    if (wasCancelled(e)) return { ok: false, cancelled: true };
    return { ok: false, message: "Não foi possível entrar com a Apple." };
  }
}

/**
 * Entrar com o Google: abre o navegador do sistema; ao final a página /auth/native devolve o código pelo link jakash://
 * e o NativeBridge conclui o login no WebView (onde está o verificador PKCE).
 */
export async function signInWithGoogleNative(supabase: SupabaseClient, next: string): Promise<NativeAuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${NATIVE_SITE}/auth/native?next=${encodeURIComponent(safeNext(next))}`, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { ok: false, message: error?.message };
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url });
    return { ok: true };
  } catch {
    return { ok: false, message: "Não foi possível abrir o login do Google." };
  }
}

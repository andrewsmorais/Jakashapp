// "Reduzir transparência" (sem efeito vidro). Três escolhas, guardadas no aparelho (é ajuste de acessibilidade):
//   "auto" (padrão): segue o aparelho. No app do iPhone, quem lê o ajuste de Acessibilidade é o código nativo
//          (ios/App/App/AppDelegate.swift, MainViewController), que avisa a página; no Chrome, o @media do CSS.
//   "on":  sempre sem vidro.   "off": sempre com vidro.
// O efeito é o atributo data-solid no <html>, que o globals.css usa para deixar barras, botões e cartões sólidos.
export type SolidMode = "auto" | "on" | "off";
const KEY = "jakash-solid";

declare global { interface Window { __JAKASH_OS_REDUCE_TRANSPARENCY?: boolean } }

export function storedSolid(): SolidMode {
  try { const v = localStorage.getItem(KEY); return v === "1" ? "on" : v === "0" ? "off" : "auto"; } catch { return "auto"; }
}

/** O aparelho pediu menos transparência? */
export function osReducesTransparency(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__JAKASH_OS_REDUCE_TRANSPARENCY === true) return true;
  try { return window.matchMedia("(prefers-reduced-transparency: reduce)").matches; } catch { return false; }
}

export function applySolid(mode: SolidMode = storedSolid()) {
  const on = mode === "on" || (mode === "auto" && osReducesTransparency());
  if (on) document.documentElement.dataset.solid = "1"; else delete document.documentElement.dataset.solid;
}

export function setSolid(mode: SolidMode) {
  try { if (mode === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode === "on" ? "1" : "0"); } catch { /* sem armazenamento */ }
  applySolid(mode);
}

/** Reaplica quando o iPhone avisa que o ajuste mudou (evento disparado pelo código nativo). */
export function watchSolid(): () => void {
  const h = () => applySolid();
  window.addEventListener("jakash:os-transparency", h);
  return () => window.removeEventListener("jakash:os-transparency", h);
}

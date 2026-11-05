// Cor de destaque do app. Fica no perfil (profiles.accent) para valer em todos os aparelhos e
// também no localStorage, para a tela já abrir com a cor certa antes do perfil carregar.

export const ACCENT_IDS = ["violet", "blue", "green", "rose", "orange", "cyan", "red", "slate"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

const STORAGE_KEY = "jakash-accent";

export const isAccent = (v: unknown): v is AccentId => typeof v === "string" && (ACCENT_IDS as readonly string[]).includes(v);

export function storedAccent(): AccentId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isAccent(v) ? v : null;
  } catch {
    return null; // sem storage (modo privado, bloqueado...)
  }
}

export function applyAccent(id: AccentId) {
  document.documentElement.dataset.accent = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* sem storage */ }
  window.dispatchEvent(new Event("jakash:accent")); // telas abertas (ex.: Aparência) atualizam a seleção
}

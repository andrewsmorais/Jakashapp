"use client";

// Bloqueio com Face ID (opcional, desligado por padrão). A preferência fica só neste aparelho.
// Usa @aparajita/capacitor-biometric-auth (import dinâmico). Se o aparelho não tem Face ID, cai para o código do iPhone.

const KEY = "jakash:biolock";
export const BIOLOCK_AFTER_MS = 5 * 60 * 1000; // volta do segundo plano depois de 5 min = pede de novo

export function getBioLockEnabled(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setBioLockEnabled(on: boolean) {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* sem armazenamento: a preferência não persiste */ }
}

/** O aparelho tem Face ID/Touch ID ou ao menos um código de acesso? Sem nenhum dos dois não dá para bloquear. */
export async function canLockDevice(): Promise<boolean> {
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const r = await BiometricAuth.checkBiometry();
    return r.isAvailable || r.deviceIsSecure;
  } catch {
    return false;
  }
}

/** Pede Face ID (ou o código do iPhone). true = liberado. */
export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({ reason: "Abrir o Jakash", cancelTitle: "Cancelar", allowDeviceCredential: true, iosFallbackTitle: "Usar o código" });
    return true;
  } catch {
    return false;
  }
}

"use client";

import { isNativeApp } from "@/lib/native";

// Exportação de arquivos (CSV). No navegador baixa o arquivo; no app iOS (WKWebView não baixa blob) grava em cache
// com @capacitor/filesystem e abre a folha de compartilhar (@capacitor/share: Arquivos, AirDrop, WhatsApp...).

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "arquivo.csv";

function downloadInBrowser(filename: string, content: string | Uint8Array, mime: string) {
  // Uint8Array -> Blob: copia para um ArrayBuffer comum (o tipo do BlobPart não aceita buffers compartilhados).
  const part: BlobPart = typeof content === "string" ? content : new Uint8Array(content);
  const url = URL.createObjectURL(new Blob([part], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bytes -> base64 (em pedaços, para não estourar a pilha com arquivos grandes). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/**
 * true = o arquivo foi entregue (baixado ou a folha de compartilhar abriu). false = a pessoa cancelou ou falhou.
 * Texto vai em UTF-8; binário (ex.: .zip) vai em base64 pelo Filesystem.
 */
export async function saveOrShareFile(filename: string, content: string | Uint8Array, mime: string): Promise<boolean> {
  if (!isNativeApp()) { downloadInBrowser(filename, content, mime); return true; }
  try {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const name = safeName(filename);
    const { uri } = await Filesystem.writeFile(
      typeof content === "string"
        ? { path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 }
        : { path: name, data: bytesToBase64(content), directory: Directory.Cache }, // sem encoding = dados em base64
    );
    await Share.share({ title: name, url: uri, dialogTitle: "Salvar ou enviar o arquivo" });
    return true;
  } catch {
    return false;
  }
}

/** true = o arquivo foi entregue (baixado ou a folha de compartilhar abriu). false = a pessoa cancelou ou falhou. */
export function saveOrShareText(filename: string, content: string, mime = "text/csv;charset=utf-8"): Promise<boolean> {
  return saveOrShareFile(filename, content, mime);
}

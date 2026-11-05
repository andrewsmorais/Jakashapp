// Comprovantes (PDF/foto) anexados aos lançamentos. Ficam no bucket privado "receipts", dentro da pasta do próprio usuário.
import type { SupabaseClient } from "@supabase/supabase-js";
import { shrinkImage } from "@/lib/fileImport";

export const RECEIPT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf";
export const RECEIPT_MAX = 4 * 1024 * 1024;
const BUCKET = "receipts";

export type Receipt = { path: string; name: string };

const extOf = (f: File) => {
  if (f.type === "application/pdf") return "pdf";
  if (f.type === "image/png") return "png";
  if (f.type === "image/webp") return "webp";
  return "jpg";
};

/** Envia o arquivo para a pasta da pessoa. Foto grande é reduzida antes (e HEIC vira JPEG quando o navegador sabe abrir). */
export async function uploadReceipt(supabase: SupabaseClient, userId: string, file: File): Promise<Receipt> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImg = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isPdf && !isImg) throw new Error("Anexe um PDF ou uma foto (JPG, PNG).");
  const send = isImg ? await shrinkImage(file) : file;
  if (send.size > RECEIPT_MAX) throw new Error("O comprovante passa de 4 MB. Use um arquivo menor.");
  const path = `${userId}/${crypto.randomUUID()}.${extOf(send)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, send, { contentType: send.type || (isPdf ? "application/pdf" : "image/jpeg"), upsert: false });
  if (error) throw new Error("Não foi possível enviar o comprovante.");
  return { path, name: file.name.slice(0, 80) };
}

/** Abre o comprovante por um link que vale 2 minutos. */
export async function openReceipt(supabase: SupabaseClient, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return true;
}

/** Apaga do armazenamento os arquivos que nenhum lançamento usa mais. */
export async function removeOrphanReceipts(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<void> {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  if (!unique.length) return;
  const { data } = await supabase.from("transactions").select("attachment_path").in("attachment_path", unique);
  const used = new Set((data ?? []).map((r: { attachment_path: string | null }) => r.attachment_path));
  const gone = unique.filter((p) => !used.has(p));
  if (gone.length) await supabase.storage.from(BUCKET).remove(gone);
}

/** Apaga todos os comprovantes da pessoa (usado em "recomeçar do zero"). */
export async function removeAllReceipts(supabase: SupabaseClient, userId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
    if (!data?.length) return;
    await supabase.storage.from(BUCKET).remove(data.map((o) => `${userId}/${o.name}`));
  }
}

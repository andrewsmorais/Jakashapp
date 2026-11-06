// Foto de perfil: fica no bucket privado "receipts", na pasta do usuário, e é mostrada por link temporário.
import type { SupabaseClient } from "@supabase/supabase-js";
import { shrinkImage } from "@/lib/fileImport";

const BUCKET = "receipts";
const MAX = 4 * 1024 * 1024;

/** Envia a foto (reduzida antes), grava em profiles.avatar_path e apaga a foto antiga. Devolve o novo caminho. */
export async function uploadAvatar(supabase: SupabaseClient, userId: string, file: File, oldPath: string | null): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("Escolha uma foto (JPG ou PNG).");
  const img = await shrinkImage(file);
  if (img.size > MAX) throw new Error("A foto passa de 4 MB. Escolha outra.");
  const ext = img.type === "image/png" ? "png" : img.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, img, { contentType: img.type || "image/jpeg", upsert: false });
  if (up.error) throw new Error("Não foi possível enviar a foto.");
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId).select("id").single();
  if (error) { await supabase.storage.from(BUCKET).remove([path]); throw new Error("Não foi possível salvar a foto."); }
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  return path;
}

/** Tira a foto do perfil (volta às iniciais). */
export async function removeAvatar(supabase: SupabaseClient, userId: string, oldPath: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", userId).select("id").single();
  if (error) throw new Error("Não foi possível tirar a foto.");
  await supabase.storage.from(BUCKET).remove([oldPath]);
}

/** Link temporário (1 hora) para mostrar a foto. */
export async function avatarUrl(supabase: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

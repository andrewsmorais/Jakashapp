// Imagem do selo de conta/cartão: recortada em quadrado e reduzida no próprio aparelho (nada vai para serviço externo).

export const LOGO_PX = 96;
export const LOGO_MAX_CHARS = 60000; // mesmo limite da coluna no banco
export const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const isValidLogo = (v: unknown): v is string => typeof v === "string" && v.length <= LOGO_MAX_CHARS && LOGO_RE.test(v);

export async function imageToLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Imagem muito grande (máximo 10 MB).");
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("Não consegui abrir esta imagem. Tente PNG ou JPG."); }
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_PX; canvas.height = LOGO_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui preparar a imagem.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, LOGO_PX, LOGO_PX);
  for (const [type, q] of [["image/webp", 0.85], ["image/png", undefined], ["image/jpeg", 0.8]] as const) {
    const url = canvas.toDataURL(type, q);
    if (isValidLogo(url)) return url;
  }
  throw new Error("Não consegui reduzir esta imagem. Tente outra.");
}

type Db = { from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown; error: unknown }> } };

/** Imagens dos selos (id da conta/cartão -> imagem). Consulta separada: se a coluna ainda não existir, nada quebra. */
export async function loadLogos(supabase: unknown): Promise<Record<string, string>> {
  const db = supabase as Db;
  const [a, c] = await Promise.all([db.from("accounts").select("id,logo"), db.from("credit_cards").select("id,logo")]);
  const out: Record<string, string> = {};
  for (const r of [a, c]) {
    if (r.error) continue;
    for (const x of (r.data ?? []) as { id: string; logo: string | null }[]) if (isValidLogo(x.logo)) out[x.id] = x.logo;
  }
  return out;
}

// Leitura de arquivos enviados pela pessoa: OFX/CSV/TXT (no aparelho), planilha XLSX/XLS em HTML (no aparelho) e PDF/foto (IA, no servidor).
import { parseGrid, parseStatement, type ParsedRow, type ParseResult } from "@/lib/importer";

export const ACCEPT = ".ofx,.qfx,.csv,.txt,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,text/csv,application/x-ofx,application/pdf,image/*";
export const MAX_BYTES = 4 * 1024 * 1024;

const ext = (f: File) => (f.name.split(".").pop() ?? "").toLowerCase();
export const isImage = (f: File) => f.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext(f));
export const isPdf = (f: File) => f.type === "application/pdf" || ext(f) === "pdf";
export const isSheet = (f: File) => ext(f) === "xlsx" || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const usesAI = (f: File) => isImage(f) || isPdf(f);

/** .xls de verdade (formato binário do Excel 97-2003). Muitos bancos mandam ".xls" que na verdade é HTML ou texto, e esses a gente lê. */
export function isBinaryXls(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 4));
  return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Planilha .xlsx -> mesmo caminho do CSV (cabeçalho com data, descrição e valor). */
export async function parseSpreadsheet(file: File): Promise<ParseResult> {
  const { readSheet } = await import("read-excel-file/browser");
  let data: unknown[][];
  try { data = (await readSheet(file)) as unknown[][]; } catch { throw new Error("Não consegui abrir esta planilha. Salve como .xlsx ou CSV e tente de novo."); }
  const cell = (v: unknown): string => {
    if (v == null) return "";
    if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    if (typeof v === "number") return String(v).replace(".", ",");
    return String(v).replace(/[\r\n]+/g, " ").trim();
  };
  const res = parseGrid(data.slice(0, 5000).map((row) => row.map(cell)));
  if (!res.rows.length) throw new Error("Não encontrei lançamentos nesta planilha. Use colunas com data, descrição e valor na primeira aba.");
  return { ...res, format: "xlsx" };
}

/** Foto grande -> JPEG de até 1800 px (menor para enviar, e converte HEIC quando o navegador sabe abrir). */
export async function shrinkImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { /* usa o original */ }
  return file;
}

/** PDF ou foto -> lançamentos lidos pela IA (a pessoa confere na prévia antes de salvar). */
export async function parseWithAI(file: File): Promise<ParseResult> {
  const send = isImage(file) ? await shrinkImage(file) : file;
  if (send.size > MAX_BYTES) throw new Error("Arquivo muito grande (máximo 4 MB). Tente uma foto menor ou um PDF mais leve.");
  const fd = new FormData();
  fd.append("file", send);
  const res = await fetch("/api/import/extract", { method: "POST", body: fd });
  const body = (await res.json().catch(() => ({}))) as { error?: string; document?: string; transactions?: { date: string; description: string; amount: number; type: "income" | "expense" }[] };
  if (!res.ok) throw new Error(body.error ?? "Não consegui ler este arquivo.");
  const rows: ParsedRow[] = (body.transactions ?? []).map((t) => ({ date: t.date, description: t.description, amount: t.type === "income" ? t.amount : -t.amount }));
  if (!rows.length) throw new Error("Não encontrei lançamentos neste arquivo. Confira se a imagem está nítida e mostra os valores.");
  return { format: "ai", kind: body.document === "fatura" ? "card" : undefined, document: body.document, rows, skipped: 0 };
}

export async function readAnyFile(file: File): Promise<ParseResult> {
  if (usesAI(file)) return parseWithAI(file);
  if (file.size > MAX_BYTES * 2) throw new Error("Arquivo muito grande (máximo 8 MB).");
  if (isSheet(file)) return parseSpreadsheet(file);
  const buf = await file.arrayBuffer();
  if (ext(file) === "xls" && isBinaryXls(buf)) throw new Error("Esta planilha .xls é do formato antigo do Excel. Abra e salve como .xlsx ou CSV e envie de novo.");
  return parseStatement(buf);
}

// Arquivo escolhido na janela "Novo lançamento": fica guardado aqui até a tela de importação abrir.
let pending: File | null = null;
export const stashFile = (f: File) => { pending = f; };
export const takeFile = (): File | null => { const f = pending; pending = null; return f; };

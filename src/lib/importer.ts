// Importação de extrato/fatura: OFX e CSV são lidos no próprio navegador (custo zero, nada vai para serviço pago).
// O app aprende a categoria de cada estabelecimento com o histórico do usuário e, na falta dele, usa um dicionário padrão.
import type { CatRow } from "@/lib/categories";

export type ParsedRow = {
  date: string; // AAAA-MM-DD
  amount: number; // com o sinal do arquivo
  description: string;
  fitid?: string;
  acct?: string;
};

export type ParseResult = {
  format: "ofx" | "csv" | "xlsx" | "xls" | "ai";
  kind?: "bank" | "card"; // OFX, layout conhecido (ex.: fatura Nubank) ou documento lido pela IA
  source?: FileSource; // banco/layout reconhecido pelo cabeçalho
  rows: ParsedRow[];
  document?: string; // só PDF/foto lidos por IA: extrato, fatura, nota, comprovante...
  skipped: number; // linhas sem data/valor (cabeçalhos, saldos, totais)
};

// ---------- texto, datas e valores ----------

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** minúsculas, sem acento, só letras e números separados por espaço */
export const lightNorm = (s: string): string => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 2026-10-03 | 03/10/2026 | 03/10/26 | 03-10-2026 | 03.10.2026 -> AAAA-MM-DD (null se não for data) */
export function parseDateAny(input: string): string | null {
  const s = (input ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:\s.*)?$/.exec(s);
  if (m) return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

/** "R$ 1.234,56" | "(50,00)" | "100,00D" | "-12.50" | "12,5" -> número (NaN se inválido) */
export function parseAmountBR(input: string): number {
  let s = (input ?? "").toString().trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/r\$/gi, "").replace(/[\s ]/g, "").replace(/−/g, "-");
  const tail = /([dc])$/i.exec(s);
  if (tail) { if (tail[1].toLowerCase() === "d") neg = true; s = s.slice(0, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (s.charAt(0) === "+") s = s.slice(1);
  if (s.charAt(0) === "-") { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return NaN;
  const lastC = s.lastIndexOf(",");
  const lastD = s.lastIndexOf(".");
  let norm: string;
  if (lastC >= 0 && lastD >= 0) norm = lastC > lastD ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastC >= 0) norm = s.replace(/,/g, (_m, off: number) => (off === lastC ? "." : ""));
  else if (lastD >= 0) norm = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  else norm = s;
  const n = Number(norm);
  if (!Number.isFinite(n)) return NaN;
  const r = Math.round(n * 100) / 100;
  return neg ? -r : r;
}

// ---------- OFX ----------

const decodeEntities = (s: string) =>
  s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'");

function tagValue(block: string, tag: string): string {
  const m = new RegExp("<" + tag + ">\\s*([^<\\r\\n]*)", "i").exec(block);
  return m ? decodeEntities(m[1].trim()) : "";
}

export function parseOFX(text: string): ParseResult {
  const acct = tagValue(text, "ACCTID");
  const kind: "bank" | "card" = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text) ? "card" : "bank";
  const rows: ParsedRow[] = [];
  let skipped = 0;
  text.split(/<STMTTRN>/i).slice(1).forEach((raw) => {
    const block = raw.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<LEDGERBAL>|<AVAILBAL>/i)[0];
    const dm = /^(\d{4})(\d{2})(\d{2})/.exec(tagValue(block, "DTPOSTED"));
    const date = dm ? isoDate(+dm[1], +dm[2], +dm[3]) : null;
    const amount = parseAmountBR(tagValue(block, "TRNAMT"));
    if (!date || !Number.isFinite(amount) || amount === 0) { skipped++; return; }
    const name = tagValue(block, "NAME");
    const memo = tagValue(block, "MEMO");
    let description = memo || name;
    if (memo && name) {
      const a = lightNorm(memo), b = lightNorm(name);
      description = a.indexOf(b) >= 0 ? memo : b.indexOf(a) >= 0 ? name : `${name} - ${memo}`;
    }
    rows.push({ date, amount, description: description || "Sem descrição", fitid: tagValue(block, "FITID") || undefined, acct: acct || undefined });
  });
  return { format: "ofx", kind, rows, skipped };
}

// ---------- CSV ----------

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  const cands = [";", "\t", ",", "|"];
  const score = cands.map(() => 0);
  lines.forEach((line) => {
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line.charAt(i);
      if (c === '"') q = !q;
      else if (!q) { const k = cands.indexOf(c); if (k >= 0) score[k]++; }
    }
  });
  let best = 0;
  for (let k = 1; k < cands.length; k++) if (score[k] > score[best]) best = k;
  return score[best] > 0 ? cands[best] : ";";
}

export function splitCSV(text: string, delim: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const endRow = () => {
    row.push(cur);
    cur = "";
    if (row.some((x) => x.trim() !== "")) out.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (q) {
      if (c === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text.charAt(i + 1) === "\n") i++; endRow(); }
    else cur += c;
  }
  endRow();
  return out.map((r) => r.map((x) => x.trim()));
}

type Cols = { date: number; desc: number[]; amount: number; debit: number; credit: number; kind: number; id: number; parcel: number };

// Colunas que não descrevem o lançamento (dados do portador do cartão), mesmo tendo "nome" no título.
const NOT_DESC = /nome no cartao|nome do cartao|final do cartao|portador|titular|^cartao$|numero do cartao/;
// Valor em moeda estrangeira ou cotação: só serve se não houver coluna em reais.
const FOREIGN = /(^|\s)(us|usd|dolar|dolares|eur|euro|moeda estrangeira|cotacao)(\s|$)/;

function mapHeader(cells: string[]): Cols | null {
  const h = cells.map(lightNorm);
  const first = (re: RegExp, skip: number[] = []) => {
    for (let i = 0; i < h.length; i++) if (skip.indexOf(i) < 0 && re.test(h[i])) return i;
    return -1;
  };
  const date = first(/(^|\s)(data|date|dt)(\s|$)/);
  if (date < 0) return null;
  const debit = first(/debito|saida|debit/);
  const credit = first(/credito|entrada|credit/);
  // coluna única "Débito/Crédito" = indicador de tipo, não duas colunas de valor
  const kind = debit >= 0 && debit === credit ? debit : first(/^(tipo|natureza|d c|dc)$|^tipo (de )?(lancamento|transacao|movimentacao)/, [date]);
  const twoCols = debit >= 0 && credit >= 0 && debit !== credit;
  // Várias colunas de valor (ex.: C6 "Valor (em US$)" e "Valor (em R$)"): prefere a em reais.
  const AMT = /(^|\s)(valor|amount|quantia|montante)(\s|$)/;
  let amount = -1;
  if (!twoCols) {
    const cand = h.map((x, i) => i).filter((i) => i !== date && i !== kind && AMT.test(h[i]));
    amount = cand.find((i) => /(^|\s)(r|brl|reais)(\s|$)/.test(h[i])) ?? cand.find((i) => !FOREIGN.test(h[i])) ?? cand[0] ?? -1;
  }
  if (amount < 0 && !twoCols) return null;
  const id = first(/^(identificador|id|fitid)$/);
  const parcel = first(/^(parcela|parcelas|parcelamento|n parcela)$/);
  const skipDesc = [date, amount, debit, credit, kind, id, parcel];
  const desc: number[] = [];
  h.forEach((x, i) => {
    if (skipDesc.indexOf(i) >= 0) return;
    if (/saldo|categoria|category|^valor|^data|cotacao/.test(x) || NOT_DESC.test(x)) return;
    if (/descri|historico|estabelecimento|titulo|title|memo|detalhe|lancamento|nome|beneficiario|favorecido|transaction type|tipo de transacao/.test(x)) desc.push(i);
  });
  return { date, desc, amount, debit: twoCols ? debit : -1, credit: twoCols ? credit : -1, kind, id, parcel };
}

// ---------- origem do arquivo (banco e tipo), pelo cabeçalho ----------

export type FileSource = { institution?: string; kind?: "bank" | "card"; label: string };

/** Reconhece layouts conhecidos de exportação. Só dica: a pessoa confere o destino e o sinal na prévia. */
export function detectSource(header: string[]): FileSource | undefined {
  const h = header.map(lightNorm).filter(Boolean).join("|");
  if (h === "date|title|amount") return { institution: "nubank", kind: "card", label: "Fatura do cartão Nubank" };
  if (/^data\|valor\|identificador\|descricao$/.test(h)) return { institution: "nubank", kind: "bank", label: "Extrato da conta Nubank" };
  if (/nome no cartao/.test(h) && /final do cartao/.test(h)) return { institution: "c6", kind: "card", label: "Fatura do cartão C6 Bank" };
  if (/release date/.test(h) && /transaction net amount/.test(h)) return { institution: "mercadopago", kind: "bank", label: "Extrato do Mercado Pago" };
  if (/(^|\|)(parcela|parcelas)(\||$)|final do cartao|nome no cartao/.test(h)) return { kind: "card", label: "Fatura de cartão" };
  return undefined;
}

// Sem cabeçalho reconhecível: descobre as colunas pelo conteúdo das primeiras linhas.
function guessCols(rows: string[][]): Cols | null {
  const sample = rows.slice(0, 8);
  const width = Math.max.apply(null, sample.map((r) => r.length).concat([0]));
  const frac = (i: number, f: (v: string) => boolean) => sample.filter((r) => f(r[i] ?? "")).length / Math.max(sample.length, 1);
  let date = -1;
  for (let i = 0; i < width && date < 0; i++) if (frac(i, (v) => parseDateAny(v) !== null) >= 0.6) date = i;
  if (date < 0) return null;
  let amount = -1;
  for (let i = 0; i < width && amount < 0; i++) {
    if (i !== date && frac(i, (v) => /\d/.test(v) && Number.isFinite(parseAmountBR(v))) >= 0.6) amount = i;
  }
  if (amount < 0) return null;
  let desc = -1, best = 0;
  for (let i = 0; i < width; i++) {
    if (i === date || i === amount) continue;
    const avg = sample.reduce((n, r) => n + (r[i] ?? "").length, 0) / Math.max(sample.length, 1);
    if (avg > best && frac(i, (v) => !Number.isFinite(parseAmountBR(v))) >= 0.6) { best = avg; desc = i; }
  }
  return { date, desc: desc >= 0 ? [desc] : [], amount, debit: -1, credit: -1, kind: -1, id: -1, parcel: -1 };
}

/** "2/6", "02 de 06", "Parcela 2/6" -> " (2/6)"; "Única", "À vista" ou vazio -> "" */
function parcelSuffix(v: string): string {
  const m = /(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i.exec(v ?? "");
  return m && +m[2] >= 2 ? ` (${+m[1]}/${+m[2]})` : "";
}

export function parseCSV(text: string): ParseResult {
  return { ...parseGrid(splitCSV(text, detectDelimiter(text))), format: "csv" };
}

/** Tabela já separada em linhas e colunas (CSV, planilha .xlsx ou tabela HTML salva como .xls). */
export function parseGrid(grid: string[][]): ParseResult {
  let cols: Cols | null = null;
  let start = 0;
  let source: FileSource | undefined;
  for (let i = 0; i < Math.min(grid.length, 25) && !cols; i++) {
    const c = mapHeader(grid[i]);
    if (c) { cols = c; start = i + 1; source = detectSource(grid[i]); }
  }
  if (!cols) cols = guessCols(grid);
  if (!cols) throw new Error("Não consegui identificar as colunas (data, descrição e valor) neste arquivo. Confira se a planilha tem data, descrição e valor, ou baixe o extrato em OFX.");
  const c = cols;
  const rows: ParsedRow[] = [];
  let skipped = 0;
  const descOf = (r: string[]) => {
    const parts: string[] = [];
    c.desc.forEach((i) => {
      const v = (r[i] ?? "").trim();
      if (v && parts.indexOf(v) < 0) parts.push(v);
    });
    // Sem coluna de descrição, o tipo da transação (ex.: Mercado Pago) é melhor do que nada.
    if (!parts.length && c.kind >= 0 && (r[c.kind] ?? "").trim().length > 2) parts.push(r[c.kind].trim());
    return parts.join(" - ");
  };
  const hasAmount = (r: string[]) => [c.amount, c.debit, c.credit].some((i) => i >= 0 && Number.isFinite(parseAmountBR(r[i] ?? "")));
  let prev: ParsedRow | null = null;
  grid.slice(start).forEach((r) => {
    const date = parseDateAny(r[c.date] ?? "");
    if (!date) {
      // Linha de continuação (ex.: Bradesco põe o nome do favorecido na linha de baixo, sem data nem valor).
      const extra = descOf(r);
      if (prev && extra && extra.length <= 60 && !hasAmount(r) && !/^(saldo|total)(\s|$)/.test(lightNorm(extra)) && prev.description.length < 120) {
        prev.description = prev.description === "Sem descrição" ? extra : `${prev.description} - ${extra}`;
      } else skipped++;
      return;
    }
    let amount: number;
    if (c.amount >= 0) {
      amount = parseAmountBR(r[c.amount] ?? "");
      if (Number.isFinite(amount) && c.kind >= 0) {
        const k = lightNorm(r[c.kind] ?? "");
        if (/^(d|debito|saida|debit|despesa)(\s|$)/.test(k)) amount = -Math.abs(amount);
        else if (/^(c|credito|entrada|credit|receita)(\s|$)/.test(k)) amount = Math.abs(amount);
      }
    } else {
      const d = parseAmountBR(r[c.debit] ?? "");
      const cr = parseAmountBR(r[c.credit] ?? "");
      amount = (Number.isFinite(cr) ? Math.abs(cr) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
    }
    let description = descOf(r);
    if (c.parcel >= 0 && description) description += parcelSuffix(r[c.parcel] ?? "");
    if (!Number.isFinite(amount) || amount === 0 || /^(saldo|total|s a l d o)(\s|$)/.test(lightNorm(description))) { skipped++; prev = null; return; }
    prev = { date, amount, description: description || "Sem descrição", fitid: c.id >= 0 ? (r[c.id] ?? "").trim() || undefined : undefined };
    rows.push(prev);
  });
  return { format: "csv", kind: source?.kind, source, rows, skipped };
}

// ---------- tabela HTML (vários bancos baixam o ".xls" como página HTML) ----------

const decodeHtml = (s: string) =>
  decodeEntities(s.replace(/&nbsp;|&#160;/gi, " ").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n))));

export function htmlTableGrid(html: string): string[][] {
  const out: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) && out.length < 6000) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(m[1]))) cells.push(decodeHtml(c[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim());
    if (cells.some((x) => x)) out.push(cells);
  }
  return out;
}

/** Lê OFX ou CSV. PDF, foto e planilha passam por lib/fileImport. */
export function parseStatement(buf: ArrayBuffer): ParseResult {
  const head = new Uint8Array(buf.slice(0, 5));
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
    throw new Error("Este PDF precisa ser lido pela IA. Envie-o pela tela de importação.");
  }
  const text = decodeText(buf);
  const res = /<OFX>|<STMTTRN>/i.test(text) ? parseOFX(text)
    : /<table[\s>]/i.test(text.slice(0, 200000)) ? { ...parseGrid(htmlTableGrid(text)), format: "xls" as const }
    : parseCSV(text);
  if (!res.rows.length) throw new Error("Não encontrei lançamentos neste arquivo.");
  return res;
}

/** Em fatura de cartão, vários bancos exportam a compra como valor positivo. Sugere inverter o sinal. */
export function suggestInvert(res: ParseResult, target: "account" | "card"): boolean {
  // OFX de cartão e leitura por IA já trazem compra como valor negativo.
  if (target !== "card" || (res.kind === "card" && (res.format === "ofx" || res.format === "ai"))) return false;
  const pos = res.rows.filter((r) => r.amount > 0).length;
  return pos > res.rows.length - pos;
}

// ---------- estabelecimento: normalização e chaves de aprendizado ----------

const STOP = ("compra compras debito credito cartao pix enviado enviada recebido recebida transferencia transf pagamento pagto pgto pag de da do das dos e em no na via pelo pela " +
  "ltda me epp eireli sa parc parcela ted doc boleto ref cod on line online").split(" ");

/** Palavras que identificam o estabelecimento (sem números, códigos e termos genéricos de banco) */
export function merchantTokens(desc: string): string[] {
  return lightNorm(desc).split(" ").filter((t) => t.length > 1 && !/^\d+$/.test(t) && STOP.indexOf(t) < 0 && !(t.length >= 6 && /\d/.test(t)));
}

export type MerchantKey = { k: string; weak: boolean };

/** Chaves do mais específico ao mais genérico: duas primeiras palavras, depois a primeira (fraca quando há mais palavras). */
export function merchantKeys(desc: string): MerchantKey[] {
  const t = merchantTokens(desc);
  if (!t.length) return [];
  if (t.length === 1) return t[0].length >= 3 ? [{ k: t[0], weak: false }] : [];
  const out: MerchantKey[] = [{ k: t[0] + " " + t[1], weak: false }];
  if (t[0].length >= 4) out.push({ k: t[0], weak: true });
  return out;
}

export type Rule = { cat: string; n: number; share: number; weak: boolean };
export type Rules = Record<string, Rule>;

/** Regras aprendidas com o histórico do próprio usuário. Passe os lançamentos do mais novo para o mais antigo (empate fica com o mais recente). */
export function buildRules(history: { description: string; type: string; category_id: string | null }[]): Rules {
  const counts: Record<string, Record<string, number>> = {};
  const weakKeys: Record<string, boolean> = {};
  history.forEach((h) => {
    if (!h.category_id || !h.description) return;
    merchantKeys(h.description).forEach((mk) => {
      const key = h.type + "|" + mk.k;
      weakKeys[key] = mk.weak;
      const bucket = counts[key] || (counts[key] = {});
      bucket[h.category_id as string] = (bucket[h.category_id as string] || 0) + 1;
    });
  });
  const rules: Rules = {};
  Object.keys(counts).forEach((key) => {
    let total = 0, bestCat = "", bestN = 0;
    Object.keys(counts[key]).forEach((cat) => {
      const n = counts[key][cat];
      total += n;
      if (n > bestN) { bestN = n; bestCat = cat; }
    });
    rules[key] = { cat: bestCat, n: total, share: bestN / total, weak: weakKeys[key] };
  });
  return rules;
}

export function lookupRule(rules: Rules, type: "income" | "expense", desc: string): string | null {
  const keys = merchantKeys(desc);
  for (let i = 0; i < keys.length; i++) {
    const r = rules[type + "|" + keys[i].k];
    if (r && (!r.weak || (r.n >= 2 && r.share >= 0.8))) return r.cat;
  }
  return null;
}

// ---------- dicionário padrão (nomes das categorias padrão do Jakash) ----------

type Dict = { kw: string[]; type?: "income" | "expense"; root: string; sub?: string };
const d = (root: string, sub: string | undefined, kw: string, type?: "income" | "expense"): Dict => ({ root, sub, kw: kw.split(","), type });

// A ordem importa: vale a primeira que casar. "x*" = começa com x; sem asterisco = palavra inteira.
const DICT: Dict[] = [
  // receitas
  d("Salário", undefined, "salario,folha de pagamento,13o salario,adiantamento salarial,ferias", "income"),
  d("Rendimentos", "Juros e dividendos", "rendimento*,rend pago,dividendo*,jcp,proventos,juros sobre capital", "income"),
  d("Rendimentos", "Aluguéis recebidos", "aluguel,aluguer", "income"),
  d("Vendas e serviços", "Venda de produtos", "mercado pago,mercadopago,pagseguro,pagbank,cielo,stone,getnet,sumup,infinitepay,hotmart,eduzz,kiwify,braip,venda*", "income"),
  d("Vendas e serviços", "Prestação de serviços", "nota fiscal,servico prestado,honorarios", "income"),
  d("Pix / Transferência", undefined, "pix,transferencia,ted,doc", "income"),
  // delivery e restaurantes
  d("Alimentação", "Delivery", "ifood,rappi,uber eats,ubereats,99food,ze delivery,aiqfome,james delivery"),
  d("Alimentação", "Restaurantes", "restaurante*,mc donalds,mcdonalds,burger king,subway,outback,giraffas,madero,habibs,spoleto,pizzaria*,churrascaria*,lanchonete*,sushi*,bk brasil"),
  d("Alimentação", "Padaria e lanches", "padaria*,panificadora,cafeteria*,starbucks,cafe,confeitaria,sorveteria*,acai*"),
  d("Alimentação", "Feira e hortifruti", "hortifruti,sacolao,feira"),
  // compras online antes de "mercado"
  d("Serviços", "Assinaturas e streaming", "netflix,spotify,disney*,hbo,amazon prime,prime video,youtube premium,google youtube,apple com bill,icloud,globoplay,deezer,paramount*,crunchyroll,dazn,telecine,premiere,google one,audible"),
  d("Compras", "Compras online", "mercado livre,mercadolivre,shopee,aliexpress,amazon*,shein,magazine luiza,magalu,americanas,casas bahia,kabum,submarino,shoptime,temu,olx"),
  d("Outros", undefined, "mercado pago,mercadopago,pagseguro,pagbank"),
  d("Alimentação", "Supermercado", "supermercado*,mercadinho,mercearia,mercado,carrefour,assai,atacadao,atacarejo,pao de acucar,angeloni,condor,zaffari,makro,sams club,hirota,savegnago"),
  // transporte
  d("Transporte", "Aplicativos de transporte", "uber,99 pop,99pop,99app,99 tecnologia,cabify,indriver"),
  d("Transporte", "Combustível", "posto*,shell,ipiranga,petrobras,combustivel*,combustiveis,gasolina,etanol"),
  d("Transporte", "Estacionamento e pedágio", "estacionamento*,sem parar,semparar,conectcar,veloe,pedagio*,estapar,zona azul"),
  d("Transporte", "Transporte público", "bilhete unico,sptrans,riocard,metro,cptm,metrorec"),
  d("Transporte", "Manutenção do veículo", "oficina*,auto pecas,borracharia,lava jato,lavagem"),
  // moradia
  d("Moradia", "Aluguel", "aluguel,aluguer"),
  d("Moradia", "Condomínio", "condominio*"),
  d("Moradia", "IPTU", "iptu"),
  d("Moradia", "Energia elétrica", "enel,cemig,cpfl,energisa,copel,neoenergia,equatorial,coelba,celpe,elektro,cosern,celesc,rge,energia"),
  d("Moradia", "Água", "sabesp,copasa,sanepar,cedae,embasa,compesa,caesb,agua e esgoto,saneamento"),
  d("Moradia", "Gás", "comgas,naturgy,ultragaz,liquigas,gas natural,botijao,supergasbras,copagaz"),
  d("Moradia", "Internet e TV", "vivo fibra,claro net,net virtua,oi fibra,sky,brisanet,internet"),
  d("Serviços", "Celular", "tim celular,tim brasil,vivo celular,claro celular,oi movel,recarga*"),
  // saúde
  d("Saúde", "Farmácia", "drogaria*,farmacia*,drogasil,droga raia,raia,pague menos,pacheco,panvel,ultrafarma,drogal,nissei,araujo,venancio,onofre"),
  d("Saúde", "Plano de saúde", "unimed,amil,bradesco saude,sulamerica,hapvida,notredame,porto saude,plano de saude"),
  d("Saúde", "Dentista", "dentista,odonto*"),
  d("Saúde", "Exames", "laboratorio*,exame*,fleury,dasa,hermes pardini"),
  d("Saúde", "Consultas", "clinica*,consulta*,medico*"),
  // lazer e educação
  d("Lazer", "Cinema, shows e teatro", "cinema*,cinemark,kinoplex,ingresso*,sympla,eventim,ticketmaster"),
  d("Lazer", "Esporte e academia", "academia*,smartfit,smart fit,bluefit,bodytech,gympass,wellhub,totalpass"),
  d("Lazer", "Jogos e hobbies", "steam,playstation,psn,xbox,nintendo,epic games,riot,blizzard"),
  d("Educação", "Cursos", "udemy,alura,coursera,rocketseat,duolingo"),
  d("Educação", "Escola e faculdade", "escola*,colegio*,faculdade*,universidade*,mensalidade,anhanguera,estacio,unip,uninove,unopar"),
  // compras
  d("Compras", "Roupas e calçados", "renner,c a,riachuelo,marisa,zara,hering,centauro,netshoes,dafiti,arezzo,havaianas"),
  d("Compras", "Cuidados pessoais", "barbearia*,salao*,cabeleireir*,boticario,natura,sephora,manicure"),
  // pet, viagens, seguros, doações
  d("Pet", "Veterinário", "veterinari*"),
  d("Pet", "Banho e tosa", "banho e tosa"),
  d("Pet", "Ração e petiscos", "petz,cobasi,petlove,pet shop,petshop"),
  d("Viagens", "Passagens", "latam,gol linhas,azul linhas,decolar,123milhas,maxmilhas"),
  d("Viagens", "Hospedagem", "airbnb,booking,hotel*,pousada*"),
  d("Seguros", "Seguro do veículo", "seguro auto,seguro veicular,porto seguro auto"),
  d("Seguros", undefined, "seguro*"),
  d("Doações", undefined, "doacao*,vakinha,dizimo,igreja"),
  // impostos e dívidas
  d("Taxas/Impostos", "DAS (MEI)", "pgmei,das mei,das simples,simples nacional"),
  d("Taxas/Impostos", "IPVA", "ipva"),
  d("Taxas/Impostos", "Imposto de renda", "darf,imposto de renda,irpf"),
  d("Taxas/Impostos", "Multas", "multa,multas"),
  d("Taxas/Impostos", "Tarifas bancárias", "tarifa*,anuidade,iof,manutencao de conta,pacote de servicos,cesta de servicos"),
  d("Dívidas e financiamentos", "Empréstimos", "emprestimo*,consignado"),
  d("Dívidas e financiamentos", "Financiamentos", "financiamento*"),
  d("Dívidas e financiamentos", "Juros e multas", "juros,encargos,mora"),
  // negócio
  d("Negócio", "Marketing e anúncios", "facebook ads,meta ads,google ads,facebk,instagram ads,tiktok ads"),
  d("Negócio", "Frete e entregas", "correios,loggi,melhor envio,jadlog,sedex"),
  d("Negócio", "Contador", "contador*,contabil*,contabilidade"),
  d("Negócio", "Ferramentas e sistemas", "canva,notion,adobe,microsoft,google workspace,github,vercel,aws,hostinger,godaddy,registro br,locaweb,zoom,slack,figma,openai,chatgpt"),
  d("Negócio", "Taxas de maquininha", "maquininha"),
];

function kwMatch(padded: string, kw: string): boolean {
  return kw.charAt(kw.length - 1) === "*" ? padded.indexOf(" " + kw.slice(0, -1)) >= 0 : padded.indexOf(" " + kw + " ") >= 0;
}

function findCat(cats: CatRow[], type: "income" | "expense", root: string, sub?: string): string | null {
  const r = lightNorm(root);
  const rc = cats.filter((c) => !c.parent_id && c.type === type && lightNorm(c.name) === r)[0];
  if (!rc) return null;
  if (!sub) return rc.id;
  const s = lightNorm(sub);
  const sc = cats.filter((c) => c.parent_id === rc.id && lightNorm(c.name) === s)[0];
  return (sc || rc).id;
}

export function defaultCategory(cats: CatRow[], type: "income" | "expense", desc: string): string | null {
  const padded = " " + lightNorm(desc) + " ";
  for (let i = 0; i < DICT.length; i++) {
    const e = DICT[i];
    if (e.type && e.type !== type) continue;
    if (!e.type && type === "income") continue; // sem tipo = só despesas
    if (e.kw.some((k) => kwMatch(padded, k))) {
      const id = findCat(cats, type, e.root, e.sub);
      if (id) return id;
    }
  }
  return null;
}

// ---------- prévia ----------

const WORDS_LOWER = / (De|Da|Do|Das|Dos|E|Em|No|Na) /g;

/** Texto legível para o lançamento: TUDO MAIÚSCULO vira "Tudo Maiúsculo" */
export function prettyDesc(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s\-*\/(])([a-zà-ú])/g, (_m, a: string, b: string) => a + b.toUpperCase());
    s = s.replace(WORDS_LOWER, (m) => m.toLowerCase());
  }
  return s.slice(0, 100);
}

export function looksLikeCardPayment(desc: string): boolean {
  return /(pagamento|pagto|pgto) (de |da |do )?(fatura|cartao)|fatura (cartao|paga)|pagamento recebido|pagamento efetuado|pagamento on ?line/.test(lightNorm(desc));
}

export function looksLikeInternalMove(desc: string): boolean {
  return /aplicacao|resgate|\brdb\b|\bcdb\b|poupanca|transf(erencia)? entre contas|mesma titularidade/.test(lightNorm(desc));
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/** Chave anti-duplicidade: o mesmo arquivo importado de novo gera as mesmas chaves. */
export function importKeyFor(r: ParsedRow, targetId: string, occurrence: number): string {
  if (r.fitid && r.acct) return `ofx:${r.acct}:${r.fitid}`;
  if (r.fitid) return `id:${r.fitid}`;
  return `h:${targetId}:${r.date}:${Math.round(Math.abs(r.amount) * 100)}:${fnv(lightNorm(r.description))}:${occurrence}`;
}

// ---------- parcelas ("Notebook 2/6", "PARC 02/06", "(2/6)") ----------

export type Installment = { n: number; total: number; group: string; base: string };

const INST_RES: RegExp[] = [
  /parc(?:ela)?s?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i,
  /\(\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)/,
  /(?:^|[\s-])(\d{1,2})\/(\d{1,2})\s*$/,
];

/** Reconhece o marcador de parcela na descrição de uma compra de cartão e devolve o grupo (igual em todas as parcelas da mesma compra). */
export function parseInstallment(desc: string, targetId: string, amount: number): Installment | null {
  for (const re of INST_RES) {
    const m = re.exec(desc);
    if (!m) continue;
    const n = Number(m[1]), total = Number(m[2]);
    if (!(total >= 2 && total <= 48 && n >= 1 && n <= total)) continue;
    const base = prettyDesc(desc.replace(m[0], " ").replace(/\s+/g, " ").trim());
    const seed = `${targetId}|${merchantTokens(base).join(" ")}|${total}|${Math.round(amount)}`;
    const hex = ["a", "b", "c", "d"].map((salt) => (parseInt(fnv(salt + seed), 36) >>> 0).toString(16).padStart(8, "0")).join("");
    const group = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    return { n, total, group, base };
  }
  return null;
}

export type ExistingTx = { date: string; amount: number; type: string; import_key: string | null; description?: string | null };

// ---------- avisos: valores fora do padrão e possíveis duplicados ----------

export type AmountStats = { n: number; median: number; p90: number };
export type StatsByType = { income: AmountStats; expense: AmountStats };

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];

/** Mediana e percentil 90 dos valores que a pessoa já lançou (por tipo). */
export function amountStats(history: { amount: number; type: string }[]): StatsByType {
  const mk = (t: string): AmountStats => {
    const v = history.filter((h) => h.type === t && h.amount > 0).map((h) => h.amount).sort((a, b) => a - b);
    return v.length ? { n: v.length, median: quantile(v, 0.5), p90: quantile(v, 0.9) } : { n: 0, median: 0, p90: 0 };
  };
  return { income: mk("income"), expense: mk("expense") };
}

/** Texto de aviso quando o valor é muito maior do que o histórico (precisa de pelo menos 8 lançamentos do tipo). */
export function outlierWarning(amount: number, type: "income" | "expense", stats?: StatsByType): string | undefined {
  const st = stats?.[type];
  if (!st || st.n < 8 || amount < 200) return undefined;
  const limit = Math.max(st.p90 * 3, st.median * 5);
  if (amount <= limit) return undefined;
  const times = Math.round(amount / Math.max(st.median, 1));
  return `Valor bem acima do seu normal (cerca de ${times}x a mediana). Confira se não tem zero a mais.`;
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** Já existe lançamento com o mesmo valor e descrição parecida em até 3 dias (de outro dia: o mesmo dia já é tratado à parte). */
export function nearDuplicate(r: { date: string; amount: number; type: string; description: string }, existing: ExistingTx[]): ExistingTx | undefined {
  const mine = new Set(merchantTokens(r.description));
  return existing.find((e) => {
    if (e.type !== r.type || Math.round(e.amount * 100) !== Math.round(r.amount * 100)) return false;
    const d = dayDiff(e.date, r.date);
    if (d === 0 || d > 3) return false;
    if (!e.description) return false;
    const theirs = merchantTokens(e.description);
    return theirs.some((t) => mine.has(t));
  });
}

export type PreviewRow = {
  uid: number;
  date: string;
  amount: number; // sempre positivo
  type: "income" | "expense";
  description: string;
  categoryId: string | null;
  catSource: "aprendida" | "padrao" | null;
  key: string;
  include: boolean;
  note?: string;
  inst?: Installment;
  warn?: string; // aviso que não desmarca o lançamento, só pede conferência
};

export function buildPreview(opts: {
  rows: ParsedRow[];
  invert: boolean;
  targetId: string;
  rules: Rules;
  cats: CatRow[];
  existing: ExistingTx[];
  stats?: StatsByType;
  detectInstallments?: boolean; // compras de cartão: reconhece "2/6"
}): PreviewRow[] {
  const { rows, invert, targetId, rules, cats, existing, stats, detectInstallments } = opts;
  const seen: Record<string, number> = {};
  const importedKeys: Record<string, boolean> = {};
  const manual: Record<string, number> = {};
  existing.forEach((e) => {
    if (e.import_key) importedKeys[e.import_key] = true;
    else {
      const k = `${e.date}|${Math.round(e.amount * 100)}|${e.type}`;
      manual[k] = (manual[k] || 0) + 1;
    }
  });
  return rows.map((r, i) => {
    const signed = invert ? -r.amount : r.amount;
    const type: "income" | "expense" = signed >= 0 ? "income" : "expense";
    const amount = Math.round(Math.abs(signed) * 100) / 100;
    const base = `${r.date}|${amount}|${lightNorm(r.description)}`;
    seen[base] = (seen[base] || 0) + 1;
    const inst = detectInstallments && type === "expense" ? parseInstallment(r.description, targetId, amount) : null;
    const key = inst ? `inst:${inst.group}:${inst.n}` : importKeyFor(r, targetId, seen[base]);
    const learned = lookupRule(rules, type, r.description);
    const fallback = learned ? null : defaultCategory(cats, type, r.description);
    let include = true;
    let note: string | undefined;
    const mk = `${r.date}|${Math.round(amount * 100)}|${type}`;
    if (importedKeys[key]) { include = false; note = "Já importado antes"; }
    else if (looksLikeCardPayment(r.description)) { include = false; note = "Pagamento de fatura: já está nas compras do cartão"; }
    else if (looksLikeInternalMove(r.description)) { include = false; note = "Parece movimentação entre suas contas/investimentos"; }
    else if (manual[mk] > 0) { manual[mk]--; include = false; note = "Já existe um lançamento igual neste dia"; }
    let warn: string | undefined;
    if (include) {
      const dup = nearDuplicate({ date: r.date, amount, type, description: r.description }, existing);
      if (dup) warn = `Parece repetido: já existe "${dup.description}" de mesmo valor em ${dup.date.slice(8, 10)}/${dup.date.slice(5, 7)}.`;
      else if (seen[base] > 1 && !(r.fitid)) warn = "Linha igual a outra do mesmo arquivo (mesmo dia, valor e descrição). Pode ser repetida.";
      else warn = outlierWarning(amount, type, stats);
    }
    return { uid: i, date: r.date, amount, type, description: inst ? `${inst.base} (${inst.n}/${inst.total})` : prettyDesc(r.description), categoryId: learned || fallback, catSource: learned ? "aprendida" : fallback ? "padrao" : null, key, include, note, warn, inst: inst ?? undefined };
  });
}

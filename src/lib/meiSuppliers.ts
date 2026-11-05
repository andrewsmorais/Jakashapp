// Regras puras de fornecedores do MEI (sem acesso ao banco): validação do cadastro, busca e totais por fornecedor.

export type Supplier = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  pix_key: string | null;
  category: string | null;
  notes: string | null;
  archived: boolean;
};

/** Texto digitado no formulário (tudo string, como vem dos campos). */
export type SupplierForm = { name: string; document: string; phone: string; email: string; pix_key: string; category: string; notes: string };
export const EMPTY_SUPPLIER_FORM: SupplierForm = { name: "", document: "", phone: "", email: "", pix_key: "", category: "", notes: "" };

/** Linha gravada em mei_suppliers (sem id e sem dono). Os limites são os mesmos do banco. */
export type SupplierRow = Omit<Supplier, "id" | "archived">;

export const SUPPLIER_LIMITS = { name: 120, phone: 20, email: 120, pix_key: 140, category: 60, notes: 500 } as const;

/** Sugestões para "O que ele fornece". Livre: a pessoa pode digitar outra coisa. */
export const CATEGORY_SUGGESTIONS = [
  "Matéria-prima", "Mercadorias para revenda", "Embalagens", "Insumos", "Ferramentas e equipamentos",
  "Serviços terceirizados", "Frete e entrega", "Marketing e divulgação", "Aluguel e contas do negócio",
];

// ---------------------------------------------------------------------------
// CPF / CNPJ
// ---------------------------------------------------------------------------
export const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

export type DocumentKind = "cpf" | "cnpj";
export function documentKind(raw: string | null | undefined): DocumentKind | null {
  const n = onlyDigits(raw).length;
  return n === 11 ? "cpf" : n === 14 ? "cnpj" : null;
}

/** null = pode salvar. Vazio vale (o documento é opcional); preenchido precisa ter 11 (CPF) ou 14 (CNPJ) dígitos. */
export function validateDocument(raw: string | null | undefined): string | null {
  const digits = onlyDigits(raw);
  if (digits.length === 0) return null;
  return documentKind(digits) ? null : "CPF tem 11 números e CNPJ tem 14. Confira o documento do fornecedor.";
}

/** 12345678000190 -> 12.345.678/0001-90 ; 12345678901 -> 123.456.789-01 ; outro tamanho volta como veio. */
export function formatDocument(raw: string | null | undefined): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return raw ?? "";
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Confere o formulário e devolve a linha pronta para gravar (campos vazios viram null, documento só com dígitos). */
export function supplierRow(form: SupplierForm): { ok: true; row: SupplierRow } | { ok: false; error: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, error: "Informe o nome do fornecedor." };
  if (name.length > SUPPLIER_LIMITS.name) return { ok: false, error: `O nome pode ter até ${SUPPLIER_LIMITS.name} caracteres.` };

  const docError = validateDocument(form.document);
  if (docError) return { ok: false, error: docError };
  const digits = onlyDigits(form.document);

  const phone = form.phone.trim();
  if (phone.length > SUPPLIER_LIMITS.phone) return { ok: false, error: `O telefone pode ter até ${SUPPLIER_LIMITS.phone} caracteres.` };
  const email = form.email.trim();
  if (email && (email.length > SUPPLIER_LIMITS.email || !EMAIL_RE.test(email))) return { ok: false, error: "E-mail inválido." };
  const pix = form.pix_key.trim();
  if (pix.length > SUPPLIER_LIMITS.pix_key) return { ok: false, error: `A chave Pix pode ter até ${SUPPLIER_LIMITS.pix_key} caracteres.` };
  const category = form.category.trim();
  if (category.length > SUPPLIER_LIMITS.category) return { ok: false, error: `O que ele fornece pode ter até ${SUPPLIER_LIMITS.category} caracteres.` };
  const notes = form.notes.trim();
  if (notes.length > SUPPLIER_LIMITS.notes) return { ok: false, error: `As observações podem ter até ${SUPPLIER_LIMITS.notes} caracteres.` };

  return {
    ok: true,
    row: { name, document: digits || null, phone: phone || null, email: email || null, pix_key: pix || null, category: category || null, notes: notes || null },
  };
}

export function supplierToForm(s: Supplier): SupplierForm {
  return {
    name: s.name, document: s.document ? formatDocument(s.document) : "", phone: s.phone ?? "", email: s.email ?? "",
    pix_key: s.pix_key ?? "", category: s.category ?? "", notes: s.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------
/** Minúsculas e sem acento, para "materia" achar "Matéria-prima". */
export const normalizeText = (s: string | null | undefined): string => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Busca por nome, o que fornece, e-mail, telefone ou documento; arquivados só com `showArchived`. Ordem alfabética. */
export function filterSuppliers<T extends Supplier>(list: T[], query: string, showArchived: boolean): T[] {
  const q = normalizeText(query);
  const qDigits = onlyDigits(query);
  return list
    .filter((s) => showArchived || !s.archived)
    .filter((s) => {
      if (!q) return true;
      if (normalizeText(s.name).includes(q) || normalizeText(s.category).includes(q) || normalizeText(s.email).includes(q)) return true;
      return qDigits.length >= 3 && (onlyDigits(s.document).includes(qDigits) || onlyDigits(s.phone).includes(qDigits));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

// ---------------------------------------------------------------------------
// Totais por fornecedor
// ---------------------------------------------------------------------------
/** Compra já lançada (despesa da empresa com fornecedor). */
export type PurchaseRow = { id: string; supplier_id: string | null; amount: number; date: string; description: string };
/** Conta a pagar em aberto com fornecedor. */
export type PayableRow = { id: string; supplier_id: string | null; amount: number; due_date: string; description: string };

export type SupplierSummary = {
  /** Comprado no mês e no ano de `today` (pela data do lançamento). */
  month: number;
  year: number;
  /** Quantas compras (lançamentos) o fornecedor tem na lista. */
  purchaseCount: number;
  /** A pagar: total e quantidade das contas em aberto; as vencidas à parte. */
  openTotal: number;
  openCount: number;
  overdueTotal: number;
  overdueCount: number;
  /** Vencimento mais próximo entre as contas em aberto (pode ser uma já vencida). */
  nextDue: string | null;
  /** Contas em aberto, da que vence primeiro para a última. */
  open: PayableRow[];
  /** Últimas compras, da mais recente para a mais antiga. */
  recent: PurchaseRow[];
};

export const RECENT_PURCHASES = 10;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const toCents = (n: number): number => (Number.isFinite(n) ? Math.round(n * 100) : 0);
const fromCents = (c: number): number => c / 100;

/**
 * Agrupa compras e contas por fornecedor. `today` é AAAA-MM-DD (data local).
 * Soma em centavos (sem erro de ponto flutuante) e ignora linhas sem fornecedor.
 */
export function summarizeSuppliers(purchases: PurchaseRow[], bills: PayableRow[], today: string, recentLimit = RECENT_PURCHASES): Map<string, SupplierSummary> {
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  type Acc = { month: number; year: number; open: number; overdue: number; purchases: PurchaseRow[]; bills: PayableRow[] };
  const acc = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) { a = { month: 0, year: 0, open: 0, overdue: 0, purchases: [], bills: [] }; acc.set(id, a); }
    return a;
  };

  for (const p of purchases) {
    if (!p.supplier_id) continue;
    const a = get(p.supplier_id);
    const c = toCents(p.amount);
    if (p.date.slice(0, 4) === year) a.year += c;
    if (p.date.slice(0, 7) === month) a.month += c;
    a.purchases.push(p);
  }
  for (const b of bills) {
    if (!b.supplier_id) continue;
    const a = get(b.supplier_id);
    const c = toCents(b.amount);
    a.open += c;
    if (b.due_date < today) a.overdue += c;
    a.bills.push(b);
  }

  const out = new Map<string, SupplierSummary>();
  for (const [id, a] of acc) {
    const open = [...a.bills].sort((x, y) => cmp(x.due_date, y.due_date) || cmp(x.id, y.id));
    const recent = [...a.purchases].sort((x, y) => cmp(y.date, x.date) || cmp(y.id, x.id)).slice(0, recentLimit);
    out.set(id, {
      month: fromCents(a.month), year: fromCents(a.year), purchaseCount: a.purchases.length,
      openTotal: fromCents(a.open), openCount: a.bills.length,
      overdueTotal: fromCents(a.overdue), overdueCount: a.bills.filter((b) => b.due_date < today).length,
      nextDue: open.length ? open[0].due_date : null, open, recent,
    });
  }
  return out;
}

export const EMPTY_SUPPLIER_SUMMARY: SupplierSummary = {
  month: 0, year: 0, purchaseCount: 0, openTotal: 0, openCount: 0, overdueTotal: 0, overdueCount: 0, nextDue: null, open: [], recent: [],
};

/** Soma de todos os fornecedores (para os cartões do topo da tela). */
export function overallTotals(summaries: Iterable<SupplierSummary>) {
  let month = 0;
  let year = 0;
  let open = 0;
  let openCount = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const s of summaries) {
    month += toCents(s.month);
    year += toCents(s.year);
    open += toCents(s.openTotal);
    openCount += s.openCount;
    overdue += toCents(s.overdueTotal);
    overdueCount += s.overdueCount;
  }
  return { month: fromCents(month), year: fromCents(year), open: fromCents(open), openCount, overdue: fromCents(overdue), overdueCount };
}

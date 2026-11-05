// Exportar meus dados: tudo que a pessoa tem no Jakash, com filtros, em CSV (zip) ou JSON.
// Funções puras (colunas, mapeadores, CSV, plano de consulta) + a leitura paginada e a montagem do arquivo.
// Não importa o Supabase: o cliente entra por uma interface mínima (ClientLike), então dá para testar sem rede.
import { buildPlans, type InstallmentRow } from "@/lib/installments";
import { buildClassifier } from "@/lib/essentials";
import { institutionByKey } from "@/lib/institutions";
import { FUELS, SHIFT_COLUMNS, isFuel, normalizeShift, shiftMetrics } from "@/lib/driver";
import { platformOf } from "@/lib/driverPlatforms";

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------
export type ExportItemId =
  | "transactions" | "accounts" | "cards" | "invoice_payments" | "installments" | "bills" | "debts" | "goals"
  | "budgets" | "investments" | "categories" | "shopping" | "driver" | "mei" | "profile";
export type Scope = "pessoal" | "empresa" | "ambos";
export type ExportFormat = "csv" | "json";

export type ExportOptions = {
  items: ExportItemId[];
  /** AAAA-MM-DD (inclusive) ou null = desde o começo. */
  from: string | null;
  /** AAAA-MM-DD (inclusive) ou null = até hoje e além. */
  to: string | null;
  scope: Scope;
  /** true = tudo que a casa enxerga (RLS); false = só as linhas do próprio usuário. */
  household: boolean;
  format: ExportFormat;
};

export type ExportContext = {
  userId: string;
  /** id da pessoa -> nome, para a coluna "Pessoa" quando a casa é compartilhada. */
  members: Record<string, string>;
  /** Usa o app para a empresa (usage_type "empresarial" ou "ambos"): mostra o pacote MEI e as colunas de empresa. */
  isMei: boolean;
  /** AAAA-MM-DD de hoje (data local da pessoa). */
  today: string;
  now: Date;
};

export const MAX_ROWS_PER_TABLE = 50_000;
export const PAGE_SIZE = 1000;

export type ExportItem = { id: ExportItemId; label: string; hint: string; meiOnly?: boolean };

export const EXPORT_ITEMS: ExportItem[] = [
  { id: "transactions", label: "Lançamentos", hint: "Receitas e despesas, com categoria, conta, cartão e parcela." },
  { id: "accounts", label: "Contas bancárias", hint: "Com o saldo atual." },
  { id: "cards", label: "Cartões", hint: "Crédito e débito." },
  { id: "invoice_payments", label: "Pagamentos de fatura", hint: "Quanto foi pago, quando e de qual conta." },
  { id: "installments", label: "Parcelamentos", hint: "Um resumo por compra parcelada. Não usa o período." },
  { id: "bills", label: "Contas a pagar e receber", hint: "Pelo vencimento." },
  { id: "debts", label: "Dívidas e pagamentos de dívida", hint: "Saldo, juros, acordo e cada pagamento." },
  { id: "goals", label: "Objetivos e aportes", hint: "Metas e o que foi guardado em cada uma." },
  { id: "budgets", label: "Limites do mês", hint: "Limite de gasto por categoria." },
  { id: "investments", label: "Investimentos e movimentações", hint: "Carteira, aportes, resgates e valores." },
  { id: "categories", label: "Categorias e subcategorias", hint: "As do Jakash e as suas." },
  { id: "shopping", label: "Listas de compras e itens", hint: "Listas, itens e preços estimados." },
  { id: "driver", label: "Motorista de app", hint: "Cada dia trabalhado com ganho bruto, despesas e lucro líquido, e os seus carros." },
  { id: "mei", label: "MEI: clientes, fornecedores, recibos e produtos", hint: "Clientes, fornecedores, recibos emitidos e o catálogo de produtos e serviços.", meiOnly: true },
  { id: "profile", label: "Perfil", hint: "Só dados do seu cadastro. Sem senhas, cobrança ou chaves." },
];

export const DEFAULT_OPTIONS = (isMei: boolean): ExportOptions => ({
  items: availableItems(isMei).map((i) => i.id),
  from: null,
  to: null,
  scope: "ambos",
  household: false,
  format: "csv",
});

export const availableItems = (isMei: boolean): ExportItem[] => EXPORT_ITEMS.filter((i) => !i.meiOnly || isMei);

/** Itens realmente exportados: na ordem do catálogo, sem repetir e sem o pacote MEI para quem não usa. */
export function effectiveItems(opts: ExportOptions, ctx: Pick<ExportContext, "isMei">): ExportItemId[] {
  const wanted = new Set(opts.items);
  return availableItems(ctx.isMei).map((i) => i.id).filter((id) => wanted.has(id));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Mensagem de erro em português, ou null se as opções estão certas. */
export function validateOptions(opts: ExportOptions, ctx: Pick<ExportContext, "isMei">): string | null {
  if (effectiveItems(opts, ctx).length === 0) return "Escolha ao menos um item.";
  if (opts.from && !validDate(opts.from)) return "A data inicial não é válida.";
  if (opts.to && !validDate(opts.to)) return "A data final não é válida.";
  if (opts.from && opts.to && opts.from > opts.to) return "A data inicial vem depois da final.";
  return null;
}

// ---------------------------------------------------------------------------
// Formatação (Excel brasileiro)
// ---------------------------------------------------------------------------
export type CellKind = "text" | "money" | "number" | "int" | "date" | "datetime" | "month" | "bool" | "json";
export type Cell = string | number | boolean | null | Record<string, unknown>;
export type Row = Record<string, Cell>;
export type Column = { key: string; header: string; kind: CellKind; household?: boolean; business?: boolean };

export const CSV_BOM = "﻿";
export const CSV_SEP = ";";
export const CSV_EOL = "\r\n";

/** Texto que a planilha poderia tratar como fórmula ganha um apóstrofo na frente (=, +, -, @, tab, CR). */
export function guardFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Texto seguro para uma célula CSV com separador ";": protege fórmula e põe aspas quando precisa. */
export function csvEscape(text: string): string {
  const s = guardFormula(text);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const SP_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function spParts(iso: string): { y: string; m: string; d: string; h: string; min: string } | null {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const p: Record<string, string> = {};
  for (const x of SP_FMT.formatToParts(dt)) p[x.type] = x.value;
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute };
}

/** "2026-10-23" ou um timestamp -> "2026-10-23" (timestamp no fuso de São Paulo). null se não for data. */
export function toDateISO(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  if (ISO_DATE.test(v)) return v;
  const p = spParts(v);
  return p ? `${p.y}-${p.m}-${p.d}` : null;
}

/** "2026-10-23" -> "23/10/2026". */
export function formatDateBR(v: unknown): string {
  const iso = toDateISO(v);
  if (!iso) return typeof v === "string" ? v : "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Timestamp -> "23/10/2026 14:05" (fuso de São Paulo). */
export function formatDateTimeBR(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  if (ISO_DATE.test(v)) return formatDateBR(v);
  const p = spParts(v);
  return p ? `${p.d}/${p.m}/${p.y} ${p.h}:${p.min}` : v;
}

/** "2026-10-01" -> "10/2026". */
export function formatMonthBR(v: unknown): string {
  if (typeof v !== "string" || v.length < 7) return "";
  return `${v.slice(5, 7)}/${v.slice(0, 4)}`;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 1234.5 -> "1234,50" (vírgula decimal, sem símbolo e sem ponto de milhar). */
export function formatMoneyBR(v: unknown): string {
  const n = num(v);
  if (n === null) return "";
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2).replace(".", ",");
}

/** 2.5 -> "2,5" (até 3 casas, sem zeros sobrando). */
export function formatNumberBR(v: unknown): string {
  const n = num(v);
  if (n === null) return "";
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

/** Texto final de uma célula no CSV. */
export function formatCsvCell(kind: CellKind, v: Cell): string {
  if (v === null || v === undefined) return "";
  switch (kind) {
    case "money": return formatMoneyBR(v);
    case "number": return formatNumberBR(v);
    case "int": { const n = num(v); return n === null ? "" : String(Math.trunc(n)); }
    case "date": return formatDateBR(v);
    case "datetime": return formatDateTimeBR(v);
    case "month": return formatMonthBR(v);
    case "bool": return v === true ? "Sim" : v === false ? "Não" : "";
    case "json": {
      if (typeof v === "object" && Object.keys(v).length === 0) return "";
      return csvEscape(typeof v === "string" ? v : JSON.stringify(v));
    }
    default: return csvEscape(String(v));
  }
}

/** Arquivo CSV completo: BOM, cabeçalho em português, ";" e quebra de linha do Windows. */
export function toCsv(columns: Column[], rows: Row[]): string {
  const head = columns.map((c) => csvEscape(c.header)).join(CSV_SEP);
  const body = rows.map((r) => columns.map((c) => formatCsvCell(c.kind, r[c.key] ?? null)).join(CSV_SEP));
  return CSV_BOM + [head, ...body].join(CSV_EOL) + CSV_EOL;
}

/** Valor da célula no JSON: tipos de verdade (número, booleano), datas em AAAA-MM-DD. */
export function jsonValue(kind: CellKind, v: Cell): unknown {
  if (v === null || v === undefined) return null;
  switch (kind) {
    case "money": { const n = num(v); return n === null ? null : round2(n); }
    case "number": return num(v);
    case "int": { const n = num(v); return n === null ? null : Math.trunc(n); }
    case "date": return toDateISO(v);
    case "month": return typeof v === "string" ? v.slice(0, 7) : null;
    case "bool": return typeof v === "boolean" ? v : null;
    case "datetime": return typeof v === "string" ? v : null;
    case "json": return v;
    default: return typeof v === "string" ? v : String(v);
  }
}

// ---------------------------------------------------------------------------
// Filtros e plano de consulta
// ---------------------------------------------------------------------------
export type QueryFilter =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte" | "lte"; column: string; value: string }
  | { op: "not_null"; column: string }
  | { op: "eq_or_null"; column: string; value: string };

type TableMeta = { owner?: string; ownerOrNull?: string; business?: string; date?: string };
const TABLE_META: Record<string, TableMeta> = {
  transactions: { owner: "user_id", business: "is_business", date: "date" },
  accounts: { owner: "user_id", business: "is_business" },
  credit_cards: { owner: "user_id", business: "is_business" },
  card_invoice_payments: { owner: "user_id", date: "paid_on" },
  bills: { owner: "user_id", business: "is_business", date: "due_date" },
  debts: { owner: "user_id" },
  debt_payments: { date: "paid_on" },
  goals: { owner: "user_id" },
  goal_contributions: { date: "date" },
  budgets: { owner: "user_id" },
  investments: { owner: "user_id" },
  investment_movements: { owner: "user_id", date: "moved_on" },
  categories: { ownerOrNull: "user_id" },
  shopping_lists: { owner: "user_id", business: "is_business" },
  shopping_items: {},
  driver_vehicles: { owner: "user_id" },
  driver_shifts: { owner: "user_id", date: "date" },
  mei_clients: { owner: "user_id" },
  mei_suppliers: { owner: "user_id" },
  mei_invoices: { owner: "user_id", date: "invoice_date" },
  mei_items: { owner: "user_id" },
};

/**
 * Filtros de uma tabela, a partir das opções:
 * pessoas da casa (sem marcar = só linhas do usuário), Pessoal/Empresa (onde a tabela tem is_business) e período (na coluna de data da tabela).
 */
export function buildFilters(table: string, opts: ExportOptions, userId: string, withPeriod = true): QueryFilter[] {
  const m = TABLE_META[table] ?? {};
  const out: QueryFilter[] = [];
  if (!opts.household) {
    if (!userId) throw new Error("Usuário não identificado.");
    if (m.owner) out.push({ op: "eq", column: m.owner, value: userId });
    if (m.ownerOrNull) out.push({ op: "eq_or_null", column: m.ownerOrNull, value: userId });
  }
  if (m.business && opts.scope !== "ambos") out.push({ op: "eq", column: m.business, value: opts.scope === "empresa" });
  if (withPeriod && m.date) {
    if (opts.from) out.push({ op: "gte", column: m.date, value: opts.from });
    if (opts.to) out.push({ op: "lte", column: m.date, value: opts.to });
  }
  return out;
}

/** Aplica os mesmos filtros na memória (tabelas pequenas que também servem para achar nomes). */
export function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: QueryFilter[]): T[] {
  if (filters.length === 0) return rows;
  return rows.filter((r) => filters.every((f) => {
    const v = r[f.column];
    switch (f.op) {
      case "eq": return v === f.value;
      case "gte": return typeof v === "string" && v >= f.value;
      case "lte": return typeof v === "string" && v <= f.value;
      case "not_null": return v !== null && v !== undefined;
      case "eq_or_null": return v === null || v === undefined || v === f.value;
    }
  }));
}

export type TaskId =
  | "transactions" | "installment_rows" | "accounts" | "account_balances" | "credit_cards" | "card_invoice_payments" | "bills"
  | "debts" | "debt_payments" | "goals" | "goal_contributions" | "budgets" | "investments" | "investment_movements"
  | "categories" | "category_flags" | "shopping_lists" | "shopping_items" | "driver_vehicles" | "driver_shifts" | "mei_clients" | "mei_suppliers" | "mei_invoices" | "mei_items" | "profile";

export type PlanTask = {
  id: TaskId;
  table: string;
  /** Para a mensagem de progresso: "Lendo lançamentos…". */
  label: string;
  kind: "table" | "rpc" | "single";
  columns: string;
  /** Filtros que vão para a consulta. */
  filters: QueryFilter[];
  /** Filtros aplicados depois de ler (tabelas pequenas, lidas inteiras porque também servem para achar nomes). */
  local: QueryFilter[];
  order: { column: string; ascending: boolean }[];
};

const PROFILE_BASE = ["full_name", "usage_type", "language", "currency", "birth_date", "accent", "notify_enabled", "notify_email", "notify_push", "notify_when", "created_at"];
const PROFILE_MEI = ["business_name", "business_cnpj", "mei_activity", "mei_opened_on", "mei_annual_limit", "business_municipio", "business_uf", "business_im", "business_cep", "business_address"];
/** Única lista de colunas do perfil que sai do app. Nada de cobrança, tokens, CPF, chave Pix ou permissões. */
export const profileColumns = (isMei: boolean): string[] => (isMei ? [...PROFILE_BASE, ...PROFILE_MEI] : [...PROFILE_BASE]);
/** Nomes que nunca podem aparecer no perfil exportado (usado nos testes e como trava). */
export const PROFILE_FORBIDDEN = [
  "id", "cpf_cnpj", "asaas_customer_id", "asaas_subscription_id", "subscription_status", "subscription_plan", "subscription_expires_at",
  "billing_provider", "apple_original_transaction_id", "is_admin", "pix_key", "pix_key_type", "pix_name", "pix_city", "referral_code",
  "token", "password", "email", "whatsapp_number", "phone",
];

type TaskDef = { table: string; label: string; kind?: PlanTask["kind"]; columns: string; order: PlanTask["order"]; entity?: boolean; noPeriod?: boolean };
const asc = (column: string) => ({ column, ascending: true });
const desc = (column: string) => ({ column, ascending: false });

const TASKS: Record<Exclude<TaskId, "profile">, TaskDef> = {
  transactions: {
    table: "transactions", label: "lançamentos",
    columns: "id,user_id,category_id,amount,description,type,date,is_recurring,account_id,card_id,debit_card_id,invoice_month,installment_number,installment_total,is_business,attachment_name,revenue_kind,client_id,supplier_id,is_owner_draw",
    order: [desc("date"), asc("id")],
  },
  installment_rows: {
    table: "transactions", label: "parcelamentos",
    columns: "id,user_id,card_id,description,amount,date,invoice_month,installment_group,installment_number,installment_total,category_id,is_business",
    order: [asc("installment_group"), asc("installment_number"), asc("id")], noPeriod: true,
  },
  accounts: { table: "accounts", label: "contas bancárias", entity: true, columns: "id,user_id,name,kind,initial_balance,archived,is_business,institution,created_at", order: [asc("created_at"), asc("id")] },
  account_balances: { table: "account_balances", label: "saldos das contas", kind: "rpc", columns: "*", order: [] },
  credit_cards: {
    table: "credit_cards", label: "cartões", entity: true,
    columns: "id,user_id,name,brand,credit_limit,closing_day,due_day,pay_account_id,archived,kind,is_business,institution,created_at", order: [asc("created_at"), asc("id")],
  },
  card_invoice_payments: { table: "card_invoice_payments", label: "pagamentos de fatura", columns: "id,user_id,card_id,invoice_month,amount,paid_on,account_id", order: [desc("paid_on"), asc("id")] },
  bills: {
    table: "bills", label: "contas a pagar e receber",
    columns: "id,user_id,description,amount,due_date,type,recurrence,status,paid_at,is_business,revenue_kind,client_id,supplier_id,debt_id,created_at", order: [asc("due_date"), asc("id")],
  },
  debts: {
    table: "debts", label: "dívidas", entity: true,
    columns: "id,user_id,name,kind,balance,monthly_rate,min_payment,archived,creditor,original_amount,status,overdue_since,essential,cash_offer,agreement_installments,agreement_amount,agreement_first_due,created_at",
    order: [asc("created_at"), asc("id")],
  },
  debt_payments: { table: "debt_payments", label: "pagamentos de dívida", columns: "id,debt_id,amount,paid_on", order: [desc("paid_on"), asc("id")] },
  goals: { table: "goals", label: "objetivos", entity: true, columns: "id,user_id,name,type,target_amount,current_amount,deadline,status,metadata,created_at", order: [asc("created_at"), asc("id")] },
  goal_contributions: { table: "goal_contributions", label: "aportes dos objetivos", columns: "id,goal_id,amount,date", order: [desc("date"), asc("id")] },
  budgets: { table: "budgets", label: "limites do mês", entity: true, columns: "id,user_id,category_id,amount_limit", order: [asc("created_at"), asc("id")] },
  investments: {
    table: "investments", label: "investimentos", entity: true,
    columns: "id,user_id,name,kind,institution,invested,current_value,archived,created_at,updated_at", order: [asc("created_at"), asc("id")],
  },
  investment_movements: {
    table: "investment_movements", label: "movimentações de investimentos",
    columns: "id,user_id,investment_id,kind,amount,moved_on,account_id,note,value_after", order: [desc("moved_on"), asc("id")],
  },
  categories: { table: "categories", label: "categorias", entity: true, columns: "id,user_id,name,type,is_default,parent_id", order: [asc("created_at"), asc("id")] },
  category_flags: { table: "category_flags", label: "marcações das categorias", entity: true, columns: "user_id,category_id,is_essential,is_benefit", order: [asc("category_id")] },
  shopping_lists: {
    table: "shopping_lists", label: "listas de compras", entity: true,
    columns: "id,user_id,name,is_business,status,transaction_id,created_at,finished_at", order: [asc("created_at"), asc("id")],
  },
  shopping_items: {
    table: "shopping_items", label: "itens das listas de compras",
    columns: "id,list_id,name,quantity,unit,est_price,checked,checked_at", order: [asc("list_id"), asc("position"), asc("id")],
  },
  driver_vehicles: { table: "driver_vehicles", label: "carros", entity: true, columns: "id,user_id,name,fuel,efficiency,fuel_price,efficiency_alt,fuel_price_alt,cost_per_km,daily_rent,archived,created_at", order: [asc("created_at"), asc("id")] },
  driver_shifts: { table: "driver_shifts", label: "dias de motorista", columns: "user_id," + SHIFT_COLUMNS, order: [desc("date"), asc("id")] },
  mei_clients: {
    table: "mei_clients", label: "clientes", entity: true,
    columns: "id,user_id,name,document,phone,email,notes,archived,created_at,cep,address,address_number,address_complement,neighborhood,city,uf", order: [asc("created_at"), asc("id")],
  },
  mei_suppliers: { table: "mei_suppliers", label: "fornecedores", entity: true, columns: "id,user_id,name,document,phone,email,pix_key,category,notes,archived,created_at", order: [asc("created_at"), asc("id")] },
  mei_invoices: {
    table: "mei_invoices", label: "recibos", columns: "id,user_id,invoice_number,client_id,client_name,value,invoice_date,notes", order: [desc("invoice_date"), desc("invoice_number")],
  },
  mei_items: {
    table: "mei_items", label: "produtos e serviços", columns: "id,user_id,kind,name,description,unit_price,unit,ctrib_nac,nbs,municipal_code,ncm,cfop,archived,created_at", order: [asc("created_at"), asc("id")],
  },
};

// Tabelas `entity` (pequenas) são lidas inteiras e filtradas na memória: pessoas da casa e Pessoal/Empresa valem para o que sai no arquivo,
// mas o nome de uma conta, categoria, cartão ou dívida precisa ser achado mesmo quando ela ficou de fora do filtro.

// ---------------------------------------------------------------------------
// Catálogo de arquivos (um por tabela do item)
// ---------------------------------------------------------------------------
export type DatasetId =
  | "transactions" | "accounts" | "cards" | "invoice_payments" | "installments" | "bills" | "debts" | "debt_payments" | "goals"
  | "goal_contributions" | "budgets" | "investments" | "investment_movements" | "categories" | "shopping_lists" | "shopping_items"
  | "driver_shifts" | "driver_vehicles" | "mei_clients" | "mei_suppliers" | "mei_invoices" | "mei_items" | "profile";

const c = (key: string, header: string, kind: CellKind = "text", flags: Pick<Column, "household" | "business"> = {}): Column => ({ key, header, kind, ...flags });
const PESSOA = c("pessoa", "Pessoa", "text", { household: true });
const TIPO_USO = c("pessoal_empresa", "Pessoal/Empresa", "text", { business: true });

export type DatasetDef = {
  id: DatasetId;
  item: ExportItemId;
  file: string;
  jsonKey: string;
  title: string;
  description: string;
  columns: Column[];
  /** Tarefas de leitura necessárias (a primeira é a que dá as linhas). */
  tasks: TaskId[];
  single?: boolean;
};

export const DATASETS: DatasetDef[] = [
  {
    id: "transactions", item: "transactions", file: "lancamentos.csv", jsonKey: "lancamentos", title: "Lançamentos",
    description: "Receitas e despesas, com categoria, conta, cartão, fatura e parcela.",
    tasks: ["transactions", "categories", "accounts", "credit_cards", "mei_clients", "mei_suppliers"],
    columns: [PESSOA, c("data", "Data", "date"), c("descricao", "Descrição"), c("tipo", "Tipo"), c("valor", "Valor", "money"), c("categoria", "Categoria"), c("subcategoria", "Subcategoria"),
      c("conta", "Conta"), c("cartao_credito", "Cartão de crédito"), c("cartao_debito", "Cartão de débito"), c("fatura", "Fatura (mês de vencimento)", "month"),
      c("parcela", "Parcela", "int"), c("total_parcelas", "Total de parcelas", "int"), TIPO_USO,
      c("tipo_receita_mei", "Tipo de receita (MEI)", "text", { business: true }), c("cliente", "Cliente", "text", { business: true }), c("fornecedor", "Fornecedor", "text", { business: true }),
      c("retirada_do_socio", "Retirada do sócio", "bool", { business: true }), c("recorrente", "Recorrente", "bool"), c("anexo", "Nome do anexo")],
  },
  {
    id: "accounts", item: "accounts", file: "contas-bancarias.csv", jsonKey: "contas_bancarias", title: "Contas bancárias",
    description: "Contas, saldo inicial e saldo atual (de hoje).",
    tasks: ["accounts", "account_balances"],
    columns: [PESSOA, c("nome", "Conta"), c("tipo", "Tipo"), c("instituicao", "Instituição"), c("saldo_inicial", "Saldo inicial", "money"), c("saldo_atual", "Saldo atual", "money"), TIPO_USO, c("arquivada", "Arquivada", "bool"), c("criada_em", "Criada em", "date")],
  },
  {
    id: "cards", item: "cards", file: "cartoes.csv", jsonKey: "cartoes", title: "Cartões",
    description: "Cartões de crédito e débito.",
    tasks: ["credit_cards", "accounts"],
    columns: [PESSOA, c("nome", "Cartão"), c("tipo", "Tipo"), c("bandeira", "Bandeira"), c("instituicao", "Instituição"), c("limite", "Limite", "money"), c("dia_fechamento", "Dia do fechamento", "int"),
      c("dia_vencimento", "Dia do vencimento", "int"), c("conta_pagamento", "Conta que paga a fatura"), TIPO_USO, c("arquivado", "Arquivado", "bool"), c("criado_em", "Criado em", "date")],
  },
  {
    id: "invoice_payments", item: "invoice_payments", file: "pagamentos-de-fatura.csv", jsonKey: "pagamentos_de_fatura", title: "Pagamentos de fatura",
    description: "Cada pagamento de fatura de cartão.",
    tasks: ["card_invoice_payments", "credit_cards", "accounts"],
    columns: [PESSOA, c("cartao", "Cartão"), c("fatura", "Fatura (mês de vencimento)", "month"), c("valor", "Valor pago", "money"), c("pago_em", "Pago em", "date"), c("conta", "Conta de onde saiu"), TIPO_USO],
  },
  {
    id: "installments", item: "installments", file: "parcelamentos.csv", jsonKey: "parcelamentos", title: "Parcelamentos",
    description: "Um resumo por compra parcelada (as parcelas, uma a uma, estão nos lançamentos). Não usa o período.",
    tasks: ["installment_rows", "credit_cards"],
    columns: [PESSOA, c("compra", "Compra"), c("cartao", "Cartão"), c("valor_parcela", "Valor da parcela", "money"), c("total_parcelas", "Total de parcelas", "int"), c("valor_total", "Valor total da compra", "money"),
      c("parcelas_vencidas", "Parcelas já vencidas", "int"), c("parcelas_a_vencer", "Parcelas a vencer", "int"), c("valor_a_vencer", "Valor a vencer", "money"), c("primeira_fatura", "Primeira fatura", "month"),
      c("proxima_fatura", "Próxima fatura", "month"), c("ultima_fatura", "Última fatura", "month"), c("parcelas_nao_lancadas", "Parcelas ainda não lançadas", "int"), TIPO_USO],
  },
  {
    id: "bills", item: "bills", file: "contas-a-pagar-e-receber.csv", jsonKey: "contas_a_pagar_e_receber", title: "Contas a pagar e receber",
    description: "Contas pelo vencimento, com a situação.",
    tasks: ["bills", "debts", "mei_clients", "mei_suppliers"],
    columns: [PESSOA, c("vencimento", "Vencimento", "date"), c("descricao", "Descrição"), c("tipo", "Tipo"), c("valor", "Valor", "money"), c("situacao", "Situação"), c("paga_em", "Paga em", "date"), c("repete", "Repete"),
      c("divida", "Dívida ligada"), TIPO_USO, c("tipo_receita_mei", "Tipo de receita (MEI)", "text", { business: true }), c("cliente", "Cliente", "text", { business: true }), c("fornecedor", "Fornecedor", "text", { business: true }), c("criada_em", "Criada em", "date")],
  },
  {
    id: "debts", item: "debts", file: "dividas.csv", jsonKey: "dividas", title: "Dívidas",
    description: "Saldo devedor, juros, situação e acordo.",
    tasks: ["debts"],
    columns: [PESSOA, c("nome", "Dívida"), c("tipo", "Tipo"), c("credor", "Credor"), c("situacao", "Situação"), c("saldo", "Saldo devedor", "money"), c("valor_original", "Valor original", "money"),
      c("juros_mes", "Juros ao mês (%)", "number"), c("pagamento_minimo", "Pagamento mínimo", "money"), c("atrasada_desde", "Atrasada desde", "date"), c("essencial", "Essencial", "bool"),
      c("proposta_a_vista", "Proposta à vista", "money"), c("acordo_parcelas", "Acordo: parcelas", "int"), c("acordo_valor_parcela", "Acordo: valor da parcela", "money"),
      c("acordo_primeiro_vencimento", "Acordo: primeiro vencimento", "date"), c("arquivada", "Arquivada", "bool"), c("criada_em", "Criada em", "date")],
  },
  {
    id: "debt_payments", item: "debts", file: "pagamentos-de-divida.csv", jsonKey: "pagamentos_de_divida", title: "Pagamentos de dívida",
    description: "Cada pagamento feito em uma dívida.",
    tasks: ["debt_payments", "debts"],
    columns: [PESSOA, c("divida", "Dívida"), c("valor", "Valor pago", "money"), c("pago_em", "Pago em", "date")],
  },
  {
    id: "goals", item: "goals", file: "objetivos.csv", jsonKey: "objetivos", title: "Objetivos",
    description: "Metas, quanto falta e o prazo.",
    tasks: ["goals"],
    columns: [PESSOA, c("nome", "Objetivo"), c("tipo", "Tipo"), c("situacao", "Situação"), c("valor_alvo", "Valor alvo", "money"), c("valor_atual", "Valor guardado", "money"), c("prazo", "Prazo", "date"),
      c("detalhes", "Detalhes", "json"), c("criado_em", "Criado em", "date")],
  },
  {
    id: "goal_contributions", item: "goals", file: "aportes-dos-objetivos.csv", jsonKey: "aportes_dos_objetivos", title: "Aportes dos objetivos",
    description: "Cada valor guardado em um objetivo.",
    tasks: ["goal_contributions", "goals"],
    columns: [PESSOA, c("objetivo", "Objetivo"), c("valor", "Valor", "money"), c("data", "Data", "date")],
  },
  {
    id: "budgets", item: "budgets", file: "limites-do-mes.csv", jsonKey: "limites_do_mes", title: "Limites do mês",
    description: "Limite mensal de gasto por categoria (ou geral).",
    tasks: ["budgets", "categories"],
    columns: [PESSOA, c("categoria", "Categoria"), c("subcategoria", "Subcategoria"), c("limite", "Limite por mês", "money")],
  },
  {
    id: "investments", item: "investments", file: "investimentos.csv", jsonKey: "investimentos", title: "Investimentos",
    description: "Carteira: quanto foi aplicado e o valor atual.",
    tasks: ["investments"],
    columns: [PESSOA, c("nome", "Investimento"), c("tipo", "Tipo"), c("instituicao", "Instituição"), c("investido", "Valor investido", "money"), c("valor_atual", "Valor atual", "money"),
      c("resultado", "Resultado", "money"), c("arquivado", "Arquivado", "bool"), c("criado_em", "Criado em", "date"), c("atualizado_em", "Atualizado em", "date")],
  },
  {
    id: "investment_movements", item: "investments", file: "movimentacoes-de-investimentos.csv", jsonKey: "movimentacoes_de_investimentos", title: "Movimentações de investimentos",
    description: "Aportes, resgates e atualizações de valor.",
    tasks: ["investment_movements", "investments", "accounts"],
    columns: [PESSOA, c("data", "Data", "date"), c("investimento", "Investimento"), c("tipo", "Tipo"), c("valor", "Valor", "money"), c("valor_apos", "Valor do investimento depois", "money"), c("conta", "Conta"), c("observacao", "Observação")],
  },
  {
    id: "categories", item: "categories", file: "categorias.csv", jsonKey: "categorias", title: "Categorias e subcategorias",
    description: "Categorias do Jakash e as suas, com a marcação de essencial e benefício.",
    tasks: ["categories", "category_flags"],
    columns: [c("tipo", "Tipo"), c("categoria", "Categoria"), c("subcategoria", "Subcategoria"), c("origem", "Origem"), c("essencial", "Essencial", "bool"), c("beneficio", "Benefício (VA/VR)", "bool")],
  },
  {
    id: "shopping_lists", item: "shopping", file: "listas-de-compras.csv", jsonKey: "listas_de_compras", title: "Listas de compras",
    description: "Listas abertas e concluídas.",
    tasks: ["shopping_lists"],
    columns: [PESSOA, c("nome", "Lista"), c("situacao", "Situação"), TIPO_USO, c("gerou_lancamento", "Virou lançamento", "bool"), c("criada_em", "Criada em", "date"), c("concluida_em", "Concluída em", "date")],
  },
  {
    id: "shopping_items", item: "shopping", file: "itens-das-listas-de-compras.csv", jsonKey: "itens_das_listas_de_compras", title: "Itens das listas de compras",
    description: "Itens de cada lista, com quantidade e preço estimado.",
    tasks: ["shopping_items", "shopping_lists"],
    columns: [PESSOA, c("lista", "Lista"), c("item", "Item"), c("quantidade", "Quantidade", "number"), c("unidade", "Unidade"), c("preco_estimado", "Preço estimado", "money"), c("comprado", "Comprado", "bool"), c("comprado_em", "Comprado em", "date")],
  },
  {
    id: "driver_shifts", item: "driver", file: "motorista-dias.csv", jsonKey: "motorista_dias", title: "Motorista de app: dias",
    description: "Um dia trabalhado por linha, com ganho bruto, despesas e lucro líquido.",
    tasks: ["driver_shifts", "driver_vehicles"],
    columns: [c("data", "Data", "date"), c("carro", "Carro"), c("inicio", "Início"), c("fim", "Fim"), c("horas", "Horas", "number"), c("km", "Km", "number"),
      c("plataformas", "Plataformas"), c("ganho_bruto", "Ganho bruto", "money"), c("gorjetas", "Gorjetas", "money"), c("combustivel", "Combustível", "money"),
      c("custo_carro", "Custo do carro", "money"), c("outros_gastos", "Outros gastos", "money"), c("despesas", "Despesas", "money"), c("lucro_liquido", "Lucro líquido", "money"),
      c("lucro_por_hora", "Lucro por hora", "money"), c("lucro_por_km", "Lucro por km", "money"), c("observacoes", "Observações")],
  },
  {
    id: "driver_vehicles", item: "driver", file: "motorista-carros.csv", jsonKey: "motorista_carros", title: "Motorista de app: carros",
    description: "Seus carros, com combustível, média e custos.",
    tasks: ["driver_vehicles"],
    columns: [c("nome", "Carro"), c("combustivel", "Combustível"), c("media", "Média (km por litro/m³/kWh; no flex, gasolina)", "number"), c("preco_combustivel", "Preço do combustível (no flex, gasolina)", "money"),
      c("media_etanol", "Média no etanol (flex)", "number"), c("preco_etanol", "Preço do etanol (flex)", "money"),
      c("custo_por_km", "Manutenção por km", "money"), c("aluguel_dia", "Aluguel por dia", "money"), c("arquivado", "Arquivado", "bool"), c("criado_em", "Criado em", "date")],
  },
  {
    id: "mei_clients", item: "mei", file: "mei-clientes.csv", jsonKey: "mei_clientes", title: "MEI: clientes",
    description: "Seus clientes (contatos que você cadastrou).",
    tasks: ["mei_clients"],
    columns: [c("nome", "Cliente"), c("documento", "CPF/CNPJ"), c("telefone", "Telefone"), c("email", "E-mail"),
      c("cep", "CEP"), c("logradouro", "Logradouro"), c("numero", "Número"), c("complemento", "Complemento"), c("bairro", "Bairro"), c("municipio", "Município"), c("uf", "UF"),
      c("observacoes", "Observações"), c("arquivado", "Arquivado", "bool"), c("criado_em", "Criado em", "date")],
  },
  {
    id: "mei_suppliers", item: "mei", file: "mei-fornecedores.csv", jsonKey: "mei_fornecedores", title: "MEI: fornecedores",
    description: "Seus fornecedores (contatos que você cadastrou).",
    tasks: ["mei_suppliers"],
    columns: [c("nome", "Fornecedor"), c("fornece", "O que fornece"), c("documento", "CPF/CNPJ"), c("telefone", "Telefone"), c("email", "E-mail"), c("chave_pix", "Chave Pix"), c("observacoes", "Observações"), c("arquivado", "Arquivado", "bool"), c("criado_em", "Criado em", "date")],
  },
  {
    id: "mei_invoices", item: "mei", file: "mei-recibos.csv", jsonKey: "mei_recibos", title: "MEI: recibos",
    description: "Recibos emitidos, pela data.",
    tasks: ["mei_invoices", "mei_clients"],
    columns: [c("numero", "Número", "int"), c("data", "Data", "date"), c("cliente", "Cliente"), c("valor", "Valor", "money"), c("observacoes", "Observações")],
  },
  {
    id: "mei_items", item: "mei", file: "mei-produtos-e-servicos.csv", jsonKey: "mei_produtos_e_servicos", title: "MEI: produtos e serviços",
    description: "Seu catálogo, com valor padrão e os códigos que você cadastrou para a nota fiscal.",
    tasks: ["mei_items"],
    columns: [c("tipo", "Tipo"), c("nome", "Nome"), c("descricao", "Descrição"), c("valor_padrao", "Valor padrão", "money"), c("unidade", "Unidade"),
      c("codigo_tributacao_nacional", "Código de tributação nacional (serviço)"), c("nbs", "Item da NBS (serviço)"), c("codigo_municipio", "Código complementar do município (serviço)"),
      c("ncm", "NCM (produto)"), c("cfop", "CFOP (produto)"), c("arquivado", "Arquivado", "bool"), c("criado_em", "Criado em", "date")],
  },
  {
    id: "profile", item: "profile", file: "perfil.csv", jsonKey: "perfil", title: "Perfil",
    description: "Dados do seu cadastro. Sem senha, cobrança, chaves ou CPF.",
    tasks: ["profile"], single: true,
    columns: [c("nome", "Nome"), c("tipo_de_uso", "Como usa o Jakash"), c("idioma", "Idioma"), c("moeda", "Moeda"), c("data_nascimento", "Data de nascimento", "date"), c("cor_destaque", "Cor de destaque"),
      c("avisos_ativos", "Avisos ativos", "bool"), c("avisos_email", "Avisos por e-mail", "bool"), c("avisos_push", "Avisos no celular", "bool"), c("avisos_quando", "Quando avisar"), c("cadastro_em", "Cadastro em", "date"),
      c("negocio_nome", "Nome do negócio", "text", { business: true }), c("negocio_cnpj", "CNPJ do negócio", "text", { business: true }), c("mei_atividade", "Atividade do MEI", "text", { business: true }),
      c("mei_abertura", "Abertura do MEI", "date", { business: true }), c("mei_limite_anual", "Limite anual do MEI", "money", { business: true }),
      c("negocio_municipio", "Município do negócio", "text", { business: true }), c("negocio_uf", "UF do negócio", "text", { business: true }),
      c("negocio_inscricao_municipal", "Inscrição municipal do negócio", "text", { business: true }), c("negocio_cep", "CEP do negócio", "text", { business: true }),
      c("negocio_endereco", "Endereço do negócio", "text", { business: true })],
  },
];

const DATASET_BY_ID = new Map(DATASETS.map((d) => [d.id, d]));
// "cards" é um item próprio; as demais ligações item -> arquivos vêm do campo `item`.
export const datasetsForItems = (items: ExportItemId[]): DatasetDef[] => DATASETS.filter((d) => items.includes(d.item));

/** Colunas que valem para esta exportação: "Pessoa" só com a casa ligada; colunas de empresa só para quem usa o app para a empresa. */
export function columnsFor(ds: DatasetDef, opts: Pick<ExportOptions, "household">, ctx: Pick<ExportContext, "isMei">): Column[] {
  return ds.columns.filter((col) => (!col.household || opts.household) && (!col.business || ctx.isMei));
}

const TASK_ORDER: TaskId[] = [
  "categories", "category_flags", "accounts", "account_balances", "credit_cards", "mei_clients", "mei_suppliers", "debts", "goals", "investments", "shopping_lists",
  "transactions", "installment_rows", "card_invoice_payments", "bills", "debt_payments", "goal_contributions", "budgets", "investment_movements", "shopping_items", "driver_vehicles", "driver_shifts", "mei_invoices", "mei_items", "profile",
];

/**
 * Plano de leitura: quais tabelas ler, com quais filtros, em que ordem.
 * Inclui as tabelas de apoio (categorias, contas, cartões, clientes) só quando algum item escolhido precisa delas para mostrar nomes.
 */
export function buildQueryPlan(opts: ExportOptions, ctx: ExportContext): PlanTask[] {
  const items = effectiveItems(opts, ctx);
  const needed = new Set<TaskId>();
  for (const ds of datasetsForItems(items)) {
    for (const t of ds.tasks) {
      if ((t === "mei_clients" || t === "mei_suppliers") && !ctx.isMei) continue;
      needed.add(t);
    }
  }
  return TASK_ORDER.filter((id) => needed.has(id)).map((id): PlanTask => {
    if (id === "profile") {
      return { id, table: "profiles", label: "perfil", kind: "single", columns: profileColumns(ctx.isMei).join(","), filters: [{ op: "eq", column: "id", value: ctx.userId }], local: [], order: [] };
    }
    const def = TASKS[id];
    const kind = def.kind ?? "table";
    if (kind === "rpc") return { id, table: def.table, label: def.label, kind, columns: def.columns, filters: [], local: [], order: [] };
    if (id === "category_flags") {
      // Só as marcações da própria pessoa valem para ela.
      return { id, table: def.table, label: def.label, kind, columns: def.columns, filters: [], local: [{ op: "eq", column: "user_id", value: ctx.userId }], order: def.order };
    }
    const filters = buildFilters(def.table, opts, ctx.userId, !def.noPeriod);
    const toMemory = Boolean(def.entity);
    if (id === "installment_rows") filters.push({ op: "not_null", column: "installment_group" });
    return {
      id, table: def.table, label: def.label, kind, columns: def.columns, order: def.order,
      filters: toMemory ? [] : filters,
      local: toMemory ? filters : [],
    };
  });
}

// ---------------------------------------------------------------------------
// Leitura paginada
// ---------------------------------------------------------------------------
type DbError = { message: string } | null;
export interface QueryLike extends PromiseLike<{ data: unknown; error: DbError }> {
  eq(column: string, value: unknown): QueryLike;
  gte(column: string, value: unknown): QueryLike;
  lte(column: string, value: unknown): QueryLike;
  not(column: string, operator: string, value: unknown): QueryLike;
  or(expression: string): QueryLike;
  order(column: string, options?: { ascending?: boolean }): QueryLike;
  range(from: number, to: number): QueryLike;
  maybeSingle(): QueryLike;
}
/** O pedaço do cliente do Supabase que a exportação usa (o do navegador serve; o de teste é de mentira). */
export interface ClientLike {
  from(table: string): { select(columns: string): QueryLike };
  rpc(fn: string): QueryLike;
}

export class ExportError extends Error {
  constructor(message: string, readonly task?: TaskId) { super(message); this.name = "ExportError"; }
}

type RawRow = Record<string, unknown>;
export type TaskResult = { rows: RawRow[]; capped: boolean };

export function applyServerFilters(q: QueryLike, filters: QueryFilter[]): QueryLike {
  let out = q;
  for (const f of filters) {
    if (f.op === "eq") out = out.eq(f.column, f.value);
    else if (f.op === "gte") out = out.gte(f.column, f.value);
    else if (f.op === "lte") out = out.lte(f.column, f.value);
    else if (f.op === "not_null") out = out.not(f.column, "is", null);
    else out = out.or(`${f.column}.is.null,${f.column}.eq.${f.value}`);
  }
  return out;
}

async function pageWithRetry(build: () => QueryLike): Promise<RawRow[]> {
  let lastErr: DbError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await build();
    if (!error) return (data ?? []) as RawRow[];
    lastErr = error;
  }
  throw new Error(lastErr?.message ?? "erro");
}

/** Lê uma tabela de 1000 em 1000 linhas, até acabar ou chegar em 50 mil (nesse caso `capped` = true se ainda havia mais). */
export async function fetchTask(
  client: ClientLike, task: PlanTask, onCount: (n: number) => void, signal?: { aborted: boolean },
): Promise<TaskResult> {
  const fail = () => new ExportError(`Não foi possível ler ${task.label}.`, task.id);
  const cancelled = () => new ExportError("Exportação cancelada.", task.id);
  try {
    if (task.kind === "rpc") {
      const { data, error } = await client.rpc(task.table);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as RawRow[];
      onCount(rows.length);
      return { rows, capped: false };
    }
    if (task.kind === "single") {
      const { data, error } = await applyServerFilters(client.from(task.table).select(task.columns), task.filters).maybeSingle();
      if (error) throw new Error(error.message);
      onCount(data ? 1 : 0);
      return { rows: data ? [data as RawRow] : [], capped: false };
    }
    const build = (from: number, to: number) => {
      let q = applyServerFilters(client.from(task.table).select(task.columns), task.filters);
      for (const o of task.order) q = q.order(o.column, { ascending: o.ascending });
      return q.range(from, to);
    };
    const rows: RawRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      if (signal?.aborted) throw cancelled();
      const page = await pageWithRetry(() => build(from, from + PAGE_SIZE - 1));
      rows.push(...page);
      onCount(rows.length);
      if (page.length < PAGE_SIZE) return { rows, capped: false };
      if (rows.length >= MAX_ROWS_PER_TABLE) {
        const probe = await pageWithRetry(() => build(rows.length, rows.length));
        return { rows: rows.slice(0, MAX_ROWS_PER_TABLE), capped: probe.length > 0 };
      }
    }
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw fail();
  }
}

// ---------------------------------------------------------------------------
// Mapeadores: linhas do banco -> linhas legíveis
// ---------------------------------------------------------------------------
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const int = (v: unknown): number | null => { const n = num(v); return n === null ? null : Math.trunc(n); };
const money = (v: unknown): number | null => { const n = num(v); return n === null ? null : round2(n); };

const label = (map: Record<string, string>, v: unknown): string | null => {
  const s = str(v);
  return s ? map[s] ?? s : null;
};

const TIPO_LANC: Record<string, string> = { income: "Receita", expense: "Despesa" };
const TIPO_CONTA: Record<string, string> = { corrente: "Conta corrente", poupanca: "Poupança", dinheiro: "Dinheiro", investimento: "Investimento" };
const TIPO_CARTAO: Record<string, string> = { credito: "Crédito", debito: "Débito" };
const BANDEIRA: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", elo: "Elo", amex: "Amex", hipercard: "Hipercard", outro: "Outra" };
const TIPO_DIVIDA: Record<string, string> = { cartao: "Cartão", cheque_especial: "Cheque especial", emprestimo: "Empréstimo", financiamento: "Financiamento", conta_consumo: "Conta (água, luz, gás)", loja: "Loja / crediário", outro: "Outra" };
const SITUACAO_DIVIDA: Record<string, string> = { em_dia: "Em dia", atrasada: "Atrasada", negativada: "Negativada", negociada: "Negociada", quitada: "Quitada" };
const TIPO_OBJETIVO: Record<string, string> = {
  custom: "Outro objetivo", viagem: "Viagem", bebe: "Chegada do bebê", reserva: "Reserva de emergência", casamento: "Casamento", carro: "Carro", imovel: "Imóvel", curso: "Curso", reforma: "Reforma",
};
const SITUACAO_OBJETIVO: Record<string, string> = { in_progress: "Em andamento", completed: "Concluído", cancelled: "Cancelado" };
const TIPO_INVEST: Record<string, string> = {
  renda_fixa: "Renda fixa", tesouro: "Tesouro Direto", acoes: "Ações", fiis: "Fundos imobiliários", cripto: "Criptomoedas", fundos: "Fundos", previdencia: "Previdência", poupanca: "Poupança", outros: "Outros",
};
const TIPO_MOV: Record<string, string> = { aporte: "Aporte", resgate: "Resgate", valor: "Atualização de valor" };
const TIPO_RECEITA: Record<string, string> = { comercio: "Comércio", industria: "Indústria", servicos: "Serviços" };
const USO: Record<string, string> = { pessoal: "Pessoal", casal: "Casal", empresarial: "Empresarial", ambos: "Pessoal e empresa" };
const IDIOMA: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol" };
const QUANDO: Record<string, string> = { on_due: "No dia do vencimento", "1_day": "1 dia antes", "3_days": "3 dias antes", "7_days": "7 dias antes" };
const ATIVIDADE: Record<string, string> = { servicos: "Prestação de serviços", comercio: "Comércio", industria: "Indústria" };

const byId = (rows: RawRow[]) => new Map(rows.map((r) => [String(r.id), r]));

export type Built = { id: DatasetId; rows: Row[]; capped: boolean };

/** Linhas de todos os arquivos pedidos. `raw` traz o resultado de cada tarefa do plano. */
export function buildDatasets(raw: Partial<Record<TaskId, TaskResult>>, plan: PlanTask[], opts: ExportOptions, ctx: ExportContext): Built[] {
  const items = effectiveItems(opts, ctx);
  const planById = new Map(plan.map((p) => [p.id, p]));
  const rowsOf = (id: TaskId): RawRow[] => {
    const t = planById.get(id);
    const rows = raw[id]?.rows ?? [];
    return t && t.local.length ? applyFilters(rows, t.local) : rows;
  };
  const allRowsOf = (id: TaskId): RawRow[] => raw[id]?.rows ?? []; // sem filtro: para achar nomes
  const cappedOf = (id: TaskId) => raw[id]?.capped ?? false;

  // Nomes (sempre da lista inteira, pois uma conta/categoria pode estar fora do filtro e ainda ser citada).
  const cats = byId(allRowsOf("categories"));
  const accounts = byId(allRowsOf("accounts"));
  const cards = byId(allRowsOf("credit_cards"));
  const clients = byId(allRowsOf("mei_clients"));
  const suppliers = byId(allRowsOf("mei_suppliers"));
  const debts = byId(allRowsOf("debts"));
  const goals = byId(allRowsOf("goals"));
  const invs = byId(allRowsOf("investments"));
  const lists = byId(allRowsOf("shopping_lists"));
  const nameOf = (m: Map<string, RawRow>, id: unknown): string | null => (id ? str(m.get(String(id))?.name) : null);

  const person = (userId: unknown): string => {
    const id = str(userId);
    if (!id) return "";
    return ctx.members[id] ?? (id === ctx.userId ? "Você" : "Outra pessoa da casa");
  };
  const uso = (b: unknown) => (b === true ? "Empresa" : "Pessoal");
  const catParts = (id: unknown): { categoria: string; subcategoria: string | null } => {
    if (!id) return { categoria: "Sem categoria", subcategoria: null };
    const cat = cats.get(String(id));
    if (!cat) return { categoria: "Sem categoria", subcategoria: null };
    const parent = cat.parent_id ? cats.get(String(cat.parent_id)) : undefined;
    return parent ? { categoria: str(parent.name) ?? "", subcategoria: str(cat.name) } : { categoria: str(cat.name) ?? "", subcategoria: null };
  };
  const instName = (key: unknown) => institutionByKey(str(key))?.name ?? null;

  const out: Built[] = [];
  const push = (id: DatasetId, rows: Row[], cap: TaskId = DATASET_BY_ID.get(id)!.tasks[0]) => out.push({ id, rows, capped: cappedOf(cap) });
  const wants = (id: DatasetId) => items.includes(DATASET_BY_ID.get(id)!.item);

  if (wants("transactions")) {
    push("transactions", rowsOf("transactions").map((r) => {
      const cp = catParts(r.category_id);
      return {
        pessoa: person(r.user_id), data: str(r.date), descricao: str(r.description), tipo: label(TIPO_LANC, r.type), valor: money(r.amount),
        categoria: cp.categoria, subcategoria: cp.subcategoria, conta: nameOf(accounts, r.account_id), cartao_credito: nameOf(cards, r.card_id), cartao_debito: nameOf(cards, r.debit_card_id),
        fatura: str(r.invoice_month), parcela: int(r.installment_number), total_parcelas: int(r.installment_total), pessoal_empresa: uso(r.is_business),
        tipo_receita_mei: label(TIPO_RECEITA, r.revenue_kind), cliente: nameOf(clients, r.client_id), fornecedor: nameOf(suppliers, r.supplier_id), retirada_do_socio: bool(r.is_owner_draw), recorrente: bool(r.is_recurring), anexo: str(r.attachment_name),
      };
    }));
  }

  if (wants("accounts")) {
    const balances = new Map(allRowsOf("account_balances").map((b) => [String(b.id), money(b.balance)]));
    push("accounts", rowsOf("accounts").map((r) => ({
      pessoa: person(r.user_id), nome: str(r.name), tipo: label(TIPO_CONTA, r.kind), instituicao: instName(r.institution), saldo_inicial: money(r.initial_balance),
      saldo_atual: balances.get(String(r.id)) ?? null, pessoal_empresa: uso(r.is_business), arquivada: bool(r.archived), criada_em: str(r.created_at),
    })));
  }

  if (wants("cards")) {
    push("cards", rowsOf("credit_cards").map((r) => ({
      pessoa: person(r.user_id), nome: str(r.name), tipo: label(TIPO_CARTAO, r.kind), bandeira: label(BANDEIRA, r.brand), instituicao: instName(r.institution), limite: money(r.credit_limit),
      dia_fechamento: int(r.closing_day), dia_vencimento: int(r.due_day), conta_pagamento: nameOf(accounts, r.pay_account_id), pessoal_empresa: uso(r.is_business),
      arquivado: bool(r.archived), criado_em: str(r.created_at),
    })));
  }

  if (wants("invoice_payments")) {
    let rows = rowsOf("card_invoice_payments");
    // Sem marcação própria: a fatura é da empresa se o cartão é da empresa.
    if (opts.scope !== "ambos") rows = rows.filter((r) => (cards.get(String(r.card_id))?.is_business === true) === (opts.scope === "empresa"));
    push("invoice_payments", rows.map((r) => ({
      pessoa: person(r.user_id), cartao: nameOf(cards, r.card_id), fatura: str(r.invoice_month), valor: money(r.amount), pago_em: str(r.paid_on),
      conta: nameOf(accounts, r.account_id), pessoal_empresa: uso(cards.get(String(r.card_id))?.is_business),
    })));
  }

  if (wants("installments")) {
    const rows = allRowsOf("installment_rows");
    const cardCfg = allRowsOf("credit_cards").map((k) => ({ id: String(k.id), closing_day: Number(k.closing_day), due_day: Number(k.due_day) }));
    const input: InstallmentRow[] = rows.map((r) => ({
      id: String(r.id), user_id: String(r.user_id), card_id: str(r.card_id), description: String(r.description ?? ""), amount: Number(r.amount), date: String(r.date),
      invoice_month: str(r.invoice_month), installment_group: str(r.installment_group), installment_number: int(r.installment_number), installment_total: int(r.installment_total),
      category_id: str(r.category_id), is_business: r.is_business === true,
    }));
    const sums = new Map<string, { sum: number; first: string; business: boolean }>();
    for (const r of input) {
      if (!r.installment_group || !r.invoice_month) continue;
      const cur = sums.get(r.installment_group);
      const month = `${r.invoice_month.slice(0, 7)}-01`;
      sums.set(r.installment_group, { sum: (cur?.sum ?? 0) + Number(r.amount), first: cur && cur.first < month ? cur.first : month, business: cur?.business ?? r.is_business === true });
    }
    const plans = buildPlans(input, ctx.today, cardCfg);
    push("installments", plans.map((p) => {
      const s = sums.get(p.group);
      return {
        pessoa: person(p.userId), compra: p.name, cartao: nameOf(cards, p.cardId), valor_parcela: round2(p.perInstallment), total_parcelas: p.total,
        valor_total: round2((s?.sum ?? 0) + p.missingRows * p.perInstallment), parcelas_vencidas: p.paidCount, parcelas_a_vencer: p.remainingCount, valor_a_vencer: p.remainingAmount,
        primeira_fatura: s?.first ?? null, proxima_fatura: p.nextInvoiceMonth, ultima_fatura: p.lastInvoiceMonth, parcelas_nao_lancadas: p.missingRows, pessoal_empresa: uso(s?.business),
      };
    }), "installment_rows");
  }

  if (wants("bills")) {
    push("bills", rowsOf("bills").map((r) => ({
      pessoa: person(r.user_id), vencimento: str(r.due_date), descricao: str(r.description), tipo: r.type === "income" ? "A receber" : "A pagar", valor: money(r.amount),
      situacao: r.status === "paid" ? "Paga" : "Pendente", paga_em: str(r.paid_at), repete: r.recurrence === "monthly" ? "Todo mês" : "Não repete",
      divida: nameOf(debts, r.debt_id), pessoal_empresa: uso(r.is_business), tipo_receita_mei: label(TIPO_RECEITA, r.revenue_kind), cliente: nameOf(clients, r.client_id), fornecedor: nameOf(suppliers, r.supplier_id), criada_em: str(r.created_at),
    })));
  }

  if (wants("debts")) {
    const ds = rowsOf("debts");
    push("debts", ds.map((r) => ({
      pessoa: person(r.user_id), nome: str(r.name), tipo: label(TIPO_DIVIDA, r.kind), credor: str(r.creditor), situacao: label(SITUACAO_DIVIDA, r.status), saldo: money(r.balance),
      valor_original: money(r.original_amount), juros_mes: num(r.monthly_rate), pagamento_minimo: money(r.min_payment), atrasada_desde: str(r.overdue_since), essencial: bool(r.essential),
      proposta_a_vista: money(r.cash_offer), acordo_parcelas: int(r.agreement_installments), acordo_valor_parcela: money(r.agreement_amount), acordo_primeiro_vencimento: str(r.agreement_first_due),
      arquivada: bool(r.archived), criada_em: str(r.created_at),
    })));
    const kept = new Set(ds.map((d) => String(d.id)));
    push("debt_payments", rowsOf("debt_payments").filter((p) => kept.has(String(p.debt_id))).map((p) => ({
      pessoa: person(debts.get(String(p.debt_id))?.user_id), divida: nameOf(debts, p.debt_id), valor: money(p.amount), pago_em: str(p.paid_on),
    })));
  }

  if (wants("goals")) {
    const gs = rowsOf("goals");
    const meta = (v: unknown): Cell => (v && typeof v === "object" && Object.keys(v as object).length > 0 ? (v as Record<string, unknown>) : null);
    push("goals", gs.map((r) => ({
      pessoa: person(r.user_id), nome: str(r.name), tipo: label(TIPO_OBJETIVO, r.type), situacao: label(SITUACAO_OBJETIVO, r.status), valor_alvo: money(r.target_amount),
      valor_atual: money(r.current_amount), prazo: str(r.deadline), detalhes: meta(r.metadata), criado_em: str(r.created_at),
    })));
    const kept = new Set(gs.map((g) => String(g.id)));
    push("goal_contributions", rowsOf("goal_contributions").filter((p) => kept.has(String(p.goal_id))).map((p) => ({
      pessoa: person(goals.get(String(p.goal_id))?.user_id), objetivo: nameOf(goals, p.goal_id), valor: money(p.amount), data: str(p.date),
    })));
  }

  if (wants("driver_shifts")) {
    const cars = byId(allRowsOf("driver_vehicles"));
    push("driver_shifts", rowsOf("driver_shifts").map((r) => {
      const sh = normalizeShift(r);
      const m = shiftMetrics(sh);
      return {
        data: sh.date, carro: nameOf(cars, sh.vehicle_id), inicio: sh.start_time ? sh.start_time.slice(0, 5) : null, fim: sh.end_time ? sh.end_time.slice(0, 5) : null,
        horas: m.hours || null, km: m.km, plataformas: sh.earnings.map((e) => `${platformOf(e.platform).name} ${e.amount.toFixed(2).replace(".", ",")}`).join(" | ") || null,
        ganho_bruto: m.gross, gorjetas: m.tips, combustivel: m.fuel, custo_carro: m.vehicle, outros_gastos: m.extras, despesas: m.expenses, lucro_liquido: m.net,
        lucro_por_hora: m.netPerHour, lucro_por_km: m.netPerKm, observacoes: sh.notes,
      };
    }));
    push("driver_vehicles", rowsOf("driver_vehicles").map((r) => ({
      nome: str(r.name), combustivel: isFuel(r.fuel) ? FUELS[r.fuel].label : str(r.fuel), media: num(r.efficiency), preco_combustivel: money(r.fuel_price),
      media_etanol: r.efficiency_alt == null ? null : num(r.efficiency_alt), preco_etanol: r.fuel_price_alt == null ? null : money(r.fuel_price_alt),
      custo_por_km: money(r.cost_per_km), aluguel_dia: money(r.daily_rent), arquivado: bool(r.archived), criado_em: str(r.created_at),
    })));
  }

  if (wants("budgets")) {
    push("budgets", rowsOf("budgets").map((r) => {
      const cp = r.category_id ? catParts(r.category_id) : { categoria: "Limite geral do mês", subcategoria: null };
      return { pessoa: person(r.user_id), categoria: cp.categoria, subcategoria: cp.subcategoria, limite: money(r.amount_limit) };
    }));
  }

  if (wants("investments")) {
    push("investments", rowsOf("investments").map((r) => ({
      pessoa: person(r.user_id), nome: str(r.name), tipo: label(TIPO_INVEST, r.kind), instituicao: str(r.institution), investido: money(r.invested), valor_atual: money(r.current_value),
      resultado: money((num(r.current_value) ?? 0) - (num(r.invested) ?? 0)), arquivado: bool(r.archived), criado_em: str(r.created_at), atualizado_em: str(r.updated_at),
    })));
    push("investment_movements", rowsOf("investment_movements").map((r) => ({
      pessoa: person(r.user_id), data: str(r.moved_on), investimento: nameOf(invs, r.investment_id), tipo: label(TIPO_MOV, r.kind), valor: money(r.amount),
      valor_apos: money(r.value_after), conta: nameOf(accounts, r.account_id), observacao: str(r.note),
    })));
  }

  if (wants("categories")) {
    const all = allRowsOf("categories");
    const flags = rowsOf("category_flags").map((f) => ({ category_id: String(f.category_id), is_essential: bool(f.is_essential), is_benefit: bool(f.is_benefit) }));
    const cls = buildClassifier(all.map((k) => ({ id: String(k.id), name: String(k.name), parent_id: str(k.parent_id) })), flags);
    const rows = rowsOf("categories").map((r) => {
      const cp = catParts(r.id);
      const own = str(r.user_id);
      return {
        tipo: label(TIPO_LANC, r.type), categoria: cp.categoria, subcategoria: cp.subcategoria,
        origem: r.is_default === true || !own ? "Padrão do Jakash" : own === ctx.userId ? "Criada por você" : `Criada por ${person(own)}`,
        essencial: r.type === "expense" ? cls.isEssential(String(r.id)) : null, beneficio: r.type === "income" ? cls.isBenefit(String(r.id)) : null,
      } satisfies Row;
    });
    const coll = (a: Cell, b: Cell) => String(a ?? "").localeCompare(String(b ?? ""), "pt-BR");
    rows.sort((a, b) => coll(a.tipo, b.tipo) || coll(a.categoria, b.categoria) || coll(a.subcategoria, b.subcategoria));
    push("categories", rows);
  }

  if (wants("shopping_lists")) {
    const ls = rowsOf("shopping_lists");
    push("shopping_lists", ls.map((r) => ({
      pessoa: person(r.user_id), nome: str(r.name), situacao: r.status === "done" ? "Concluída" : "Aberta", pessoal_empresa: uso(r.is_business), gerou_lancamento: r.transaction_id ? true : false,
      criada_em: str(r.created_at), concluida_em: str(r.finished_at),
    })));
    const kept = new Set(ls.map((l) => String(l.id)));
    push("shopping_items", rowsOf("shopping_items").filter((i) => kept.has(String(i.list_id))).map((i) => ({
      pessoa: person(lists.get(String(i.list_id))?.user_id), lista: nameOf(lists, i.list_id), item: str(i.name), quantidade: num(i.quantity), unidade: str(i.unit),
      preco_estimado: money(i.est_price), comprado: bool(i.checked), comprado_em: str(i.checked_at),
    })));
  }

  if (wants("mei_clients") || wants("mei_invoices")) {
    push("mei_clients", rowsOf("mei_clients").map((r) => ({
      nome: str(r.name), documento: str(r.document), telefone: str(r.phone), email: str(r.email),
      cep: str(r.cep), logradouro: str(r.address), numero: str(r.address_number), complemento: str(r.address_complement), bairro: str(r.neighborhood), municipio: str(r.city), uf: str(r.uf),
      observacoes: str(r.notes), arquivado: bool(r.archived), criado_em: str(r.created_at),
    })));
    push("mei_suppliers", rowsOf("mei_suppliers").map((r) => ({
      nome: str(r.name), fornece: str(r.category), documento: str(r.document), telefone: str(r.phone), email: str(r.email), chave_pix: str(r.pix_key),
      observacoes: str(r.notes), arquivado: bool(r.archived), criado_em: str(r.created_at),
    })));
    push("mei_invoices", rowsOf("mei_invoices").map((r) => ({
      numero: int(r.invoice_number), data: str(r.invoice_date), cliente: nameOf(clients, r.client_id) ?? str(r.client_name), valor: money(r.value), observacoes: str(r.notes),
    })));
    push("mei_items", rowsOf("mei_items").map((r) => ({
      tipo: r.kind === "produto" ? "Produto" : "Serviço", nome: str(r.name), descricao: str(r.description), valor_padrao: money(r.unit_price), unidade: str(r.unit),
      codigo_tributacao_nacional: str(r.ctrib_nac), nbs: str(r.nbs), codigo_municipio: str(r.municipal_code), ncm: str(r.ncm), cfop: str(r.cfop),
      arquivado: bool(r.archived), criado_em: str(r.created_at),
    })));
  }

  if (wants("profile")) {
    const p = rowsOf("profile")[0];
    push("profile", p ? [profileRow(p)] : []);
  }

  return out;
}

/** Linha do perfil. Só lê as colunas permitidas (profileColumns), mesmo que a consulta traga mais. */
export function profileRow(p: RawRow): Row {
  return {
    nome: str(p.full_name), tipo_de_uso: label(USO, p.usage_type), idioma: label(IDIOMA, p.language), moeda: str(p.currency), data_nascimento: str(p.birth_date), cor_destaque: str(p.accent),
    avisos_ativos: bool(p.notify_enabled), avisos_email: bool(p.notify_email), avisos_push: bool(p.notify_push), avisos_quando: label(QUANDO, p.notify_when), cadastro_em: str(p.created_at),
    negocio_nome: str(p.business_name), negocio_cnpj: str(p.business_cnpj), mei_atividade: label(ATIVIDADE, p.mei_activity), mei_abertura: str(p.mei_opened_on), mei_limite_anual: money(p.mei_annual_limit),
    negocio_municipio: str(p.business_municipio), negocio_uf: str(p.business_uf), negocio_inscricao_municipal: str(p.business_im), negocio_cep: str(p.business_cep), negocio_endereco: str(p.business_address),
  };
}

// ---------------------------------------------------------------------------
// Arquivos de saída
// ---------------------------------------------------------------------------
export type SummaryLine = { id: DatasetId; file: string; title: string; count: number; capped: boolean };
export type OutFile = { name: string; content: string };

export const scopeLabel = (s: Scope) => (s === "pessoal" ? "Só pessoal" : s === "empresa" ? "Só empresa" : "Pessoal e empresa");

export function periodLabel(opts: Pick<ExportOptions, "from" | "to">): string {
  if (!opts.from && !opts.to) return "Tudo (sem filtro de período)";
  if (opts.from && opts.to) return `De ${formatDateBR(opts.from)} até ${formatDateBR(opts.to)}`;
  return opts.from ? `A partir de ${formatDateBR(opts.from)}` : `Até ${formatDateBR(opts.to)}`;
}

export const exportFileName = (format: ExportFormat, today: string): string => `jakash-dados-${today}.${format === "json" ? "json" : "zip"}`;

export function summarize(built: Built[], opts: ExportOptions, ctx: ExportContext): SummaryLine[] {
  return built.map((b) => {
    const ds = DATASET_BY_ID.get(b.id)!;
    return { id: b.id, file: ds.file, title: ds.title, count: b.rows.length, capped: b.capped };
  }).filter((l) => effectiveItems(opts, ctx).includes(DATASET_BY_ID.get(l.id)!.item));
}

export function buildReadme(opts: ExportOptions, ctx: ExportContext, summary: SummaryLine[]): string {
  const ids = new Set(summary.map((s) => s.id));
  const nl = "\r\n";
  const lines: string[] = [
    "JAKASH: SEUS DADOS",
    `Exportado em: ${formatDateTimeBR(ctx.now.toISOString())}`,
    "",
    "FILTROS USADOS",
    `Período: ${periodLabel(opts)}`,
    ...(ctx.isMei ? [`Tipo: ${scopeLabel(opts.scope)}`] : []),
    `Pessoas: ${opts.household ? "Você e as outras pessoas da casa" : "Só os seus dados"}`,
    "",
    "ARQUIVOS",
    ...summary.map((s) => {
      const ds = DATASET_BY_ID.get(s.id)!;
      return `${s.file}: ${ds.description} (${s.count} ${s.count === 1 ? "linha" : "linhas"})`;
    }),
    "",
    "COMO ABRIR",
    "Os arquivos são CSV com ponto e vírgula (;) e UTF-8.",
    "No Excel ou no Numbers, abra o arquivo direto. Se os acentos saírem errados, importe como UTF-8.",
    "Datas no formato dd/mm/aaaa. Valores com vírgula nos centavos, sem R$.",
    "Texto que começa com =, +, - ou @ ganha um apóstrofo (') na frente. É uma proteção da planilha.",
  ];
  const notes: string[] = [];
  const capped = summary.filter((s) => s.capped);
  for (const s of capped) notes.push(`${s.file} foi cortado em ${MAX_ROWS_PER_TABLE.toLocaleString("pt-BR")} linhas. Há mais dados. Use o filtro de período para exportar o resto.`);
  if (ids.has("accounts")) notes.push("O saldo das contas é o de hoje, no dia da exportação. Contas arquivadas ficam sem saldo.");
  if (ids.has("installments")) notes.push("Os parcelamentos não usam o filtro de período. Cada parcela está em lancamentos.csv.");
  if (ids.has("transactions")) notes.push("Comprovantes anexados não vão junto. Só o nome do arquivo aparece.");
  if (opts.scope !== "ambos") notes.push("O filtro Pessoal/Empresa vale onde existe essa marca: lançamentos, contas, cartões, contas a pagar e listas de compras. Pagamentos de fatura seguem o cartão. O resto sai completo.");
  if (opts.from || opts.to) notes.push("O período vale para lançamentos (data), contas a pagar e receber (vencimento), pagamentos de fatura e de dívida, aportes, movimentações de investimento e recibos.");
  if (opts.household) notes.push("A coluna Pessoa mostra de quem é cada linha.");
  if (notes.length) lines.push("", "AVISOS", ...notes);
  return CSV_BOM + lines.join(nl) + nl;
}

export function buildCsvFiles(built: Built[], opts: ExportOptions, ctx: ExportContext, summary: SummaryLine[]): OutFile[] {
  const files: OutFile[] = built.map((b) => {
    const ds = DATASET_BY_ID.get(b.id)!;
    return { name: ds.file, content: toCsv(columnsFor(ds, opts, ctx), b.rows) };
  }).filter((f) => summary.some((s) => s.file === f.name));
  files.push({ name: "LEIA-ME.txt", content: buildReadme(opts, ctx, summary) });
  return files;
}

export function buildJson(built: Built[], opts: ExportOptions, ctx: ExportContext, summary: SummaryLine[]): string {
  const dados: Record<string, unknown> = {};
  const contagens: Record<string, number> = {};
  for (const b of built) {
    const ds = DATASET_BY_ID.get(b.id)!;
    if (!summary.some((s) => s.id === b.id)) continue;
    const cols = columnsFor(ds, opts, ctx);
    const rows = b.rows.map((r) => Object.fromEntries(cols.map((col) => [col.key, jsonValue(col.kind, r[col.key] ?? null)])));
    dados[ds.jsonKey] = ds.single ? rows[0] ?? null : rows;
    contagens[ds.jsonKey] = rows.length;
  }
  const avisos = summary.filter((s) => s.capped).map((s) => `${s.title} foi cortado em ${MAX_ROWS_PER_TABLE} linhas.`);
  return JSON.stringify({
    aplicativo: "Jakash",
    versao_do_formato: 1,
    exportado_em: ctx.now.toISOString(),
    filtros: {
      periodo: { de: opts.from, ate: opts.to },
      tipo: opts.scope,
      incluir_outras_pessoas_da_casa: opts.household,
      itens: effectiveItems(opts, ctx),
    },
    avisos,
    contagens,
    dados,
  }, null, 2);
}

/** .zip com os CSVs e o LEIA-ME.txt. jszip só é carregado na hora de exportar. */
export async function buildZip(files: OutFile[]): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------
export type Progress = { step: number; steps: number; label: string; count: number; done: boolean };
export type ExportResult = {
  fileName: string;
  mime: string;
  data: string | Uint8Array;
  summary: SummaryLine[];
  totalRows: number;
};

/** "Lendo lançamentos… 2.000" */
export const progressText = (p: Pick<Progress, "label" | "count">): string => `Lendo ${p.label}… ${p.count.toLocaleString("pt-BR")}`;

export async function runExport(
  client: ClientLike, opts: ExportOptions, ctx: ExportContext, onProgress: (p: Progress) => void = () => {}, signal?: { aborted: boolean },
): Promise<ExportResult> {
  const problem = validateOptions(opts, ctx);
  if (problem) throw new ExportError(problem);
  const plan = buildQueryPlan(opts, ctx);
  const raw: Partial<Record<TaskId, TaskResult>> = {};
  for (let i = 0; i < plan.length; i++) {
    const task = plan[i];
    const base = { step: i + 1, steps: plan.length, label: task.label };
    onProgress({ ...base, count: 0, done: false });
    raw[task.id] = await fetchTask(client, task, (n) => onProgress({ ...base, count: n, done: false }), signal);
    onProgress({ ...base, count: raw[task.id]!.rows.length, done: true });
  }
  const built = buildDatasets(raw, plan, opts, ctx);
  const summary = summarize(built, opts, ctx);
  const totalRows = summary.reduce((s, l) => s + l.count, 0);
  const fileName = exportFileName(opts.format, ctx.today);
  if (opts.format === "json") {
    return { fileName, mime: "application/json;charset=utf-8", data: buildJson(built, opts, ctx, summary), summary, totalRows };
  }
  const data = await buildZip(buildCsvFiles(built, opts, ctx, summary));
  return { fileName, mime: "application/zip", data, summary, totalRows };
}

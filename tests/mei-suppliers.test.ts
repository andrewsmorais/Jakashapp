// Testes offline dos fornecedores do MEI: documento, cadastro, busca, totais por fornecedor e a migração.
// Rodar: npm run test:suppliers
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_SUGGESTIONS, EMPTY_SUPPLIER_FORM, SUPPLIER_LIMITS, documentKind, filterSuppliers, formatDocument, normalizeText, onlyDigits, overallTotals, summarizeSuppliers,
  supplierRow, supplierToForm, validateDocument, type PayableRow, type PurchaseRow, type Supplier, type SupplierForm,
} from "../src/lib/meiSuppliers";

let pass = 0;
const t = (name: string, fn: () => void) => { try { fn(); pass++; } catch (e) { console.error(`FALHOU: ${name}`); throw e; } };

const form = (patch: Partial<SupplierForm> = {}): SupplierForm => ({ ...EMPTY_SUPPLIER_FORM, name: "Papelaria Central", ...patch });

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------
t("Documento: só dígitos", () => {
  assert.equal(onlyDigits("12.345.678/0001-90"), "12345678000190");
  assert.equal(onlyDigits(null), "");
  assert.equal(onlyDigits(undefined), "");
});

t("Documento: CPF tem 11, CNPJ tem 14, vazio vale", () => {
  assert.equal(documentKind("123.456.789-01"), "cpf");
  assert.equal(documentKind("12.345.678/0001-90"), "cnpj");
  assert.equal(documentKind("123456789"), null);
  assert.equal(validateDocument(""), null);
  assert.equal(validateDocument("   "), null);
  assert.equal(validateDocument(null), null);
  assert.equal(validateDocument("12345678901"), null);
  assert.equal(validateDocument("12.345.678/0001-90"), null);
  assert.match(validateDocument("1234567")!, /11 números/);
  assert.match(validateDocument("123456789012")!, /14/); // 12 dígitos não é CPF nem CNPJ
  assert.match(validateDocument("123456789012345")!, /14/); // 15 dígitos
});

t("Documento: máscara de CPF e CNPJ; outro tamanho volta como veio", () => {
  assert.equal(formatDocument("12345678901"), "123.456.789-01");
  assert.equal(formatDocument("12345678000190"), "12.345.678/0001-90");
  assert.equal(formatDocument("12.345.678/0001-90"), "12.345.678/0001-90");
  assert.equal(formatDocument("12345"), "12345");
  assert.equal(formatDocument(null), "");
});

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------
t("Cadastro: só o nome é obrigatório; vazios viram null", () => {
  const r = supplierRow(form({ name: "  Papelaria Central  " }));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.row, { name: "Papelaria Central", document: null, phone: null, email: null, pix_key: null, category: null, notes: null });
  const bad = supplierRow(form({ name: "   " }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /nome/);
});

t("Cadastro: documento vai só com dígitos e é conferido", () => {
  const ok = supplierRow(form({ document: "12.345.678/0001-90" }));
  assert.ok(ok.ok && ok.row.document === "12345678000190");
  const cpf = supplierRow(form({ document: "123.456.789-01" }));
  assert.ok(cpf.ok && cpf.row.document === "12345678901");
  const bad = supplierRow(form({ document: "12.345" }));
  assert.equal(bad.ok, false);
});

t("Cadastro: limites iguais aos do banco", () => {
  assert.ok(supplierRow(form({ name: "a".repeat(SUPPLIER_LIMITS.name) })).ok);
  assert.equal(supplierRow(form({ name: "a".repeat(SUPPLIER_LIMITS.name + 1) })).ok, false);
  assert.ok(supplierRow(form({ pix_key: "x".repeat(SUPPLIER_LIMITS.pix_key) })).ok);
  assert.equal(supplierRow(form({ pix_key: "x".repeat(SUPPLIER_LIMITS.pix_key + 1) })).ok, false);
  assert.ok(supplierRow(form({ notes: "n".repeat(SUPPLIER_LIMITS.notes) })).ok);
  assert.equal(supplierRow(form({ notes: "n".repeat(SUPPLIER_LIMITS.notes + 1) })).ok, false);
  assert.equal(supplierRow(form({ phone: "1".repeat(SUPPLIER_LIMITS.phone + 1) })).ok, false);
  assert.equal(supplierRow(form({ category: "c".repeat(SUPPLIER_LIMITS.category + 1) })).ok, false);
  assert.equal(supplierRow(form({ email: `${"e".repeat(SUPPLIER_LIMITS.email)}@x.com` })).ok, false);
});

t("Cadastro: e-mail inválido é recusado, válido passa", () => {
  assert.equal(supplierRow(form({ email: "sem-arroba" })).ok, false);
  assert.equal(supplierRow(form({ email: "a@b" })).ok, false);
  const ok = supplierRow(form({ email: " vendas@papelaria.com.br " }));
  assert.ok(ok.ok && ok.row.email === "vendas@papelaria.com.br");
});

t("Cadastro: ida e volta com o formulário de edição", () => {
  const s: Supplier = {
    id: "s1", name: "Embalagens Sul", document: "12345678000190", phone: "(51) 99999-0000", email: null, pix_key: "12345678000190",
    category: "Embalagens", notes: null, archived: false,
  };
  const f = supplierToForm(s);
  assert.equal(f.document, "12.345.678/0001-90");
  assert.equal(f.email, "");
  const back = supplierRow(f);
  assert.ok(back.ok);
  if (back.ok) assert.deepEqual(back.row, { name: s.name, document: s.document, phone: s.phone, email: null, pix_key: s.pix_key, category: s.category, notes: null });
  assert.ok(CATEGORY_SUGGESTIONS.every((c) => c.length <= SUPPLIER_LIMITS.category));
});

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------
const sup = (id: string, name: string, patch: Partial<Supplier> = {}): Supplier => ({
  id, name, document: null, phone: null, email: null, pix_key: null, category: null, notes: null, archived: false, ...patch,
});
const list: Supplier[] = [
  sup("a", "Zé das Embalagens", { category: "Embalagens", phone: "(51) 99999-1234" }),
  sup("b", "Ágata Tecidos", { category: "Matéria-prima", document: "12345678000190", email: "ventas@agata.com" }),
  sup("c", "Casa do Frete", { archived: true, category: "Frete e entrega" }),
];

t("Busca: sem acento, por nome, categoria, telefone, documento e e-mail", () => {
  assert.equal(normalizeText("  Matéria-PRIMA "), "materia-prima");
  assert.deepEqual(filterSuppliers(list, "agata", false).map((s) => s.id), ["b"]);
  assert.deepEqual(filterSuppliers(list, "materia", false).map((s) => s.id), ["b"]);
  assert.deepEqual(filterSuppliers(list, "embalagens", false).map((s) => s.id), ["a"]);
  assert.deepEqual(filterSuppliers(list, "99999", false).map((s) => s.id), ["a"]);
  assert.deepEqual(filterSuppliers(list, "12.345.678", false).map((s) => s.id), ["b"]);
  assert.deepEqual(filterSuppliers(list, "agata.com", false).map((s) => s.id), ["b"]);
  assert.deepEqual(filterSuppliers(list, "nada", false), []);
});

t("Busca: arquivados só quando pedidos; ordem alfabética sem ligar para acento", () => {
  assert.deepEqual(filterSuppliers(list, "", false).map((s) => s.id), ["b", "a"]); // Ágata antes de Zé
  assert.deepEqual(filterSuppliers(list, "", true).map((s) => s.id), ["b", "c", "a"]);
  assert.deepEqual(filterSuppliers(list, "frete", false), []);
  assert.deepEqual(filterSuppliers(list, "frete", true).map((s) => s.id), ["c"]);
  assert.equal(list[0].id, "a"); // não embaralha a lista de entrada
});

// ---------------------------------------------------------------------------
// Totais por fornecedor
// ---------------------------------------------------------------------------
const TODAY = "2026-10-23";
const p = (id: string, supplier_id: string | null, amount: number, date: string): PurchaseRow => ({ id, supplier_id, amount, date, description: `Compra ${id}` });
const b = (id: string, supplier_id: string | null, amount: number, due_date: string): PayableRow => ({ id, supplier_id, amount, due_date, description: `Conta ${id}` });

t("Totais: mês e ano pela data do lançamento", () => {
  const m = summarizeSuppliers([
    p("1", "A", 100, "2026-10-01"), p("2", "A", 50.5, "2026-10-23"), p("3", "A", 200, "2026-09-30"), p("4", "A", 10, "2026-01-01"),
    p("5", "A", 999, "2025-12-31"), p("6", "A", 5, "2026-11-01"),
  ], [], TODAY);
  const a = m.get("A")!;
  assert.equal(a.month, 150.5);
  assert.equal(a.year, 150.5 + 200 + 10 + 5); // inclui parcela lançada para novembro deste ano, fora o ano passado
  assert.equal(a.purchaseCount, 6);
});

t("Totais: centavos somam sem erro de ponto flutuante", () => {
  const m = summarizeSuppliers([p("1", "A", 0.1, "2026-10-02"), p("2", "A", 0.2, "2026-10-03"), p("3", "A", 33.33, "2026-10-04")], [], TODAY);
  assert.equal(m.get("A")!.month, 33.63);
});

t("Totais: linhas sem fornecedor ou de outro fornecedor não entram", () => {
  const m = summarizeSuppliers([p("1", null, 500, "2026-10-05"), p("2", "A", 10, "2026-10-05"), p("3", "B", 20, "2026-10-05")], [b("x", null, 70, "2026-10-30")], TODAY);
  assert.deepEqual([...m.keys()].sort(), ["A", "B"]);
  assert.equal(m.get("A")!.month, 10);
  assert.equal(m.get("B")!.month, 20);
  assert.equal(m.get("A")!.openTotal, 0);
});

t("A pagar: total, vencidas, próximo vencimento e ordem", () => {
  const m = summarizeSuppliers([], [
    b("1", "A", 300, "2026-11-10"), b("2", "A", 120.4, "2026-10-20"), b("3", "A", 80, "2026-10-23"), b("4", "A", 50, "2026-10-28"), b("5", "B", 15, "2026-12-01"),
  ], TODAY);
  const a = m.get("A")!;
  assert.equal(a.openTotal, 550.4);
  assert.equal(a.openCount, 4);
  assert.equal(a.overdueTotal, 120.4); // venceu dia 20; a de hoje ainda não está vencida
  assert.equal(a.overdueCount, 1);
  assert.equal(a.nextDue, "2026-10-20");
  assert.deepEqual(a.open.map((x) => x.id), ["2", "3", "4", "1"]);
  const bb = m.get("B")!;
  assert.equal(bb.nextDue, "2026-12-01");
  assert.equal(bb.overdueCount, 0);
  assert.equal(bb.month, 0);
});

t("Histórico: as 10 compras mais recentes, da mais nova para a mais antiga", () => {
  const rows = Array.from({ length: 14 }, (_, i) => p(`p${String(i).padStart(2, "0")}`, "A", i + 1, `2026-0${(i % 9) + 1}-1${i % 9}`));
  const a = summarizeSuppliers(rows, [], TODAY).get("A")!;
  assert.equal(a.recent.length, 10);
  assert.equal(a.purchaseCount, 14);
  const dates = a.recent.map((x) => x.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(summarizeSuppliers(rows, [], TODAY, 3).get("A")!.recent.length, 3);
  // mesma data: desempate estável pelo id (o mais novo primeiro)
  const tie = summarizeSuppliers([p("a1", "A", 1, "2026-10-01"), p("a2", "A", 2, "2026-10-01")], [], TODAY).get("A")!;
  assert.deepEqual(tie.recent.map((x) => x.id), ["a2", "a1"]);
});

t("Totais gerais somam todos os fornecedores", () => {
  const m = summarizeSuppliers(
    [p("1", "A", 100.1, "2026-10-05"), p("2", "B", 200.2, "2026-10-06"), p("3", "B", 50, "2026-02-06")],
    [b("1", "A", 30, "2026-10-01"), b("2", "B", 70.7, "2026-11-01")],
    TODAY,
  );
  const o = overallTotals(m.values());
  assert.equal(o.month, 300.3);
  assert.equal(o.year, 350.3);
  assert.equal(o.open, 100.7);
  assert.equal(o.openCount, 2);
  assert.equal(o.overdue, 30);
  assert.equal(o.overdueCount, 1);
  assert.deepEqual(overallTotals([]), { month: 0, year: 0, open: 0, openCount: 0, overdue: 0, overdueCount: 0 });
});

t("Valores inválidos viram zero em vez de quebrar a soma", () => {
  const m = summarizeSuppliers([p("1", "A", Number.NaN, "2026-10-05"), p("2", "A", 10, "2026-10-05")], [b("1", "A", Number.NaN, "2026-10-25")], TODAY);
  assert.equal(m.get("A")!.month, 10);
  assert.equal(m.get("A")!.openTotal, 0);
});

// ---------------------------------------------------------------------------
// Migração (texto): trava o que não pode se perder
// ---------------------------------------------------------------------------
const mig = (name: string) => readFileSync(join(__dirname, "..", "supabase", "migrations", name), "utf8");
const up = mig("20261023070000_mei_suppliers.sql");
const down = mig("20261023070000_mei_suppliers_down.sql");

t("Migração: tabela com RLS do dono, sem acesso anônimo", () => {
  assert.match(up, /CREATE TABLE IF NOT EXISTS public\.mei_suppliers/);
  assert.match(up, /user_id UUID NOT NULL DEFAULT auth\.uid\(\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(up, /ALTER TABLE public\.mei_suppliers ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /USING \(auth\.uid\(\) = user_id\) WITH CHECK \(auth\.uid\(\) = user_id\)/);
  assert.match(up, /REVOKE ALL ON public\.mei_suppliers FROM anon/);
  assert.match(up, /document ~ '\^\[0-9\]\{1,14\}\$'/);
  assert.match(up, /char_length\(pix_key\) <= 140/);
  assert.match(up, /char_length\(notes\) <= 500/);
});

t("Migração: supplier_id em lançamentos e contas, com índice, e checagem de dono", () => {
  for (const tbl of ["transactions", "bills"]) {
    assert.match(up, new RegExp(`ALTER TABLE public\\.${tbl} ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public\\.mei_suppliers\\(id\\) ON DELETE SET NULL`));
    assert.match(up, new RegExp(`CREATE OR REPLACE TRIGGER trg_${tbl}_supplier_owner`));
  }
  assert.match(up, /CREATE INDEX IF NOT EXISTS idx_transactions_supplier/);
  assert.match(up, /CREATE INDEX IF NOT EXISTS idx_bills_supplier/);
  assert.match(up, /s\.user_id = NEW\.user_id/);
  assert.match(up, /SECURITY DEFINER SET search_path = public, pg_temp/);
  assert.match(up, /REVOKE EXECUTE ON FUNCTION public\.check_supplier_owner\(\) FROM PUBLIC, anon, authenticated/);
});

t("Migração: dar baixa leva o fornecedor e mantém o resto (dívida de acordo, recorrência)", () => {
  assert.match(up, /INSERT INTO public\.transactions \(user_id, amount, description, type, date, origin, is_business, revenue_kind, client_id, supplier_id\)/);
  assert.match(up, /b\.client_id, b\.supplier_id\);/);
  assert.match(up, /INSERT INTO public\.bills \(user_id, description, amount, due_date, type, recurrence, is_business, revenue_kind, client_id, supplier_id\)/);
  assert.match(up, /debt_payments/);
  assert.match(up, /status = 'quitada'/);
  assert.match(up, /SECURITY INVOKER/);
});

t("Migração de volta: restaura a baixa anterior e remove tudo que foi criado", () => {
  assert.match(down, /DROP TRIGGER IF EXISTS trg_transactions_supplier_owner/);
  assert.match(down, /DROP TRIGGER IF EXISTS trg_bills_supplier_owner/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.check_supplier_owner\(\)/);
  assert.match(down, /CREATE OR REPLACE FUNCTION public\.mark_bill_paid/);
  assert.equal(/supplier_id\)\s*VALUES/.test(down), false); // a baixa de volta não grava fornecedor
  assert.match(down, /ALTER TABLE public\.transactions DROP COLUMN IF EXISTS supplier_id/);
  assert.match(down, /ALTER TABLE public\.bills DROP COLUMN IF EXISTS supplier_id/);
  assert.match(down, /DROP TABLE IF EXISTS public\.mei_suppliers/);
});

console.log(`ok: ${pass} testes`);

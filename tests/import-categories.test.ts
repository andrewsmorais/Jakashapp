// Testes offline: planilhas de banco (Nubank, C6, Inter, Bradesco, ".xls" em HTML) e categorias escondidas.
// Rodar: npm run test:import
import assert from "node:assert/strict";
import { parseCSV, parseStatement, suggestInvert, detectSource, htmlTableGrid } from "../src/lib/importer";
import { isBinaryXls } from "../src/lib/fileImport";
import { hiddenIds, visibleCats, coreOnlyFor, isCoreDefault, canHide, type CatFull } from "../src/lib/categoryVisibility";
import { isValidLogo } from "../src/lib/logoImage";

let pass = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); pass++; } catch (e) { console.error(`FALHOU: ${name}`); throw e; }
};
const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

// ---------- planilhas ----------

t("Nubank fatura (date,title,amount): reconhece, compras positivas pedem inversão", () => {
  const r = parseCSV("date,title,amount\n2026-10-01,Padaria Real,23.50\n2026-10-02,Uber *Trip,18.90\n2026-10-03,Pagamento recebido,-500.00\n");
  assert.equal(r.rows.length, 3);
  assert.equal(r.source?.institution, "nubank");
  assert.equal(r.kind, "card");
  assert.equal(r.rows[0].amount, 23.5);
  assert.equal(r.rows[0].description, "Padaria Real");
  assert.equal(r.rows[2].amount, -500);
  assert.equal(suggestInvert(r, "card"), true);
  assert.equal(suggestInvert(r, "account"), false);
});

t("Nubank conta (Data,Valor,Identificador,Descrição)", () => {
  const r = parseCSV("Data,Valor,Identificador,Descrição\n01/10/2026,-45.90,abc-1,Compra no débito - Mercado X\n02/10/2026,1500.00,abc-2,\"Transferência recebida pelo Pix - FULANO, AG 1\"\n");
  assert.equal(r.source?.label, "Extrato da conta Nubank");
  assert.equal(r.kind, "bank");
  assert.deepEqual(r.rows.map((x) => x.amount), [-45.9, 1500]);
  assert.equal(r.rows[0].fitid, "abc-1");
  assert.equal(r.rows[1].description, "Transferência recebida pelo Pix - FULANO, AG 1");
  assert.equal(suggestInvert(r, "account"), false);
});

t("C6 fatura: usa o valor em R$ (não US$), ignora nome do cartão e soma a parcela na descrição", () => {
  const csv = "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n" +
    "05/10/2026;FULANO S;1234;Restaurante;IFOOD *LOJA;Única;0;0;54,90\n" +
    "06/10/2026;FULANO S;1234;Eletro;LOJA X;2/10;0;0;199,90\n";
  const r = parseCSV(csv);
  assert.equal(r.source?.institution, "c6");
  assert.equal(r.kind, "card");
  assert.deepEqual(r.rows.map((x) => x.amount), [54.9, 199.9]);
  assert.equal(r.rows[0].description, "IFOOD *LOJA");
  assert.equal(r.rows[1].description, "LOJA X (2/10)");
});

t("Coluna Tipo com 'Compra à vista' não vira crédito; 'Débito' vira saída", () => {
  const r = parseCSV("Data;Lançamento;Tipo;Valor\n01/10/2026;POSTO SHELL;Compra à vista;-100,00\n02/10/2026;TARIFA;Débito;12,00\n03/10/2026;PIX;Crédito;30,00\n");
  assert.deepEqual(r.rows.map((x) => x.amount), [-100, -12, 30]);
});

t("Bradesco: linha de continuação sem data entra na descrição; saldo do dia é ignorado", () => {
  const csv = "Extrato de: Agência 1 Conta 2\nData;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)\n" +
    "01/10/2026;PIX ENVIADO;123;;50,00;950,00\n;FULANO DE TAL;;;;\n02/10/2026;SALDO DO DIA;;;;950,00\n03/10/2026;SALARIO;9;3.000,00;;3.950,00\n";
  const r = parseCSV(csv);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].description, "PIX ENVIADO - FULANO DE TAL");
  assert.equal(r.rows[0].amount, -50);
  assert.equal(r.rows[1].amount, 3000);
});

t("Mercado Pago: tipo da transação vira descrição", () => {
  const r = parseCSV("RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE\n01-10-2026;Pagamento com QR Pix;111;-25,00;75,00\n");
  assert.equal(r.source?.institution, "mercadopago");
  assert.equal(r.rows[0].amount, -25);
  assert.equal(r.rows[0].description, "Pagamento com QR Pix");
});

t("\".xls\" que é página HTML: lido como tabela", () => {
  const html = "<html><body><table><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr>" +
    "<tr><td>01/10/2026</td><td>Mercado &amp; Cia<br>Loja 2</td><td>-12,30</td></tr>" +
    "<tr><td>02/10/2026</td><td>Salário&nbsp;Empresa</td><td>2.500,00</td></tr></table></body></html>";
  assert.equal(htmlTableGrid(html).length, 3);
  const r = parseStatement(buf(html));
  assert.equal(r.format, "xls");
  assert.deepEqual(r.rows.map((x) => [x.description, x.amount]), [["Mercado & Cia Loja 2", -12.3], ["Salário Empresa", 2500]]);
});

t(".xls binário antigo é detectado (para pedir .xlsx/CSV)", () => {
  assert.equal(isBinaryXls(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1]).buffer as ArrayBuffer), true);
  assert.equal(isBinaryXls(buf("<html>")), false);
});

t("Layout desconhecido continua funcionando sem origem", () => {
  const r = parseCSV("Data;Descrição;Valor\n01/10/2026;Farmácia;-30,00\n");
  assert.equal(r.source, undefined);
  assert.equal(r.rows[0].amount, -30);
  assert.equal(detectSource(["Data", "Descrição", "Valor"]), undefined);
});

t("OFX de cartão não pede inversão", () => {
  const ofx = "<OFX><CREDITCARDMSGSRSV1><CCSTMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261001<TRNAMT>-10.00<FITID>1<MEMO>LOJA</STMTTRN></BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>";
  const r = parseStatement(buf(ofx));
  assert.equal(r.kind, "card");
  assert.equal(suggestInvert(r, "card"), false);
});

// ---------- categorias escondidas ----------

const ME = "u1";
const cats: CatFull[] = [
  { id: "ali", name: "Alimentação", type: "expense", parent_id: null, is_default: true, user_id: null },
  { id: "sup", name: "Supermercado", type: "expense", parent_id: "ali", is_default: true, user_id: null },
  { id: "pet", name: "Pet", type: "expense", parent_id: null, is_default: true, user_id: null },
  { id: "rac", name: "Ração e petiscos", type: "expense", parent_id: "pet", is_default: true, user_id: null },
  { id: "sal", name: "Salário", type: "income", parent_id: null, is_default: true, user_id: null },
  { id: "aca", name: "Academia", type: "expense", parent_id: null, is_default: false, user_id: ME },
  { id: "par", name: "Do parceiro", type: "expense", parent_id: null, is_default: false, user_id: "u2" },
];
const byId = new Map(cats.map((c) => [c.id, c]));

t("Básicas: Alimentação e suas subs; Pet não", () => {
  assert.equal(isCoreDefault(byId.get("sup")!, byId), true);
  assert.equal(isCoreDefault(byId.get("pet")!, byId), false);
  assert.equal(isCoreDefault(byId.get("sal")!, byId), true);
  assert.equal(isCoreDefault(byId.get("aca")!, byId), false);
});

t("Conta nova: só as básicas e as próprias aparecem", () => {
  const h = hiddenIds(cats, [], true, ME);
  assert.deepEqual([...h].sort(), ["pet", "rac"]);
  assert.equal(h.has("par"), false); // de quem divide: não é pronta, então não some sozinha
});

t("Conta antiga: nada some sozinho; esconder uma principal esconde as subs", () => {
  assert.equal(hiddenIds(cats, [], false, ME).size, 0);
  const h = hiddenIds(cats, [{ category_id: "ali", hidden: true }], false, ME);
  assert.deepEqual([...h].sort(), ["ali", "sup"]);
});

t("Mostrar uma pronta escondida vale a escolha da pessoa", () => {
  const h = hiddenIds(cats, [{ category_id: "pet", hidden: false }, { category_id: "rac", hidden: false }], true, ME);
  assert.equal(h.size, 0);
});

t("As próprias nunca somem, mesmo com linha de escondida", () => {
  assert.equal(hiddenIds(cats, [{ category_id: "aca", hidden: true }], false, ME).has("aca"), false);
  assert.equal(canHide(byId.get("aca")!, ME), false);
  assert.equal(canHide(byId.get("pet")!, ME), true);
  assert.equal(canHide(byId.get("par")!, ME), true);
});

t("Listas de escolha mantêm a categoria em uso e a principal dela", () => {
  const h = hiddenIds(cats, [], true, ME);
  assert.deepEqual(visibleCats(cats, h).map((c) => c.id), ["ali", "sup", "sal", "aca", "par"]);
  assert.deepEqual(visibleCats(cats, h, ["rac"]).map((c) => c.id), ["ali", "sup", "pet", "rac", "sal", "aca", "par"]);
});

t("Regra de conta nova pela data de criação", () => {
  assert.equal(coreOnlyFor("2026-10-25T10:00:00Z"), true);
  assert.equal(coreOnlyFor("2026-09-01T10:00:00Z"), false);
  assert.equal(coreOnlyFor(undefined), false);
});

// ---------- imagem do selo ----------

t("Imagem do selo: só PNG/JPEG/WebP em base64 e dentro do limite", () => {
  assert.equal(isValidLogo("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(isValidLogo("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isValidLogo("data:image/png;base64,abc\"onerror=x"), false);
  assert.equal(isValidLogo("data:image/png;base64," + "A".repeat(70000)), false);
});

console.log(`ok: ${pass} testes`);

// Testes offline da ficha da nota fiscal do MEI: formatos, validações, ficha de serviço (NFS-e) e de produto (NF-e), pendências e texto para copiar.
// Rodar: npm run test:nota
import assert from "node:assert/strict";
import {
  EMPTY_ITEM_FORM, EMPTY_TOMADOR, buildFicha, cleanDocument, documentKind, fichaToText, formatCep, formatCfop, formatCnpj, formatCpf, formatDocument, formatNcm,
  isValidCnpj, isValidCpf, isValidDocument, itemFormFrom, lineFromItem, moneyText, normalizeCTribNac, normalizeCep, normalizeCfop, normalizeNbs, normalizeNcm,
  normalizeUf, qtyText, receiptNotesFor, serviceDescription, validateItemForm, validatePrestadorForm,
  type CatalogItem, type FichaInput, type NotaLine, type PrestadorInput, type TomadorInput,
} from "../src/lib/meiNota";

let pass = 0;
const t = (name: string, fn: () => void) => { try { fn(); pass++; } catch (e) { console.error(`FALHOU: ${name}`); throw e; } };

const prestador: PrestadorInput = {
  full_name: "Ana Souza", business_name: "ANA SOUZA 12345678901", business_cnpj: "11.222.333/0001-81", business_municipio: "Campinas", business_uf: "SP",
  business_im: "998877", business_cep: "13010000", business_address: "Rua das Flores, 10, Centro",
};
const tomadorPj: TomadorInput = {
  ...EMPTY_TOMADOR, clientId: "c1", name: "Padaria do Zé Ltda", document: "11.222.333/0001-81", email: "ze@padaria.com", phone: "(19) 99999-0000",
  cep: "13015-000", address: "Av. Brasil", address_number: "500", address_complement: "Loja 2", neighborhood: "Centro", city: "Campinas", uf: "SP",
};
const svcItem: CatalogItem = {
  id: "i1", kind: "servico", name: "Consultoria", description: "Hora de consultoria em gestão", unit_price: 150, unit: "h",
  ctrib_nac: "17.01.01", nbs: "1.1506.21.00", municipal_code: "001", ncm: null, cfop: null, archived: false,
};
const prodItem: CatalogItem = {
  id: "i2", kind: "produto", name: "Camiseta", description: null, unit_price: 49.9, unit: "un",
  ctrib_nac: null, nbs: null, municipal_code: null, ncm: "61091000", cfop: "5102", archived: false,
};
const svcInput = (patch: Partial<FichaInput> = {}): FichaInput => ({
  kind: "servico", date: "2026-10-23", prestador, tomador: tomadorPj, lines: [lineFromItem(svcItem, 2)], discount: 0, ...patch,
});
const prodInput = (patch: Partial<FichaInput> = {}): FichaInput => ({
  kind: "produto", date: "2026-10-23", prestador, tomador: tomadorPj, lines: [lineFromItem(prodItem, 3)], discount: 0, ...patch,
});
const sec = (f: ReturnType<typeof buildFicha>, id: string) => f.sections.find((s) => s.id === id)!;
const fld = (f: ReturnType<typeof buildFicha>, s: string, k: string) => sec(f, s).fields.find((x) => x.key === k)!;
const keys = (f: ReturnType<typeof buildFicha>) => f.issues.map((i) => i.key);

// ---------------------------------------------------------------------------
// Formatos e validações
// ---------------------------------------------------------------------------
t("CPF e CNPJ: máscara e tipo", () => {
  assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatCpf("52998224725"), "529.982.247-25");
  assert.equal(formatDocument("52998224725"), "529.982.247-25");
  assert.equal(formatDocument("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatDocument(" 123 "), "123");
  assert.equal(documentKind("529.982.247-25"), "cpf");
  assert.equal(documentKind("11.222.333/0001-81"), "cnpj");
  assert.equal(documentKind("1234"), null);
  assert.equal(cleanDocument("11.222.333/0001-81"), "11222333000181");
});

t("CPF: dígitos verificadores", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-26"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("123"), false);
});

t("CNPJ: numérico e alfanumérico (novo formato de 2026)", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
  assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true); // exemplo da Receita Federal
  assert.equal(isValidCnpj("12.ABC.345/01DE-36"), false);
  assert.equal(documentKind("12.ABC.345/01DE-35"), "cnpj");
  assert.equal(formatCnpj("12abc34501de35"), "12.ABC.345/01DE-35");
  assert.equal(isValidDocument("12ABC34501DE35"), true);
  assert.equal(isValidDocument("abc"), false);
});

t("CEP, cTribNac, NBS, NCM, CFOP e UF: só o formato", () => {
  assert.equal(normalizeCep("13010-000"), "13010000");
  assert.equal(normalizeCep("1301"), null);
  assert.equal(formatCep("13010000"), "13010-000");
  assert.equal(normalizeCTribNac("010101"), "01.01.01");
  assert.equal(normalizeCTribNac("17.01.01"), "17.01.01");
  assert.equal(normalizeCTribNac("0101"), null);
  assert.equal(normalizeNbs("115062100"), "1.1506.21.00");
  assert.equal(normalizeNbs("1.1506.21.00"), "1.1506.21.00");
  assert.equal(normalizeNbs("1234"), null);
  assert.equal(normalizeNcm("6109.10.00"), "61091000");
  assert.equal(normalizeNcm("6109"), null);
  assert.equal(formatNcm("61091000"), "6109.10.00");
  assert.equal(normalizeCfop("5.102"), "5102");
  assert.equal(normalizeCfop("0102"), null);
  assert.equal(normalizeCfop("510"), null);
  assert.equal(formatCfop("6102"), "6.102");
  assert.equal(normalizeUf(" sp "), "SP");
  assert.equal(normalizeUf("XX"), null);
});

t("Valores: vírgula sem milhar e quantidade sem zeros", () => {
  assert.equal(moneyText(1234.5), "1234,50");
  assert.equal(moneyText(0.1 + 0.2), "0,30");
  assert.equal(qtyText(2), "2");
  assert.equal(qtyText(1.5), "1,5");
  assert.equal(qtyText(0.12345), "0,1235");
});

t("Descrição do serviço: uma linha vira o nome; várias detalham quantidade e valor", () => {
  const one: NotaLine = { name: "Corte de cabelo", quantity: 1, unitPrice: 50 };
  assert.equal(serviceDescription([one]), "Corte de cabelo");
  assert.equal(serviceDescription([{ ...one, description: "masculino" }]), "Corte de cabelo: masculino");
  assert.equal(serviceDescription([{ ...one, quantity: 3 }]), "3 x Corte de cabelo (R$ 50,00 cada)");
  assert.equal(serviceDescription([one, { name: "Barba", quantity: 2, unitPrice: 30, unit: "un" }]), "1 x Corte de cabelo (R$ 50,00 cada); 2 un x Barba (R$ 30,00 cada)");
  assert.equal(serviceDescription([{ ...one, name: "  " }]), "");
});

// ---------------------------------------------------------------------------
// Ficha de serviço (NFS-e)
// ---------------------------------------------------------------------------
t("NFS-e: telas na ordem do emissor e tudo preenchido, sem pendência", () => {
  const f = buildFicha(svcInput());
  assert.deepEqual(f.sections.map((s) => s.id), ["prestador", "tomador", "servico", "valores", "tributacao"]);
  assert.equal(f.sections[0].title, "Passo 1 · Pessoas: Emitente (Prestador)");
  assert.equal(f.sections[2].title, "Passo 2 · Serviço");
  assert.equal(f.sections[3].title, "Passo 3 · Valores");
  assert.equal(f.sections[4].title, "Passo 3 · Tributação (MEI)");
  assert.equal(f.issues.length, 0, JSON.stringify(f.issues));
  assert.equal(f.ready, true);
  assert.equal(f.total, 300);
  // prestador
  assert.equal(fld(f, "prestador", "competencia").value, "23/10/2026");
  assert.equal(fld(f, "prestador", "cnpj").value, "11.222.333/0001-81");
  assert.equal(fld(f, "prestador", "cnpj").copy, "11222333000181");
  assert.equal(fld(f, "prestador", "municipio").value, "Campinas/SP");
  assert.equal(fld(f, "prestador", "municipio").copy, "Campinas");
  assert.equal(fld(f, "prestador", "im").value, "998877");
  assert.match(fld(f, "prestador", "opsn").value, /MEI/);
  assert.equal(fld(f, "prestador", "ibs").value, "Não");
  // tomador
  assert.equal(fld(f, "tomador", "tipo").value, "Tomador do Brasil");
  assert.equal(fld(f, "tomador", "doc").copy, "11222333000181");
  assert.equal(fld(f, "tomador", "cep").value, "13015-000");
  assert.equal(fld(f, "tomador", "cep").copy, "13015000");
  assert.equal(fld(f, "tomador", "municipio").value, "Campinas/SP");
  assert.equal(fld(f, "tomador", "email").value, "ze@padaria.com");
  // serviço
  assert.equal(fld(f, "servico", "pais").value, "Brasil");
  assert.equal(fld(f, "servico", "cidade").value, "Campinas");
  assert.equal(fld(f, "servico", "ctrib").value, "17.01.01");
  assert.equal(fld(f, "servico", "ctribMun").value, "001");
  assert.equal(fld(f, "servico", "nbs").value, "1.1506.21.00");
  assert.equal(fld(f, "servico", "descricao").value, "2 h x Consultoria: Hora de consultoria em gestão (R$ 150,00 cada)");
  // valores e tributação
  assert.equal(fld(f, "valores", "valor").value, "300,00");
  assert.equal(fld(f, "valores", "desconto").value, "");
  assert.equal(fld(f, "tributacao", "ret").value, "Não");
  assert.equal(fld(f, "tributacao", "regesp").value, "Nenhum");
  assert.match(sec(f, "tributacao").note ?? "", /DAS/);
  assert.match(f.notes[0], /contador/);
});

t("NFS-e: desconto reduz o total mas não o valor do serviço", () => {
  const f = buildFicha(svcInput({ discount: 20 }));
  assert.equal(fld(f, "valores", "valor").value, "300,00");
  assert.equal(fld(f, "valores", "desconto").value, "20,00");
  assert.equal(fld(f, "valores", "liquido").value, "280,00");
  assert.equal(f.total, 280);
  assert.equal(f.discount, 20);
  const bad = buildFicha(svcInput({ discount: 301 }));
  assert.equal(keys(bad).includes("discount"), true);
  assert.equal(bad.ready, false);
});

t("NFS-e: pendências do prestador levam à seção dos dados do MEI", () => {
  const empty: PrestadorInput = { business_name: null, business_cnpj: null, business_municipio: null, business_uf: null, business_im: null, business_cep: null, business_address: null };
  const f = buildFicha(svcInput({ prestador: empty }));
  const byKey = Object.fromEntries(f.issues.map((i) => [i.key, i]));
  assert.equal(byKey["p-cnpj"].level, "obrigatorio");
  assert.equal(byKey["p-cnpj"].message, "Cadastre o CNPJ do seu MEI.");
  assert.equal(byKey["p-mun"].level, "obrigatorio");
  assert.equal(byKey["p-mun"].message, "Cadastre o município do seu MEI.");
  assert.equal(byKey["p-mun"].href, "#prestador");
  assert.equal(byKey["p-nome"].level, "recomendado");
  assert.equal(byKey["p-uf"].level, "recomendado");
  assert.equal(f.ready, false);
  assert.equal(fld(f, "prestador", "cnpj").missing, true);
  assert.equal(fld(f, "prestador", "cnpj").need, "obrigatorio");
  // obrigatórios vêm antes dos recomendados
  const levels = f.issues.map((i) => i.level);
  assert.equal(levels.indexOf("recomendado") > levels.lastIndexOf("obrigatorio"), true);
  const invalid = buildFicha(svcInput({ prestador: { ...prestador, business_cnpj: "11.222.333/0001-80" } }));
  assert.match(invalid.issues.find((i) => i.key === "p-cnpj")!.message, /inválido/);
});

t("NFS-e: o município da prestação segue o do MEI, ou o ajuste digitado", () => {
  assert.equal(fld(buildFicha(svcInput()), "servico", "cidade").value, "Campinas");
  assert.equal(fld(buildFicha(svcInput({ service: { city: "Valinhos" } })), "servico", "cidade").value, "Valinhos");
});

t("NFS-e: tomador com dados faltando ou sem tomador", () => {
  const noDoc = buildFicha(svcInput({ tomador: { ...tomadorPj, document: "", cep: "", address: "", city: "" } }));
  const doc = noDoc.issues.find((i) => i.key === "t-doc")!;
  assert.equal(doc.level, "obrigatorio");
  assert.equal(doc.message, "Cadastre o CPF ou CNPJ de Padaria do Zé Ltda.");
  assert.equal(doc.href, "/mei/clientes"); // cliente do cadastro: corrige lá
  const end = noDoc.issues.find((i) => i.key === "t-end")!;
  assert.equal(end.level, "recomendado");
  assert.match(end.message, /falta CEP, logradouro, município/);
  assert.equal(fld(noDoc, "tomador", "doc").missing, true);

  const manual = buildFicha(svcInput({ tomador: { ...tomadorPj, clientId: null, document: "123" } }));
  assert.equal(manual.issues.find((i) => i.key === "t-doc")!.href, "#tomador"); // digitado na hora: corrige na própria ficha
  assert.match(manual.issues.find((i) => i.key === "t-doc")!.message, /inválido/);

  const pf = buildFicha(svcInput({ tomador: { ...tomadorPj, name: "Maria", document: "529.982.247-25", email: "", phone: "" } }));
  assert.equal(pf.issues.some((i) => i.key === "t-doc"), false);
  assert.equal(fld(pf, "tomador", "email").missing, true);
  assert.equal(fld(pf, "tomador", "email").need, undefined); // e-mail e telefone são opcionais

  const none = buildFicha(svcInput({ tomador: null }));
  assert.equal(fld(none, "tomador", "tipo").value, "Tomador não informado");
  assert.equal(none.issues.find((i) => i.key === "t-none")!.level, "recomendado");
  assert.equal(none.ready, true); // pessoa física pode ficar sem tomador
});

t("NFS-e: código de tributação é por nota", () => {
  const second: CatalogItem = { ...svcItem, id: "i3", name: "Treinamento", ctrib_nac: "08.02.01" };
  const conflict = buildFicha(svcInput({ lines: [lineFromItem(svcItem), lineFromItem(second)] }));
  assert.equal(keys(conflict).includes("ctrib-conflict"), true);
  assert.equal(conflict.ready, false);
  const fixed = buildFicha(svcInput({ lines: [lineFromItem(svcItem), lineFromItem(second)], service: { ctribNac: "170101" } }));
  assert.equal(keys(fixed).includes("ctrib-conflict"), false);
  assert.equal(fld(fixed, "servico", "ctrib").value, "17.01.01");
  const same = buildFicha(svcInput({ lines: [lineFromItem(svcItem), lineFromItem({ ...svcItem, id: "i4", name: "Outra" })] }));
  assert.equal(keys(same).includes("ctrib-conflict"), false);
  assert.equal(fld(same, "servico", "descricao").value.startsWith("1 h x Consultoria"), true);
});

t("NFS-e: serviço do catálogo sem código leva ao cadastro do item", () => {
  const f = buildFicha(svcInput({ lines: [lineFromItem({ ...svcItem, ctrib_nac: null, nbs: null })] }));
  const c = f.issues.find((i) => i.key === "ctrib")!;
  assert.equal(c.level, "obrigatorio");
  assert.equal(c.href, "/mei/produtos?edit=i1");
  assert.match(c.message, /Consultoria/);
  const nbs = f.issues.find((i) => i.key === "nbs")!;
  assert.equal(nbs.level, "recomendado"); // NBS: o emissor pode pedir; não bloqueia
  assert.equal(f.ready, false);

  const free = buildFicha(svcInput({ lines: [{ name: "Conserto", quantity: 1, unitPrice: 80 }] }));
  assert.equal(free.issues.find((i) => i.key === "ctrib")!.href, "#servico");
  const typed = buildFicha(svcInput({ lines: [{ name: "Conserto", quantity: 1, unitPrice: 80 }], service: { ctribNac: "14.01.01" } }));
  assert.equal(typed.issues.some((i) => i.key === "ctrib"), false);
  const wrong = buildFicha(svcInput({ lines: [{ name: "Conserto", quantity: 1, unitPrice: 80 }], service: { ctribNac: "1401" } }));
  assert.match(wrong.issues.find((i) => i.key === "ctrib")!.message, /6 dígitos/);
});

t("NFS-e: sem linhas, valor zero e descrição vazia", () => {
  assert.equal(keys(buildFicha(svcInput({ lines: [] }))).includes("lines"), true);
  assert.equal(keys(buildFicha(svcInput({ lines: [{ name: "X", quantity: 1, unitPrice: 0, ctribNac: "17.01.01" }] }))).includes("line-value"), true);
  assert.equal(keys(buildFicha(svcInput({ lines: [{ name: " ", quantity: 1, unitPrice: 10, ctribNac: "17.01.01" }] }))).includes("line-name"), true);
  assert.equal(keys(buildFicha(svcInput({ date: "" }))).includes("date"), true);
});

t("NFS-e: a pergunta de IBS/CBS muda de tom em 2027", () => {
  assert.match(fld(buildFicha(svcInput()), "prestador", "ibs").hint ?? "", /01\/01\/2027/);
  assert.equal(fld(buildFicha(svcInput({ date: "2027-02-01" })), "prestador", "ibs").value, "Confira no emissor");
});

// ---------------------------------------------------------------------------
// Ficha de produto (NF-e)
// ---------------------------------------------------------------------------
t("NF-e: emitente, destinatário, produto, totais e tributação", () => {
  const f = buildFicha(prodInput());
  assert.deepEqual(f.sections.map((s) => s.id), ["prestador", "tomador", "item-1", "totais", "tributacao"]);
  assert.equal(f.issues.length, 0, JSON.stringify(f.issues));
  assert.equal(fld(f, "item-1", "desc").value, "Camiseta");
  assert.equal(fld(f, "item-1", "ncm").value, "6109.10.00");
  assert.equal(fld(f, "item-1", "ncm").copy, "61091000");
  assert.equal(fld(f, "item-1", "cfop").value, "5.102");
  assert.equal(fld(f, "item-1", "cfop").copy, "5102");
  assert.equal(fld(f, "item-1", "un").value, "un");
  assert.equal(fld(f, "item-1", "qtd").value, "3");
  assert.equal(fld(f, "item-1", "vun").value, "49,90");
  assert.equal(fld(f, "item-1", "vtot").value, "149,70");
  assert.equal(fld(f, "totais", "produtos").value, "149,70");
  assert.match(fld(f, "prestador", "crt").value, /CRT 4/);
  assert.match(fld(f, "tributacao", "icms").value, /^400/);
  assert.match(f.notes[0], /consumidor final/);
  assert.match(f.notes[0], /contador/);
  assert.equal(f.issuerName.includes("SEFAZ"), true);
});

t("NF-e: produto sem NCM, CFOP ou unidade, e vários produtos", () => {
  const f = buildFicha(prodInput({ lines: [lineFromItem({ ...prodItem, ncm: null, cfop: null, unit: null }), lineFromItem({ ...prodItem, id: "i9", name: "Boné" }, 2)] }));
  assert.deepEqual(f.sections.map((s) => s.id).slice(2, 4), ["item-1", "item-2"]);
  assert.equal(sec(f, "item-1").title, "Produto 1");
  const k = keys(f);
  for (const x of ["l1-ncm", "l1-cfop", "l1-un"]) assert.equal(k.includes(x), true, x);
  assert.equal(k.some((x) => x.startsWith("l2-")), false);
  assert.equal(f.issues.find((i) => i.key === "l1-ncm")!.href, "/mei/produtos?edit=i2");
  assert.equal(f.ready, false);
  assert.equal(fld(f, "item-1", "ncm").missing, true);
  const bad = buildFicha(prodInput({ lines: [{ name: "Livre", quantity: 1, unitPrice: 5, unit: "un", ncm: "6109", cfop: "51" }] }));
  assert.match(bad.issues.find((i) => i.key === "l1-ncm")!.message, /8 dígitos/);
  assert.match(bad.issues.find((i) => i.key === "l1-cfop")!.message, /4 dígitos/);
  assert.equal(bad.issues.find((i) => i.key === "l1-ncm")!.href, "#itens");
});

t("NF-e: CFOP 5 x 6 conforme o estado do cliente", () => {
  const out = buildFicha(prodInput({ tomador: { ...tomadorPj, uf: "RJ" } }));
  const a = out.issues.find((i) => i.key === "l1-cfop-uf")!;
  assert.equal(a.level, "recomendado");
  assert.match(a.message, /outro estado/);
  assert.equal(out.ready, true); // é só um alerta
  const six = buildFicha(prodInput({ lines: [lineFromItem({ ...prodItem, cfop: "6102" })] }));
  assert.match(six.issues.find((i) => i.key === "l1-cfop-uf")!.message, /mesmo estado/);
  const ok6 = buildFicha(prodInput({ lines: [lineFromItem({ ...prodItem, cfop: "6102" })], tomador: { ...tomadorPj, uf: "MG" } }));
  assert.equal(ok6.issues.some((i) => i.key === "l1-cfop-uf"), false);
});

t("NF-e: sem destinatário não está pronta", () => {
  const f = buildFicha(prodInput({ tomador: null }));
  assert.equal(f.issues.find((i) => i.key === "t-none")!.level, "obrigatorio");
  assert.equal(f.ready, false);
});

// ---------------------------------------------------------------------------
// Copiar tudo
// ---------------------------------------------------------------------------
t("Copiar tudo: texto simples na ordem das telas, com (preencher) onde falta", () => {
  const text = fichaToText(buildFicha(svcInput()), "2026-10-23");
  const order = ["== Passo 1 · Pessoas: Emitente (Prestador) ==", "== Passo 1 · Pessoas: Tomador ==", "== Passo 2 · Serviço ==", "== Passo 3 · Valores ==", "== Passo 3 · Tributação (MEI) =="];
  let at = -1;
  for (const h of order) { const i = text.indexOf(h); assert.equal(i > at, true, h); at = i; }
  assert.match(text, /^FICHA DA NFS-E \(EMISSOR NACIONAL\)\nMontada no Jakash em 23\/10\/2026\. O Jakash não emite nota fiscal/);
  assert.match(text, /CNPJ: 11\.222\.333\/0001-81/);
  assert.match(text, /Código de Tributação Nacional: 17\.01\.01/);
  assert.match(text, /Valor do serviço prestado: 300,00/);
  assert.equal(text.includes("(preencher)"), false);
  assert.equal(text.includes("PENDÊNCIAS"), false);
  assert.equal(text.includes("Desconto incondicionado"), false); // opcional e vazio: fica de fora
  assert.equal(text.endsWith("\n"), true);

  const gaps = fichaToText(buildFicha(svcInput({ lines: [{ name: "Conserto", quantity: 1, unitPrice: 80 }], tomador: null })), "2026-10-23");
  assert.match(gaps, /Código de Tributação Nacional: \(preencher\)/);
  assert.match(gaps, /== PENDÊNCIAS ==/);
  assert.match(gaps, /- Falta: Informe o código de tributação nacional/);
  assert.match(gaps, /- Confira: Item da NBS não informado/);
});

// ---------------------------------------------------------------------------
// Formulários do catálogo e do prestador
// ---------------------------------------------------------------------------
t("Catálogo: serviço guarda só campos de serviço, produto só de produto", () => {
  const svc = validateItemForm({ ...EMPTY_ITEM_FORM, kind: "servico", name: " Consultoria ", unit_price: "150,5", unit: "h", ctrib_nac: "170101", nbs: "115062100", ncm: "61091000", cfop: "5102" }, 150.5);
  assert.equal(svc.ok, true);
  if (svc.ok) {
    assert.equal(svc.row.name, "Consultoria");
    assert.equal(svc.row.unit_price, 150.5);
    assert.equal(svc.row.ctrib_nac, "17.01.01");
    assert.equal(svc.row.nbs, "1.1506.21.00");
    assert.equal(svc.row.ncm, null);
    assert.equal(svc.row.cfop, null);
  }
  const prod = validateItemForm({ ...EMPTY_ITEM_FORM, kind: "produto", name: "Camiseta", ncm: "6109.10.00", cfop: "5.102", ctrib_nac: "170101" }, NaN);
  assert.equal(prod.ok, true);
  if (prod.ok) {
    assert.equal(prod.row.ncm, "61091000");
    assert.equal(prod.row.cfop, "5102");
    assert.equal(prod.row.ctrib_nac, null);
    assert.equal(prod.row.unit_price, 0); // sem valor padrão
  }
  const err = (patch: Partial<typeof EMPTY_ITEM_FORM>, price = 0) => { const r = validateItemForm({ ...EMPTY_ITEM_FORM, name: "X", ...patch }, price); return r.ok ? null : r.error; };
  assert.equal(err({ name: "  " }), "Informe o nome.");
  assert.match(err({ ctrib_nac: "1701" }) ?? "", /6 dígitos/);
  assert.match(err({ nbs: "12" }) ?? "", /9 dígitos/);
  assert.match(err({ kind: "produto", ncm: "123" }) ?? "", /8 dígitos/);
  assert.match(err({ kind: "produto", cfop: "12" }) ?? "", /4 dígitos/);
  assert.equal(err({ unit_price: "abc" }, NaN), "Valor inválido.");
  assert.equal(err({ unit_price: "-5" }, -5), "Valor inválido.");
  assert.match(err({ unit: "metros cúbicos" }) ?? "", /10 letras/);
});

t("Catálogo: editar mostra o item como foi guardado", () => {
  const f = itemFormFrom(prodItem);
  assert.equal(f.ncm, "6109.10.00");
  assert.equal(f.cfop, "5.102");
  assert.equal(f.unit_price, "49,90");
  assert.equal(itemFormFrom(svcItem).ctrib_nac, "17.01.01");
});

t("Recibo a partir do catálogo: nome e descrição, até 500 letras", () => {
  assert.equal(receiptNotesFor({ name: "Consultoria", description: null }), "Consultoria");
  assert.equal(receiptNotesFor({ name: "Consultoria", description: "em gestão" }), "Consultoria: em gestão");
  assert.equal(receiptNotesFor({ name: "X", description: "a".repeat(600) }).length, 500);
});

t("Dados do prestador: confere CNPJ, UF e CEP e normaliza", () => {
  const form = { business_name: " Ana ME ", business_cnpj: "11222333000181", business_municipio: " Campinas ", business_uf: "sp", business_im: "", business_cep: "13010-000", business_address: " Rua A, 1 " };
  const r = validatePrestadorForm(form);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.row, { business_name: "Ana ME", business_cnpj: "11.222.333/0001-81", business_municipio: "Campinas", business_uf: "SP", business_im: null, business_cep: "13010000", business_address: "Rua A, 1" });
  }
  const bad = (patch: Partial<typeof form>) => { const x = validatePrestadorForm({ ...form, ...patch }); return x.ok ? null : x.error; };
  assert.match(bad({ business_cnpj: "11222333000199" }) ?? "", /CNPJ/);
  assert.match(bad({ business_uf: "ZZ" }) ?? "", /UF/);
  assert.match(bad({ business_cep: "123" }) ?? "", /CEP/);
  const empty = validatePrestadorForm({ business_name: "", business_cnpj: "", business_municipio: "", business_uf: "", business_im: "", business_cep: "", business_address: "" });
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(Object.values(empty.row).every((v) => v === null), true);
});

console.log(`${pass} testes da ficha da nota fiscal passaram.`);

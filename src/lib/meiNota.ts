// Ficha da nota fiscal do MEI (funções puras, sem rede e sem banco).
//
// O Jakash NÃO emite nota fiscal e não se integra a sistema fiscal nenhum: ele reúne, na ordem das telas do emissor oficial,
// os dados que o emissor pede, para a pessoa copiar e colar lá. Os códigos (cTribNac, NBS, NCM, CFOP) são digitados pela própria
// pessoa; aqui só se confere o formato, nunca se inventa ou "adivinha" um código.
//
// Fontes consultadas em 23/10/2026 (campos e regras podem mudar; por isso toda regra aqui vem com "confira"):
//  - Guia do Emissor Público Nacional Web (gov.br/nfse), v1.2.1: telas Pessoas, Serviço, Valores e Emitir NFS-e; campos do prestador (preenchidos
//    pela Receita), do tomador (Brasil/Exterior), "Código de Tributação Nacional", "Item da NBS", "Descrição do Serviço", descontos e tributação.
//    https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf
//  - Manual de Emissão da NFS-e Nacional da Prefeitura de Curitiba: "Emissão Simplificada" só para MEI; opção "Tomador não informado"; data de competência.
//    https://mid.curitiba.pr.gov.br/2025/00461932.pdf
//  - Layout da DPS (regras para optante MEI, opSimpNac = 2: sem alíquota, sem retenção de ISSQN, sem dedução e sem benefício municipal) e cTribNac com 6 dígitos:
//    https://buscadorncm.com.br/nfse/tags-xml/opsimpnac e https://buscadorncm.com.br/nfse/tags-xml/ctribnac
//  - Lista oficial de códigos de tributação nacional: https://www.gov.br/nfse/pt-br/mei-e-demais-empresas/codigos-de-tributacao-nacional-nbs
//  - Obrigatoriedade para o MEI (obrigatória para cliente pessoa jurídica; facultativa para pessoa física): Jornal Contábil, "MEI: você está preparado para a
//    emissão da NFS-e Nacional?" https://jornalcontabil.com.br/noticia/mei-voce-esta-preparado-para-a-emissao-da-nfs-e-nacional/amp/
//  - NF-e de produto (NCM com 8 dígitos, CFOP 5.101/6.101 produção própria e 5.102/6.102 revenda, unidade, quantidade e valor, ICMS "400 - Não tributada pelo
//    Simples Nacional", IPI em branco; MEI dispensado de nota na venda a pessoa física consumidor final): página do MEI da SEFAZ-RS, https://estado.rs.gov.br/MEI
//    (as regras de NF-e são estaduais: vale conferir a SEFAZ do seu estado).
//  - CRT 4 (MEI) na NF-e: Nota Técnica 2024.001 (resumo em https://simplifique.contmatic.com.br/blogs/crt4-novas-para-o-mei-regras-comecam-a-valer-em-abril).
//  - CNPJ alfanumérico (novos CNPJs a partir de julho/2026: 12 caracteres A-Z/0-9 + 2 dígitos; valor = código ASCII - 48):
//    https://valorfinal.com.br/guia/cnpj-alfanumerico-digito-verificador
import { formatDateBR } from "@/lib/format";

export type NotaKind = "servico" | "produto";

/** Links oficiais (só abrem em outra aba; nada é chamado em segundo plano). */
export const EMISSOR_NACIONAL_URL = "https://www.nfse.gov.br/EmissorNacional";
export const CODIGOS_NFSE_URL = "https://www.gov.br/nfse/pt-br/mei-e-demais-empresas/codigos-de-tributacao-nacional-nbs";
export const NCM_CONSULTA_URL = "https://portalunico.siscomex.gov.br/portal/";

/** Onde cada pendência da ficha é resolvida. "#..." rola até a seção da própria página. */
export const FIX = { prestador: "#prestador", tomador: "#tomador", itens: "#itens", servico: "#servico", clientes: "/mei/clientes", produtos: "/mei/produtos" } as const;

export const UF_LIST = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

// ---------------------------------------------------------------------------
// Números e textos
// ---------------------------------------------------------------------------
export const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");
/** CPF/CNPJ sem máscara. Letras ficam (CNPJ alfanumérico). */
export const cleanDocument = (s: string | null | undefined): string => (s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** "1234,56": formato que os campos de valor do emissor aceitam (sem separador de milhar). */
export const moneyText = (n: number): string => round2(n).toFixed(2).replace(".", ",");
export const qtyText = (n: number): string => String(Math.round(n * 10000) / 10000).replace(".", ",");
export const lineTotal = (l: { quantity: number; unitPrice: number }): number => round2(l.quantity * l.unitPrice);

// ---------------------------------------------------------------------------
// CPF e CNPJ
// ---------------------------------------------------------------------------
export type DocKind = "cpf" | "cnpj";

export function documentKind(v: string | null | undefined): DocKind | null {
  const d = cleanDocument(v);
  if (/^\d{11}$/.test(d)) return "cpf";
  if (d.length === 14) return "cnpj";
  return null;
}

export function isValidCpf(v: string | null | undefined): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

/** Vale para o CNPJ numérico de sempre e para o alfanumérico (valor de cada caractere = código ASCII - 48). */
export function isValidCnpj(v: string | null | undefined): boolean {
  const d = cleanDocument(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const digit = (len: number): number => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (d.charCodeAt(i) - 48) * w[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

export const isValidDocument = (v: string | null | undefined): boolean => {
  const k = documentKind(v);
  return k === "cpf" ? isValidCpf(v) : k === "cnpj" ? isValidCnpj(v) : false;
};

export function formatCpf(v: string | null | undefined): string {
  const d = onlyDigits(v);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v ?? "").trim();
}

export function formatCnpj(v: string | null | undefined): string {
  const d = cleanDocument(v);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (v ?? "").trim();
}

/** CPF (11 dígitos) ou CNPJ (14 caracteres) com máscara; qualquer outra coisa volta como foi digitada. */
export function formatDocument(v: string | null | undefined): string {
  const k = documentKind(v);
  return k === "cpf" ? formatCpf(v) : k === "cnpj" ? formatCnpj(v) : (v ?? "").trim();
}

// ---------------------------------------------------------------------------
// Códigos que a pessoa digita (só conferimos o formato)
// ---------------------------------------------------------------------------
export function normalizeCep(v: string | null | undefined): string | null {
  const d = onlyDigits(v);
  return d.length === 8 ? d : null;
}
export function formatCep(v: string | null | undefined): string {
  const d = onlyDigits(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? "").trim();
}

/** Código de Tributação Nacional (cTribNac): 6 dígitos no padrão 01.01.01 (item, subitem e desdobro nacional). */
export function normalizeCTribNac(v: string | null | undefined): string | null {
  const d = onlyDigits(v);
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : null;
}

/** Item da NBS: 9 dígitos, mostrado como 1.0101.10.00. */
export function normalizeNbs(v: string | null | undefined): string | null {
  const d = onlyDigits(v);
  return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : null;
}

/** NCM: 8 dígitos (guardado só com números). */
export function normalizeNcm(v: string | null | undefined): string | null {
  const d = onlyDigits(v);
  return d.length === 8 ? d : null;
}
export function formatNcm(v: string | null | undefined): string {
  const d = onlyDigits(v);
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : (v ?? "").trim();
}

/** CFOP: 4 dígitos (guardado só com números). O primeiro dígito diz o destino: 5 dentro do estado, 6 outro estado, 7 exterior. */
export function normalizeCfop(v: string | null | undefined): string | null {
  const d = onlyDigits(v);
  return /^[1-7]\d{3}$/.test(d) ? d : null;
}
export function formatCfop(v: string | null | undefined): string {
  const d = onlyDigits(v);
  return d.length === 4 ? `${d[0]}.${d.slice(1)}` : (v ?? "").trim();
}

export function normalizeUf(v: string | null | undefined): string | null {
  const u = (v ?? "").trim().toUpperCase();
  return (UF_LIST as readonly string[]).includes(u) ? u : null;
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------
export type CatalogItem = {
  id: string; kind: NotaKind; name: string; description: string | null; unit_price: number; unit: string | null;
  ctrib_nac: string | null; nbs: string | null; municipal_code: string | null; ncm: string | null; cfop: string | null; archived: boolean;
};

export type PrestadorInput = {
  full_name?: string | null;
  business_name: string | null; business_cnpj: string | null; business_municipio: string | null; business_uf: string | null;
  business_im: string | null; business_cep: string | null; business_address: string | null;
};

export type TomadorInput = {
  /** Cliente do cadastro (para a pendência levar à tela certa). Vazio = digitado na hora. */
  clientId?: string | null;
  name: string; document: string; email: string; phone: string;
  cep: string; address: string; address_number: string; address_complement: string; neighborhood: string; city: string; uf: string;
};

export const EMPTY_TOMADOR: TomadorInput = {
  clientId: null, name: "", document: "", email: "", phone: "", cep: "", address: "", address_number: "", address_complement: "", neighborhood: "", city: "", uf: "",
};

export type NotaLine = {
  /** Item do catálogo de origem (vazio = linha livre). */
  itemId?: string | null;
  name: string; description?: string | null; quantity: number; unitPrice: number; unit?: string | null;
  ctribNac?: string | null; nbs?: string | null; municipalCode?: string | null; ncm?: string | null; cfop?: string | null;
};

export function lineFromItem(item: CatalogItem, quantity = 1): NotaLine {
  return {
    itemId: item.id, name: item.name, description: item.description, quantity, unitPrice: item.unit_price, unit: item.unit,
    ctribNac: item.ctrib_nac, nbs: item.nbs, municipalCode: item.municipal_code, ncm: item.ncm, cfop: item.cfop,
  };
}

/** Ajustes do serviço feitos na própria ficha (vazio = usar o que vem do catálogo / do perfil). */
export type ServiceOverrides = { city: string; ctribNac: string; nbs: string; municipalCode: string };
export const EMPTY_OVERRIDES: ServiceOverrides = { city: "", ctribNac: "", nbs: "", municipalCode: "" };

export type FichaInput = {
  kind: NotaKind;
  /** AAAA-MM-DD: data de competência (serviço) ou de emissão (produto). */
  date: string;
  prestador: PrestadorInput;
  /** null = tomador não informado. */
  tomador: TomadorInput | null;
  lines: NotaLine[];
  /** Desconto incondicionado, em reais. */
  discount: number;
  service?: Partial<ServiceOverrides>;
};

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
export type Need = "obrigatorio" | "recomendado";

export type FichaField = {
  key: string;
  label: string;
  /** Como aparece na tela (com máscara). */
  value: string;
  /** O que o botão Copiar leva para a área de transferência (sem máscara quando o emissor já tem máscara). */
  copy: string;
  hint?: string;
  /** Campo que o emissor exige (ou que costuma exigir) e que ainda está vazio. */
  need?: Need;
  /** Vazio, mas sem problema (campo opcional do emissor ou preenchido por ele). */
  missing: boolean;
};

export type FichaSection = { id: string; title: string; note?: string; fields: FichaField[] };

export type FichaIssue = { key: string; level: Need; message: string; href: string; linkLabel: string };

export type Ficha = {
  kind: NotaKind;
  title: string;
  /** Texto do botão e do aviso de onde emitir. */
  issuerName: string;
  sections: FichaSection[];
  issues: FichaIssue[];
  subtotal: number;
  discount: number;
  total: number;
  /** Descrição do serviço / resumo dos itens, para recibo. */
  summary: string;
  /** Sem pendência obrigatória. */
  ready: boolean;
  /** Avisos de quando a nota é exigida (sempre com "confira com seu contador"). */
  notes: string[];
};

type FieldOpts = { need?: Need; hint?: string; copy?: string };
function field(key: string, label: string, value: string | null | undefined, o: FieldOpts = {}): FichaField {
  const v = (value ?? "").trim();
  return { key, label, value: v, copy: (o.copy ?? v).trim(), hint: o.hint, need: o.need, missing: !v };
}

const list = (parts: string[]): string => parts.join(", ");

// ---------------------------------------------------------------------------
// Pedaços comuns
// ---------------------------------------------------------------------------
function totals(lines: NotaLine[], discount: number) {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const d = round2(Math.max(discount || 0, 0));
  return { subtotal, discount: d, total: round2(subtotal - d) };
}

/** Descrição do serviço a partir das linhas (uma só linha de quantidade 1 vira o próprio nome). */
export function serviceDescription(lines: NotaLine[]): string {
  const named = lines.filter((l) => l.name.trim());
  return named.map((l) => {
    const base = l.description?.trim() ? `${l.name.trim()}: ${l.description.trim()}` : l.name.trim();
    if (named.length === 1 && l.quantity === 1) return base;
    const unit = l.unit?.trim() ? ` ${l.unit.trim()}` : "";
    return `${qtyText(l.quantity)}${unit} x ${base} (R$ ${moneyText(l.unitPrice)} cada)`;
  }).join("; ");
}

function municipioUf(city: string | null | undefined, uf: string | null | undefined): string {
  const c = (city ?? "").trim();
  const u = (uf ?? "").trim();
  return c && u ? `${c}/${u}` : c;
}

function prestadorSection(i: FichaInput, issues: FichaIssue[], kind: NotaKind): FichaSection {
  const p = i.prestador;
  const cnpj = cleanDocument(p.business_cnpj);
  const name = (p.business_name ?? "").trim();
  const mun = (p.business_municipio ?? "").trim();

  if (!cnpj) issues.push({ key: "p-cnpj", level: "obrigatorio", message: "Cadastre o CNPJ do seu MEI.", href: FIX.prestador, linkLabel: "Cadastrar" });
  else if (!isValidCnpj(cnpj)) issues.push({ key: "p-cnpj", level: "obrigatorio", message: "O CNPJ do seu MEI parece inválido. Confira os números.", href: FIX.prestador, linkLabel: "Corrigir" });
  if (!name) issues.push({ key: "p-nome", level: "recomendado", message: "Cadastre o nome do seu MEI (nome empresarial).", href: FIX.prestador, linkLabel: "Cadastrar" });
  if (!mun) issues.push({ key: "p-mun", level: "obrigatorio", message: "Cadastre o município do seu MEI.", href: FIX.prestador, linkLabel: "Cadastrar" });
  if (!(p.business_uf ?? "").trim()) issues.push({ key: "p-uf", level: "recomendado", message: "Cadastre o estado (UF) do seu MEI.", href: FIX.prestador, linkLabel: "Cadastrar" });
  if (!i.date) issues.push({ key: "date", level: "obrigatorio", message: kind === "servico" ? "Informe a data de competência (quando o serviço foi prestado)." : "Informe a data da emissão.", href: FIX.itens, linkLabel: "Informar" });

  const address = [(p.business_address ?? "").trim(), p.business_cep ? `CEP ${formatCep(p.business_cep)}` : ""].filter(Boolean).join(" · ");
  const fields: FichaField[] = [];
  if (kind === "servico") {
    fields.push(
      field("competencia", "Data de competência", i.date ? formatDateBR(i.date) : "", { need: "obrigatorio", hint: "Data em que o serviço foi prestado." }),
      field("emitente", "Emitente", "Prestador/Fornecedor", { hint: "Hoje só o prestador emite a NFS-e." }),
    );
  } else {
    fields.push(field("emissao", "Data da emissão", i.date ? formatDateBR(i.date) : "", { need: "obrigatorio" }));
  }
  fields.push(
    field("cnpj", "CNPJ", formatCnpj(cnpj), { need: "obrigatorio", copy: cnpj }),
    field("nome", kind === "servico" ? "Nome/Razão social" : "Razão social/Nome", name, { need: "recomendado", hint: kind === "servico" ? "O emissor preenche sozinho com os dados da Receita." : undefined }),
    field("municipio", kind === "servico" ? "Município do emissor" : "Município", municipioUf(mun, p.business_uf), {
      need: "obrigatorio", copy: mun,
      hint: kind === "servico" ? "É o que você informa no emissor; depois dele o sistema preenche CNPJ, razão social e inscrição municipal." : undefined,
    }),
  );
  if (kind === "servico") {
    fields.push(
      field("im", "Indicador municipal (inscrição municipal)", p.business_im, { hint: "Só se a prefeitura emitiu uma para você. O emissor preenche sozinho depois do município." }),
      field("opsn", "Opção no Simples Nacional", "Optante - Microempreendedor Individual (MEI)", { hint: "O emissor traz isso da Receita; confira se aparece MEI." }),
      field("endereco", "Endereço do emitente", address, { hint: "CEP, logradouro, número e bairro vêm da Receita; aqui é só para você conferir." }),
      field("ibs", "Preencher as informações IBS/CBS?", i.date >= "2027-01-01" ? "Confira no emissor" : "Não", {
        hint: i.date >= "2027-01-01"
          ? "O guia oficial prevê a exigência para o Simples Nacional a partir de 01/01/2027. Veja o que o emissor pede e fale com seu contador."
          : "Pelo guia oficial, para o Simples Nacional isso só passa a ser exigido a partir de 01/01/2027. Confira a tela do emissor.",
      }),
    );
  } else {
    fields.push(
      field("im", "Inscrição municipal", p.business_im),
      field("endereco", "Endereço", address, { hint: "Normalmente vem do seu cadastro na SEFAZ." }),
      field("crt", "Regime tributário (CRT)", "Simples Nacional - MEI (CRT 4)", { hint: "Se o emissor perguntar o regime, escolha o de MEI. Confira com seu contador." }),
    );
  }
  return {
    id: "prestador",
    title: kind === "servico" ? "Passo 1 · Pessoas: Emitente (Prestador)" : "Emitente (você)",
    note: kind === "servico" ? "No emissor, depois de informar o município, os dados do prestador aparecem preenchidos. Use esta parte para conferir." : undefined,
    fields,
  };
}

function tomadorSection(i: FichaInput, issues: FichaIssue[], kind: NotaKind): FichaSection {
  const t = i.tomador;
  const title = kind === "servico" ? "Passo 1 · Pessoas: Tomador" : "Destinatário (cliente)";
  // Na tela do emissor, "Compras governamentais" vem logo antes do tomador.
  const gov = field("gov", "Compras governamentais?", "Não", { hint: "Marque \"Sim\" só se o tomador for órgão público." });
  if (!t) {
    if (kind === "produto") {
      issues.push({ key: "t-none", level: "obrigatorio", message: "Escolha o cliente (destinatário) da NF-e.", href: FIX.tomador, linkLabel: "Escolher" });
    } else {
      issues.push({
        key: "t-none", level: "recomendado", href: FIX.tomador, linkLabel: "Escolher",
        message: "Sem tomador. O emissor aceita \"Tomador não informado\" para cliente pessoa física que não pediu nota; para empresa, informe o CNPJ.",
      });
    }
    return {
      id: "tomador", title,
      fields: kind === "servico"
        ? [gov, field("tipo", "Tomador", "Tomador não informado", { hint: "No emissor, marque \"Tomador não informado\"." })]
        : [field("tipo", "Destinatário", "")],
    };
  }

  const who = t.name.trim() || "o cliente";
  const fixHref = t.clientId ? FIX.clientes : FIX.tomador;
  const fixLabel = t.clientId ? "Abrir clientes" : "Preencher";
  const doc = cleanDocument(t.document);
  if (!t.name.trim()) issues.push({ key: "t-nome", level: "obrigatorio", message: "Informe o nome ou razão social do tomador.", href: fixHref, linkLabel: fixLabel });
  if (!doc) issues.push({ key: "t-doc", level: "obrigatorio", message: `Cadastre o CPF ou CNPJ de ${who}.`, href: fixHref, linkLabel: fixLabel });
  else if (!isValidDocument(doc)) issues.push({ key: "t-doc", level: "obrigatorio", message: `O CPF/CNPJ de ${who} parece inválido. Confira os números.`, href: fixHref, linkLabel: fixLabel });

  const cityUf = municipioUf(t.city, t.uf);
  const missingAddr: string[] = [];
  if (!normalizeCep(t.cep)) missingAddr.push("CEP");
  if (!t.address.trim()) missingAddr.push("logradouro");
  if (!t.address_number.trim()) missingAddr.push("número");
  if (!t.neighborhood.trim()) missingAddr.push("bairro");
  if (!t.city.trim()) missingAddr.push("município");
  if (missingAddr.length > 0) {
    issues.push({
      key: "t-end", level: "recomendado", href: fixHref, linkLabel: fixLabel,
      message: kind === "servico"
        ? `Endereço de ${who} incompleto (falta ${list(missingAddr)}). O emissor costuma pedir o endereço completo ao identificar o tomador; confira na tela.`
        : `Endereço de ${who} incompleto (falta ${list(missingAddr)}). A NF-e pede o endereço do destinatário.`,
    });
  }
  if (kind === "produto" && t.uf.trim() && !normalizeUf(t.uf)) {
    issues.push({ key: "t-uf", level: "recomendado", message: "O estado (UF) do cliente deve ter 2 letras (ex.: SP).", href: fixHref, linkLabel: fixLabel });
  }

  const fields: FichaField[] = [];
  if (kind === "servico") fields.push(gov, field("tipo", "Tomador", "Tomador do Brasil", { hint: "Escolha \"Tomador do Brasil\" no emissor." }));
  fields.push(
    field("doc", "CPF/CNPJ", formatDocument(doc), { need: "obrigatorio", copy: doc }),
    field("nome", "Nome/Razão social", t.name, { need: "obrigatorio" }),
    field("cep", "CEP", normalizeCep(t.cep) ? formatCep(t.cep) : t.cep, { need: "recomendado", copy: onlyDigits(t.cep) }),
    field("logradouro", "Logradouro", t.address, { need: "recomendado" }),
    field("numero", "Número", t.address_number, { need: "recomendado", hint: "Sem número, use S/N." }),
    field("complemento", "Complemento (opcional)", t.address_complement),
    field("bairro", "Bairro", t.neighborhood, { need: "recomendado" }),
    field("municipio", "Município", cityUf, { need: "recomendado", copy: t.city.trim() }),
    field("email", "E-mail (opcional)", t.email),
    field("telefone", "Telefone (opcional)", t.phone),
  );
  return {
    id: "tomador", title,
    note: kind === "servico" ? "Pessoa física: o emissor aceita \"Tomador não informado\". Se for identificar, preencha o que ele pedir." : undefined,
    fields,
  };
}

/** Valor único entre as linhas (ou o ajuste digitado). conflict = linhas com valores diferentes e nenhum ajuste. */
function pickCode(override: string | undefined, values: (string | null | undefined)[], normalize: (v: string | null | undefined) => string | null) {
  const o = (override ?? "").trim();
  if (o) {
    const n = normalize(o);
    return { value: n ?? o, valid: n !== null, conflict: false, fromOverride: true };
  }
  const distinct = Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean).map((v) => normalize(v) ?? v)));
  if (distinct.length === 0) return { value: "", valid: true, conflict: false, fromOverride: false };
  if (distinct.length > 1) return { value: distinct[0], valid: true, conflict: true, fromOverride: false };
  return { value: distinct[0], valid: normalize(distinct[0]) !== null, conflict: false, fromOverride: false };
}

const itemHref = (l: NotaLine): { href: string; linkLabel: string } =>
  l.itemId ? { href: `${FIX.produtos}?edit=${l.itemId}`, linkLabel: "Abrir cadastro" } : { href: FIX.servico, linkLabel: "Informar" };

// ---------------------------------------------------------------------------
// NFS-e (serviço)
// ---------------------------------------------------------------------------
function buildServico(i: FichaInput): Ficha {
  const issues: FichaIssue[] = [];
  const t = totals(i.lines, i.discount);
  const ov = i.service ?? {};
  const prestador = prestadorSection(i, issues, "servico");
  const tomador = tomadorSection(i, issues, "servico");

  if (i.lines.length === 0) issues.push({ key: "lines", level: "obrigatorio", message: "Adicione o serviço (do catálogo ou com descrição e valor).", href: FIX.itens, linkLabel: "Adicionar" });
  if (i.lines.some((l) => !l.name.trim())) issues.push({ key: "line-name", level: "obrigatorio", message: "Todo serviço precisa de uma descrição.", href: FIX.itens, linkLabel: "Corrigir" });
  if (i.lines.some((l) => !(l.quantity > 0) || !(l.unitPrice > 0))) issues.push({ key: "line-value", level: "obrigatorio", message: "Quantidade e valor precisam ser maiores que zero.", href: FIX.itens, linkLabel: "Corrigir" });
  if (t.discount > t.subtotal) issues.push({ key: "discount", level: "obrigatorio", message: "O desconto não pode ser maior que o valor do serviço.", href: FIX.itens, linkLabel: "Corrigir" });

  // Um serviço = um código: o emissor aceita um só Código de Tributação Nacional por nota.
  const ctrib = pickCode(ov.ctribNac, i.lines.map((l) => l.ctribNac), normalizeCTribNac);
  if (ctrib.conflict) {
    issues.push({ key: "ctrib-conflict", level: "obrigatorio", message: "Os serviços escolhidos têm códigos de tributação diferentes. O emissor aceita um código por nota: emita uma nota para cada código (ou informe o código nos ajustes do serviço).", href: FIX.servico, linkLabel: "Ajustar" });
  } else if (!ctrib.value) {
    const without = i.lines.find((l) => l.itemId && !(l.ctribNac ?? "").trim());
    if (without) issues.push({ key: "ctrib", level: "obrigatorio", message: `Cadastre o código de tributação nacional de "${without.name}" (formato 01.01.01).`, ...itemHref(without) });
    else issues.push({ key: "ctrib", level: "obrigatorio", message: "Informe o código de tributação nacional do serviço (formato 01.01.01).", href: FIX.servico, linkLabel: "Informar" });
  } else if (!ctrib.valid) {
    issues.push({ key: "ctrib", level: "obrigatorio", message: "O código de tributação nacional tem 6 dígitos (formato 01.01.01).", href: FIX.servico, linkLabel: "Corrigir" });
  }

  const nbs = pickCode(ov.nbs, i.lines.map((l) => l.nbs), normalizeNbs);
  if (!nbs.value) {
    const first = i.lines.find((l) => l.itemId);
    issues.push({
      key: "nbs", level: "recomendado",
      message: "Item da NBS não informado. O emissor tem esse campo no serviço e pode pedi-lo; confira ao emitir.",
      ...(first ? itemHref(first) : { href: FIX.servico, linkLabel: "Informar" }),
    });
  } else if (!nbs.valid) {
    issues.push({ key: "nbs", level: "recomendado", message: "O item da NBS tem 9 dígitos (formato 1.0101.10.00).", href: FIX.servico, linkLabel: "Corrigir" });
  }
  const municipalCode = pickCode(ov.municipalCode, i.lines.map((l) => l.municipalCode), (v) => (v ?? "").trim() || null);

  const city = (ov.city ?? "").trim() || (i.prestador.business_municipio ?? "").trim();
  const description = serviceDescription(i.lines);

  const servico: FichaSection = {
    id: "servico",
    title: "Passo 2 · Serviço",
    note: "O emissor pede um único código de tributação por nota. Digite o código (ou parte do nome do serviço) e escolha na lista que aparece.",
    fields: [
      field("pais", "País da prestação", "Brasil"),
      field("cidade", "Município da prestação", city, { need: "obrigatorio", hint: "Onde o serviço foi prestado. Em geral é o município do seu MEI." }),
      field("ctrib", "Código de Tributação Nacional", ctrib.value, { need: "obrigatorio", hint: "Pesquise na lista oficial; o Jakash não confere se o código existe." }),
      field("ctribMun", "Código complementar do município (se houver)", municipalCode.value, { hint: "Só aparece se o seu município tiver códigos complementares." }),
      field("imunidade", "Imunidade, exportação ou não incidência do ISSQN?", "Não"),
      field("nbs", "Item da NBS correspondente ao serviço", nbs.value, { need: "recomendado", hint: "Se o emissor pedir, escolha o item que combina com o seu código." }),
      field("descricao", "Descrição do serviço", description, { need: "obrigatorio" }),
    ],
  };

  const valores: FichaSection = {
    id: "valores",
    title: "Passo 3 · Valores",
    fields: [
      field("valor", "Valor do serviço prestado", t.subtotal > 0 ? moneyText(t.subtotal) : "", { need: "obrigatorio" }),
      field("desconto", "Desconto incondicionado (opcional)", t.discount > 0 ? moneyText(t.discount) : "", { hint: "Reduz o valor da nota. Deixe em branco se não houver." }),
      field("liquido", "Total que o cliente paga (conferência)", t.subtotal > 0 ? moneyText(t.total) : "", { hint: "O emissor calcula; use só para conferir." }),
    ],
  };

  const tributacao: FichaSection = {
    id: "tributacao",
    title: "Passo 3 · Tributação (MEI)",
    note: "O ISS do MEI já vai no DAS mensal. Para MEI o emissor não pede alíquota, dedução nem benefício municipal e não aceita retenção de ISSQN. Os campos federais (PIS/COFINS etc.) vêm preenchidos pelo emissor. Em Configurações do emissor, o valor aproximado dos tributos costuma ficar em \"Não informar nenhum valor estimado\". Confira com seu contador.",
    fields: [
      field("regime", "Opção no Simples Nacional", "Optante - Microempreendedor Individual (MEI)"),
      field("regesp", "Regime especial de tributação", "Nenhum"),
      field("susp", "Exigibilidade do ISSQN suspensa?", "Não"),
      field("ret", "Retenção do ISSQN", "Não", { hint: "Para MEI o emissor só aceita \"não retido\"." }),
    ],
  };

  const sections = [prestador, tomador, servico, valores, tributacao];
  return {
    kind: "servico", title: "Ficha da NFS-e (Emissor Nacional)", issuerName: "Emissor Nacional da NFS-e", sections,
    issues: sortIssues(issues), subtotal: t.subtotal, discount: t.discount, total: t.total, summary: description,
    ready: !issues.some((x) => x.level === "obrigatorio"),
    notes: [
      "Para cliente pessoa jurídica, o MEI deve emitir a NFS-e; para pessoa física a emissão costuma ser facultativa (emita se o cliente pedir). A exigência também depende do município: confira com seu contador.",
    ],
  };
}

// ---------------------------------------------------------------------------
// NF-e (produto)
// ---------------------------------------------------------------------------
function buildProduto(i: FichaInput): Ficha {
  const issues: FichaIssue[] = [];
  const t = totals(i.lines, i.discount);
  const prestador = prestadorSection(i, issues, "produto");
  const tomador = tomadorSection(i, issues, "produto");
  const sections: FichaSection[] = [prestador, tomador];

  if (i.lines.length === 0) issues.push({ key: "lines", level: "obrigatorio", message: "Adicione o produto (do catálogo ou com descrição e valor).", href: FIX.itens, linkLabel: "Adicionar" });
  if (t.discount > t.subtotal) issues.push({ key: "discount", level: "obrigatorio", message: "O desconto não pode ser maior que o valor dos produtos.", href: FIX.itens, linkLabel: "Corrigir" });

  const fromUf = (i.prestador.business_uf ?? "").trim().toUpperCase();
  const toUf = (i.tomador?.uf ?? "").trim().toUpperCase();

  i.lines.forEach((l, idx) => {
    const n = idx + 1;
    const label = l.name.trim() || `item ${n}`;
    const fix = l.itemId ? { href: `${FIX.produtos}?edit=${l.itemId}`, linkLabel: "Abrir cadastro" } : { href: FIX.itens, linkLabel: "Corrigir" };
    const ncm = normalizeNcm(l.ncm);
    const cfop = normalizeCfop(l.cfop);
    if (!l.name.trim()) issues.push({ key: `l${n}-name`, level: "obrigatorio", message: `Produto ${n} sem descrição.`, href: FIX.itens, linkLabel: "Corrigir" });
    if (!(l.ncm ?? "").trim()) issues.push({ key: `l${n}-ncm`, level: "obrigatorio", message: `Cadastre o NCM de "${label}" (8 dígitos).`, ...fix });
    else if (!ncm) issues.push({ key: `l${n}-ncm`, level: "obrigatorio", message: `O NCM de "${label}" deve ter 8 dígitos.`, ...fix });
    if (!(l.cfop ?? "").trim()) issues.push({ key: `l${n}-cfop`, level: "obrigatorio", message: `Cadastre o CFOP de "${label}" (4 dígitos).`, ...fix });
    else if (!cfop) issues.push({ key: `l${n}-cfop`, level: "obrigatorio", message: `O CFOP de "${label}" deve ter 4 dígitos.`, ...fix });
    else if (fromUf && toUf && cfop) {
      if (fromUf === toUf && cfop[0] === "6") issues.push({ key: `l${n}-cfop-uf`, level: "recomendado", message: `O CFOP de "${label}" começa com 6 (outro estado), mas o cliente é do mesmo estado do seu MEI. Confira.`, ...fix });
      if (fromUf !== toUf && cfop[0] === "5") issues.push({ key: `l${n}-cfop-uf`, level: "recomendado", message: `O CFOP de "${label}" começa com 5 (dentro do estado), mas o cliente é de outro estado. Para outro estado o CFOP costuma começar com 6. Confira.`, ...fix });
    }
    if (!(l.unit ?? "").trim()) issues.push({ key: `l${n}-un`, level: "obrigatorio", message: `Informe a unidade de "${label}" (un, kg, m...).`, ...fix });
    if (!(l.quantity > 0) || !(l.unitPrice > 0)) issues.push({ key: `l${n}-val`, level: "obrigatorio", message: `Quantidade e valor de "${label}" precisam ser maiores que zero.`, href: FIX.itens, linkLabel: "Corrigir" });

    sections.push({
      id: `item-${n}`,
      title: i.lines.length > 1 ? `Produto ${n}` : "Produto",
      note: idx === 0 ? "Consulta de NCM: portal oficial do governo (link abaixo). Para revenda o CFOP costuma ser 5.102 (mesmo estado) ou 6.102 (outro estado); confira com seu contador." : undefined,
      fields: [
        field("desc", "Descrição do produto", l.description?.trim() ? `${l.name.trim()}: ${l.description.trim()}` : l.name, { need: "obrigatorio" }),
        field("ncm", "NCM", ncm ? formatNcm(ncm) : (l.ncm ?? ""), { need: "obrigatorio", copy: ncm ?? onlyDigits(l.ncm) }),
        field("cfop", "CFOP", cfop ? formatCfop(cfop) : (l.cfop ?? ""), { need: "obrigatorio", copy: cfop ?? onlyDigits(l.cfop) }),
        field("un", "Unidade comercial", l.unit, { need: "obrigatorio" }),
        field("qtd", "Quantidade comercial", l.quantity > 0 ? qtyText(l.quantity) : "", { need: "obrigatorio" }),
        field("vun", "Valor unitário", l.unitPrice > 0 ? moneyText(l.unitPrice) : "", { need: "obrigatorio" }),
        field("vtot", "Valor total do item", l.quantity > 0 && l.unitPrice > 0 ? moneyText(lineTotal(l)) : ""),
      ],
    });
  });

  sections.push({
    id: "totais", title: "Totais",
    fields: [
      field("produtos", "Valor total dos produtos", t.subtotal > 0 ? moneyText(t.subtotal) : "", { need: "obrigatorio" }),
      field("desconto", "Desconto (opcional)", t.discount > 0 ? moneyText(t.discount) : ""),
      field("nota", "Valor total da nota", t.subtotal > 0 ? moneyText(t.total) : ""),
    ],
  });

  sections.push({
    id: "tributacao", title: "Tributação (MEI)",
    note: "O emissor de NF-e é o da SEFAZ do seu estado (ou um emissor gratuito liberado por ela). As telas e os códigos de tributação mudam um pouco de estado para estado: use isto como roteiro e confira com seu contador. PIS/COFINS seguem a orientação da Receita/contador.",
    fields: [
      field("icms", "ICMS: situação tributária (Simples Nacional)", "400 - Não tributada pelo Simples Nacional", { hint: "É o que a SEFAZ-RS usa para MEI; confira no seu estado." }),
      field("ipi", "IPI e imposto de importação", "Deixar em branco"),
    ],
  });

  return {
    kind: "produto", title: "Ficha da NF-e (produtos)", issuerName: "emissor de NF-e da SEFAZ do seu estado", sections,
    issues: sortIssues(issues), subtotal: t.subtotal, discount: t.discount, total: t.total,
    summary: i.lines.filter((l) => l.name.trim()).map((l) => `${qtyText(l.quantity)}${l.unit?.trim() ? ` ${l.unit.trim()}` : ""} x ${l.name.trim()}`).join("; "),
    ready: !issues.some((x) => x.level === "obrigatorio"),
    notes: [
      "Em geral, o MEI está dispensado de emitir nota na venda a consumidor final pessoa física (se o cliente não pedir e não houver entrega). Vendas para empresa e produtos enviados ao cliente costumam exigir NF-e. As regras são estaduais: confira com seu contador.",
    ],
  };
}

const sortIssues = (list: FichaIssue[]): FichaIssue[] => [...list].sort((a, b) => (a.level === b.level ? 0 : a.level === "obrigatorio" ? -1 : 1));

export function buildFicha(input: FichaInput): Ficha {
  return input.kind === "servico" ? buildServico(input) : buildProduto(input);
}

// ---------------------------------------------------------------------------
// Texto para "Copiar tudo"
// ---------------------------------------------------------------------------
/** Ficha inteira em texto simples, na ordem das telas do emissor. `generatedOn` é AAAA-MM-DD. */
export function fichaToText(f: Ficha, generatedOn: string): string {
  const out: string[] = [f.title.toUpperCase(), `Montada no Jakash em ${formatDateBR(generatedOn)}. O Jakash não emite nota fiscal: copie os dados para o ${f.issuerName} e confira cada campo.`, ""];
  for (const s of f.sections) {
    out.push(`== ${s.title} ==`);
    for (const fl of s.fields) {
      if (!fl.value && !fl.need) continue;
      out.push(`${fl.label}: ${fl.value || "(preencher)"}`);
    }
    out.push("");
  }
  if (f.issues.length > 0) {
    out.push("== PENDÊNCIAS ==");
    for (const x of f.issues) out.push(`- ${x.level === "obrigatorio" ? "Falta" : "Confira"}: ${x.message}`);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Cadastro (catálogo) e formulários
// ---------------------------------------------------------------------------
export type ItemForm = {
  kind: NotaKind; name: string; description: string; unit_price: string; unit: string;
  ctrib_nac: string; nbs: string; municipal_code: string; ncm: string; cfop: string;
};
export const EMPTY_ITEM_FORM: ItemForm = { kind: "servico", name: "", description: "", unit_price: "", unit: "", ctrib_nac: "", nbs: "", municipal_code: "", ncm: "", cfop: "" };

export type ItemRow = {
  kind: NotaKind; name: string; description: string | null; unit_price: number; unit: string | null;
  ctrib_nac: string | null; nbs: string | null; municipal_code: string | null; ncm: string | null; cfop: string | null;
};

/** Confere o formulário do catálogo e devolve a linha pronta para gravar, ou a mensagem de erro. `price` já vem convertido (parseMoney). */
export function validateItemForm(f: ItemForm, price: number): { ok: true; row: ItemRow } | { ok: false; error: string } {
  const name = f.name.trim();
  if (!name) return { ok: false, error: "Informe o nome." };
  if (name.length > 120) return { ok: false, error: "O nome pode ter até 120 letras." };
  if (f.description.trim().length > 500) return { ok: false, error: "A descrição pode ter até 500 letras." };
  if (f.unit_price.trim() && !(price >= 0)) return { ok: false, error: "Valor inválido." };
  const unit = f.unit.trim();
  if (unit.length > 10) return { ok: false, error: "A unidade pode ter até 10 letras (un, h, kg...)." };

  const row: ItemRow = {
    kind: f.kind, name, description: f.description.trim() || null, unit_price: f.unit_price.trim() ? price : 0, unit: unit || null,
    ctrib_nac: null, nbs: null, municipal_code: null, ncm: null, cfop: null,
  };
  if (f.kind === "servico") {
    if (f.ctrib_nac.trim()) {
      const c = normalizeCTribNac(f.ctrib_nac);
      if (!c) return { ok: false, error: "O código de tributação nacional tem 6 dígitos (ex.: 01.01.01)." };
      row.ctrib_nac = c;
    }
    if (f.nbs.trim()) {
      const n = normalizeNbs(f.nbs);
      if (!n) return { ok: false, error: "O item da NBS tem 9 dígitos (ex.: 1.0101.10.00)." };
      row.nbs = n;
    }
    if (f.municipal_code.trim().length > 10) return { ok: false, error: "O código complementar do município pode ter até 10 caracteres." };
    row.municipal_code = f.municipal_code.trim() || null;
  } else {
    if (f.ncm.trim()) {
      const n = normalizeNcm(f.ncm);
      if (!n) return { ok: false, error: "O NCM tem 8 dígitos (ex.: 6109.10.00)." };
      row.ncm = n;
    }
    if (f.cfop.trim()) {
      const c = normalizeCfop(f.cfop);
      if (!c) return { ok: false, error: "O CFOP tem 4 dígitos (ex.: 5.102)." };
      row.cfop = c;
    }
  }
  return { ok: true, row };
}

export function itemFormFrom(it: CatalogItem): ItemForm {
  return {
    kind: it.kind, name: it.name, description: it.description ?? "", unit_price: it.unit_price > 0 ? moneyText(it.unit_price) : "", unit: it.unit ?? "",
    ctrib_nac: it.ctrib_nac ?? "", nbs: it.nbs ?? "", municipal_code: it.municipal_code ?? "", ncm: it.ncm ? formatNcm(it.ncm) : "", cfop: it.cfop ? formatCfop(it.cfop) : "",
  };
}

/** Texto de recibo a partir de um item do catálogo (nome e, se houver, a descrição), dentro do limite de 500 letras. */
export function receiptNotesFor(item: Pick<CatalogItem, "name" | "description">): string {
  const t = item.description?.trim() ? `${item.name.trim()}: ${item.description.trim()}` : item.name.trim();
  return t.slice(0, 500);
}

/** Dados do prestador digitados na tela, prontos para gravar no perfil (códigos conferidos). */
export type PrestadorForm = { business_name: string; business_cnpj: string; business_municipio: string; business_uf: string; business_im: string; business_cep: string; business_address: string };

export function validatePrestadorForm(f: PrestadorForm): { ok: true; row: Record<string, string | null> } | { ok: false; error: string } {
  const cnpj = cleanDocument(f.business_cnpj);
  if (cnpj && !isValidCnpj(cnpj)) return { ok: false, error: "O CNPJ parece inválido. Confira os números." };
  const uf = f.business_uf.trim();
  if (uf && !normalizeUf(uf)) return { ok: false, error: "O estado (UF) deve ter 2 letras, como SP." };
  const cep = f.business_cep.trim();
  if (cep && !normalizeCep(cep)) return { ok: false, error: "O CEP tem 8 números." };
  if (f.business_name.trim().length > 120) return { ok: false, error: "O nome pode ter até 120 letras." };
  if (f.business_municipio.trim().length > 80) return { ok: false, error: "O município pode ter até 80 letras." };
  if (f.business_im.trim().length > 20) return { ok: false, error: "A inscrição municipal pode ter até 20 caracteres." };
  if (f.business_address.trim().length > 200) return { ok: false, error: "O endereço pode ter até 200 letras." };
  return {
    ok: true,
    row: {
      business_name: f.business_name.trim() || null,
      business_cnpj: cnpj ? formatCnpj(cnpj) : null,
      business_municipio: f.business_municipio.trim() || null,
      business_uf: uf ? normalizeUf(uf) : null,
      business_im: f.business_im.trim() || null,
      business_cep: cep ? normalizeCep(cep) : null,
      business_address: f.business_address.trim() || null,
    },
  };
}

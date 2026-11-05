// Lançamento por voz: entende uma frase em português ("gastei 50 reais no almoço ontem") e devolve um RASCUNHO.
// Função pura (sem rede, sem banco, sem relógio: a data de hoje entra por parâmetro). Nada daqui grava nada:
// a tela preenche o formulário e a pessoa confere e toca em Salvar.
import type { CatRow } from "@/lib/categories";
import { defaultCategory, lightNorm } from "@/lib/importer";

export type FlowType = "income" | "expense";

export type VoiceItem = {
  type: FlowType | null;
  amount: number | null;
  description: string;
  categoryId: string | null;
  date: string | null; // AAAA-MM-DD (nunca no futuro)
  isBusiness: boolean | null; // null = não foi dito
};

export type VoiceParse = {
  text: string;
  items: VoiceItem[];
  /** true quando não achei valor ou tipo (receita/despesa) no primeiro item: vale chamar a IA (se a pessoa tiver acesso). */
  needsAi: boolean;
};

export type VoiceOpts = { today: string; categories: CatRow[] };

// ---------- datas (tudo em UTC, só strings AAAA-MM-DD) ----------

const p2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;
function validYMD(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function splitISO(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}
export function addDays(iso: string, delta: number): string {
  const [y, m, d] = splitISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function weekdayOf(iso: string): number {
  const [y, m, d] = splitISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
}
/** "dia 5": o dia 5 mais recente que não está no futuro (hoje conta). */
function recentDayOfMonth(today: string, day: number): string | null {
  const [ty, tm] = splitISO(today);
  for (let k = 0; k < 24; k++) {
    const idx = ty * 12 + (tm - 1) - k;
    const y = Math.floor(idx / 12), m = (idx % 12) + 1;
    if (!validYMD(y, m, day)) continue;
    const c = isoOf(y, m, day);
    if (c <= today) return c;
  }
  return null;
}
/** "5 de outubro" sem ano: a ocorrência mais recente que não está no futuro. */
function recentDayMonth(today: string, day: number, month: number): string | null {
  const [ty] = splitISO(today);
  for (let y = ty; y > ty - 9; y--) {
    if (!validYMD(y, month, day)) continue;
    const c = isoOf(y, month, day);
    if (c <= today) return c;
  }
  return null;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

// ---------- números ----------

const UNITS: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const TEENS: Record<string, number> = { dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const TENS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const HUNDREDS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800,
  novecentos: 900, novecentas: 900,
};
const isNumWord = (w: string | undefined): boolean =>
  w !== undefined && (w in UNITS || w in TEENS || w in TENS || w in HUNDREDS || w === "mil" || w === "milhao" || w === "milhoes");

const CURRENCY = new Set(["real", "reais", "conto", "contos", "pila", "pilas", "prata", "pratas"]);
const isCurrency = (w: string | undefined): boolean => w !== undefined && CURRENCY.has(w);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "50", "50,90", "1.234,56", "r$50", "1,5k" -> número (null se não for um valor). */
export function parseDigits(n: string): number | null {
  const m = n.match(/^(?:r\$)?(\d+(?:[.,]\d+)*)(k)?$/);
  if (!m) return null;
  const s = m[1];
  let v: number;
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length > 2) return null;
    const [int, dec] = parts;
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(int)) return null;
    if (dec.length <= 2) v = Number(`${int.replace(/\./g, "")}.${dec}`);
    else if (dec.length === 3 && !int.includes(".")) v = Number(int + dec); // "1,500" (milhar escrito à inglesa)
    else return null;
  } else if (s.includes(".")) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) v = Number(s.replace(/\./g, ""));
    else if (/^\d+\.\d{1,2}$/.test(s)) v = Number(s);
    else return null;
  } else {
    v = Number(s);
  }
  if (m[2]) v *= 1000;
  return Number.isFinite(v) ? round2(v) : null;
}

/** "cento e vinte e cinco", "dois mil e quinhentos", "mil" -> valor e índice do token seguinte. */
function parseWords(n: string[], i: number): { value: number; end: number } | null {
  let total = 0, group = 0, j = i, lastEnd = i, lastValue = 0, sawMil = false;
  let cls: "none" | "hundred" | "tens" | "small" = "none";
  let any = false;
  while (j < n.length) {
    let k = j;
    if (n[k] === "e" && any && isNumWord(n[k + 1])) k++;
    const w = n[k];
    if (w === undefined) break;
    let ok = false;
    if (w in HUNDREDS) {
      if (cls === "none") { group += HUNDREDS[w]; cls = "hundred"; ok = true; }
    } else if (w in TENS) {
      if (cls === "none" || cls === "hundred") { group += TENS[w]; cls = "tens"; ok = true; }
    } else if (w in TEENS) {
      if (cls === "none" || cls === "hundred") { group += TEENS[w]; cls = "small"; ok = true; }
    } else if (w in UNITS) {
      if (cls === "none" || cls === "hundred" || cls === "tens") { group += UNITS[w]; cls = "small"; ok = true; }
    } else if (w === "mil") {
      if (!sawMil && total === 0) { total += (group || 1) * 1000; group = 0; cls = "none"; sawMil = true; ok = true; }
    } else if (w === "milhao" || w === "milhoes") {
      if (!sawMil && total === 0) { total += (group || 1) * 1_000_000; group = 0; cls = "none"; sawMil = true; ok = true; }
    }
    if (!ok) break;
    any = true;
    j = k + 1;
    lastEnd = j;
    lastValue = total + group;
  }
  return any ? { value: lastValue, end: lastEnd } : null;
}

/** Número pequeno (< 1000, inteiro) em dígitos ou por extenso: usado em "2 mil e 500" e "50 reais e 90 centavos". */
function parseSmall(n: string[], i: number, max: number): { value: number; end: number } | null {
  const d = n[i] !== undefined && /^\d{1,3}$/.test(n[i]) ? Number(n[i]) : null;
  if (d !== null) return d < max ? { value: d, end: i + 1 } : null;
  const w = parseWords(n, i);
  return w && w.value < max && !n.slice(i, w.end).some((t) => t === "mil" || t === "milhao" || t === "milhoes") ? w : null;
}

type AmountHit = { value: number; end: number; marked: boolean };

function scanAmount(n: string[], i: number): AmountHit | null {
  let j = i, marked = false;
  if (n[j] === "r$") { marked = true; j++; }
  if (j >= n.length) return null;
  let value: number;
  const dig = parseDigits(n[j]);
  if (dig !== null) {
    if (n[j].startsWith("r$")) marked = true;
    value = dig;
    j++;
    const sc = n[j];
    if (sc === "mil" || sc === "milhao" || sc === "milhoes") {
      value *= sc === "mil" ? 1000 : 1_000_000;
      j++;
      if (n[j] === "e") {
        const t = parseSmall(n, j + 1, 1000);
        if (t) { value += t.value; j = t.end; }
      }
    }
  } else {
    const w = parseWords(n, j);
    if (!w) return null;
    value = w.value;
    j = w.end;
  }
  if (isCurrency(n[j])) {
    marked = true;
    j++;
    if (n[j] === "e") {
      const c = parseSmall(n, j + 1, 100);
      if (c && (n[c.end] === "centavo" || n[c.end] === "centavos")) { value += c.value / 100; j = c.end + 1; }
    }
  }
  return { value: round2(value), end: j, marked };
}

// ---------- palavras-chave ----------

const EXPENSE_WORDS = new Set([
  "gastei", "gastamos", "gasto", "gastou", "paguei", "pagamos", "pago", "pagar", "comprei", "compramos",
  "despesa", "perdi", "custou", "saiu", "debitou", "doei",
]);
const INCOME_WORDS = new Set([
  "recebi", "recebemos", "recebo", "receber", "recebimento", "ganhei", "ganhamos", "ganho", "entrou", "receita",
  "vendi", "vendemos", "faturei", "caiu", "depositaram", "depositou", "rendeu",
]);
const BIZ_WORDS = new Set(["empresa", "mei", "cnpj", "firma", "empresarial", "negocio"]);
const PREPS = new Set(["de", "do", "da", "pra", "para", "pro", "na", "no", "pela", "pelo", "em", "com", "a", "o"]);
const STOP = new Set([
  "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "em", "com", "pra", "para", "pro", "pelo", "pela", "por", "um", "uma", "uns", "umas",
  "o", "a", "os", "as", "ao", "aos", "que", "foi", "eu", "meu", "minha", "meus", "minhas", "e", "ai", "la", "so", "mais", "tambem", "valor",
  "total", "lancamento", "lancar", "lanca", "lance", "registrar", "registra", "registre", "anota", "anotar", "anote", "adiciona",
  "adicionar", "adicione", "coloca", "colocar", "novo", "nova", "ate", "deu", "foram", "sao", "era", "ser", "isso", "esse", "essa", "esta",
  "este", "nesse", "nessa", "neste", "nesta", "tipo", "assim", "ja", "ainda", "la", "aqui", "depois",
]);
const SMALL_OK_NEXT = new Set(["no", "na", "em", "de", "do", "da", "com", "pra", "para", "pro"]);
const CONNECTORS = new Set(["e", "depois", "tambem", "mais"]);
const NOT_AMOUNT_NEXT = new Set([
  "dia", "dias", "hora", "horas", "h", "minuto", "minutos", "ano", "anos", "mes", "meses", "semana", "semanas", "vez", "vezes", "parcela",
  "parcelas", "x", "km", "kg", "g", "l", "litro", "litros", "unidade", "unidades", "pessoa", "pessoas",
]);

// Palavras faladas -> dicas de nome de categoria (a primeira dica que existir para a pessoa vence).
type KwRule = { words: string[]; type: FlowType; hints: string[] };
const KW: KwRule[] = [
  { words: ["freela", "freelance", "freelancer", "consultoria", "cliente", "honorarios", "projeto"], type: "income", hints: ["prestacao de servicos", "vendas e servicos", "servicos", "receita"] },
  { words: ["salario", "pagamento mensal", "quinzena", "bonus", "ferias", "decimo terceiro", "13o"], type: "income", hints: ["salario"] },
  { words: ["venda", "vendas", "vendi"], type: "income", hints: ["venda de produtos", "vendas e servicos", "vendas"] },
  { words: ["rendimento", "rendimentos", "dividendo", "dividendos", "juros"], type: "income", hints: ["juros e dividendos", "rendimentos"] },
  { words: ["reembolso", "estorno", "devolucao"], type: "income", hints: ["reembolso", "outros"] },
  { words: ["almoco", "almocei", "janta", "jantar", "jantei", "lanche", "refeicao", "comida", "restaurante", "pizza", "hamburguer", "marmita", "churrasco", "sorvete", "sobremesa", "ifood", "rappi", "delivery", "cafe da manha", "cafe da tarde", "bar"],
    type: "expense", hints: ["restaurantes", "restaurante", "delivery", "alimentacao"] },
  { words: ["padaria", "pao", "paes", "cafe", "cafezinho", "bolo", "salgado", "acai"], type: "expense", hints: ["padaria e lanches", "padaria", "alimentacao"] },
  { words: ["mercado", "supermercado", "feira", "hortifruti", "sacolao", "atacadao", "compras do mes", "açougue", "acougue"], type: "expense", hints: ["supermercado", "mercado", "feira e hortifruti", "alimentacao"] },
  { words: ["uber", "99", "taxi", "corrida", "cabify"], type: "expense", hints: ["aplicativos de transporte", "aplicativos", "transporte"] },
  { words: ["gasolina", "combustivel", "etanol", "diesel", "posto", "abasteci", "abastecer", "abastecimento"], type: "expense", hints: ["combustivel", "transporte"] },
  { words: ["estacionamento", "pedagio", "sem parar"], type: "expense", hints: ["estacionamento e pedagio", "estacionamento", "transporte"] },
  { words: ["onibus", "metro", "passagem", "bilhete", "trem", "busao"], type: "expense", hints: ["transporte publico", "transporte"] },
  { words: ["oficina", "mecanico", "pneu", "revisao", "lava jato"], type: "expense", hints: ["manutencao do veiculo", "transporte"] },
  { words: ["farmacia", "remedio", "remedios", "medicamento", "medicamentos", "drogaria"], type: "expense", hints: ["farmacia", "saude"] },
  { words: ["medico", "consulta", "psicologo", "terapia", "fisioterapia", "clinica"], type: "expense", hints: ["consultas", "saude"] },
  { words: ["dentista"], type: "expense", hints: ["dentista", "saude"] },
  { words: ["exame", "exames", "laboratorio"], type: "expense", hints: ["exames", "saude"] },
  { words: ["luz", "energia", "conta de luz"], type: "expense", hints: ["energia eletrica", "energia", "moradia"] },
  { words: ["agua", "conta de agua"], type: "expense", hints: ["agua", "moradia"] },
  { words: ["gas", "botijao"], type: "expense", hints: ["gas", "moradia"] },
  { words: ["internet", "wifi", "wi fi", "fibra"], type: "expense", hints: ["internet e tv", "internet", "moradia"] },
  { words: ["aluguel", "aluguer"], type: "expense", hints: ["aluguel", "moradia"] },
  { words: ["condominio"], type: "expense", hints: ["condominio", "moradia"] },
  { words: ["iptu", "ipva", "imposto", "impostos", "das", "darf", "multa"], type: "expense", hints: ["impostos", "taxas"] },
  { words: ["celular", "recarga", "telefone", "plano do celular"], type: "expense", hints: ["celular", "servicos"] },
  { words: ["netflix", "spotify", "assinatura", "streaming", "disney", "youtube premium"], type: "expense", hints: ["assinaturas e streaming", "assinaturas", "servicos"] },
  { words: ["cinema", "show", "ingresso", "teatro", "festa", "balada", "cerveja", "jogo", "passeio"], type: "expense", hints: ["cinema, shows e teatro", "lazer"] },
  { words: ["academia", "esporte"], type: "expense", hints: ["esporte e academia", "lazer"] },
  { words: ["roupa", "roupas", "camisa", "camiseta", "tenis", "sapato", "calca", "vestido", "blusa"], type: "expense", hints: ["roupas e calcados", "roupas", "compras"] },
  { words: ["presente", "shopping", "loja", "amazon", "shopee", "mercado livre"], type: "expense", hints: ["compras online", "compras"] },
  { words: ["barbearia", "cabelo", "salao", "manicure", "corte de cabelo"], type: "expense", hints: ["cuidados pessoais", "compras"] },
  { words: ["curso", "escola", "faculdade", "livro", "mensalidade", "material escolar"], type: "expense", hints: ["cursos", "escola e faculdade", "educacao"] },
  { words: ["pet", "racao", "veterinario", "cachorro", "gato", "petshop"], type: "expense", hints: ["racao e petiscos", "veterinario", "pet"] },
  { words: ["hotel", "viagem", "passagem aerea", "airbnb", "hospedagem"], type: "expense", hints: ["hospedagem", "viagens"] },
  { words: ["dizimo", "oferta", "doacao", "igreja"], type: "expense", hints: ["doacoes"] },
];

// ---------- tokens ----------

type Tok = { raw: string; n: string; comma: boolean };

const stripAcc = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const w of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (!w) continue;
    const comma = /[,;]$/.test(w);
    const raw = w.replace(/^[^\p{L}\p{N}$]+/u, "").replace(/[^\p{L}\p{N}%$]+$/u, "");
    if (!raw) continue;
    out.push({ raw, n: stripAcc(raw).toLowerCase().replace(/-feira$/, ""), comma });
  }
  return out;
}

type Hit<T> = { i: number; end: number; v: T };

function scanDate(n: string[], i: number, today: string): { date: string | null; end: number } | null {
  const w = n[i];
  const dayPart = (j: number): number => {
    let k = j;
    if ((n[k] === "a" || n[k] === "de" || n[k] === "da" || n[k] === "pela") && (n[k + 1] === "noite" || n[k + 1] === "manha" || n[k + 1] === "tarde")) k += 2;
    else if (n[k] === "cedo") k += 1;
    return k;
  };
  if (w === "hoje" || w === "agora") return { date: today, end: dayPart(i + 1) };
  if (w === "ontem") return { date: addDays(today, -1), end: dayPart(i + 1) };
  if (w === "anteontem") return { date: addDays(today, -2), end: dayPart(i + 1) };
  if (w === "antes" && n[i + 1] === "de" && n[i + 2] === "ontem") return { date: addDays(today, -2), end: i + 3 };

  // "há 3 dias" / "3 dias atrás"
  if (w === "ha" && /^\d{1,3}$/.test(n[i + 1] ?? "") && (n[i + 2] === "dia" || n[i + 2] === "dias")) {
    const k = Number(n[i + 1]);
    return { date: k <= 3650 ? addDays(today, -k) : null, end: i + 3 };
  }
  if (/^\d{1,3}$/.test(w) && (n[i + 1] === "dia" || n[i + 1] === "dias") && n[i + 2] === "atras") {
    return { date: addDays(today, -Number(w)), end: i + 3 };
  }

  // dd/mm e dd/mm/aaaa
  const sl = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (sl) {
    const d = Number(sl[1]), m = Number(sl[2]);
    if (sl[3]) {
      const y = sl[3].length === 2 ? 2000 + Number(sl[3]) : Number(sl[3]);
      const c = validYMD(y, m, d) ? isoOf(y, m, d) : null;
      return { date: c && c <= today ? c : null, end: i + 1 };
    }
    return { date: m >= 1 && m <= 12 ? recentDayMonth(today, d, m) : null, end: i + 1 };
  }

  // "dia 5", "dia 5 de outubro", "5 de outubro", "5 de outubro de 2025"
  let k = i, hasDia = false;
  if (w === "dia" && /^\d{1,2}$/.test(n[i + 1] ?? "")) { hasDia = true; k = i + 1; }
  if (/^\d{1,2}$/.test(n[k] ?? "")) {
    const day = Number(n[k]);
    const mon = n[k + 1] === "de" ? MONTHS[n[k + 2] ?? ""] : undefined;
    if (mon) {
      let end = k + 3;
      if (n[end] === "de" && /^\d{4}$/.test(n[end + 1] ?? "")) {
        const y = Number(n[end + 1]);
        end += 2;
        const c = validYMD(y, mon, day) ? isoOf(y, mon, day) : null;
        return { date: c && c <= today ? c : null, end };
      }
      return { date: recentDayMonth(today, day, mon), end };
    }
    if (hasDia && day >= 1 && day <= 31) return { date: recentDayOfMonth(today, day), end: k + 1 };
  }

  // dias da semana: o mais recente que já passou ("segunda" -> a última segunda)
  if (w in WEEKDAYS) {
    const after = n[i + 1];
    if (w === "segunda" && (after === "via" || after === "parcela" || after === "vez" || after === "opcao" || after === "mao" || after === "chance")) return null;
    let end = i + 1;
    if (n[end] === "feira") end++;
    if (n[end] === "passada" || n[end] === "passado") end++;
    const diff = ((weekdayOf(today) - WEEKDAYS[w] + 7) % 7) || 7;
    return { date: addDays(today, -diff), end };
  }
  return null;
}

// ---------- categorias ----------

const stemWord = (w: string) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w);
const stemPhrase = (s: string) => lightNorm(s).split(" ").filter(Boolean).map(stemWord).join(" ");

function phrasesOf(name: string): string[] {
  const full = stemPhrase(name);
  const parts = name.split(/[/,&]|\se\s/).map((x) => stemPhrase(x)).filter((x) => x.length >= 4);
  return Array.from(new Set([full, ...parts]));
}

/** Categoria cujo nome aparece na frase (subcategoria vale mais que a principal). */
function matchByName(cats: CatRow[], type: FlowType, descNorm: string): string | null {
  const hay = ` ${stemPhrase(descNorm)} `;
  let best: { id: string; score: number } | null = null;
  for (const c of cats) {
    if (c.type !== type) continue;
    for (const ph of phrasesOf(c.name)) {
      if (ph.length < 3 || !hay.includes(` ${ph} `)) continue;
      const score = ph.length + (c.parent_id ? 0.5 : 0);
      if (!best || score > best.score) best = { id: c.id, score };
    }
  }
  return best?.id ?? null;
}

function matchByHints(cats: CatRow[], type: FlowType, hints: string[]): string | null {
  for (const hint of hints) {
    const h = stemPhrase(hint);
    const sub = cats.filter((c) => c.type === type && stemPhrase(c.name) === h);
    if (sub.length) return sub.sort((a, b) => Number(Boolean(b.parent_id)) - Number(Boolean(a.parent_id)))[0].id;
  }
  for (const hint of hints) {
    const h = stemPhrase(hint);
    const cand = cats.filter((c) => c.type === type && ` ${stemPhrase(c.name)} `.includes(` ${h} `));
    if (cand.length) return cand.sort((a, b) => Number(Boolean(a.parent_id)) - Number(Boolean(b.parent_id)))[0].id;
  }
  return null;
}

function kwRulesFor(descNorm: string): KwRule[] {
  const hay = ` ${descNorm} `;
  return KW.filter((r) => r.words.some((w) => hay.includes(` ${stripAcc(w).toLowerCase()} `)));
}

/** Acha a categoria (e o tipo, quando ainda não se sabe) pelo que foi dito. Só devolve categorias que a pessoa tem. */
function findCategory(cats: CatRow[], descNorm: string, type: FlowType | null): { id: string; type: FlowType } | null {
  if (!descNorm) return null;
  const types: FlowType[] = type ? [type] : ["expense", "income"];
  for (const t of types) {
    const byName = matchByName(cats, t, descNorm);
    if (byName) return { id: byName, type: t };
  }
  const rules = kwRulesFor(descNorm);
  for (const t of types) {
    for (const r of rules) {
      if (r.type !== t) continue;
      const id = matchByHints(cats, t, r.hints);
      if (id) return { id, type: t };
    }
  }
  for (const t of types) {
    const id = defaultCategory(cats, t, descNorm);
    if (id) return { id, type: t };
  }
  return null;
}

/** Nome dito pela IA ("Alimentação", "Alimentação › Restaurantes", "restaurantes") -> id de categoria da pessoa. */
export function matchCategoryByName(cats: CatRow[], name: string | null | undefined, type: FlowType): string | null {
  if (!name) return null;
  const want = stemPhrase(name.split("›").pop() ?? name);
  if (!want) return null;
  const same = cats.filter((c) => c.type === type && stemPhrase(c.name) === want);
  if (same.length) return same.sort((a, b) => Number(Boolean(b.parent_id)) - Number(Boolean(a.parent_id)))[0].id;
  return matchByName(cats, type, name);
}

// ---------- parser ----------

/** Valor para o campo de texto do formulário: 50 -> "50", 50.9 -> "50,90". */
export function amountToField(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

function describe(toks: Tok[], used: boolean[], from: number, to: number): string {
  const words: string[] = [];
  for (let i = from; i < to; i++) if (!used[i]) words.push(toks[i].raw);
  const isStop = (w: string) => STOP.has(stripAcc(w).toLowerCase());
  while (words.length && isStop(words[0])) words.shift();
  while (words.length && isStop(words[words.length - 1])) words.pop();
  if (!words.length) return "";
  const text = words.map((w) => (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w) ? w : w.toLowerCase())).join(" ").replace(/\s+/g, " ").trim().slice(0, 100);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function parseVoice(input: string, opts: VoiceOpts): VoiceParse {
  const text = input.replace(/\s+/g, " ").trim();
  const toks = tokenize(text);
  const n = toks.map((t) => t.n);
  const used = new Array<boolean>(toks.length).fill(false);
  const mark = (a: number, b: number) => { for (let i = a; i < b; i++) used[i] = true; };

  // 1) ruído: porcentagem, "3x", horário
  for (let i = 0; i < n.length; i++) {
    if (n[i].includes("%") || /^\d+x$/.test(n[i]) || /^\d{1,2}h(\d{2})?$/.test(n[i])) mark(i, i + 1);
    else if (/^\d{1,2}$/.test(n[i]) && (n[i + 1] === "h" || n[i + 1] === "hora" || n[i + 1] === "horas")) mark(i, i + 2);
  }

  // 2) datas
  const dates: Hit<string | null>[] = [];
  for (let i = 0; i < n.length; i++) {
    if (used[i]) continue;
    const d = scanDate(n, i, opts.today);
    if (!d) continue;
    dates.push({ i, end: d.end, v: d.date });
    mark(i, d.end);
  }

  // 3) receita ou despesa
  const types: Hit<FlowType>[] = [];
  for (let i = 0; i < n.length; i++) {
    if (used[i]) continue;
    if (n[i] === "me" && (n[i + 1] === "pagou" || n[i + 1] === "pagaram" || n[i + 1] === "pagaram")) {
      types.push({ i, end: i + 2, v: "income" });
      mark(i, i + 2);
    } else if (INCOME_WORDS.has(n[i])) { types.push({ i, end: i + 1, v: "income" }); mark(i, i + 1); }
    else if (EXPENSE_WORDS.has(n[i])) { types.push({ i, end: i + 1, v: "expense" }); mark(i, i + 1); }
  }

  // 4) empresa / pessoal
  const biz: Hit<boolean>[] = [];
  for (let i = 0; i < n.length; i++) {
    if (used[i]) continue;
    if (BIZ_WORDS.has(n[i])) {
      const from = i > 0 && !used[i - 1] && PREPS.has(n[i - 1]) ? i - 1 : i;
      biz.push({ i: from, end: i + 1, v: true });
      mark(from, i + 1);
    } else if (n[i] === "pessoal" && i > 0 && !used[i - 1] && PREPS.has(n[i - 1])) {
      biz.push({ i: i - 1, end: i + 1, v: false });
      mark(i - 1, i + 1);
    } else if (n[i] === "pessoa" && n[i + 1] === "fisica") {
      biz.push({ i, end: i + 2, v: false });
      mark(i, i + 2);
    }
  }

  // 5) valores
  const typeIdx = new Set(types.map((t) => t.i));
  let amounts: Hit<AmountHit>[] = [];
  for (let i = 0; i < n.length; ) {
    if (used[i]) { i++; continue; }
    const a = scanAmount(n, i);
    if (!a || a.end <= i || Array.from({ length: a.end - i }, (_, k) => used[i + k]).some(Boolean)) { i++; continue; }
    const isDigit = parseDigits(n[i] === "r$" ? (n[i + 1] ?? "") : n[i]) !== null;
    const next = n[a.end];
    if (!a.marked) {
      if (next !== undefined && NOT_AMOUNT_NEXT.has(next)) { i++; continue; }
      // número por extenso sem "reais": só vale se for >= 10 ou ("gastei cinco no café") vier depois do verbo e antes de uma preposição
      if (!isDigit && a.value < 10 && !(a.value >= 2 && i > 0 && typeIdx.has(i - 1) && next !== undefined && SMALL_OK_NEXT.has(next))) { i++; continue; }
    }
    amounts.push({ i, end: a.end, v: a });
    i = a.end;
  }
  // "comprei 2 pães por 10 reais": havendo valor com "reais", número solto pequeno é quantidade
  if (amounts.some((a) => a.v.marked)) amounts = amounts.filter((a) => a.v.marked || a.v.value >= 10);

  // 6) divide em itens quando há mais de um valor ("almoço 50 e uber 20")
  const bounds: number[] = [0]; // início de cada trecho
  const cuts: number[] = []; // fim (exclusivo) de cada trecho, sem o conector
  for (let k = 0; k + 1 < amounts.length; k++) {
    const from = amounts[k].end, to = amounts[k + 1].i;
    let cut = -1, nextStart = -1;
    for (let c = from - 1; c < to; c++) if (toks[c].comma) { cut = c + 1; nextStart = c + 1; }
    if (cut < 0) for (let c = from; c < to; c++) if (CONNECTORS.has(n[c])) { cut = c; nextStart = c + 1; }
    if (cut < 0) continue;
    cuts.push(cut);
    bounds.push(nextStart);
  }
  cuts.push(toks.length);

  const segs: { from: number; to: number; amount: Hit<AmountHit> | null }[] = bounds.map((from, k) => ({
    from, to: cuts[k], amount: amounts.find((a) => a.i >= from && a.i < cuts[k]) ?? null,
  }));
  // só o primeiro valor de cada trecho é o valor do item; os outros números ficam na descrição ("uber 99")
  for (const seg of segs) if (seg.amount) mark(seg.amount.i, seg.amount.end);
  const globalAt = (h: { i: number; end: number }) => h.i === 0 || h.end >= toks.length;

  const items: VoiceItem[] = [];
  let prevType: FlowType | null = null;
  for (const seg of segs) {
    const inSeg = <T extends { i: number }>(h: T) => h.i >= seg.from && h.i < seg.to;
    const ownType = types.find(inSeg)?.v ?? null;
    const ownDate = dates.find(inSeg) ?? dates.find((d) => globalAt(d));
    const ownBiz = biz.find(inSeg) ?? biz.find((b) => globalAt(b));
    const desc = describe(toks, used, seg.from, seg.to);
    const descNorm = lightNorm(desc);
    let type: FlowType | null = ownType;
    const cat = findCategory(opts.categories, descNorm, type);
    if (!type && cat) type = cat.type;
    if (!type) {
      const rule = kwRulesFor(descNorm)[0];
      if (rule) type = rule.type;
    }
    if (!type) type = prevType;
    if (type) prevType = type;
    const catName = cat ? opts.categories.find((c) => c.id === cat.id)?.name ?? "" : "";
    items.push({
      type,
      amount: seg.amount ? seg.amount.v.value : null,
      description: desc || catName,
      categoryId: cat && (!type || cat.type === type) ? cat.id : null,
      date: ownDate ? ownDate.v : null,
      isBusiness: ownBiz ? ownBiz.v : null,
    });
  }

  const good = items.filter((it) => it.amount !== null);
  const final = good.length ? good : items.slice(0, 1);
  const first = final[0];
  return { text, items: final, needsAi: !first || first.amount === null || first.type === null };
}

// ---------- junção com o rascunho da IA ----------

export type AiDraftLike = {
  type: FlowType | null;
  amount: number | null;
  description: string | null;
  category: string | null;
  date: string | null;
  is_business: boolean | null;
};

/** O que o parser local achou vale mais; a IA só preenche o que faltou. */
export function mergeAiDraft(base: VoiceItem, draft: AiDraftLike, cats: CatRow[]): VoiceItem {
  const type = base.type ?? draft.type;
  const categoryId = base.categoryId ?? (type ? matchCategoryByName(cats, draft.category, type) : null);
  return {
    type,
    amount: base.amount ?? draft.amount,
    description: base.description || draft.description || "",
    categoryId,
    date: base.date ?? draft.date,
    isBusiness: base.isBusiness ?? draft.is_business,
  };
}

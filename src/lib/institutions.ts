// Instituições para o selo de contas e cartões. Selo = cor + iniciais, feito pelo app (sem imagem de terceiros e sem custo).
// Não são logotipos oficiais. Logos oficiais só entram com origem autorizada (ver PLANO-JAKASH.md, 9.2).

export type Institution = { key: string; name: string; color: string; fg: string; initials: string; match: RegExp };

export const INSTITUTIONS: Institution[] = [
  { key: "nubank", name: "Nubank", color: "#820AD1", fg: "#FFFFFF", initials: "Nu", match: /nubank|\bnu\b/i },
  { key: "itau", name: "Itaú", color: "#EC7000", fg: "#FFFFFF", initials: "It", match: /ita[uú]/i },
  { key: "bradesco", name: "Bradesco", color: "#CC092F", fg: "#FFFFFF", initials: "Br", match: /bradesco/i },
  { key: "bb", name: "Banco do Brasil", color: "#FCD600", fg: "#1B3A8C", initials: "BB", match: /banco do brasil|\bbb\b/i },
  { key: "caixa", name: "Caixa", color: "#0066B3", fg: "#FFFFFF", initials: "CX", match: /caixa|\bcef\b/i },
  { key: "santander", name: "Santander", color: "#EC0000", fg: "#FFFFFF", initials: "Sa", match: /santander/i },
  { key: "inter", name: "Inter", color: "#FF7A00", fg: "#FFFFFF", initials: "In", match: /\binter\b|banco inter/i },
  { key: "c6", name: "C6 Bank", color: "#242424", fg: "#FFFFFF", initials: "C6", match: /\bc6\b/i },
  { key: "btg", name: "BTG Pactual", color: "#001E62", fg: "#FFFFFF", initials: "BTG", match: /btg/i },
  { key: "picpay", name: "PicPay", color: "#21C25E", fg: "#FFFFFF", initials: "Pic", match: /picpay/i },
  { key: "mercadopago", name: "Mercado Pago", color: "#00A7E1", fg: "#FFFFFF", initials: "MP", match: /mercado\s*pago|\bmp\b/i },
  { key: "sicoob", name: "Sicoob", color: "#003641", fg: "#FFFFFF", initials: "Sc", match: /sicoob/i },
  { key: "sicredi", name: "Sicredi", color: "#3FA110", fg: "#FFFFFF", initials: "Si", match: /sicredi/i },
  { key: "neon", name: "Neon", color: "#0AC2D4", fg: "#06323A", initials: "Ne", match: /\bneon\b/i },
  { key: "pagbank", name: "PagBank", color: "#00A859", fg: "#FFFFFF", initials: "Pag", match: /pagbank|pagseguro/i },
  { key: "carteira", name: "Carteira / dinheiro", color: "#6B7280", fg: "#FFFFFF", initials: "R$", match: /carteira|dinheiro|em esp[eé]cie/i },
];

const byKey = new Map(INSTITUTIONS.map((i) => [i.key, i]));
export const institutionByKey = (key: string | null | undefined): Institution | null => (key ? byKey.get(key) ?? null : null);

/** Descobre a instituição pelo nome da conta/cartão (ex.: "Nubank roxinho"), para contas antigas ficarem com selo sem ninguém editar. */
export function guessInstitution(name: string | null | undefined): Institution | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  return INSTITUTIONS.find((i) => i.match.test(n)) ?? null;
}

/** Escolhida pela pessoa; senão deduzida pelo nome. */
export const resolveInstitution = (key: string | null | undefined, name: string | null | undefined): Institution | null => institutionByKey(key) ?? guessInstitution(name);

/** Iniciais neutras para quem não tem instituição (até 2 letras do nome). */
export function nameInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

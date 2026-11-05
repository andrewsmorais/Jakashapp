// Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central), gerado sem custo e sem consultar nada.
// O pagamento cai direto na conta de quem recebe; o app não vê nem confirma o pagamento.

export type PixKeyType = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

export const PIX_TYPES: { value: PixKeyType; label: string }[] = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "telefone", label: "Celular" },
  { value: "email", label: "E-mail" },
  { value: "aleatoria", label: "Chave aleatória" },
];

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, "0") + value;

/** Texto do BR Code: só ASCII, sem acento nem símbolos, no tamanho máximo do campo. */
export function pixText(s: string, max: number): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Chave no formato aceito pelo BR Code: CPF/CNPJ só dígitos, celular com +55, e-mail e chave aleatória em minúsculas. */
export function normalizePixKey(type: PixKeyType, key: string): string {
  const k = key.trim();
  if (type === "cpf" || type === "cnpj") return k.replace(/\D/g, "");
  if (type === "telefone") {
    const digits = k.replace(/\D/g, "");
    return k.charAt(0) === "+" ? "+" + digits : "+55" + digits.replace(/^55(?=\d{10,11}$)/, "");
  }
  return k.toLowerCase();
}

/** Mensagem de erro em português, ou null quando a chave parece válida. */
export function validatePixKey(type: PixKeyType, key: string): string | null {
  const k = normalizePixKey(type, key);
  if (!k) return "Informe a chave Pix.";
  if (type === "cpf") return /^\d{11}$/.test(k) ? null : "O CPF deve ter 11 dígitos.";
  if (type === "cnpj") return /^\d{14}$/.test(k) ? null : "O CNPJ deve ter 14 dígitos.";
  if (type === "telefone") return /^\+55\d{10,11}$/.test(k) ? null : "O celular deve ter DDD e número (ex.: 11 99999-8888).";
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) && k.length <= 77 ? null : "E-mail inválido.";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k) ? null : "A chave aleatória tem o formato 123e4567-e89b-12d3-a456-426614174000.";
}

export type PixInput = {
  type: PixKeyType;
  key: string;
  name: string; // nome de quem recebe (até 25 caracteres)
  city: string; // cidade (até 15 caracteres)
  amount?: number; // omitido = quem paga digita o valor
  description?: string; // mensagem ao pagador (opcional)
  txid?: string; // identificador (letras e números, até 25); "***" quando não informado
};

/** Código "copia e cola" do Pix estático. */
export function buildPixPayload(p: PixInput): string {
  const key = normalizePixKey(p.type, p.key);
  const name = pixText(p.name, 25) || "RECEBEDOR";
  const city = pixText(p.city, 15) || "BRASIL";
  const txid = (p.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  let account = tlv("00", "br.gov.bcb.pix") + tlv("01", key);
  const desc = p.description ? pixText(p.description, 40) : "";
  if (desc && (account + tlv("02", desc)).length <= 99) account += tlv("02", desc);
  const amount = p.amount && p.amount > 0 ? tlv("54", (Math.round(p.amount * 100) / 100).toFixed(2)) : "";
  const body =
    tlv("00", "01") + tlv("26", account) + tlv("52", "0000") + tlv("53", "986") + amount +
    tlv("58", "BR") + tlv("59", name) + tlv("60", city) + tlv("62", tlv("05", txid)) + "6304";
  return body + crc16(body);
}

/** Confere o CRC de um código (usado nos testes e antes de exibir). */
export function pixPayloadValid(payload: string): boolean {
  return payload.length > 8 && payload.slice(-8, -4) === "6304" && crc16(payload.slice(0, -4)) === payload.slice(-4);
}

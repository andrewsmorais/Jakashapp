// Exportação da receita anual do MEI para a DASN-SIMEI. Roda no navegador (sem custo de servidor).
import { KIND_LABEL, dasnTotals, type RevenueKind, type YearSummary } from "@/lib/mei";
import { saveOrShareText } from "@/lib/nativeShare";

export type DasnRow = { date: string; description: string; amount: number; kind: RevenueKind; client: string };

// CSV para abrir direto no Excel brasileiro (separador ";", decimal com vírgula, UTF-8 com BOM).
// Texto que começaria com = + - @ ganha um apóstrofo para não virar fórmula na planilha.
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (n: number) => n.toFixed(2).replace(".", ",");

export function dasnCsv(year: number, rows: DasnRow[], s: YearSummary): string {
  const t = dasnTotals(s);
  const head = ["Data", "Descrição", "Cliente", "Tipo de receita", "Valor (R$)"].join(";");
  const lines = rows.map((r) => {
    const [y, m, d] = r.date.split("-");
    return [`${d}/${m}/${y}`, cell(r.description), cell(r.client), cell(KIND_LABEL[r.kind]), num(r.amount)].join(";");
  });
  const totals = [
    "",
    `Receita bruta ${year} - comércio e indústria;;;;${num(t.goods)}`,
    `Receita bruta ${year} - prestação de serviços;;;;${num(t.services)}`,
    `Receita bruta ${year} - total;;;;${num(t.total)}`,
  ];
  return "﻿" + [head, ...lines, ...totals].join("\r\n") + "\r\n";
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  // No navegador baixa o arquivo; no app iOS (onde blob não baixa) abre a folha de compartilhar.
  void saveOrShareText(filename, content, mime);
}

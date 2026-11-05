// Exportação do Motorista de app: planilha (CSV para Excel/Google Planilhas) com o resumo no topo
// (ganho bruto, despesas e lucro líquido em destaque) e um dia por linha.
import { platformOf } from "@/lib/driverPlatforms";
import { hoursLabel, shiftMetrics, summarize, type Shift, type Summary, type Vehicle } from "@/lib/driver";

const money = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));
const dec = (n: number | null, d = 2) => (n === null ? "" : n.toFixed(d).replace(".", ","));
const dateBR = (iso: string) => iso.split("-").reverse().join("/");

function cell(v: string): string {
  // Evita fórmula no Excel (=, +, -, @ no começo) e escapa aspas/; .
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (cols: string[]) => cols.map(cell).join(";");

export type DriverExportOpts = { from: string; to: string; platform?: string | null; vehicleName?: string | null };

export function driverCsv(shifts: Shift[], vehicles: Vehicle[], opts: DriverExportOpts, summary: Summary = summarize(shifts, opts.platform)): string {
  const vName = new Map(vehicles.map((v) => [v.id, v.name]));
  const t = summary.total;
  const out: string[] = [];
  out.push(line(["Jakash · Motorista de app"]));
  out.push(line(["Período", `${dateBR(opts.from)} a ${dateBR(opts.to)}`]));
  out.push(line(["Plataforma", opts.platform ? platformOf(opts.platform).name : "Todas"]));
  if (opts.vehicleName) out.push(line(["Carro", opts.vehicleName]));
  out.push("");
  out.push(line(["RESUMO", "R$"]));
  out.push(line(["GANHO BRUTO", money(t.gross)]));
  out.push(line(["DESPESAS", money(t.expenses)]));
  out.push(line(["LUCRO LÍQUIDO", money(t.net)]));
  out.push("");
  out.push(line(["Dias trabalhados", String(summary.days)]));
  out.push(line(["Turnos", String(summary.shifts)]));
  out.push(line(["Horas", hoursLabel(t.hours)]));
  out.push(line(["Km rodados", dec(t.km, 1)]));
  out.push(line(["Combustível", money(t.fuel)]));
  out.push(line(["Custo do carro (manutenção/aluguel)", money(t.vehicle)]));
  out.push(line(["Outros gastos (pedágio, lavagem, comida...)", money(t.extras)]));
  out.push(line(["Ganho bruto por hora", money(t.grossPerHour)]));
  out.push(line(["Lucro líquido por hora", money(t.netPerHour)]));
  out.push(line(["Ganho bruto por km", money(t.grossPerKm)]));
  out.push(line(["Lucro líquido por km", money(t.netPerKm)]));
  out.push(line(["Despesa por km", money(t.costPerKm)]));
  if (summary.byPlatform.length) {
    out.push("");
    out.push(line(["POR PLATAFORMA", "Dias", "Ganho bruto", "Despesas", "Lucro líquido", "R$ por hora (bruto)", "R$ por km (bruto)", "Corridas"]));
    for (const p of summary.byPlatform) {
      const m = p.metrics;
      out.push(line([platformOf(p.platform).name, String(p.days), money(m.gross), money(m.expenses), money(m.net), money(m.grossPerHour) + (p.estimatedHours ? " (estimado)" : ""), money(m.grossPerKm), m.trips ? String(m.trips) : ""]));
    }
  }
  out.push("");
  out.push(line(["DIAS", "Carro", "Início", "Fim", "Horas", "Km", "Plataformas", "Ganho bruto", "Gorjetas", "Combustível", "Custo do carro", "Outros gastos", "Despesas", "Lucro líquido", "R$/hora (líquido)", "R$/km (líquido)", "Observações"]));
  for (const s of [...shifts].sort((a, b) => a.date.localeCompare(b.date))) {
    if (opts.platform && !s.earnings.some((e) => e.platform === opts.platform)) continue;
    const m = shiftMetrics(s);
    const plats = s.earnings.map((e) => `${platformOf(e.platform).name} ${money(e.amount)}`).join(" | ");
    out.push(line([dateBR(s.date), s.vehicle_id ? vName.get(s.vehicle_id) ?? "" : "", (s.start_time ?? "").slice(0, 5), (s.end_time ?? "").slice(0, 5), dec(m.hours), dec(m.km, 1), plats,
      money(m.gross), money(m.tips), money(m.fuel), money(m.vehicle), money(m.extras), money(m.expenses), money(m.net), money(m.netPerHour), money(m.netPerKm), s.notes ?? ""]));
  }
  if (opts.platform) out.push(line(["Na linha de cada dia aparece o dia inteiro; o resumo acima conta só a parte da plataforma escolhida."]));
  return "﻿" + out.join("\r\n") + "\r\n";
}

export const driverFileName = (from: string, to: string) => `jakash-motorista-${from}-a-${to}.csv`;

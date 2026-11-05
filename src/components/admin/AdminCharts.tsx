"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/format";
import type { SeriesPoint } from "@/lib/adminMetrics";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const labelMonth = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;
const labelDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const C_MEI = "#5B5BF0";
const C_CPF = "#A78BFA";
const C_OLD = "#38BDF8";
const C_OK = "#10B981";
const C_BAD = "#EF4444";

export function RevenueChart({ series, grain }: { series: SeriesPoint[]; grain: 'day' | 'month' }) {
  const labelFn = grain === 'day' ? labelDay : labelMonth;
  const data = series.map((m) => ({
    name: labelFn(m.from),
    Pessoal: m.revenue_cpf,
    // O SQL separa só 'cpf' e 'mei'; o que sobrar do total vem de planos antigos (ex.: Família, que não é mais vendido).
    Outros: Math.max(0, Math.round((m.revenue - m.revenue_cpf - m.revenue_mei) * 100) / 100),
    Empresarial: m.revenue_mei,
  }));
  const hasOld = data.some((d) => d.Outros > 0);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Empresarial" stackId="r" fill={C_MEI} />
        {hasOld && <Bar dataKey="Outros" name="Planos antigos" stackId="r" fill={C_OLD} />}
        <Bar dataKey="Pessoal" stackId="r" fill={C_CPF} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CustomersChart({ series, grain }: { series: SeriesPoint[]; grain: 'day' | 'month' }) {
  const labelFn = grain === 'day' ? labelDay : labelMonth;
  const data = series.map((m) => ({
    name: labelFn(m.from),
    Novos: m.new_customers,
    Cancelamentos: m.churned,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Novos" fill={C_OK} radius={[6, 6, 0, 0]} />
        <Bar dataKey="Cancelamentos" fill={C_BAD} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

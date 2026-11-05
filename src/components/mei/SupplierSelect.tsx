"use client";

import Link from "next/link";
import { Label, inputCls } from "@/components/ui/page";
import type { SupplierOption } from "@/lib/useMeiSuppliers";

// "Fornecedor (opcional)" das despesas da empresa. Só aparece quando a pessoa já cadastrou fornecedores;
// o "+ novo" leva para o cadastro (`onNavigate` fecha a janela de onde ele foi aberto).
export function SupplierSelect({ suppliers, value, onChange, onNavigate }: {
  suppliers: SupplierOption[]; value: string; onChange: (id: string) => void; onNavigate?: () => void;
}) {
  if (suppliers.length === 0) return null;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <Label>Fornecedor (opcional)</Label>
        <Link href="/mei/fornecedores" onClick={onNavigate} className="mb-1 text-xs font-bold text-brand-dark dark:text-brand-soft">+ novo</Link>
      </div>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Fornecedor">
        <option value="">Sem fornecedor</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

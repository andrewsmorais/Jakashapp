"use client";

import { useState, useMemo } from "react";
import { calculatePrice, type PricingInput } from "@/lib/meiPricing";
import { computeDas } from "@/lib/meiConstants";
import { brl } from "@/lib/format";
import { BackTitle, Card, Label, inputCls } from "@/components/ui/page";

export default function PrecagemPage() {
  const [materialCost, setMaterialCost] = useState("50");
  const [fixedCost, setFixedCost] = useState("2000");
  const [workUnitsPerMonth, setWorkUnitsPerMonth] = useState("160");
  const [workUnitLabel, setWorkUnitLabel] = useState("horas");
  const [activityKind, setActivityKind] = useState<"comercio" | "industria" | "servicos">("servicos");
  const [desiredMargin, setDesiredMargin] = useState("40");

  // Calcula o DAS automaticamente
  const das = useMemo(() => computeDas(activityKind), [activityKind]);

  // Calcula o preço
  const result = useMemo(() => {
    const input: PricingInput = {
      materialCost: parseFloat(materialCost) || 0,
      fixedCost: parseFloat(fixedCost) || 0,
      workUnitsPerMonth: parseFloat(workUnitsPerMonth) || 1,
      dasMonthly: das,
      desiredMarginPercent: parseFloat(desiredMargin) || 0,
    };
    return calculatePrice(input);
  }, [materialCost, fixedCost, workUnitsPerMonth, das, desiredMargin]);

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <BackTitle
        title="Calculadora de preço"
        subtitle="Quanto cobrar pela sua hora/produto para cobrir custos, DAS e ter a margem que deseja."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Inputs */}
        <Card>
          <h2 className="font-extrabold text-lg mb-4">Seus dados</h2>
          <div className="space-y-4">
            <div>
              <Label>Tipo de atividade</Label>
              <select
                className={inputCls}
                value={activityKind}
                onChange={(e) => setActivityKind(e.target.value as "comercio" | "industria" | "servicos")}
              >
                <option value="servicos">Prestação de serviços</option>
                <option value="comercio">Comércio</option>
                <option value="industria">Indústria</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Determina o valor do DAS.</p>
            </div>

            <div>
              <Label>Custo de material ou produto (por {workUnitLabel})</Label>
              <input
                type="number"
                className={inputCls}
                inputMode="decimal"
                step="0.01"
                value={materialCost}
                onChange={(e) => setMaterialCost(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Se varia por unidade, coloque a média.</p>
            </div>

            <div>
              <Label>Custo fixo mensal (aluguel, internet, etc.)</Label>
              <input
                type="number"
                className={inputCls}
                inputMode="decimal"
                step="0.01"
                value={fixedCost}
                onChange={(e) => setFixedCost(e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <Label>Quantidade de {workUnitLabel} por mês</Label>
              <input
                type="number"
                className={inputCls}
                inputMode="decimal"
                step="0.1"
                value={workUnitsPerMonth}
                onChange={(e) => setWorkUnitsPerMonth(e.target.value)}
                placeholder="160"
              />
              <div className="flex gap-2 mt-2">
                {["horas", "unidades", "projetos"].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setWorkUnitLabel(u)}
                    className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${
                      workUnitLabel === u
                        ? "bg-brand-dark text-white dark:bg-brand-vivid"
                        : "bg-gray-100 text-gray-700 dark:bg-[#1E1E1E] dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#262626]"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Margem de lucro desejada (%)</Label>
              <input
                type="number"
                className={inputCls}
                inputMode="decimal"
                step="1"
                min="0"
                max="99"
                value={desiredMargin}
                onChange={(e) => setDesiredMargin(e.target.value)}
                placeholder="40"
              />
              <p className="text-xs text-gray-500 mt-1">Margem bruta: quanto sobra de lucro por unidade.</p>
            </div>

            {/* DAS Info */}
            <div className="rounded-xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3">
              <p className="text-xs font-bold text-gray-600 dark:text-gray-400">DAS mensal (automático)</p>
              <p className="text-lg font-extrabold mt-1">{brl(das)}</p>
              <p className="text-xs text-gray-500 mt-1">Já incluído no cálculo de custo fixo.</p>
            </div>
          </div>
        </Card>

        {/* Resultados */}
        <Card>
          <h2 className="font-extrabold text-lg mb-4">Resultado</h2>
          <div className="space-y-4">
            <div className="rounded-xl bg-green-50 dark:bg-green-500/10 p-4 border border-green-200 dark:border-green-500/20">
              <p className="text-xs font-bold text-green-700 dark:text-green-400">Preço a cobrar por {workUnitLabel}</p>
              <p className="text-4xl font-extrabold text-green-600 dark:text-green-400 mt-1">{brl(result.finalPrice)}</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Lucro: <span className="font-bold">{brl(result.profitPerUnit)}</span> por {workUnitLabel}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-[#1E1E1E] p-3 border border-gray-200 dark:border-white/5">
                <p className="text-xs text-gray-600 dark:text-gray-400">Custo por {workUnitLabel}</p>
                <p className="font-extrabold text-lg mt-1">{brl(result.costPerUnit)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-[#1E1E1E] p-3 border border-gray-200 dark:border-white/5">
                <p className="text-xs text-gray-600 dark:text-gray-400">Break-even</p>
                <p className="font-extrabold text-lg mt-1">{brl(result.breakEvenPrice)}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-white/5 pt-4">
              <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3">Se trabalhar o mês inteiro:</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Receita total</span>
                  <span className="font-bold">{brl(result.monthlyRevenue)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Custos (material + fixo + DAS)</span>
                  <span className="font-bold text-red-600">{brl(result.costPerUnit * parseFloat(workUnitsPerMonth || "1"))}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold border-t border-gray-200 dark:border-white/5 pt-2">
                  <span className="text-gray-700 dark:text-gray-200">Lucro bruto</span>
                  <span className="text-green-600 dark:text-green-400">{brl(result.monthlyProfit)}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Este cálculo é orientativo. Considere também concorrência, sazonalidade e impostos sobre a receita (que não foram incluídos). Confirme com seu contador.
            </p>
          </div>
        </Card>
      </div>

      <Card className="!bg-amber-50 dark:!bg-amber-500/10">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <span className="font-bold">Lembrete:</span> Este cálculo mostra a margem <strong>bruta</strong> (receita - custo).
          Você ainda vai pagar impostos sobre a receita (ICMS, ISS) que reduzem o lucro líquido.
          O DAS já está incluído como custo fixo, mas outros impostos (IR, contribuição social) dependem do seu lucro real.
          Revise com seu contador.
        </p>
      </Card>
    </div>
  );
}

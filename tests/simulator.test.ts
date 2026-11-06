import assert from 'node:assert/strict';
import {
  addMonthsYM, costlyDebts, futureValue, goalCost, impliedRate, monthlyNeeded, monthlyRateFrom, monthsToReach, monthsUntil,
  prepayLast, prepayVsSave, prepayWithAmount, presentValue, pricePayment, yearlyPctFrom,
} from '@/lib/simulator';

// Simulador. Rodar: npx tsx --tsconfig tsconfig.json tests/simulator.test.ts
const near = (a: number, b: number, tol = 0.02, msg?: string) => assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} ≈ ${b}`);

// taxas
near(monthlyRateFrom(1, 'mes'), 0.01, 1e-12);
near(monthlyRateFrom(12.6825, 'ano'), 0.01, 1e-6); // 1,01^12 = 1,126825
assert.equal(monthlyRateFrom(NaN, 'mes'), 0);
near(yearlyPctFrom(0.01), 12.6825, 1e-3);

// datas
assert.equal(monthsUntil('2026-11-06', '2027-11'), 12);
assert.equal(monthsUntil('2026-11-06', '2026-12-10'), 1);
assert.equal(monthsUntil('2026-11-06', '2026-12-05'), 0);
assert.equal(monthsUntil('2026-11-06', '2026-10'), 0);
assert.equal(addMonthsYM('2026-11-06', 2), '2027-01');

// guardar
assert.deepEqual(futureValue(0, 100, 12, 0), { total: 1200, deposited: 1200, interest: 0 });
near(futureValue(1000, 0, 12, 0.01).total, 1126.83);
near(futureValue(0, 100, 12, 0.01).total, 1268.25);
near(monthlyNeeded(1268.25, 0, 12, 0.01)!, 100);
assert.equal(monthlyNeeded(5000, 0, 25, 0), 200);
assert.equal(monthlyNeeded(100, 500, 10, 0), 0); // já tem
assert.equal(monthlyNeeded(100, 0, 0, 0), null);
assert.equal(monthsToReach(5000, 0, 200, 0), 25); // o exemplo do dono: 5 mil guardando 200
assert.equal(monthsToReach(5000, 5000, 0, 0), 0);
assert.equal(monthsToReach(5000, 0, 0, 0), null);
assert.ok(monthsToReach(5000, 0, 200, 0.01)! < 25); // com rendimento chega antes

// custo do objetivo
assert.deepEqual(goalCost([{ label: 'a', value: 1000 }, { label: 'b', value: 500 }, { label: 'c', value: NaN }], 10), { subtotal: 1500, buffer: 150, total: 1650 });

// financiamento (Price): 10 mil em 12x a 2% ao mês -> parcela 945,60
near(pricePayment(10000, 12, 0.02), 945.6);
near(presentValue(945.596, 12, 0.02), 10000, 0.05);
near(impliedRate(10000, 12, 945.596)!, 0.02, 1e-6);
assert.equal(impliedRate(10000, 10, 1000), 0);
assert.equal(impliedRate(10000, 10, 900), null); // parcelas não pagam nem o valor financiado

// adiantar as últimas parcelas
const one = prepayLast(945.6, 12, 0.02, 1);
near(one.payNow, 745.6); // 945,60 / 1,02^12
near(one.savings, 200);
assert.equal(one.remainingAfter, 11);
const all = prepayLast(945.596, 12, 0.02, 12);
near(all.payNow, 10000, 0.05);
near(all.savings, 945.596 * 12 - 10000, 0.05);
assert.equal(prepayLast(945.6, 12, 0.02, 99).count, 12); // não passa do que falta
const cash = prepayWithAmount(945.6, 12, 0.02, 1500);
assert.equal(cash.count, 1); // 2 parcelas custariam ~1.506
near(cash.leftover, 754.4);
// sem juros, adiantar não economiza
assert.equal(prepayLast(500, 10, 0, 3).savings, 0);

// adiantar ou guardar
near(prepayVsSave(945.6, 12, one, 0.02).advantage, 0); // mesma taxa: empate
near(prepayVsSave(945.6, 12, one, 0).advantage, one.savings); // sem rendimento: ganha os juros economizados
assert.ok(prepayVsSave(945.6, 12, one, 0.005).advantage > 0); // contrato 2% > rende 0,5%: adiantar vale mais
assert.ok(prepayVsSave(945.6, 12, one, 0.03).advantage < 0); // rende mais que o contrato: guardar vale mais

// ordem sugerida
assert.deepEqual(costlyDebts([{ name: 'A', monthly_rate: 2, balance: 100 }, { name: 'B', monthly_rate: 12, balance: 50 }, { name: 'C', monthly_rate: 0, balance: 10 }]).map((d) => d.name), ['B', 'A']);

console.log('simulator: ok');

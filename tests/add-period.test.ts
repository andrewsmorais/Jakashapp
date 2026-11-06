import assert from 'node:assert/strict';
import { addPeriod } from '@/lib/format';

// Repetir lançamento: datas seguintes. Rodar: npx tsx --tsconfig tsconfig.json tests/add-period.test.ts
assert.equal(addPeriod('2026-11-05', 'monthly', 0), '2026-11-05');
assert.equal(addPeriod('2026-11-05', 'monthly', 2), '2027-01-05');
assert.equal(addPeriod('2026-01-31', 'monthly', 1), '2026-02-28');
assert.equal(addPeriod('2028-01-31', 'monthly', 1), '2028-02-29');
assert.equal(addPeriod('2026-11-05', 'weekly', 3), '2026-11-26');
assert.equal(addPeriod('2026-12-28', 'weekly', 1), '2027-01-04');
assert.equal(addPeriod('2028-02-29', 'yearly', 1), '2029-02-28');
assert.equal(addPeriod('2026-11-05', 'monthly', 12), '2027-11-05');
console.log('add-period: ok');

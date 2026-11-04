import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceTotals} from '../packages/contracts/src/pricing.js';
test('MAD tax uses exact integer arithmetic, per-line half-up rounding and consistent inclusive/exclusive totals',()=>{
 assert.deepEqual(priceTotals([{priceMinor:10001,quantity:1}],{rateBps:2000,inclusive:false}),{subtotalMinor:10001,taxMinor:2000,totalMinor:12001});
 assert.deepEqual(priceTotals([{priceMinor:12001,quantity:1}],{rateBps:2000,inclusive:true}),{subtotalMinor:10001,taxMinor:2000,totalMinor:12001});
 assert.deepEqual(priceTotals([{priceMinor:1,quantity:1},{priceMinor:1,quantity:1},{priceMinor:1,quantity:1}],{rateBps:2000,inclusive:false}),{subtotalMinor:3,taxMinor:0,totalMinor:3});
 assert.throws(()=>priceTotals([{priceMinor:1,quantity:1.5}],{rateBps:2000,inclusive:false}),/VALIDATION_ERROR/);
 assert.throws(()=>priceTotals([{priceMinor:Number.MAX_SAFE_INTEGER,quantity:100}],{rateBps:2000,inclusive:false}),/VALIDATION_ERROR/);
});

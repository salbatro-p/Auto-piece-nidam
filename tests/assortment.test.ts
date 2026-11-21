import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { readSheet } from 'read-excel-file/node';
import { assortmentGroups, counterEssentials, merchandiseTypes, findMerchandiseTypes, merchandiseTypeByCode, merchandiseTypesCsv } from '../packages/contracts/src/assortment.js';
import { productSchema } from '../apps/api/src/catalog.js';

test('Assortment keeps every blueprint code, unique identities and three populated labels', async () => {
  const path = fileURLToPath(new URL('../blueprint/AutoParts_Work_Handoff_v1.3/07_REFERENCE_AutoParts_Morocco_Data_Foundation_v0_1.xlsx', import.meta.url));
  const rows = await readSheet(path, 'Part_Taxonomy');
  const handoff = await readFile(new URL('../samples/merchandise-types.csv', import.meta.url), 'utf8');
  assert.equal(handoff.replaceAll('\r\n','\n'), merchandiseTypesCsv(merchandiseTypes).replaceAll('\r\n','\n'));
  for (const [code,group,,,ar,fr] of rows.slice(1)) {
    const type = merchandiseTypeByCode(String(code));
    assert.equal(type?.group,group);
    assert.equal(type.names.ar,ar);
    assert.equal(type.names.fr,fr);
  }
  assert.equal(new Set(merchandiseTypes.map(type => type.code)).size,merchandiseTypes.length);
  assert.equal(new Set(assortmentGroups.map(g => g.code)).size,assortmentGroups.length);
  for (const entry of [...assortmentGroups,...merchandiseTypes]) {
    assert.match(entry.code,/^[A-Z0-9_]{1,100}$/);
    for (const name of Object.values(entry.names)) assert.ok(name.trim().length);
    assert.match(entry.names.ar,/\p{Script=Arabic}/u);
  }
});

test('Search matches counter terms, type codes and cross-language terms within departments', () => {
  for (const [query,group,code] of [
    ['فِيلتر زيت','ENGINE','ENGINE_OIL_FILTER'],
    ['electrique TRACTION','EV_HYBRID','EV_HYBRID_TRACTION'],
    ['clés torque','TOOLS','TOOLS_TORQUE'],
    ['سناديق-غير-موجودة','TOOLS',''],
    ['TOOLS_DIAG','TOOLS','TOOLS_DIAG'],
  ]) {
    const result = findMerchandiseTypes(query,group);
    if (code) assert.ok(result.some(type => type.code === code), query);
    else assert.equal(result.length,0);
    assert.ok(result.every(type => type.group === group));
  }
});

test('AAA counter range retains exact grades and exports the proposed assortment', async () => {
  const proposed = findMerchandiseTypes('','',true);
  assert.equal(proposed.length,counterEssentials.size);
  const sheet = await readFile(new URL('../samples/AAA-counter-essentials.csv', import.meta.url), 'utf8');
  assert.equal(sheet.replaceAll('\r\n','\n'), merchandiseTypesCsv(proposed).replaceAll('\r\n','\n'));
  for (const query of ['5W30','٥W٣٠']) {
    assert.deepEqual(findMerchandiseTypes(query,'MOTOR_OILS',true).map(type=>type.code), ['MOTOR_OILS_5W30']);
  }
  assert.ok(findMerchandiseTypes('antijene','',true).some(type=>type.code==='COOLANT_SHELF_PREMIX'));
  assert.ok(findMerchandiseTypes('gresses','GREASES',true).some(type=>type.code==='GREASES_LITHIUM'));
  assert.equal(findMerchandiseTypes('Si-OAT','',true).length,0);
  assert.ok(findMerchandiseTypes('Si-OAT','COOLANT_SHELF').length>0);
});

test('Product registration and imports supply only missing category translations for exact type codes', () => {
  const article = {sku:'TYPE-TEST',names:{en:'Synthetic scanner'},brand:'TEST',category:'TOOLS_DIAG',packSize:1,priceMinor:100,costMinor:1};
  const parsed = productSchema.parse({...article,categoryNames:{fr:'Nom maison'}});
  assert.equal(parsed.categoryNames.fr,'Nom maison');
  assert.equal(parsed.categoryNames.ar,merchandiseTypeByCode(article.category)?.names.ar);
  assert.ok(parsed.categoryNames.en);
  const custom = productSchema.parse({...article,category:'CUSTOM-LOCAL'});
  assert.deepEqual(custom.categoryNames,{ar:'',fr:'',en:''});
});

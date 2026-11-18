import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const vpicSource = {
  name: 'NHTSA vPIC · US model-year references',
  origin: 'https://vpic.nhtsa.dot.gov/api/',
  license: 'NHTSA Open Data API, documented for free public use at https://vpic.nhtsa.dot.gov/api/Home/Index/FAQ. Factual reference fields only. Internal attribution; no credentials, VINs, images, claims of exact configurations or fitment, or store syndication.',
  canStore: true,
  canDisplay: true,
  canSyndicate: false,
};

export async function fetchVpicModelYear(make, year) {
  if (typeof make !== 'string' || !/^[a-zA-Z0-9 .-]{1,50}$/.test(make) || !Number.isInteger(year) || year < 1995 || year > 2100)
    throw new Error('A valid make name and model year are required');
  const url = new URL(`vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/passenger%20car?format=json`,vpicSource.origin);
  const response = await fetch(url,{ redirect: 'error',signal: AbortSignal.timeout(15000),headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`vPIC unavailable: HTTP ${response.status}`);
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 1_000_000) throw new Error('Unexpected vPIC response size');
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload.Results) || payload.Count !== payload.Results.length || payload.Count === 0 || payload.Count > 500)
    throw new Error('Unexpected vPIC model-year result');
  const rows = payload.Results.map(row => {
    if (!Number.isInteger(row.Make_ID) || !Number.isInteger(row.Model_ID) || typeof row.Make_Name !== 'string' ||
        typeof row.Model_Name !== 'string' || row.Make_Name.toLowerCase() !== make.toLowerCase() || row.VehicleTypeId !== 2)
      throw new Error('Unexpected vPIC model identity');
    return {
      kind: 'MODEL_YEAR', externalId: `vPIC:${row.Make_ID}:${row.Model_ID}:${year}`,
      make: row.Make_Name, model: row.Model_Name, market: 'US', year,
    };
  }).sort((a,b) => a.externalId.localeCompare(b.externalId,'en'));
  const rawSha256 = createHash('sha256').update(raw).digest('hex');
  return { datasetVersion: `vPIC model-year ${year} · ${rawSha256.slice(0,16)}`, retrievedAt: new Date().toISOString(), endpoint: url.href, rawSha256, rows };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [make, year, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/fetch-vpic-sample.mjs MAKE YEAR OUTPUT.json');
  const manifest = await fetchVpicModelYear(make, Number(year));
  await writeFile(output, JSON.stringify(manifest,null,2)+'\n',{ flag: 'wx' });
  console.log(JSON.stringify({ count: manifest.rows.length, endpoint: manifest.endpoint, sha256: manifest.rawSha256 }));
}

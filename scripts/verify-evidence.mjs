import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

// Verifies the saved revision and artifacts; it does not rerun tests or approve release.
const root = resolve('.');
function localPath(path) {
  assert.equal(isAbsolute(path), false, 'Manifest paths must be repository-relative');
  const resolved = resolve(root, path);
  assert.ok(resolved.startsWith(root + sep), 'Manifest path must remain inside the repository');
  return resolved;
}
const manifest = JSON.parse(await readFile('docs/evidence/manifest.json', 'utf8'));
const source = createHash('sha256');
assert.equal(new Set(manifest.sourceFiles).size, manifest.sourceFiles.length, 'Duplicate source entry');
for (const path of manifest.sourceFiles)
  source.update(path + '\0').update((await readFile(localPath(path), 'utf8')).replace(/\r\n/g, '\n'));
assert.equal(source.digest('hex'), manifest.sourceSha256LfNormalized,
  'Source changed since the saved evidence manifest; reconcile and regenerate after verification');
for (const [path, expected] of Object.entries(manifest.evidenceSha256)) {
  const actual = createHash('sha256').update(await readFile(localPath(path))).digest('hex');
  assert.equal(actual, expected, 'Evidence artifact changed: ' + path);
}
console.log(JSON.stringify({
  sourceFiles: manifest.sourceFiles.length,
  evidenceFiles: Object.keys(manifest.evidenceSha256).length,
  sourceHashMatched: true, evidenceHashesMatched: true,
  scope: 'Artifact integrity only. Read ACCEPTANCE_REPORT.md for test scope and remaining release gates.',
}));

import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const read=async name=>JSON.parse(await readFile(`docs/evidence/${name}.json`,'utf8'));
const [api,browser,coverage,performance,imports,restore,restart,audit]=await Promise.all(['api-integration','browser-results','translation-coverage','performance','import-resumption','restore-drill','database-restart','dependency-audit'].map(read));
const batch=await read('image-batch-1000'),images=await read('image-browser'),bulkBrowser=await read('image-bulk-browser').catch(()=>null);
async function files(dir){const found=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','dist','.local'].includes(entry.name))continue;const path=`${dir}/${entry.name}`;found.push(...(entry.isDirectory()?await files(path):[path]));}return found;}
const codeFiles=[...await files('apps'),...await files('packages'),...await files('db'),...await files('tests'),...await files('scripts'),...await files('infrastructure'),...await files('.github'),'package.json','package-lock.json','tsconfig.json','playwright.config.ts'].sort();
const hash=createHash('sha256');for(const path of codeFiles)hash.update(path+'\0').update((await readFile(path,'utf8')).replace(/\r\n/g,'\n'));
const sourceHash=hash.digest('hex'),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const evidenceFiles=(await files('docs/evidence')).filter(p=>!p.endsWith('/manifest.json'));
const checksums={};for(const path of evidenceFiles)checksums[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile('docs/evidence/manifest.json',JSON.stringify({generatedAt:new Date().toISOString(),sourceCommitBase:commit,sourceSha256LfNormalized:sourceHash,sourceFiles:codeFiles,scope:'Local synthetic evidence. Individual artifacts retain their execution dates; older load/recovery runs are not claimed as target-device or staging runs.',evidenceSha256:checksums},null,2));
const p=performance.scenarios;
const tests=await readFile('docs/evidence/api-test-output.txt','utf8');const testCount=tests.match(/tests (\d+)/)?.[1]??'see log';
const passCount=tests.match(/pass (\d+)/)?.[1]??'unknown',failCount=tests.match(/fail (\d+)/)?.[1]??'unknown';
const backendLoadPassed=p.every(s=>s.pass),browserPassed=browser.stats.unexpected===0&&browser.stats.skipped===0;
const reportDate=new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'Europe/Istanbul'}).format(new Date());
const report=`# Phase 1 acceptance report — NOT READY FOR RELEASE

Updated ${reportDate} (user timezone Europe/Istanbul). Run timestamps in JSON evidence are UTC; retained older import/restart artifacts identify their original execution dates. This continues the existing v1.2 project and integrates v1.3. AutoParts Business runs locally at http://127.0.0.1:4173 with real PostgreSQL persistence and synthetic data. **Phase 1 is not declared complete. No staging or production deployment, real-company import, provider connection or publication has occurred.** Shop remains Phase 2.

## Observed local results

- Backend, security, domain, localization, pricing and parser tests: **${passCount}/${testCount} passed**, ${failCount} failures in the latest log. [Log](evidence/api-test-output.txt), [measured integration cases](evidence/api-integration.json).
- Built Business application: **${browser.stats.expected} browser tests passed**, ${browser.stats.unexpected} failed, ${browser.stats.skipped} skipped. Chromium on Windows, 390×844 phone and 1280×800 tablet emulation, with additional 320px reflow checks. [Browser results](evidence/browser-results.json).
- AR/FR/EN: **${coverage.keysPerLocale} keys per locale, 100% technical key coverage**; ${coverage.backendDomainErrorCodes} backend domain errors covered. **Professional approval: 0%**. [Coverage](evidence/translation-coverage.json).
- INV-01–08 passed: 100-way last-unit contention, ten identical retries, sale/transfer races, multi-SKU ordering, reservation expiry, quarantine/damage and immutable ledger protections. Warehouse and bin ledgers reconciled.
- New-product image upload + carton receipt produced exactly 10 PCS across language switches; supplier references, replacement evidence and independently approved opening counts passed browser and API tests. [Product/receipt](evidence/owner-product-receipt.json), [import/bins](evidence/browser-import-bins.json), [catalog/opening](evidence/browser-catalog-opening.json).
- Offline switching and expired-session reauthentication preserved a three-piece cart without changing stock. Offline shell AR/FR/EN works and caches only four static assets. [Draft](evidence/offline-session-draft.json), [cache inspection](evidence/offline-shell.json).
- Expanded automated axe coverage includes nine screens × three languages × two device sizes, product/receipt drafts, login and new photo galleries. Read the current browser result for failures; zero observed violations is **not** complete WCAG or physical screen-reader certification. [Screenshots](evidence/screenshots), [gallery checks](evidence/image-browser.json).
- Dependency audit: **${audit.metadata.vulnerabilities.total} reported vulnerabilities** at scan time. [Audit](evidence/dependency-audit.json). This does not replace a manual application security review.

## v1.3 image-system evidence

Rights-controlled private image files, exact SKU/manufacturer snapshots, five distinct media categories, immutable reviews, independently gated public selection, source/expiry/revocation checks, exact vehicle filtering, responsive galleries, and coverage/review queues are implemented. Changing license terms invalidates the old approval. Product/vehicle applicability is rechecked on reads. Image presence never creates a fitment.

Excel+ZIP batch: **${batch.rows} rows**, ${batch.outcomes.STAGED} staged, ${batch.outcomes.DUPLICATE} duplicates, ${batch.outcomes.ERROR} errors; **${(batch.durationMs/1000).toFixed(1)} s**, **${batch.peakRssMiB.toFixed(1)} MiB** peak combined test-process RSS against a 512 MiB bound. Restart at row 500, same-row replay and unchanged stock passed. No automatic approvals. [Batch evidence](evidence/image-batch-1000.json).

Phone/tablet AR/FR/EN gallery, alt text, RTL, broken-image fallback and lost-upload-response recovery: [browser evidence](evidence/image-browser.json). CSV+ZIP preview/retry evidence: **${bulkBrowser?'executed; see artifact':'NOT TESTED'}**. ${bulkBrowser?'[Bulk browser](evidence/image-bulk-browser.json).':''} The coverage report describes **synthetic fixtures only**, not the company’s real catalogue: [itemized synthetic coverage](evidence/image-coverage-synthetic.json). No real company product photographs, supplier license grants, or worldwide diagram coverage were supplied or claimed.

Protected media restore: **${restore.privateMedia?.objects??0} objects**, matching file hashes **${restore.privateMedia?.allFileHashesMatch??false}**, authenticated restored thumbnail **${restore.privateMedia?.approvedThumbnailAfterRestore??false}**. Legacy BLOB uploads are retained pending explicit matching/migration and review. New imports are private files rather than unbounded database BLOBs.

## Representative backend measurements

Windows, Node 24.16.0, PostgreSQL 18.4, Intel i7-8850H (12 logical CPUs), approximately 34 GB RAM. Real database; Fastify injection excludes TCP/WAN delay. Synthetic dataset: 100,000 products, 1,000,000 fitments, 10,000 variants, three warehouses. No claim of actual Android, network-throttled LCP, OS-cold cache, sustained soak or hosted availability. [Complete report and plans](evidence/performance.json).

| Scenario | Rate | Observed p95 / p99 ms | p95 target ms | Result |
|---|---:|---:|---:|---|
${p.map(s=>`| ${s.name} | ${s.requestedRate}/s | ${s.p95} / ${s.p99} | ${s.targetP95} | ${s.pass?'PASS':'FAIL'} |`).join('\n')}

The earlier exact-search p99 miss is retained in [the pre-fix measurement](evidence/performance-before-exact-search.json). Indexed identifier-first lookup fixed that observed regression. This is not a guarantee against all future performance regressions.

The initial v1.3 [load run](evidence/performance-v13-before-query-review.json) and [intermediate run](evidence/performance-v13-before-selective-filters.json) are also retained. Query plans identified optional-filter predicates that prevented selective vehicle lookup, repeated dashboard work and connection startup costs. The revised queries, pending-review index, bounded dashboard memory and eight prepared connections now have **${backendLoadPassed?'PASS':'FAIL'}** for the latest measured backend scenarios above. These are local service timings, not page-load or physical-device measurements.

## Recovery and import evidence

100,000 valid imported rows produced exactly 100,000 distinct products after forcibly killing the worker at the committed 50% checkpoint and starting a fresh process. Commit including restart: **${(imports.commitWithRestartMs/1000).toFixed(2)} s**; full run including invalid-file validation: **${(imports.totalMs/1000).toFixed(2)} s**. Peak worker RSS **${(imports.workerPeakRssBytes/1048576).toFixed(1)} MiB**; API RSS **${(imports.apiPeakRssBytes/1048576).toFixed(1)} MiB**. Separate 100,000-row invalid file: three injected errors detected, no products committed. [Import drill](evidence/import-resumption.json).

An isolated PostgreSQL cluster was stopped during a request between balance update and ledger insertion. Recovery took **${(restart.recoveryMs/1000).toFixed(2)} s**; the interrupted transaction rolled back and ten same-key retries posted one receipt. [Database restart](evidence/database-restart.json). This test originally exposed an unhandled connection-error crash, now handled without hiding query failures.

A logical backup restored into a new isolated database with identical counts/hashes for all recorded critical tables, one sale deduction under replay, and warehouse/bin reconciliation. [Restore report](evidence/restore-drill.json). These local drills do **not** establish production RPO ≤15 minutes or RTO ≤2 hours.

## Required evidence register

Source base: \`${commit.slice(0,12)}\` plus the exact working source hash in [manifest](evidence/manifest.json): \`${sourceHash}\`. Each artifact retains its own execution time. The manifest is an integrity index, not a claim that earlier performance runs used later unrelated UI additions.

| Requirement ID | Implementation / revision | Test | Date UTC | Environment | Observed | Target | Status | Evidence | Owner | Remediation | Risk accepted by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| INV-01–08, SEC-01/02 | inventory/auth/db; source manifest | integration suite | ${api.started??api.startedAt??'see artifact'} | Local PG, synthetic | ${passCount} pass, ${failCount} fail | All assertions | ${failCount==='0'?'PASS (executed scope)':'FAIL'} | [API](evidence/api-integration.json) | Engineering | Manual ASVS review still required | Nobody |
| I18N-01/02/03, A09-08 | Business + i18n | Business and image browser scenarios | ${browser.stats.startTime} | Built Chromium emulation | ${browser.stats.expected} pass | No lost drafts or stock duplicates | ${browserPassed?'PASS':'FAIL / INCOMPLETE'} | [Browser](evidence/browser-results.json) | Engineering | Repeat on physical devices | Nobody |
| IMG-01–10 | media/discovery/import modules + migrations 012–014 | Rights, variants, 1k batch, browser, thumbnail load | ${batch.finishedAt} | Local synthetic fixtures | See individual artifacts | All tests + lawful company pilot coverage | PARTIAL — real content/device gates remain | [Batch](evidence/image-batch-1000.json), [images](evidence/image-browser.json), [load](evidence/performance.json) | Engineering + company | Authorized originals/rights, fitment review, target devices | Nobody |
| L10-03b, I18N-05 review | dictionaries/product review | Qualified linguistic review | Not run | AR/FR/EN human review | 0% approved | 100% critical text reviewed | NOT TESTED | [Coverage](evidence/translation-coverage.json) | Company linguistic reviewers | Approve exact message revision | Nobody |
| DATA-01, REL-02 | imports + worker | Kill at 50% | ${imports.date} | Local 100k fixture | 100k distinct, no invalid writes | Resume without duplicate | PASS | [Import](evidence/import-resumption.json) | Engineering | Repeat staging volume and licensed files | Nobody |
| REL-01 | db/inventory | Immediate PG restart | ${restart.date} | Separate local cluster | Atomic rollback and one retry effect | All or nothing | ${restart.result==='PASS'?'PASS':'FAIL'} | [Restart](evidence/database-restart.json) | Engineering | Hosted failover rehearsal | Nobody |
| REL-04 | restore script | Snapshot restore + sale | ${restore.date??'see artifact'} | Separate local database | Hashes/counts match | Local restore integrity | ${restore.pass?'PASS (local only)':'FAIL'} | [Restore](evidence/restore-drill.json) | Engineering | Encrypted off-host backup/WAL and staging RPO/RTO | Nobody |
| OPS-01/02, A09-10 | infrastructure/runbooks | Staging rollback and monitoring | Not run | Hosting not provisioned | None | Verified alerts, backup, rollback | NOT TESTED | [Operations](OPERATIONS.md) | Company + Engineering | Choose authorized hosting; then rehearse | Nobody |
| L10-04c/06b, UX-01 | Business | Physical device/scanner/screen reader | Not run | Target devices unavailable | Emulation only | Actual devices and network profile | NOT TESTED | [Screenshots](evidence/screenshots) | Company QA | Tablet/Android/scan/zoom/assistive review | Nobody |
| LEGAL-01 | policies, sources, tax configuration | Legal/accountant/data rights review | Not run | Real company scope | No real data or assumed tax rate | Named company approvals | NOT TESTED | [Source register](SOURCE_LICENSE_REGISTER.md) | Company reviewers | Validate tax/privacy/rights and opening count | Nobody |
| Phase 2 I18N-04/PAY/SHIP | contracts + Shop seam | Public checkout/provider scenarios | Not run | Shop not implemented | No public application | Run at Phase 2 | NOT TESTED | [Readiness](PHASE2_READINESS.md) | Future Phase 2 team | Separate Shop, shared inventory, full locale regression | Nobody |

## Release decision and remaining work

Gate 1's local persisted vertical slice is demonstrated. Gate 2 and Gate 3 remain **partial**: core modules, technical attributes, image workflows and local hardening exist, while qualified automotive vocabulary/translation review, licensed business content, actual target-device accessibility/performance and independent security review remain required. Optional supplier/diagram adapters cannot be validated without an authorized provider and licensed data. Product-master imports deliberately do not trust supplied translation-approval claims. Opening imports are limited to 500 rows per review and require an existing validated product and warehouse/bin code; branch text is source evidence, while authorization uses the warehouse ID.

Docker and hosted CI definitions have not been executed here. Real-device screen-reader/scan/print/PWA installation, target-network LCP and long-running pool saturation/soak remain NOT TESTED. External outbox provider effects are unbuilt Phase 2 work; local outbox deduplication is not proof of a real payment/courier effect.

Gate 4 requires a separately approved staging/pilot, licensed company records, physically counted and signed opening inventory and trained staff. Gate 5 requires all release gates, named reviewers, monitored backups and **explicit production approval**. No residual risk is marked accepted. This report must not be used as a production go-live approval.
`;
await writeFile('docs/ACCEPTANCE_REPORT.md',report);
console.log(JSON.stringify({tests:testCount,browser:browser.stats.expected,sourceHash,releaseReady:false}));

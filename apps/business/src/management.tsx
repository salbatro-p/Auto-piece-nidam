import React, { useState, useEffect } from 'react';
import { SourceManager, VehicleCreator } from './catalog-admin';
import { TaxConfiguration } from './tax-settings';
import { SupplierCatalog } from './catalog-links';
import { Plus, RefreshCw, ShieldCheck, FileUp, Download } from 'lucide-react';
import { useApp } from './context';
import { api, ApiError } from './api';
import {
  Amount,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  MutationState,
  SearchBox,
  Status,
  useLoad,
  useMutation,
} from './components';
import { PageHeading, ProductSelect, WarehouseSelect, whole } from './operations';
import { dateTime, parseMoney, quantity, type Locale } from '../../../packages/i18n/src/index';
import { messageKey, type MessageKey } from '../../../packages/i18n/src/business';
import type { Supplier, Vehicle, Source } from './types';

export function Suppliers() {
  const { t, notify } = useApp(),
    list = useLoad<{ items: Supplier[] }>('/suppliers'),
    save = useMutation();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [contact, setContact] = useState(''),
    [lead, setLead] = useState('3'),
    [notes, setNotes] = useState('');
  return (
    <>
      <PageHeading title="suppliers" hint="supplierHint">
        <button className="button primary" onClick={() => setOpen(true)}>
          <Plus size={18} />
          {t('newSupplier')}
        </button>
      </PageHeading>
      <ErrorBanner error={list.error} />
      <div className="supplier-grid">
        {list.data?.items.map((s) => (
          <article className="panel supplier-card" key={s.id}>
            <div className="workspace-avatar">{s.name.slice(0, 2)}</div>
            <h2>
              <bdi>{s.name}</bdi>
            </h2>
            <p dir="auto">{s.contact || '—'}</p>
            <p>
              {t('leadDays')}: <bdi>{s.leadDays}</bdi>
            </p>
            <p className="muted" dir="auto">
              {s.notes}
            </p>
            <SupplierCatalog supplier={s} />
          </article>
        ))}
      </div>
      {!list.data?.items.length && <Empty />}
      {open && (
        <Modal title={t('newSupplier')} onClose={() => setOpen(false)}>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await save.run('/suppliers', { name, contact, leadDays: Number(lead), notes });
              if (r) {
                setOpen(false);
                list.reload();
                notify('operationSaved');
              }
            }}
          >
            <Field label={t('companyName')}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('contact')}>
              <input value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label={t('leadDays')}>
              <input type="number" min="0" max="365" value={lead} onChange={(e) => setLead(e.target.value)} />
            </Field>
            <Field label={t('details')}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <MutationState state={save} />
            <div className="form-actions">
              <button className="button primary" disabled={save.busy}>
                {t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Purchases() {
  const { t, locale, warehouses } = useApp(),
    list = useLoad<{ items: any[] }>('/purchases'),
    suppliers = useLoad<{ items: Supplier[] }>('/suppliers'),
    save = useMutation();
  const [open, setOpen] = useState(false),
    [supplierId, setSupplier] = useState(''),
    [warehouseId, setWarehouse] = useState(''),
    [reference, setReference] = useState(''),
    [productId, setProduct] = useState(''),
    [qty, setQty] = useState('10'),
    [cost, setCost] = useState('0'),
    [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeading title="purchases" hint="purchaseHint">
        <button className="button primary" onClick={() => setOpen(true)}>
          <Plus size={18} />
          {t('newPurchase')}
        </button>
      </PageHeading>
      <ErrorBanner error={list.error} />
      <MutationState state={save} />
      <section className="panel table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
        <table>
          <thead>
            <tr>
              <th>{t('reference')}</th>
              <th>{t('supplier')}</th>
              <th>{t('status')}</th>
              <th>{t('ordered')}</th>
              <th>{t('received')}</th>
              <th>{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <bdi>{p.reference}</bdi>
                  <small className="sub-ref">
                    <bdi>{p.id}</bdi>
                  </small>
                </td>
                <td>
                  <bdi>{p.supplierName}</bdi>
                </td>
                <td>
                  <Status value={p.status} />
                </td>
                <td>
                  {quantity(
                    p.lines.reduce((n: number, l: any) => n + l.quantity, 0),
                    locale,
                  )}
                </td>
                <td>
                  {quantity(
                    p.lines.reduce((n: number, l: any) => n + l.received, 0),
                    locale,
                  )}
                </td>
                <td>
                  {p.status === 'ORDERED' && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        if (await save.run(`/purchases/${p.id}/cancel`, {})) list.reload();
                      }}
                    >
                      {t('cancel')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.items.length && <Empty />}
      </section>
      {open && (
        <Modal title={t('newPurchase')} onClose={() => setOpen(false)}>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await save.run('/purchases', {
                  supplierId,
                  warehouseId: warehouseId || warehouses[0]?.id,
                  reference,
                  lines: [{ productId, quantity: whole(qty), costMinor: parseMoney(cost) }],
                });
                if (r) {
                  setOpen(false);
                  list.reload();
                }
              } catch (e) {
                setError(e);
              }
            }}
          >
            <Field label={t('supplier')}>
              <select value={supplierId} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">—</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <WarehouseSelect value={warehouseId || warehouses[0]?.id || ''} onChange={setWarehouse} />
            <Field label={t('reference')}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <ProductSelect value={productId} onChange={(id) => setProduct(id)} />
            <div className="form-grid">
              <Field label={t('quantity')}>
                <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label={t('cost')}>
                <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
              </Field>
            </div>
            <ErrorBanner error={error} />
            <MutationState state={save} />
            <div className="form-actions">
              <button className="button primary" disabled={save.busy}>
                {t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Vehicles({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState(''),
    [page, setPage] = useState(1);
  const { t, can } = useApp(),
    list = useLoad<{ items: Vehicle[]; total: number }>(`/vehicles?q=${encodeURIComponent(q)}&page=${page}`),
    sources = useLoad<{ items: Source[] }>(can('catalog') ? '/sources' : '/vehicles'),
    save = useMutation();
  const [review, setReview] = useState<Vehicle | null>(null),
    [productId, setProduct] = useState(''),
    [evidence, setEvidence] = useState(''),
    [sourceId, setSource] = useState(''),
    [qualifiers, setQualifiers] = useState(''),
    [status, setStatus] = useState('REVIEW_REQUIRED');
  return (
    <>
      <PageHeading title="vehicles" hint="vehicleHint">
        <SourceManager />
        <VehicleCreator onSaved={list.reload} />
      </PageHeading>
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
      </div>
      <div className="notice warning">{t('fitmentWarning')}</div>
      <ErrorBanner error={list.error} />
      <section className="panel table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
        <table>
          <thead>
            <tr>
              {(
                [
                  'make',
                  'model',
                  'generation',
                  'years',
                  'engine',
                  'body',
                  'transmission',
                  'market',
                  'action',
                ] as const
              ).map((k) => (
                <th key={k}>{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((v) => (
              <tr key={v.id}>
                <td>
                  <bdi>{v.make}</bdi>
                </td>
                <td>
                  <bdi>{v.model}</bdi>
                </td>
                <td>
                  <bdi>{v.generation}</bdi>
                </td>
                <td>
                  <bdi>
                    {v.yearFrom}–{v.yearTo}
                  </bdi>
                </td>
                <td>
                  <bdi dir="ltr">{v.engine}</bdi>
                </td>
                <td>
                  <bdi>{v.body}</bdi>
                </td>
                <td>
                  <bdi>{v.transmission}</bdi>
                </td>
                <td>
                  <bdi>{v.market}</bdi>
                </td>
                <td>
                  <button className="text-button" onClick={() => onSelect(v.id)}>
                    {t('viewCompatible')}
                  </button>
                  {can('catalog') && (
                    <button className="text-button" onClick={() => setReview(v)}>
                      {t('evidence')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.items.length && <Empty />}
      </section>
      <div className="pagination">
        <button className="button secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          {t('previous')}
        </button>
        <span>
          {t('page')} {page}
        </span>
        <button
          className="button secondary"
          disabled={page * 30 >= (list.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('next')}
        </button>
      </div>
      {review && (
        <Modal title={t('evidence')} onClose={() => setReview(null)}>
          <p>
            <bdi>
              {review.make} {review.model} {review.engine}
            </bdi>
          </p>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save.run('/fitments', {
                  productId,
                  vehicleId: review.id,
                  status,
                  evidence,
                  sourceId,
                  qualifiers,
                })
              )
                setReview(null);
            }}
          >
            <ProductSelect value={productId} onChange={(id) => setProduct(id)} />
            <Field label={t('source')}>
              <select value={sourceId} onChange={(e) => setSource(e.target.value)}>
                <option value="">—</option>
                {sources.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('evidence')}>
              <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            </Field>
            <Field label={t('details')}>
              <textarea value={qualifiers} onChange={(e) => setQualifiers(e.target.value)} />
            </Field>
            <Field label={t('status')}>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {['REVIEW_REQUIRED', 'SOURCE_CLAIMED', 'VERIFIED', 'CONFLICTED', 'REJECTED'].map((s) => (
                  <option key={s} value={s}>
                    {t(messageKey(s) ?? 'notVerified')}
                  </option>
                ))}
              </select>
            </Field>
            <MutationState state={save} />
            <div className="form-actions">
              <button className="button primary" disabled={save.busy}>
                {t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export { BulkImports as Imports } from './bulk-imports';
export function Audit() {
  const { t, locale } = useApp(),
    list = useLoad<{ items: any[] }>('/audit');
  const [result, setResult] = useState<any>(),
    [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeading title="audit" hint="auditHint">
        <a className="button secondary" href={`/api/reports/stock.csv?locale=${locale}`}>
          <Download size={17} />
          {t('export')}
        </a>
        <button
          className="button primary"
          onClick={() => void api('/inventory/reconciliation').then(setResult).catch(setError)}
        >
          <ShieldCheck size={17} />
          {t('reconcile')}
        </button>
      </PageHeading>
      <ErrorBanner error={list.error || error} />
      {result && (
        <div className={`notice ${result.balanced ? 'success' : 'error'}`} role="status">
          {t(result.balanced ? 'balanced' : 'mismatch')}
        </div>
      )}
      <section className="panel table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
        <table>
          <thead>
            <tr>
              {(['timestamp', 'actor', 'action', 'document', 'requestId'] as const).map((k) => (
                <th key={k}>{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((e) => (
              <tr key={e.id}>
                <td>{dateTime(e.createdAt, locale)}</td>
                <td>
                  <bdi>{e.actorName}</bdi>
                </td>
                <td>
                  <span>{t(messageKey(e.action) ?? 'operation')}</span>
                  <small className="sub-ref">
                    <bdi dir="ltr">{e.action}</bdi>
                  </small>
                </td>
                <td>
                  <bdi>{e.objectId || '—'}</bdi>
                </td>
                <td>
                  <bdi>{e.requestId}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
export function Team() {
  const { t, locale, warehouses, notify } = useApp(),
    list = useLoad<{ items: any[] }>('/staff'),
    config = useLoad<{ defaultLocale: Locale }>('/config'),
    save = useMutation();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState('sales'),
    [warehouseId, setWarehouse] = useState(''),
    [token, setToken] = useState(''),
    [defaultLocale, setDefaultLocale] = useState<Locale>('fr');
  useEffect(() => {
    if (config.data) setDefaultLocale(config.data.defaultLocale);
  }, [config.data]);
  return (
    <>
      <PageHeading title="team" hint="teamHint">
        <button
          className="button primary"
          onClick={() => {
            setOpen(true);
            setToken('');
          }}
        >
          <Plus size={18} />
          {t('invite')}
        </button>
      </PageHeading>
      <MutationState state={save} />
      <TaxConfiguration />
      <section className="panel settings-panel">
        <Field label={t('defaultLocale')}>
          <select value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value as Locale)}>
            <option value="ar">العربية (AR)</option>
            <option value="fr">Français (FR)</option>
            <option value="en">English (EN)</option>
          </select>
        </Field>
        <button
          className="button secondary"
          onClick={async () => {
            if (await save.run('/settings', { defaultLocale })) notify('operationSaved');
          }}
        >
          {t('save')}
        </button>
      </section>
      <section className="panel table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
        <table>
          <thead>
            <tr>
              {(['name', 'email', 'role', 'language', 'action'] as const).map((k) => (
                <th key={k}>{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((u) => (
              <tr key={u.id}>
                <td>
                  <bdi>{u.name}</bdi>
                </td>
                <td>
                  <bdi dir="ltr">{u.email}</bdi>
                </td>
                <td>{t(messageKey(u.role.toUpperCase()) ?? 'role')}</td>
                <td>
                  <bdi>{u.locale.toUpperCase()}</bdi>
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={async () => {
                      if (await save.run(`/staff/${u.id}/revoke`, {})) notify('revokeDone');
                    }}
                  >
                    {t('revoke')}
                  </button>
                  <button
                    className="text-button"
                    onClick={async () => {
                      if (await save.run(`/staff/${u.id}/access`, { active: !u.active })) {
                        list.reload();
                        notify('operationSaved');
                      }
                    }}
                  >
                    {t(u.active ? 'deactivate' : 'activate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ErrorBanner error={list.error} />
      </section>
      {open && (
        <Modal title={t('invite')} onClose={() => setOpen(false)}>
          {token ? (
            <div className="notice warning">
              <strong>{t('inviteToken')}</strong>
              <textarea readOnly value={token} aria-label={t('inviteToken')} dir="ltr" />
            </div>
          ) : (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await save.run<{ token: string }>('/staff/invitations', {
                  name,
                  email,
                  role,
                  warehouseIds: warehouseId ? [warehouseId] : [],
                });
                if (r) setToken(r.token);
              }}
            >
              <Field label={t('name')}>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('email')}>
                <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t('role')}>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {['sales', 'warehouse', 'manager', 'buyer', 'curator', 'auditor', 'accountant'].map((r) => (
                    <option key={r} value={r}>
                      {t(messageKey(r.toUpperCase()) ?? 'role')}
                    </option>
                  ))}
                </select>
              </Field>
              <WarehouseSelect value={warehouseId} onChange={setWarehouse} all />
              <MutationState state={save} />
              <div className="form-actions">
                <button className="button primary" disabled={save.busy}>
                  {t('invite')}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

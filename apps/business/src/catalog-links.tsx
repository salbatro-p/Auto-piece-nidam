import React, { useState } from 'react';
import { useApp } from './context';
import { Amount, Empty, ErrorBanner, Field, Modal, MutationState, useLoad, useMutation } from './components';
import { ProductSelect } from './operations';
import { parseMoney } from '../../../packages/i18n/src/index';
import type { Product, Source, Supplier } from './types';

export function SupplierCatalog({ supplier }: { supplier: Supplier }) {
  const { t, can } = useApp(),
    [open, setOpen] = useState(false);
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        {t('supplierCatalog')}
      </button>
      {open && (
        <Modal title={t('supplierCatalog')} onClose={() => setOpen(false)} wide>
          <h3>
            <bdi>{supplier.name}</bdi>
          </h3>
          <SupplierItems supplierId={supplier.id} editable={can('costs')} />
        </Modal>
      )}
    </>
  );
}
function SupplierItems({ supplierId, editable }: { supplierId: string; editable: boolean }) {
  const { t } = useApp(),
    list = useLoad<{ items: any[] }>(`/suppliers/${supplierId}/items`),
    save = useMutation();
  const [product, setProduct] = useState(''),
    [reference, setReference] = useState(''),
    [cost, setCost] = useState(''),
    [version, setVersion] = useState(0),
    [error, setError] = useState<unknown>();
  return (
    <>
      <ErrorBanner error={list.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('sku')}</th>
              <th>{t('supplierReference')}</th>
              {editable && (
                <>
                  <th>{t('cost')}</th>
                  <th>{t('action')}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((row) => (
              <tr key={row.productId}>
                <td>
                  <bdi>{row.sku}</bdi>
                </td>
                <td>
                  <bdi>{row.reference}</bdi>
                </td>
                {editable && (
                  <>
                    <td>
                      <Amount minor={row.costMinor} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setProduct(row.productId);
                          setReference(row.reference);
                          setCost((row.costMinor / 100).toFixed(2));
                          setVersion(row.version);
                        }}
                      >
                        {t('edit')}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.data?.items.length && <Empty />}
      {editable && (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setError(undefined);
            try {
              if (
                await save.run(`/suppliers/${supplierId}/items`, {
                  productId: product,
                  reference,
                  costMinor: parseMoney(cost),
                  version,
                })
              ) {
                list.reload();
                setProduct('');
                setReference('');
                setCost('');
                setVersion(0);
              }
            } catch (e) {
              setError(e);
            }
          }}
        >
          <ProductSelect
            value={product}
            onChange={(id) => {
              setProduct(id);
              const row = list.data?.items.find((x) => x.productId === id);
              setVersion(row?.version ?? 0);
              setReference(row?.reference ?? '');
              setCost(row ? (row.costMinor / 100).toFixed(2) : '');
            }}
          />
          <Field label={t('supplierReference')}>
            <input dir="auto" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label={t('cost')}>
            <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <ErrorBanner error={error} />
          <MutationState state={save} />
          <button className="button primary" disabled={save.busy || !product}>
            {t('save')}
          </button>
        </form>
      )}
    </>
  );
}
export function Replacements({ product }: { product: Product }) {
  const { t, can } = useApp(),
    list = useLoad<{ items: any[] }>(`/products/${product.id}/replacements`),
    save = useMutation();
  const [withdraw, setWithdraw] = useState<any>(),
    [reason, setReason] = useState('');
  return (
    <section>
      <h3>{t('replacements')}</h3>
      <p className="muted">{t('replacementHint')}</p>
      <ErrorBanner error={list.error} />
      {list.data?.items.map((row) => (
        <div className="list-row" key={row.replacementId}>
          <div>
            <strong>
              <bdi>{row.sku}</bdi>
            </strong>
            <p>
              <bdi>{row.sourceName}</bdi>
            </p>
            <p dir="auto">{row.evidence}</p>
            <small>
              {!row.active ? t('withdrawn') : !row.sourceAllowed ? t('SOURCE_RIGHTS_REQUIRED') : ''}
            </small>
          </div>
          {can('catalog') && row.active && (
            <button className="button secondary" onClick={() => setWithdraw(row)}>
              {t('withdraw')}
            </button>
          )}
        </div>
      ))}
      {withdraw && (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save.run(`/products/${product.id}/replacements/withdraw`, {
                replacementId: withdraw.replacementId,
                version: withdraw.version,
                reason,
              })
            ) {
              list.reload();
              setWithdraw(undefined);
              setReason('');
            }
          }}
        >
          <Field label={t('reason')}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <MutationState state={save} />
          <button className="button secondary" disabled={save.busy}>
            {t('withdraw')}
          </button>
        </form>
      )}
      {can('catalog') && <ReplacementEditor product={product} onSaved={list.reload} />}
    </section>
  );
}
function ReplacementEditor({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const { t } = useApp(),
    sources = useLoad<{ items: Source[] }>('/sources'),
    save = useMutation();
  const [replacementId, setReplacement] = useState(''),
    [sourceId, setSource] = useState(''),
    [evidence, setEvidence] = useState('');
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save.run(`/products/${product.id}/replacements`, { replacementId, sourceId, evidence })) {
          onSaved();
          setReplacement('');
          setEvidence('');
        }
      }}
    >
      <ProductSelect value={replacementId} onChange={setReplacement} />
      <Field label={t('source')}>
        <select value={sourceId} onChange={(e) => setSource(e.target.value)}>
          <option value="">—</option>
          {sources.data?.items
            .filter((s) => s.canStore)
            .map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label={t('evidence')}>
        <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
      <MutationState state={save} />
      <button
        className="button secondary"
        disabled={save.busy || !replacementId || replacementId === product.id}
      >
        {t('save')}
      </button>
    </form>
  );
}

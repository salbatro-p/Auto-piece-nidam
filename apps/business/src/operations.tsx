import { TranslationReviewer } from './catalog-admin';
import {AttributeEditor,Attributes} from './technical-attributes';
import { Replacements } from './catalog-links';
import { OpeningBalances } from './opening-balances';
import { Bins } from './bins';
import { priceTotals, type TaxSettings } from '../../../packages/contracts/src/pricing';
import React, { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  Package,
  Plus,
  Printer,
  RefreshCw,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from './context';
import { api, ApiError } from './api';
import {
  Amount,
  Empty,
  ErrorBanner,
  Field,
  FilePicker,
  Modal,
  MutationState,
  ProductName,
  CategoryName,
  ProductVisual,
  SearchBox,
  Status,
  StockBadge,
  totalStock,
  useLoad,
  useMutation,
} from './components';
import {
  contentValue,
  dateTime,
  money,
  parseMoney,
  quantity,
  type Locale,
} from '../../../packages/i18n/src/index';
import { messageKey, type MessageKey } from '../../../packages/i18n/src/business';
import type { Product, Sale } from './types';

export function PageHeading({
  title,
  hint,
  children,
}: {
  title: MessageKey;
  hint: MessageKey;
  children?: React.ReactNode;
}) {
  const { t } = useApp();
  return (
    <div className="page-heading">
      <div>
        <h1>{t(title)}</h1>
        <p>{t(hint)}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function WarehouseSelect({
  value,
  onChange,
  testId,
  all = false,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  testId?: string;
  all?: boolean;
  disabled?: boolean;
}) {
  const { t, warehouses } = useApp();
  return (
    <Field label={t('warehouse')}>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {all && <option value="">{t('allWarehouses')}</option>}
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function whole(value: string, zero = false) {
  const n = parseMoney(value) / 100;
  if (!Number.isInteger(n) || n < (zero ? 0 : 1)) throw new ApiError('INVALID_QUANTITY');
  return n;
}
export function Dashboard({
  navigate,
}: {
  navigate: (page: 'pos' | 'inventory' | 'catalog' | 'imports') => void;
}) {
  const { t, locale, can } = useApp();
  const { data, error, reload } = useLoad<Record<string, any>>('/dashboard');
  const metrics: [MessageKey, string, boolean?][] = [
    ['onHand', 'onHand'],
    ['available', 'available'],
    ['reserved', 'reserved'],
    ['dailySales', 'salesTodayMinor', true],
  ];
  return (
    <>
      <PageHeading title="goodDay" hint="overviewHint">
        <button className="button secondary" onClick={reload}>
          <RefreshCw size={17} />
          {t('refresh')}
        </button>
      </PageHeading>
      <section className="hero-strip">
        <div>
          <span className="eyebrow">{t('today')}</span>
          <h2>{t('welcome')}</h2>
          <p>{dateTime(new Date(), locale)}</p>
        </div>
        <div className="hero-symbol">
          <Boxes size={72} strokeWidth={1} />
        </div>
        <span className="hero-tag">
          <span className="dot" />
          {t('online')}
        </span>
      </section>
      <ErrorBanner error={error} />
      <div className="metric-grid">
        {metrics.map(([label, key, currency]) => (
          <article className="metric" key={key}>
            <span>{t(label)}</span>
            <strong>
              {data ? currency ? <Amount minor={data[key] ?? 0} /> : quantity(data[key] ?? 0, locale) : '—'}
            </strong>
            <small>{currency ? t('dailySales') : t('PCS')}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>{t('recentMovements')}</h2>
            <span className="badge neutral">{t('today')}</span>
          </div>
          {data?.recentMovements?.length ? (
            <div className="activity-list">
              {data.recentMovements.map((m: any) => (
                <div className="activity" key={m.id}>
                  <span className={`activity-icon ${m.quantityDelta < 0 ? 'out' : 'in'}`}>
                    {m.quantityDelta < 0 ? <ArrowUpRight size={20} /> : <ArrowDownToLine size={20} />}
                  </span>
                  <div>
                    <strong>
                      <bdi>{m.sku}</bdi>
                    </strong>
                    <small>
                      {t(messageKey(m.kind) ?? 'operation')} · {dateTime(m.createdAt, locale)}
                    </small>
                  </div>
                  <bdi className="activity-value">
                    {m.quantityDelta > 0 ? '+' : ''}
                    {quantity(m.quantityDelta, locale)}
                  </bdi>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
          <p className="panel-note">{t('historyUnavailable')}</p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>{t('attention')}</h2>
            <span className="attention-dot" />
          </div>
          {(['lowStock', 'outOfStock', 'pendingFitments', 'pendingImports'] as const).map((key) => (
            <div className="attention-row" key={key}>
              <span>{t(key)}</span>
              <strong>{quantity(data?.[key] ?? 0, locale)}</strong>
            </div>
          ))}
          {can('costs') && (
            <div className="attention-row">
              <span>{t('stockValue')}</span>
              <strong>
                <Amount minor={data?.inventoryValueMinor ?? 0} />
              </strong>
            </div>
          )}
          <div className="quick-actions">
            <h3>{t('quickActions')}</h3>
            {can('sell') && (
              <button className="button primary full" onClick={() => navigate('pos')}>
                <ShoppingCart size={18} />
                {t('newSale')}
              </button>
            )}
            {can('receive') && (
              <button className="button secondary full" onClick={() => navigate('inventory')}>
                <ArrowDownToLine size={18} />
                {t('receiveStock')}
              </button>
            )}
            {can('catalog') && (
              <button className="text-button" onClick={() => navigate('catalog')}>
                {t('newProduct')}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function Catalog({ vehicleId, clearVehicle }: { vehicleId: string; clearVehicle: () => void }) {
  const { t, can, locale } = useApp();
  const [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Product | null | undefined>(),
    [selected, setSelected] = useState<Product | null>(null);
  const { data, error, loading, reload } = useLoad<{ items: Product[]; total: number }>(
    `/products?q=${encodeURIComponent(q)}&page=${page}${vehicleId ? `&vehicleId=${vehicleId}` : ''}`,
  );
  return (
    <>
      <PageHeading title="catalog" hint="catalogHint">
        {can('catalog')&&<a className="button secondary" href="/api/reports/products.csv">{t('export')}</a>}
        {can('catalog') && (
          <button className="button primary" data-testid="product-create" onClick={() => setEditing(null)}>
            <Plus size={18} />
            {t('newProduct')}
          </button>
        )}
      </PageHeading>
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(s) => {
            setQ(s);
            setPage(1);
          }}
        />
        <button className="button secondary" onClick={reload} aria-label={t('refresh')}>
          <RefreshCw size={18} />
        </button>
      </div>
      {vehicleId && (
        <button className="text-button" onClick={clearVehicle}>
          {t('clearVehicle')}
          <X size={16} />
        </button>
      )}
      <ErrorBanner error={error} />
      <div className="results-meta">
        <span>{t('productsCount', { count: data?.total ?? 0 })}</span>
        <span>{t('privateWorkspace')}</span>
      </div>
      <section className="panel table-wrap">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>{t('product')}</th>
              <th>{t('sku')}</th>
              <th>{t('available')}</th>
              <th>{t('priceEach')}</th>
              <th>{t('status')}</th>
              <th>
                <span className="sr-only">{t('view')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <button className="product-cell" onClick={() => setSelected(p)}>
                    <ProductVisual product={p} />
                    <span>
                      <ProductName product={p} />
                      <small>
                        <bdi>{p.brand}</bdi> · <CategoryName product={p} />
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <bdi dir="ltr" className="mono">
                    {p.sku}
                  </bdi>
                  <small className="sub-ref">
                    <bdi dir="ltr">{p.oem}</bdi>
                  </small>
                </td>
                <td>
                  <StockBadge value={totalStock(p).available} />
                </td>
                <td>
                  <Amount minor={p.priceMinor} />
                </td>
                <td>
                  <Status value={p.status} />
                </td>
                <td>
                  {can('catalog') ? (
                    <>
                      <TranslationReviewer product={p} onSaved={reload} />
                      <button className="text-button" onClick={() => setEditing(p)}>
                        {t('edit')}
                      </button>
                    </>
                  ) : (
                    <button className="text-button" onClick={() => setSelected(p)}>
                      {t('view')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.items.length && (
          <Empty title={loading ? t('loading') : t('noResults')} hint={t('emptyHint')} />
        )}
      </section>
      <div className="pagination">
        <button className="button secondary" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
          {t('previous')}
        </button>
        <span>
          {t('page')} <bdi>{quantity(page, locale)}</bdi>
        </span>
        <button
          className="button secondary"
          disabled={page * 30 >= (data?.total ?? 0)}
          onClick={() => setPage((n) => n + 1)}
        >
          {t('next')}
        </button>
      </div>
      {editing !== undefined && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            reload();
          }}
        />
      )}
      {selected && <ProductDetails product={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
function ProductDetails({ product: p, onClose }: { product: Product; onClose: () => void }) {
  const { t, locale } = useApp();
  return (
    <Modal title={contentValue(p.names, locale, p.translationStatus).value || p.sku} onClose={onClose} wide>
      <div className="detail-intro">
        <ProductVisual product={p} />
        <div>
          <bdi className="mono">{p.sku}</bdi>
          <p>
            <bdi>{p.brand}</bdi>
          </p>
          <Amount minor={p.priceMinor} />
        </div>
      </div>
      <p dir="auto">{contentValue(p.descriptions, locale, p.translationStatus).value}</p>
      {contentValue(p.descriptions, locale, p.translationStatus).missing && (
        <p className="warning-text">{t('translationMissing')}</p>
      )}
      <dl className="detail-grid">
        <div>
          <dt>{t('oem')}</dt>
          <dd>
            <bdi dir="ltr">{p.oem || '—'}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t('barcode')}</dt>
          <dd>
            <bdi dir="ltr">{p.barcode || '—'}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t('packSize')}</dt>
          <dd>{quantity(p.packSize, locale)}</dd>
        </div>
        {p.costMinor !== undefined && (
          <div>
            <dt>{t('cost')}</dt>
            <dd>
              <Amount minor={p.costMinor} />
            </dd>
          </div>
        )}
      </dl>
      <div className="notice warning">{t('fitmentWarning')}</div>
      <Replacements product={p} />
      <Attributes product={p}/>
      <h3>{t('inventory')}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('warehouse')}</th>
              <th>{t('onHand')}</th>
              <th>{t('reserved')}</th>
              <th>{t('available')}</th>
              <th>{t('quarantine')}</th>
            </tr>
          </thead>
          <tbody>
            {p.stock.map((s) => (
              <tr key={s.warehouseId}>
                <td>
                  <bdi>{s.warehouseName}</bdi>
                </td>
                <td>{quantity(s.onHand, locale)}</td>
                <td>{quantity(s.reserved, locale)}</td>
                <td>{quantity(s.available, locale)}</td>
                <td>{quantity(s.quarantine, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{t('vehicles')}</h3>
      {p.fitments?.length ? (
        p.fitments.map((f: any, i) => (
          <div className="list-row" key={i}>
            <bdi>
              {f.make} {f.model} · {f.engine} · {f.market}
            </bdi>
            <Status value={f.status} />
          </div>
        ))
      ) : (
        <p className="muted">{t('noFitment')}</p>
      )}
    </Modal>
  );
}

export function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, can, notify } = useApp();
  const [attributes,setAttributes]=useState(product?.companyMetadata?.technicalAttributes??[]);
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    names: { ar: product?.names.ar ?? '', fr: product?.names.fr ?? '', en: product?.names.en ?? '' },
    descriptions: {
      ar: product?.descriptions?.ar ?? '',
      fr: product?.descriptions?.fr ?? '',
      en: product?.descriptions?.en ?? '',
    },
    brand: product?.brand ?? '',
    oem: product?.oem ?? '',
    barcode: product?.barcode ?? '',
    category: product?.category ?? '',
    manufacturerPartNo: product?.manufacturerPartNo ?? '',
    categoryNames: {
      ar: product?.categoryNames?.ar ?? '',
      fr: product?.categoryNames?.fr ?? '',
      en: product?.categoryNames?.en ?? '',
    },
    packSize: String(product?.packSize ?? 1),
    price: String((product?.priceMinor ?? 0) / 100),
    cost: String((product?.costMinor ?? 0) / 100),
    reorderLevel: String(product?.reorderLevel ?? 5),
    status: product?.status ?? 'DRAFT',
  });
  const [file, setFile] = useState<File | null>(null),
    [photo, setPhoto] = useState(''),
    [rights, setRights] = useState(''),
    [savedId, setSavedId] = useState<string>(),
    [error, setError] = useState<unknown>();
  const save = useMutation(),
    upload = useMutation();
  const change = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const busy = save.busy || upload.busy;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      if (
        file &&
        (file.size > 3 * 1024 * 1024 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          rights.trim().length < 5)
      )
        throw new ApiError('INVALID_FILE');
      let id = savedId;
      if (!id) {
        const body = {
          sku: form.sku,
          names: form.names,
          descriptions: form.descriptions,
          brand: form.brand,
          oem: form.oem,
          barcode: form.barcode,
          category: form.category,
          manufacturerPartNo: form.manufacturerPartNo,
          companyMetadata: {...product?.companyMetadata,technicalAttributes:attributes},
          categoryNames: form.categoryNames,
          packSize: whole(form.packSize),
          priceMinor: parseMoney(form.price),
          costMinor: parseMoney(form.cost),
          reorderLevel: whole(form.reorderLevel, true),
          status: form.status,
          ...(product ? { version: (product as any).version } : {}),
        };
        const result = await save.run<{ id: string }>(
          product ? `/products/${product.id}/update` : '/products',
          body,
        );
        if (!result) return;
        id = result.id;
        setSavedId(id);
      }
      if (file) {
        const result = await upload.run(`/products/${id}/media`, {
          data: photo.split(',')[1],
          mime: file.type,
          rights,
        });
        if (!result) return;
      }
      notify('productSaved');
      onSaved();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Modal title={t(product ? 'edit' : 'newProduct')} onClose={onClose} wide>
      <p className="muted">{t('draftHint')}</p>
      <p className="draft-hint">{t('unsaved')}</p>
      <form onSubmit={submit} noValidate>
        {savedId && <div className="notice success">{t('productCreatedUploadPending')}</div>}
        <fieldset disabled={busy || !!savedId} className="form-grid">
          <Field label={t('sku')}>
            <input
              data-testid="product-sku"
              dir="ltr"
              value={form.sku}
              readOnly={!!product}
              onChange={(e) => change('sku', e.target.value)}
            />
          </Field>
          <Field label={t('brand')}>
            <input
              data-testid="product-brand"
              dir="auto"
              value={form.brand}
              onChange={(e) => change('brand', e.target.value)}
            />
          </Field>
          {(['ar', 'fr', 'en'] as const).map((l) => (
            <Field key={l} label={t(`name${l[0].toUpperCase() + l.slice(1)}` as MessageKey)}>
              <input
                data-testid={`product-name-${l}`}
                dir={l === 'ar' ? 'rtl' : 'ltr'}
                lang={l}
                value={form.names[l]}
                onChange={(e) => setForm((f) => ({ ...f, names: { ...f.names, [l]: e.target.value } }))}
              />
            </Field>
          ))}
          <Field label={t('category')}>
            <input
              data-testid="product-category"
              dir="auto"
              value={form.category}
              onChange={(e) => change('category', e.target.value)}
            />
          </Field>
          <Field label={t('manufacturerPartNo')}>
            <input
              dir="ltr"
              value={form.manufacturerPartNo}
              onChange={(e) => change('manufacturerPartNo', e.target.value)}
            />
          </Field>
          {(['ar', 'fr', 'en'] as const).map((l) => (
            <Field
              key={'category-' + l}
              label={t(('category' + l[0].toUpperCase() + l.slice(1)) as MessageKey)}
            >
              <input
                lang={l}
                dir={l === 'ar' ? 'rtl' : 'ltr'}
                value={form.categoryNames[l]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, categoryNames: { ...f.categoryNames, [l]: e.target.value } }))
                }
              />
            </Field>
          ))}
          <Field label={t('oem')}>
            <input
              data-testid="product-oem"
              dir="ltr"
              value={form.oem}
              onChange={(e) => change('oem', e.target.value)}
            />
          </Field>
          <Field label={t('barcode')}>
            <input
              data-testid="product-barcode"
              dir="ltr"
              value={form.barcode}
              onChange={(e) => change('barcode', e.target.value)}
            />
          </Field>
          <Field label={t('packSize')}>
            <input
              data-testid="product-pack-size"
              inputMode="numeric"
              dir="ltr"
              value={form.packSize}
              onChange={(e) => change('packSize', e.target.value)}
            />
          </Field>
          {can('costs') && (
            <>
              <Field label={t('price')}>
                <input
                  data-testid="product-price"
                  inputMode="decimal"
                  dir="ltr"
                  value={form.price}
                  onChange={(e) => change('price', e.target.value)}
                />
              </Field>
              <Field label={t('cost')}>
                <input
                  data-testid="product-cost"
                  inputMode="decimal"
                  dir="ltr"
                  value={form.cost}
                  onChange={(e) => change('cost', e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label={t('reorderLevel')}>
            <input
              inputMode="numeric"
              value={form.reorderLevel}
              onChange={(e) => change('reorderLevel', e.target.value)}
            />
          </Field>
          <Field label={t('status')}>
            <select
              data-testid="product-status"
              value={form.status}
              onChange={(e) => change('status', e.target.value)}
            >
              <option value="DRAFT">{t('DRAFT')}</option>
              <option value="ACTIVE_INTERNAL">{t('ACTIVE_INTERNAL')}</option>
            </select>
          </Field>
          {(['ar', 'fr', 'en'] as const).map((l) => (
            <Field key={l} label={t(`description${l[0].toUpperCase() + l.slice(1)}` as MessageKey)}>
              <textarea
                lang={l}
                dir={l === 'ar' ? 'rtl' : 'ltr'}
                value={form.descriptions[l]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descriptions: { ...f.descriptions, [l]: e.target.value } }))
                }
              />
            </Field>
          ))}
        </fieldset>
        <div className="upload-zone">
          <AttributeEditor value={attributes} onChange={setAttributes}/>
            <FilePicker label={t('photo')} hint={t('rightsHelp')}
              data-testid="product-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                setPhoto('');
                if (selected) {
                  const reader = new FileReader();
                  reader.onload = () => setPhoto(String(reader.result));
                  reader.readAsDataURL(selected);
                }
              }}
            />
          {file && (
            <small>
              {t('selectedFile')}: <bdi>{file.name}</bdi>
            </small>
          )}
          {photo && <img className="upload-preview" src={photo} alt={t('previewPhoto')} />}
          <Field label={t('rights')}>
            <textarea
              data-testid="product-rights"
              value={rights}
              onChange={(e) => setRights(e.target.value)}
              disabled={busy}
            />
          </Field>
        </div>
        <ErrorBanner error={error} />
        <MutationState state={save} />
        <MutationState state={upload} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button
            data-testid="product-submit"
            type="submit"
            className="button primary"
            disabled={busy || (!!file && !photo)}
          >
            {busy ? t('loading') : t(savedId ? 'upload' : 'save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Receipt({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { t, locale } = useApp();
  return (
    <Modal title={t('receipt')} onClose={onClose}>
      <article
        className="receipt-paper"
        data-testid="receipt"
        data-sale-id={sale.id}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        lang={locale}
      >
        <div className="receipt-logo">
          AutoParts <strong>Business</strong>
        </div>
        <p>{t(sale.kind === 'QUOTE' ? 'quote' : 'saleConfirmed')}</p>
        {sale.expiresAt && (
          <p>
            {t('expiresAt')}: {dateTime(sale.expiresAt, locale)}
          </p>
        )}
        <p>
          <bdi className="mono">{sale.id}</bdi>
        </p>
        <p>{dateTime(sale.createdAt ?? sale.created_at ?? new Date(), locale)}</p>
        <hr />
        {sale.lines.map((line) => (
          <div className="receipt-line" key={line.productId}>
            <div>
              <strong>
                <bdi>{contentValue(line.names, locale).value || line.sku}</bdi>
              </strong>
              {contentValue(line.names, locale).missing && <small>{t('translationMissing')}</small>}
              <small>
                <bdi dir="ltr">{line.sku}</bdi> ·{' '}
                <bdi>
                  {quantity(line.quantity, locale)} ×{' '}
                  {money(line.priceMinor ?? line.unitPriceMinor ?? 0, locale)}
                </bdi>
              </small>
            </div>
            <Amount minor={line.quantity * (line.priceMinor ?? line.unitPriceMinor ?? 0)} />
          </div>
        ))}
        <hr />
        <div className="total-row">
          <span>{t('subtotal')}</span>
          <Amount minor={sale.subtotalMinor ?? sale.totalMinor} />
        </div>
        <div className="total-row">
          <span>
            {t('tax')} · <bdi>{quantity((sale.taxRateBps ?? 0) / 100, locale)}%</bdi>
          </span>
          <Amount minor={sale.taxMinor ?? 0} />
        </div>
        <div className="receipt-total">
          <strong>{t('total')}</strong>
          <strong data-testid="receipt-total" data-minor={sale.totalMinor}>
            <Amount minor={sale.totalMinor} />
          </strong>
        </div>
        <p className="small">{t(sale.kind === 'QUOTE' ? 'quoteDisclaimer' : 'receiptDisclaimer')}</p>
        {!sale.taxConfigured && <p className="small">{t('taxNotConfigured')}</p>}
        <p className="small">{t('demoNotice')}</p>
      </article>
      <button className="button primary full no-print" onClick={() => window.print()}>
        <Printer size={18} />
        {t('print')}
      </button>
    </Modal>
  );
}

export function PointOfSale() {
  const { t, warehouses, notify, online, locale } = useApp();
  const [q, setQ] = useState(''),
    [warehouseId, setWarehouse] = useState(''),
    [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]),
    [reserved, setReserved] = useState<string>(),
    [sale, setSale] = useState<Sale | null>(null);
  const wh = warehouseId || warehouses[0]?.id || '';
  const products = useLoad<{ items: Product[]; total: number }>(
    `/products?q=${encodeURIComponent(q)}&warehouseId=${wh}`,
    [wh],
  );
  const sales = useLoad<{ items: Sale[] }>('/sales');
  const quotes = useLoad<{ items: Sale[] }>('/quotes'),
    tax = useLoad<TaxSettings>('/pricing'),
    quote = useMutation();
  const [refreshError, setRefreshError] = useState<unknown>();
  const commit = useMutation(),
    reserve = useMutation(),
    release = useMutation();
  const blocked =
    !!reserved ||
    commit.busy ||
    reserve.busy ||
    !!commit.pending ||
    !!reserve.pending ||
    quote.busy ||
    !!quote.pending;
  const totals = priceTotals(
      cart.map((l) => ({ priceMinor: l.product.priceMinor, quantity: l.quantity })),
      tax.data ?? { rateBps: 0, inclusive: false },
    ),
    total = totals.totalMinor;
  function add(p: Product) {
    if (blocked) return;
    setCart((lines) => {
      const old = lines.find((l) => l.product.id === p.id);
      return old
        ? lines.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { product: p, quantity: 1 }];
    });
  }
  const lines = cart.map((l) => ({ productId: l.product.id, quantity: l.quantity }));
  async function finish() {
    const result = await commit.run<Sale>('/sales', {
      warehouseId: wh,
      lines,
      locale,
      expectedTotalMinor: total,
      ...(reserved ? { reservationId: reserved } : {}),
    });
    if (result) {
      setSale(result);
      setCart([]);
      setReserved(undefined);
      products.reload();
      sales.reload();
      notify('saleConfirmed');
    }
  }
  return (
    <>
      <PageHeading title="pos" hint="posHint" />
      <ErrorBanner error={tax.error ?? refreshError} />
      <div className="pos-grid">
        <section className="pos-products">
          <div className="toolbar">
            <SearchBox
              value={q}
              onChange={setQ}
              onEnter={() => {
                if (products.data?.items.length === 1) add(products.data.items[0]);
              }}
            />
            <WarehouseSelect
              value={wh}
              onChange={(id) => {
                if (cart.length) return;
                setWarehouse(id);
              }}
              disabled={cart.length > 0}
            />
          </div>
          <ErrorBanner error={products.error} />
          <div className="parts-grid">
            {products.data?.items.map((p) => (
              <button
                key={p.id}
                data-testid={`add-to-cart-${p.sku}`}
                className="part-card"
                disabled={blocked || p.status !== 'ACTIVE_INTERNAL' || totalStock(p, wh).available <= 0}
                onClick={() => add(p)}
              >
                <div className="part-card-top">
                  <ProductVisual product={p} />
                  <span className="add-circle">
                    <Plus size={19} />
                  </span>
                </div>
                <ProductName product={p} />
                <bdi dir="ltr" className="mono">
                  {p.sku}
                </bdi>
                <div className="part-card-bottom">
                  <strong>
                    <Amount minor={p.priceMinor} />
                  </strong>
                  <StockBadge value={totalStock(p, wh).available} />
                </div>
              </button>
            ))}
          </div>
          {!products.data?.items.length && <Empty title={products.loading ? t('loading') : t('noResults')} />}
          <section className="panel recent-sales">
            <h2>{t('savedSales')}</h2>
            {sales.data?.items.slice(0, 4).map((s) => (
              <button
                className="list-row full"
                key={s.id}
                onClick={() => void api<Sale>(`/sales/${s.id}`).then(setSale)}
              >
                <bdi className="mono">{s.id.slice(0, 8)}</bdi>
                <Amount minor={s.totalMinor} />
                <ChevronRight size={16} />
              </button>
            ))}
            <h2>{t('quote')}</h2>
            {quotes.data?.items.slice(0, 4).map((q) => (
              <div className="list-row" key={q.id}>
                <button className="text-button" onClick={() => setSale(q)}>
                  <bdi>{q.id.slice(0, 8)}</bdi> · <Amount minor={q.totalMinor} />
                </button>
                <Status value={q.status} />
                {q.status === 'OPEN' && (
                  <button
                    className="text-button"
                    disabled={quote.busy}
                    onClick={async () => {
                      if (await quote.run(`/quotes/${q.id}/cancel`, {})) quotes.reload();
                    }}
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            ))}
          </section>
        </section>
        <aside className="cart-panel">
          <div className="cart-heading">
            <ShoppingCart size={22} />
            <h2>{t('cart')}</h2>
            <span className="badge neutral">{quantity(cart.length, locale)}</span>
          </div>
          <p className="draft-hint">{t('unsaved')}</p>
          <div className="cart-lines">
            {cart.length ? (
              cart.map((line) => (
                <div className="cart-line" key={line.product.id}>
                  <ProductVisual product={line.product} />
                  <div className="cart-line-body">
                    <ProductName product={line.product} />
                    <small>
                      <bdi dir="ltr">{line.product.sku}</bdi>
                    </small>
                    <div className="cart-line-controls">
                      <input
                        data-testid={`cart-quantity-${line.product.sku}`}
                        aria-label={`${t('quantity')} ${line.product.sku}`}
                        type="number"
                        min={1}
                        max={1000000}
                        value={line.quantity}
                        disabled={blocked}
                        onChange={(e) =>
                          setCart((ls) =>
                            ls.map((l) =>
                              l.product.id === line.product.id
                                ? {
                                    ...l,
                                    quantity: Math.min(
                                      1000000,
                                      Math.trunc(Math.max(1, Number(e.target.value) || 1)),
                                    ),
                                  }
                                : l,
                            ),
                          )
                        }
                      />
                      <Amount minor={line.quantity * line.product.priceMinor} />
                      <button
                        className="icon-button"
                        aria-label={`${t('remove')} ${line.product.sku}`}
                        disabled={blocked}
                        onClick={() => setCart((ls) => ls.filter((l) => l.product.id !== line.product.id))}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty title={t('cartEmpty')} />
            )}
          </div>
          {reserved && (
            <div className="notice success">
              <Check size={18} />
              <div>
                {t('reservationConfirmed')}
                <small>
                  <bdi>{reserved}</bdi>
                </small>
              </div>
            </div>
          )}
          <MutationState state={commit} />
          <MutationState state={reserve} />
          <MutationState state={release} />
          <div className="cart-bottom">
            <div className="total-row">
              <span>{t('total')}</span>
              <strong data-testid="cart-total" data-minor={total}>
                <Amount minor={total} />
              </strong>
            </div>
            <div className="total-row">
              <span>{t('tax')}</span>
              <Amount minor={totals.taxMinor} />
            </div>
            <p className="small muted">{t('serverTotal')}</p>
            {!tax.data?.configured && <p className="small muted">{t('taxNotConfigured')}</p>}
            <button
              className="text-button"
              disabled={!cart.length || commit.busy || !!commit.pending}
              onClick={async () => {
                setRefreshError(undefined);
                try {
                  const updated = await Promise.all(
                    cart.map(async (l) => ({
                      ...l,
                      product: await api<Product>(`/products/${l.product.id}`),
                    })),
                  );
                  setCart(updated);
                  tax.reload();
                } catch (e) {
                  setRefreshError(e);
                }
              }}
            >
              {t('refreshPrices')}
            </button>
            <button
              data-testid="sale-submit"
              className="button primary full"
              disabled={
                !cart.length ||
                !online ||
                !tax.data ||
                commit.busy ||
                reserve.busy ||
                release.busy ||
                quote.busy ||
                !!quote.pending
              }
              onClick={() => void finish()}
            >
              {commit.busy ? t('pending') : t(commit.pending ? 'retry' : 'completeSale')}
              <ArrowUpRight size={18} />
            </button>
            <MutationState state={quote} />
            <button
              className="button secondary full"
              disabled={
                !cart.length ||
                !tax.data ||
                !online ||
                quote.busy ||
                commit.busy ||
                !!commit.pending ||
                !!reserved
              }
              onClick={async () => {
                const q = await quote.run<Sale>('/quotes', { warehouseId: wh, lines, locale });
                if (q) {
                  setSale(q);
                  quotes.reload();
                }
              }}
            >
              {t(quote.pending ? 'retry' : 'saveQuote')}
            </button>
            {reserved ? (
              <button
                className="button secondary full"
                disabled={release.busy || commit.busy}
                onClick={() =>
                  void release.run(`/inventory/reservations/${reserved}/release`, {}).then((result) => {
                    if (result) {
                      setReserved(undefined);
                      products.reload();
                    }
                  })
                }
              >
                {t('release')}
              </button>
            ) : (
              <button
                className="button secondary full"
                disabled={!cart.length || !online || commit.busy || reserve.busy || !!commit.pending}
                onClick={() =>
                  void reserve
                    .run<{ id: string }>('/inventory/reservations', {
                      warehouseId: wh,
                      lines,
                      ttlMinutes: 15,
                    })
                    .then((r) => {
                      if (r) {
                        setReserved(r.id);
                        products.reload();
                        notify('reservationConfirmed');
                      }
                    })
                }
              >
                {t('reserve')}
              </button>
            )}
          </div>
        </aside>
      </div>
      {sale && <Receipt sale={sale} onClose={() => setSale(null)} />}
    </>
  );
}

export function ProductSelect({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (id: string, p?: Product) => void;
  testId?: string;
}) {
  const { t, locale } = useApp();
  const [q, setQ] = useState('');
  const { data } = useLoad<{ items: Product[] }>(`/products?q=${encodeURIComponent(q)}`);
  return (
    <div className="product-picker">
      <Field label={t('search')}>
        <input
          aria-label={t('search')}
          placeholder={t('searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          dir="auto"
        />
      </Field>
      <Field label={t('product')}>
        <select
          data-testid={testId}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value,
              data?.items.find((p) => p.id === e.target.value),
            )
          }
        >
          <option value="">— {t('product')} —</option>
          {data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {contentValue(p.names, locale, p.translationStatus).value || t('translationMissing')}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
type Operation = 'receiptOperation' | 'transfer' | 'return' | 'count' | 'inspection' | 'approveCount';
export function Inventory() {
  const { t, can, warehouses, locale, notify, online } = useApp();
  const [operation, setOperation] = useState<Operation>(
    can('receive') ? 'receiptOperation' : can('returns') ? 'return' : 'count',
  );
  const [productId, setProduct] = useState(''),
    [product, setProductDetails] = useState<Product>(),
    [warehouseId, setWarehouse] = useState(''),
    [target, setTarget] = useState(''),
    [qty, setQty] = useState('1'),
    [unit, setUnit] = useState('PCS'),
    [reference, setReference] = useState(''),
    [condition, setCondition] = useState('SELLABLE'),
    [reason, setReason] = useState(''),
    [saleId, setSaleId] = useState(''),
    [recordId, setRecordId] = useState(''),
    [purchaseId, setPurchaseId] = useState(''),
    [preview, setPreview] = useState<{ path: string; body: unknown } | null>(null),
    [error, setError] = useState<unknown>(),
    [result, setResult] = useState<any>();
  const mutation = useMutation();
  const wh = warehouseId || warehouses[0]?.id || '';
  const stock = useLoad<{ items: Product[] }>('/products');
  const returnList = useLoad<{ items: any[] }>('/inventory/returns');
  const counts = useLoad<{ items: any[] }>('/inventory/counts');
  const allowed = (
    [
      ['receiptOperation', 'receive'],
      ['transfer', 'transfer'],
      ['return', 'returns'],
      ['count', 'counts'],
      ['inspection', 'approve'],
      ['approveCount', 'approve'],
    ] as [Operation, string][]
  ).filter(([, permission]) => can(permission));
  function prepare(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      let path = '',
        body: unknown;
      switch (operation) {
        case 'receiptOperation':
          path = '/inventory/receipts';
          body = {
            productId,
            warehouseId: wh,
            quantity: whole(qty),
            unit,
            reference,
            condition,
            ...(purchaseId ? { purchaseId } : {}),
          };
          break;
        case 'transfer':
          path = '/inventory/transfers';
          body = { productId, fromWarehouseId: wh, toWarehouseId: target, quantity: whole(qty), reason };
          break;
        case 'return':
          path = '/inventory/returns';
          body = { productId, saleId, warehouseId: wh, quantity: whole(qty), reason };
          break;
        case 'count':
          path = '/inventory/counts';
          body = { productId, warehouseId: wh, counted: whole(qty, true), reason };
          break;
        case 'inspection':
          path = `/inventory/returns/${recordId}/inspect`;
          body = { condition: condition === 'DAMAGED' ? 'DAMAGED' : 'SELLABLE' };
          break;
        case 'approveCount':
          path = `/inventory/counts/${recordId}/approve`;
          body = {};
          break;
      }
      setPreview({ path, body });
    } catch (err) {
      setError(err);
    }
  }
  async function confirm() {
    if (!preview) return;
    const r = await mutation.run(preview.path, preview.body);
    if (r) {
      setResult(r);
      setPreview(null);
      stock.reload();
      returnList.reload();
      counts.reload();
      notify('operationSaved');
    }
  }
  return (
    <>
      <PageHeading title="inventory" hint="inventoryHint">
        <OpeningBalances />
        <Bins />
      </PageHeading>
      <div className="inventory-layout">
        <section className="panel operation-panel">
          {allowed.length ? (
            <>
              <div className="operation-tabs" role="group" aria-label={t('operation')}>
                {allowed.map(([id]) => (
                  <button
                    className={operation === id ? 'selected' : ''}
                    key={id}
                    onClick={() => {
                      setOperation(id);
                      setPreview(null);
                      setResult(undefined);
                      setError(undefined);
                      setRecordId('');
                    }}
                    disabled={mutation.busy || !!mutation.pending}
                  >
                    {t(id)}
                  </button>
                ))}
              </div>
              <form noValidate onSubmit={prepare}>
                <fieldset disabled={!!preview || mutation.busy} className="form-grid">
                  {!['inspection', 'approveCount'].includes(operation) ? (
                    <>
                      <div className="span-2">
                        <ProductSelect
                          testId="receipt-product"
                          value={productId}
                          onChange={(id, p) => {
                            setProduct(id);
                            setProductDetails(p);
                          }}
                        />
                      </div>
                      <WarehouseSelect value={wh} onChange={setWarehouse} />
                      <Field label={t(operation === 'count' ? 'counted' : 'quantity')}>
                        <input
                          data-testid="receipt-quantity"
                          inputMode="numeric"
                          dir="ltr"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                        />
                      </Field>
                      {operation === 'receiptOperation' && (
                        <>
                          <Field label={t('unit')}>
                            <select
                              data-testid="receipt-unit"
                              value={unit}
                              onChange={(e) => setUnit(e.target.value)}
                            >
                              <option value="PCS">{t('PCS')}</option>
                              <option value="CARTON">
                                {t('CARTON')} · {product?.packSize ?? '—'} PCS
                              </option>
                            </select>
                          </Field>
                          <Field label={t('condition')}>
                            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                              {['SELLABLE', 'QUARANTINE', 'DAMAGED'].map((s) => (
                                <option key={s} value={s}>
                                  {t(s as MessageKey)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label={t('reference')}>
                            <input
                              data-testid="receipt-reference"
                              dir="auto"
                              value={reference}
                              onChange={(e) => setReference(e.target.value)}
                            />
                          </Field>
                          <Field label={`${t('purchaseId')} · ${t('optional')}`}>
                            <input
                              dir="ltr"
                              value={purchaseId}
                              onChange={(e) => setPurchaseId(e.target.value)}
                            />
                          </Field>
                        </>
                      )}
                      {operation === 'transfer' && (
                        <Field label={t('destination')}>
                          <select value={target} onChange={(e) => setTarget(e.target.value)}>
                            <option value="">—</option>
                            {warehouses
                              .filter((w) => w.id !== wh)
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                      )}
                      {operation === 'return' && (
                        <Field label={t('saleId')}>
                          <input dir="ltr" value={saleId} onChange={(e) => setSaleId(e.target.value)} />
                        </Field>
                      )}
                      {operation !== 'receiptOperation' && (
                        <Field label={t('reason')}>
                          <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                        </Field>
                      )}
                    </>
                  ) : (
                    <>
                      <Field label={t(operation === 'inspection' ? 'returnId' : 'countId')}>
                        <select value={recordId} onChange={(e) => setRecordId(e.target.value)}>
                          <option value="">—</option>
                          {(operation === 'inspection' ? returnList.data?.items : counts.data?.items)
                            ?.filter(
                              (r) => r.status === (operation === 'inspection' ? 'QUARANTINE' : 'PENDING'),
                            )
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.id}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {operation === 'inspection' && (
                        <Field label={t('condition')}>
                          <select
                            value={condition === 'DAMAGED' ? 'DAMAGED' : 'SELLABLE'}
                            onChange={(e) => setCondition(e.target.value)}
                          >
                            <option value="SELLABLE">{t('SELLABLE')}</option>
                            <option value="DAMAGED">{t('DAMAGED')}</option>
                          </select>
                        </Field>
                      )}
                    </>
                  )}
                </fieldset>
                {operation === 'return' && <p className="notice warning">{t('returnWarning')}</p>}
                {['count', 'approveCount'].includes(operation) && (
                  <p className="notice warning">{t('countWarning')}</p>
                )}
                <ErrorBanner error={error} />
                <MutationState state={mutation} />
                {preview ? (
                  <div className="operation-preview">
                    <h3>{t('preview')}</h3>
                    <p>
                      {t(operation)}{' '}
                      {product && (
                        <>
                          · <bdi>{product.sku}</bdi>
                        </>
                      )}
                    </p>
                    {operation === 'receiptOperation' && (
                      <strong>
                        {t('receiptPreview', {
                          quantity: qty,
                          pack: unit === 'CARTON' ? (product?.packSize ?? 1) : 1,
                          pieces: whole(qty) * (unit === 'CARTON' ? (product?.packSize ?? 1) : 1),
                        })}
                      </strong>
                    )}
                    <div className="form-actions">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={mutation.busy || !!mutation.pending}
                        onClick={() => setPreview(null)}
                      >
                        {t('back')}
                      </button>
                      <button
                        data-testid="receipt-submit"
                        className="button primary"
                        type="button"
                        disabled={mutation.busy || !online}
                        onClick={() => void confirm()}
                      >
                        {t(mutation.busy ? 'pending' : mutation.pending ? 'retry' : 'confirmOperation')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="form-actions">
                    <button
                      data-testid="receipt-preview"
                      className="button primary"
                      type="submit"
                      disabled={!online}
                    >
                      {t('preview')}
                    </button>
                  </div>
                )}
                {result && (
                  <div className="notice success" role="status">
                    {t('operationSaved')}
                    <bdi className="mono" data-testid="inventory-result">
                      {result.id}
                    </bdi>
                  </div>
                )}
              </form>
            </>
          ) : (
            <Empty />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>{t('inventory')}</h2>
            <button className="icon-button" aria-label={t('refresh')} onClick={stock.reload}>
              <RefreshCw size={18} />
            </button>
          </div>
          {stock.data?.items.slice(0, 12).map((p) => (
            <div className="stock-list-item" key={p.id}>
              <ProductVisual product={p} />
              <div>
                <ProductName product={p} />
                <small>
                  <bdi dir="ltr">{p.sku}</bdi>
                </small>
              </div>
              <StockBadge value={totalStock(p).available} />
            </div>
          ))}
          <ErrorBanner error={stock.error} />
        </section>
      </div>
    </>
  );
}

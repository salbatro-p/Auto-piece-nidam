import React, { useEffect, useState } from 'react';
import { Package, ZoomIn } from 'lucide-react';
import { useApp } from './context';
import { api, ApiError } from './api';
import {
  Empty,
  ErrorBanner,
  Field,
  FilePicker,
  Modal,
  MutationState,
  ProductName,
  Status,
  useLoad,
  useMutation,
} from './components';
import { contentValue, quantity } from '../../../packages/i18n/src/index';
import { messageKey } from '../../../packages/i18n/src/business';
import type { Product, Source, Vehicle } from './types';
import { CategoryOriginals } from './original-visuals';
const kinds = [
  'EXACT_PRODUCT_PHOTO',
  'COMPANY_ORIGINAL_PHOTO',
  'GENERIC_CATEGORY_ILLUSTRATION',
  'VEHICLE_PHOTO',
  'EXPLODED_DIAGRAM',
] as const;
type Kind = (typeof kinds)[number];
type License = {
  id: string;
  name: string;
  sourceType: string;
  sourceId?: string;
  termsVersion: string;
  proof: string;
  internalDisplayPermitted: boolean;
  publicDisplayPermitted: boolean;
  attributionText: string;
  territory: string;
  restrictions: string;
  expiresAt: string | null;
  revokedAt?: string;
  version: number;
};
type Media = {
  id: string;
  productId?: string;
  vehicleVariantId?: string;
  kind: Kind;
  sku: string;
  manufacturerBrand: string;
  manufacturerPartNumber: string;
  licenseId: string;
  viewAngle: string;
  state: string;
  version: number;
  displayApproved: boolean;
  sourceName: string;
  attributionText: string;
  reviewNote: string;
  applicability: Record<string, string>;
  provider: string;
  illustrationId: string;
  callouts: { reference: string; label: string }[];
};
export function MediaImage({ media, large = false }: { media: Media; large?: boolean }) {
  const { t } = useApp(),
    [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media.id, media.version]);
  if (failed)
    return (
      <div className="image-fallback" role="status">
        <Package />
        <span>{t('IMAGE_UNAVAILABLE')}</span>
      </div>
    );
  return (
    <img
      className={large ? 'media-large' : 'media-thumbnail'}
      src={`/api/media/${media.id}?size=${large ? 'display' : 'thumbnail'}`}
      alt={t('imageAlt', {
        kind: t(media.kind),
        sku: media.sku || media.illustrationId,
        angle: media.viewAngle,
      })}
      width={large ? 1000 : 320}
      height={large ? 750 : 240}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function MediaGallery({
  product,
  vehicle,
  diagrams = false,
  startUpload = false,
}: {
  product?: Product;
  vehicle?: Vehicle;
  diagrams?: boolean;
  startUpload?: boolean;
}) {
  const { t, can } = useApp(),
    list = useLoad<{ items: Media[] }>(
      product ? `/products/${product.id}/gallery` : `/vehicles/${vehicle!.id}/media`,
    );
  const [zoom, setZoom] = useState<Media>(),
    [review, setReview] = useState<Media>(),
    [upload, setUpload] = useState(startUpload);
  const items =
    list.data?.items.filter(
      (m) => !vehicle || (diagrams ? m.kind === 'EXPLODED_DIAGRAM' : m.kind === 'VEHICLE_PHOTO'),
    ) ?? [];
  return (
    <section className="media-section">
      <div className="section-heading">
        <h3>{t(diagrams ? 'EXPLODED_DIAGRAM' : 'gallery')}</h3>
        {can('catalog') && (
          <button className="button secondary" onClick={() => setUpload(true)}>
            {t('addPhotos')}
          </button>
        )}
      </div>
      <p className="small muted">{t('imageNotFitment')}</p>
      <ErrorBanner error={list.error} />
      {!items.length && (
        <Empty
          title={t('IMAGE_UNAVAILABLE')}
          hint={t(diagrams ? 'diagramUnavailable' : 'MEDIA_REVIEW_REQUIRED')}
        />
      )}
      <div className="media-grid" role="region" aria-label={t(diagrams ? 'EXPLODED_DIAGRAM' : 'gallery')}>
        {items.map((m) => (
          <article key={m.id} className="media-card">
            <button
              type="button"
              className="media-zoom"
              onClick={() => setZoom(m)}
              aria-label={`${t('zoomPhoto')}: ${m.sku || m.illustrationId}`}
            >
              <MediaImage media={m} />
              <ZoomIn size={20} />
            </button>
            <strong>{t(m.kind)}</strong>
            <bdi className="mono">
              {m.manufacturerBrand} · {m.manufacturerPartNumber || m.illustrationId}
            </bdi>
            <Status value={m.state} />
            {!m.displayApproved && <p className="warning-text">{t('mediaBlocked')}</p>}
            <small>
              <bdi>
                {m.sourceName} {m.attributionText}
              </bdi>
            </small>
            {can('catalog') && (
              <button className="button secondary" onClick={() => setReview(m)}>
                {t('photoReview')}
              </button>
            )}
          </article>
        ))}
      </div>
      {product && list.data && <CategoryOriginals
        product={product}
        showCategoryDrawing={!items.some(item => item.displayApproved && ['EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO'].includes(item.kind))}
      />}
      {zoom && (
        <Modal title={t('zoomPhoto')} onClose={() => setZoom(undefined)} wide>
          <MediaImage media={zoom} large />
          <p>
            {t(zoom.kind)} ·{' '}
            <bdi>
              {zoom.sku} {zoom.manufacturerPartNumber} {zoom.viewAngle}
            </bdi>
          </p>
          <p>
            <bdi>
              {zoom.sourceName} {zoom.attributionText}
            </bdi>
          </p>
          {zoom.kind === 'EXPLODED_DIAGRAM' && (
            <>
              <p>
                {t('diagramProvider')}: <bdi>{zoom.provider}</bdi> · <bdi>{zoom.illustrationId}</bdi>
              </p>
              <ul>
                {zoom.callouts.map((c, i) => (
                  <li key={i}>
                    <bdi>
                      {c.reference} · {c.label}
                    </bdi>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
      {upload && (
        <MediaUploader
          product={product}
          vehicle={vehicle}
          diagrams={diagrams}
          onClose={() => setUpload(false)}
          onSaved={list.reload}
        />
      )}
      {review && (
        <MediaReviewer
          media={review}
          product={product}
          onClose={() => setReview(undefined)}
          onSaved={() => {
            setReview(undefined);
            list.reload();
          }}
        />
      )}
    </section>
  );
}
function MediaUploader({
  product,
  vehicle,
  diagrams,
  onClose,
  onSaved,
}: {
  product?: Product;
  vehicle?: Vehicle;
  diagrams: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp(),
    licenses = useLoad<{ items: License[] }>('/media/licenses'),
    save = useMutation();
  const [files, setFiles] = useState<File[]>([]),
    [angles, setAngles] = useState<Record<number, string>>({}),
    [done, setDone] = useState(0),
    [percent, setPercent] = useState(0),
    [running, setRunning] = useState(false),
    [error, setError] = useState<unknown>(),
    [license, setLicense] = useState(''),
    [kind, setKind] = useState<Kind>(
      product ? 'COMPANY_ORIGINAL_PHOTO' : diagrams ? 'EXPLODED_DIAGRAM' : 'VEHICLE_PHOTO',
    ),
    [angle, setAngle] = useState(''),
    [side, setSide] = useState(''),
    [axle, setAxle] = useState(''),
    [provider, setProvider] = useState(''),
    [illustration, setIllustration] = useState('');
  async function upload() {
    setError(undefined);
    if (!license || !files.length) {
      setError(new ApiError('VALIDATION_ERROR'));
      return;
    }
    setRunning(true);
    try {
      for (let i = done; i < files.length; i++) {
        const file = files[i];
        if (file.size > 4_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
          throw new ApiError('INVALID_IMAGE');
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new ApiError('INVALID_IMAGE'));
          reader.readAsDataURL(file);
        });
        setPercent(0);
        const result = await save.run(
          '/media/stage',
          {
            productId: product?.id,
            vehicleVariantId: vehicle?.id,
            kind,
            sku: product?.sku ?? '',
            manufacturerBrand: product?.brand ?? '',
            manufacturerPartNumber: product?.manufacturerPartNo ?? '',
            licenseId: license,
            data,
            mime: file.type,
            viewAngle: angles[i] || angle,
            applicability: {
              ...(side ? { side } : {}),
              ...(axle ? { axle } : {}),
              ...(vehicle ? { engine: vehicle.engine, equipment: vehicle.equipment ?? '' } : {}),
            },
            provider,
            illustrationId: illustration,
          },
          'POST',
          setPercent,
        );
        if (!result) break;
        setDone(i + 1);
        onSaved();
      }
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  }
  return (
    <Modal title={t('addPhotos')} onClose={onClose} wide>
      <p>{t('photoUploadHelp')}</p>
      <bdi className="mono">
        {product?.sku} {product?.brand} {product?.manufacturerPartNo}
      </bdi>
      <MediaLicenseManager onSaved={licenses.reload} />
      <fieldset disabled={running || !!save.pending || done > 0}>
        <div className="form-grid">
          <Field label={t('mediaKind')}>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {kinds
                .filter((k) =>
                  product
                    ? !['VEHICLE_PHOTO', 'EXPLODED_DIAGRAM'].includes(k)
                    : diagrams
                      ? k === 'EXPLODED_DIAGRAM'
                      : k === 'VEHICLE_PHOTO',
                )
                .map((k) => (
                  <option key={k} value={k}>
                    {t(k)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t('mediaLicenses')}>
            <select data-testid="media-license" value={license} onChange={(e) => setLicense(e.target.value)}>
              <option value="">—</option>
              {licenses.data?.items
                .filter((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date()))
                .map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t('viewAngle')}>
            <input value={angle} onChange={(e) => setAngle(e.target.value)} />
          </Field>
          <Field label={t('side')}>
            <select value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="">—</option>
              {(['LEFT', 'RIGHT', 'BOTH'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('axle')}>
            <select value={axle} onChange={(e) => setAxle(e.target.value)}>
              <option value="">—</option>
              {(['FRONT', 'REAR', 'BOTH'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
          </Field>
          {diagrams && (
            <>
              <Field label={t('diagramProvider')}>
                <input value={provider} onChange={(e) => setProvider(e.target.value)} />
              </Field>
              <Field label={t('illustrationId')}>
                <input value={illustration} onChange={(e) => setIllustration(e.target.value)} />
              </Field>
            </>
          )}
          <FilePicker
            label={t('photo')}
            accept="image/jpeg,image/png,image/webp"
            multiple
            capture="environment"
            data-testid="media-files"
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              if (selected.length > 12) {
                setError(new ApiError('INVALID_IMAGE'));
                return;
              }
              setFiles(selected);
              setDone(0);
              setError(undefined);
            }}
          />
        </div>
      </fieldset>
      <ul>
        {files.map((f, i) => (
          <li key={i}>
            <bdi>{f.name}</bdi> {i < done ? '✓' : ''}
            <Field label={`${t('viewAngle')} · ${f.name}`}>
              <input
                disabled={running || !!save.pending || i < done}
                value={angles[i] ?? ''}
                onChange={(e) => setAngles({ ...angles, [i]: e.target.value })}
              />
            </Field>
          </li>
        ))}
      </ul>
      <p role="status">{t('uploadProgress', { done, total: files.length, percent })}</p>
      <progress max={100} value={percent} aria-label={t('addPhotos')} />
      <ErrorBanner error={error || licenses.error} />
      <MutationState state={save} />
      {done === files.length && done > 0 ? (
        <p className="notice success">{t('uploadComplete')}</p>
      ) : (
        <button className="button primary" disabled={running} onClick={() => void upload()}>
          {t(save.pending ? 'retry' : 'addPhotos')}
        </button>
      )}
    </Modal>
  );
}
function MediaReviewer({
  media: m,
  product,
  onClose,
  onSaved,
}: {
  media: Media;
  product?: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, user } = useApp(),
    save = useMutation(),
    licenses = useLoad<{ items: License[] }>('/media/licenses');
  const [note, setNote] = useState(''),
    [physical, setPhysical] = useState(false),
    [applicability, setApplicability] = useState(false),
    [duplicate, setDuplicate] = useState(false),
    [license, setLicense] = useState(m.licenseId ?? '');
  async function review(state: string) {
    if (
      await save.run(`/media/${m.id}/review`, {
        version: m.version,
        state,
        note,
        physicalMatchConfirmed: physical,
        applicabilityConfirmed: applicability,
        duplicateUseConfirmed: duplicate,
      })
    )
      onSaved();
  }
  return (
    <Modal title={t('photoReview')} onClose={onClose} wide>
      <MediaImage media={m} />
      <p>
        <bdi>
          {m.sku} · {m.manufacturerBrand} · {m.manufacturerPartNumber}
        </bdi>
      </p>
      <p>
        {t(m.kind)} ·{' '}
        <bdi>
          {m.viewAngle} {m.sourceName}
        </bdi>
      </p>
      <Status value={m.state} />
      <p className="small">{t('imageNotFitment')}</p>
      <fieldset disabled={save.busy || !!save.pending}>
        <Field label={t('reviewNote')}>
          <textarea data-testid="media-review-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {[
          [physical, setPhysical, 'physicalMatch'],
          [applicability, setApplicability, 'applicabilityMatch'],
          [duplicate, setDuplicate, 'duplicateMatch'],
        ].map(([checked, set, key]) => (
          <label className="checkbox" key={String(key)}>
            <input
              type="checkbox"
              checked={checked as boolean}
              onChange={(e) => (set as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)}
            />
            {t(key as 'physicalMatch')}
          </label>
        ))}
        <Field label={t('mediaLicenses')}>
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            <option value="">—</option>
            {licenses.data?.items.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            if (
              await save.run(`/media/${m.id}/match`, {
                productId: m.productId ?? undefined,
                vehicleVariantId: m.vehicleVariantId ?? undefined,
                kind: m.kind,
                sku: product?.sku ?? m.sku,
                manufacturerBrand: product?.brand ?? m.manufacturerBrand,
                manufacturerPartNumber: product?.manufacturerPartNo ?? m.manufacturerPartNumber,
                licenseId: license,
                viewAngle: m.viewAngle,
                applicability: m.applicability,
                provider: m.provider,
                illustrationId: m.illustrationId,
                callouts: m.callouts,
                version: m.version,
                note,
              })
            )
              onSaved();
          }}
        >
          {t('matchPhoto')}
        </button>
      </fieldset>
      <MutationState state={save} />
      <div className="form-actions">
        <button
          className="button primary"
          disabled={save.busy}
          onClick={() => void review('APPROVED_INTERNAL')}
        >
          {t('approveInternal')}
        </button>
        {['owner', 'manager'].includes(user.role) && (
          <button
            className="button secondary"
            disabled={save.busy}
            onClick={() => void review('APPROVED_PUBLIC')}
          >
            {t('approvePublic')}
          </button>
        )}
        <button className="button secondary" disabled={save.busy} onClick={() => void review('REJECTED')}>
          {t('rejectPhoto')}
        </button>
      </div>
    </Modal>
  );
}
export function MediaLicenseManager({ onSaved = () => {} }: { onSaved?: () => void }) {
  const { t, user } = useApp(),
    list = useLoad<{ items: License[] }>('/media/licenses'),
    sources = useLoad<{ items: Source[] }>('/sources'),
    save = useMutation();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<License>(),
    [form, setForm] = useState({
      name: '',
      sourceType: 'COMPANY',
      sourceId: '',
      termsVersion: '',
      proof: '',
      internalDisplayPermitted: true,
      publicDisplayPermitted: false,
      attributionText: '',
      territory: 'MA',
      restrictions: '',
      expiresAt: '',
    });
  function edit(l: License) {
    setEditing(l);
    setForm({ ...l, sourceId: l.sourceId ?? '', expiresAt: l.expiresAt ? l.expiresAt.slice(0, 16) : '' });
    save.reset();
  }
  async function submit(revoked = false) {
    const body = {
      ...form,
      sourceId: form.sourceId || undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt + 'Z').toISOString() : null,
    };
    // Construct the whitelisted fields: persisted server-only metadata is never sent as authority.
    const fields = {
      name: body.name,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      termsVersion: body.termsVersion,
      proof: body.proof,
      internalDisplayPermitted: body.internalDisplayPermitted,
      publicDisplayPermitted: body.publicDisplayPermitted,
      attributionText: body.attributionText,
      territory: body.territory,
      restrictions: body.restrictions,
      expiresAt: body.expiresAt,
    };
    if (
      await save.run(
        editing ? `/media/licenses/${editing.id}/update` : '/media/licenses',
        editing ? { ...fields, version: editing.version, revoked } : fields,
      )
    ) {
      list.reload();
      onSaved();
      setEditing(undefined);
      setOpen(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          list.reload();
          setOpen(true);
        }}
      >
        {t('mediaLicenses')}
      </button>
      {open && (
        <Modal title={t('mediaLicenses')} onClose={() => setOpen(false)} wide>
          <ErrorBanner error={list.error || sources.error} />
          <div className="license-list">
            {list.data?.items.map((l) => (
              <button type="button" className="button secondary" key={l.id} onClick={() => edit(l)}>
                <bdi>{l.name}</bdi> ·{' '}
                {l.revokedAt
                  ? t('withdrawn')
                  : t(l.publicDisplayPermitted ? 'publicDisplay' : 'internalDisplay')}
              </button>
            ))}
          </div>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={save.busy || !!save.pending}>
              <div className="form-grid">
                {(
                  ['name', 'termsVersion', 'proof', 'attributionText', 'territory', 'restrictions'] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={t(
                      (({ proof: 'mediaProof', attributionText: 'attribution' } as Record<string, string>)[
                        k
                      ] as 'mediaProof') || (k as 'name'),
                    )}
                  >
                    <textarea value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  </Field>
                ))}
                <Field label={t('sourceType')}>
                  <select
                    value={form.sourceType}
                    onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                  >
                    {(['COMPANY', 'SUPPLIER', 'LICENSED_CATALOG', 'OTHER'] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(k)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('source')}>
                  <select
                    value={form.sourceId}
                    onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
                  >
                    <option value="">—</option>
                    {sources.data?.items
                      .filter((s) => s.canStore)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={`${t('licenseExpiry')} (UTC)`}>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  />
                </Field>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.internalDisplayPermitted}
                  onChange={(e) => setForm({ ...form, internalDisplayPermitted: e.target.checked })}
                />
                {t('internalDisplay')}
              </label>
              {['owner', 'manager'].includes(user.role) && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.publicDisplayPermitted}
                    onChange={(e) => setForm({ ...form, publicDisplayPermitted: e.target.checked })}
                  />
                  {t('publicDisplay')}
                </label>
              )}
            </fieldset>
            <MutationState state={save} />
            <div className="form-actions">
              <button className="button primary" disabled={save.busy}>
                {t('save')}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={save.busy}
                  onClick={() => void submit(true)}
                >
                  {t('revokeLicense')}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
type CoverageItem = Product & {
  exact: boolean;
  fitment: boolean;
  public: boolean;
  disputed: boolean;
  poorQuality: boolean;
  reviewRequired: boolean;
  sold90Days: number;
  pieces: number;
};
export function MediaCoverage({ onSelect, entry }: { onSelect: (p: Product) => void; entry?: { queue: 'missing' } }) {
  const { t, can, locale } = useApp(),
    [open, setOpen] = useState(!!entry),
    [queue, setQueue] = useState<string>(entry?.queue ?? 'all'),
    [page, setPage] = useState(1),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    if (entry) { setQueue(entry.queue); setPage(1); setOpen(true); }
  },[entry]);
  const list = useLoad<{ summary: Record<string, number>; items: CoverageItem[] }>(
    can('catalog') && open ? `/media/coverage?queue=${queue}&page=${page}` : null,
  );
  if (!can('catalog')) return null;
  return (
    <>
      <button
        className="button secondary"
        onClick={() => {
          setOpen(true);
          list.reload();
        }}
      >
        {t('mediaCollection')}
      </button>
      {open && (
        <Modal title={t('mediaCollection')} onClose={() => setOpen(false)} wide>
          <p>{t('photoQueueHelp')}</p>
          <MediaLicenseManager onSaved={list.reload} />
          <dl className="coverage-summary">
            {Object.entries(list.data?.summary ?? {}).map(([k, v]) => (
              <div key={k}>
                <dt>{t(messageKey(k) ?? 'reviewRequired')}</dt>
                <dd>{quantity(v, locale)}</dd>
              </div>
            ))}
          </dl>
          <Field label={t('status')}>
            <select
              value={queue}
              onChange={(e) => {
                setQueue(e.target.value);
                setPage(1);
              }}
            >
              {[
                ['all', 'all'],
                ['missing', 'missingPhoto'],
                ['disputed', 'disputedMatch'],
                ['poorQuality', 'poorQuality'],
                ['rights', 'reviewRequired'],
              ].map(([v, k]) => (
                <option key={v} value={v}>
                  {t(messageKey(k) ?? 'all')}
                </option>
              ))}
            </select>
          </Field>
          <ErrorBanner error={list.error || error} />
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
            <table>
              <thead>
                <tr>
                  <th>{t('product')}</th>
                  <th>{t('manufacturerPartNo')}</th>
                  <th>{t('sold90Days')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          void api<Product>(`/products/${p.id}`)
                            .then((v) => {
                              setOpen(false);
                              onSelect(v);
                            })
                            .catch(setError)
                        }
                      >
                        <ProductName product={p} />
                      </button>
                      <bdi className="sub-ref">{p.sku}</bdi>
                    </td>
                    <td>
                      <bdi>{p.manufacturerPartNo}</bdi>
                    </td>
                    <td>{quantity(p.sold90Days, locale)}</td>
                    <td>
                      {!p.exact && <p>{t('missingPhoto')}</p>}
                      {p.disputed && <p>{t('disputedMatch')}</p>}
                      {p.poorQuality && <p>{t('poorQuality')}</p>}
                      {p.reviewRequired && <p>{t('reviewRequired')}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button className="button secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t('previous')}
            </button>
            <span>{quantity(page, locale)}</span>
            <button
              className="button secondary"
              disabled={(list.data?.items.length ?? 0) < 50}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { contentValue } from '../../../packages/i18n/src/index';
import { ApiError } from './api';
import { Empty, ErrorBanner, Field, Modal, MutationState, Status, useLoad, useMutation } from './components';
import { useApp } from './context';
import type { Product } from './types';

type Kind = 'CATEGORY_3D' | 'SYSTEM_DIAGRAM';
type Template = 'OIL_FILTER' | 'DISC_BRAKE';
type Visual = {
  id: string; category: string; kind: Kind; template: Template; state: string; licenseName: string;
  attribution: string; templateVersion: number; licenseVersion: number; displayApproved: boolean;
  rightsCurrent: boolean; checksum?: string; lastError?: string;
};
const kinds: Kind[] = ['CATEGORY_3D','SYSTEM_DIAGRAM'];
const templates: Template[] = ['OIL_FILTER','DISC_BRAKE'];

function Illustration({ visual, size }: { visual: Visual; size: 'thumbnail' | 'display' }) {
  const { t } = useApp();
  const [failed,setFailed] = useState(false);
  if (failed) return <Empty title={t('IMAGE_UNAVAILABLE')} />;
  return <img className="original-visual-image" src={`/api/visuals/${visual.id}/image?size=${size}`}
    alt={`${t(visual.kind)} · ${t(visual.template)}`} width={320} height={172} loading="lazy" decoding="async"
    onError={() => setFailed(true)} />;
}

export function CategoryOriginals({ product, showCategoryDrawing }: { product: Product; showCategoryDrawing: boolean }) {
  const { t } = useApp();
  const visuals = useLoad<{items: Visual[]}>(`/visuals?category=${encodeURIComponent(product.category)}`);
  const [zoom,setZoom] = useState<Visual>();
  const items = kinds.flatMap(kind => {
    if (kind === 'CATEGORY_3D' && !showCategoryDrawing) return [];
    const item = visuals.data?.items.find(v => v.kind === kind);
    return item ? [item] : [];
  });
  if (!items.length) return null;
  return <section className="media-section">
    <h3>{t('visualLibrary')}</h3>
    <p className="muted">{t('visualDisclaimer')}</p>
    <div className="media-grid">{items.map(item => <article className="media-card" key={item.id}>
      <button type="button" className="media-zoom" onClick={() => setZoom(item)} aria-label={`${t('zoomPhoto')} · ${t(item.kind)}`}>
        <Illustration visual={item} size="thumbnail" />
      </button>
      <strong>{t(item.kind)}</strong>
      <small>{t(item.template)}</small>
      {item.kind === 'SYSTEM_DIAGRAM' && <p>{t(item.template === 'OIL_FILTER' ? 'visualOilLegend' : 'visualBrakeLegend')}</p>}
      {item.attribution && <small><bdi>{item.attribution}</bdi></small>}
    </article>)}</div>
    {zoom && <Modal title={t(zoom.kind)} onClose={() => setZoom(undefined)} wide>
      <Illustration visual={zoom} size="display" />
      <p>{t('visualDisclaimer')}</p>
    </Modal>}
  </section>;
}

export function VisualLibraryButton() {
  const { t, can } = useApp();
  const [open,setOpen] = useState(false);
  if (!can('catalog')) return null;
  return <>
    <button className="button secondary" onClick={() => setOpen(true)}>{t('visualLibrary')}</button>
    {open && <VisualLibrary close={() => setOpen(false)} />}
  </>;
}

function VisualLibrary({ close }: { close: () => void }) {
  const { t,locale } = useApp();
  const categories = useLoad<{items: {category: string; names: Product['names']}[]}>('/catalog/categories');
  const licenses = useLoad<{items: {id: string; name: string; sourceType: string; internalDisplayPermitted: boolean; revokedAt?: string; expiresAt?: string}[]}>('/media/licenses');
  const jobs = useLoad<{items: Visual[]}>('/visuals');
  const save = useMutation();
  const [category,setCategory] = useState('');
  const [kind,setKind] = useState<Kind>('CATEGORY_3D');
  const [template,setTemplate] = useState<Template>('OIL_FILTER');
  const [licenseId,setLicense] = useState('');
  const [selected,setSelected] = useState('');
  const [note,setNote] = useState('');
  const review = jobs.data?.items.find(job => job.id === selected);
  useEffect(() => {
    if (!jobs.data?.items.some(job => job.state === 'QUEUED')) return;
    const timer = setTimeout(jobs.reload,1600);
    return () => clearTimeout(timer);
  },[jobs.data]);
  async function queue() {
    if (await save.run('/visuals',{ category,kind,template,licenseId })) jobs.reload();
  }
  async function decide(decision: string) {
    if (await save.run(`/visuals/${selected}/review`,{ decision,note })) {
      setNote('');
      setSelected('');
      jobs.reload();
    }
  }
  return <Modal title={t('visualLibrary')} onClose={close} wide>
    <p>{t('visualJobHelp')}</p>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void queue(); }}>
      <Field label={t('category')}><select aria-label={t('category')} required value={category} onChange={e => setCategory(e.target.value)}>
        <option value="">{t('selectOption')}</option>
        {categories.data?.items.map(item => <option key={item.category} value={item.category}>{contentValue(item.names ?? {},locale).value || item.category}</option>)}
      </select></Field>
      <Field label={t('visualLibrary')}><select value={kind} onChange={e => setKind(e.target.value as Kind)}>
        {kinds.map(item => <option key={item} value={item}>{t(item)}</option>)}
      </select></Field>
      <Field label={t('visualTemplate')}><select value={template} onChange={e => setTemplate(e.target.value as Template)}>
        {templates.map(item => <option key={item} value={item}>{t(item)}</option>)}
      </select></Field>
      <Field label={t('license')}><select aria-label={t('license')} required value={licenseId} onChange={e => setLicense(e.target.value)}>
        <option value="">{t('selectOption')}</option>
        {licenses.data?.items.filter(item => item.sourceType === 'COMPANY' && item.internalDisplayPermitted && !item.revokedAt && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))
          .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      <p>{t('visualCost')}</p>
      <button className="button primary" disabled={!category || !licenseId || save.busy}>{t('visualQueue')}</button>
    </form>
    <ErrorBanner error={jobs.error ?? categories.error ?? licenses.error} />
    <MutationState state={save} />
    {review && <section className="panel">
      <h3>{t(review.kind)} · {t(review.template)}</h3>
      <p>{t('visualDisclaimer')}</p>
      {review.checksum && review.rightsCurrent && <Illustration key={review.id} visual={review} size="display" />}
      <p><bdi>{review.category} · {review.licenseName} · v{review.licenseVersion}</bdi></p>
      <Field label={t('visualReviewNote')}><textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></Field>
      <div className="toolbar">
        {review.state === 'REVIEW_REQUIRED' && <button type="button" className="button primary" disabled={!review.rightsCurrent || note.trim().length < 8 || save.busy} onClick={() => void decide('APPROVED_INTERNAL')}>{t('APPROVED_INTERNAL')}</button>}
        {['APPROVED_INTERNAL','REVIEW_REQUIRED'].includes(review.state) && <button type="button" className="button secondary" disabled={note.trim().length < 8 || save.busy} onClick={() => void decide('REJECTED')}>{t('REJECTED')}</button>}
        {review.state === 'FAILED' && <button type="button" className="button secondary" disabled={!review.rightsCurrent || note.trim().length < 8 || save.busy} onClick={() => void decide('QUEUED')}>{t('retry')}</button>}
      </div>
    </section>}
    <div className="media-grid">{jobs.data?.items.map(job => <article key={job.id} className="media-card">
      {job.checksum && job.rightsCurrent && ['APPROVED_INTERNAL','REVIEW_REQUIRED'].includes(job.state) && <Illustration visual={job} size="thumbnail" />}
      <strong>{t(job.kind)} · {t(job.template)}</strong>
      <small><bdi>{job.category} · {job.licenseName} · v{job.templateVersion}</bdi></small>
      <Status value={job.state} />
      {!job.rightsCurrent && <p>{t('mediaBlocked')}</p>}
      {job.lastError && <ErrorBanner error={new ApiError(job.lastError)} />}
      {['APPROVED_INTERNAL','REVIEW_REQUIRED','FAILED'].includes(job.state) && <button type="button" className="button secondary" onClick={() => { setSelected(job.id); setNote(''); }}>{t('visualReview')}</button>}
    </article>)}</div>
  </Modal>;
}

import { useEffect, useState } from 'react';
import { ApiError } from './api';
import { Empty, ErrorBanner, Field, FilePicker, Modal, MutationState, Status, useLoad, useMutation } from './components';
import { useApp } from './context';
import type { Source } from './types';

const referenceKinds = ['MODEL_YEAR','VEHICLE_VARIANT','PART_REFERENCE'] as const;
type ReferenceKind = typeof referenceKinds[number];
type Reference = { id: string; contents: Record<string,string | number>; sourceName: string; datasetVersion: string };

export function CatalogReferencesButton() {
  const { t } = useApp();
  const [open,setOpen] = useState(false);
  return <>
    <button className="button secondary" onClick={() => setOpen(true)}>{t('catalogReferences')}</button>
    {open && <CatalogReferences close={() => setOpen(false)} />}
  </>;
}

function CatalogReferences({ close }: {close: () => void}) {
  const { t } = useApp();
  const [kind,setKind] = useState<ReferenceKind>('MODEL_YEAR');
  const [query,setQuery] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(1);
  const list = useLoad<{items: Reference[]; more: boolean}>(`/catalog/references?kind=${kind}&query=${encodeURIComponent(search)}&page=${page}`);
  return <Modal title={t('catalogReferences')} onClose={close} wide>
    <p className="notice warning">{t('referenceWarning')}</p>
    <form className="form-grid" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
      <Field label={t('catalogReferences')}><select value={kind} onChange={event => { setKind(event.target.value as ReferenceKind); setPage(1); }}>
        {referenceKinds.map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select></Field>
      <Field label={t('search')}><input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} dir="auto" /></Field>
      <button className="button secondary">{t('search')}</button>
    </form>
    <ErrorBanner error={list.error} />
    {list.loading ? <p role="status">{t('loading')}</p> : <ul className="compact-list">
      {list.data?.items.map(({id,contents,sourceName,datasetVersion}) => <li key={id}>
        <strong><bdi>{[contents.make,contents.model,contents.manufacturer,contents.partNumber,contents.year,contents.market].filter(Boolean).join(' · ')}</bdi></strong>
        <p><bdi>{[contents.generation,contents.engine,contents.fuel,contents.transmission,contents.drivetrain,contents.equipment,contents.trim,contents.variant].filter(Boolean).join(' · ')}</bdi></p>
        <small><bdi>{sourceName} · {datasetVersion} · {contents.externalId}</bdi></small>
      </li>)}
    </ul>}
    {!list.loading && !list.data?.items.length && <Empty />}
    <div className="pagination">
      <button className="button secondary" disabled={page === 1} onClick={() => setPage(page-1)}>{t('previous')}</button>
      <span>{t('page')} {page}</span>
      <button className="button secondary" disabled={list.loading || !list.data?.more || page === 1000} onClick={() => setPage(page+1)}>{t('next')}</button>
    </div>
  </Modal>;
}

type Job = {
  id: string; state: string; sourceName: string; sourceVersion: number; datasetVersion: string;
  total: number; checkpoint: number; accepted: number; duplicate: number; conflict: number; rejected: number;
  lastError?: string;
  provenance?: {endpoint?: string; retrievedAt?: string; rawSha256?: string};
};
type JobDetail = Job & {
  items: { rowNumber: number; contents: Record<string, unknown>; outcome: string; errorCode?: string }[];
};

export function CatalogFeedButton() {
  const { t, can } = useApp();
  const [open, setOpen] = useState(false);
  if (!can('imports')) return null;
  return <>
    <button className="button secondary" onClick={() => setOpen(true)}>{t('catalogFeeds')}</button>
    {open && <CatalogFeeds close={() => setOpen(false)} />}
  </>;
}

function CatalogFeeds({ close }: { close: () => void }) {
  const { t } = useApp();
  const sources = useLoad<{ items: Source[] }>('/sources');
  const jobs = useLoad<{ items: Job[] }>('/catalog/feeds');
  const [sourceId, setSource] = useState('');
  const [version, setVersion] = useState('');
  const [rows, setRows] = useState<unknown[]>([]);
  const [provenance,setProvenance] = useState<Job['provenance']>();
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<unknown>();
  const detail = useLoad<JobDetail>(selected ? `/catalog/feeds/${selected}?page=${page}` : null);
  const save = useMutation();
  useEffect(() => {
    if (!jobs.data?.items.some(j => j.state === 'RUNNING')) return;
    const timer = setTimeout(() => { jobs.reload(); detail.reload(); }, 1800);
    return () => clearTimeout(timer);
  }, [jobs.data]);

  async function load(file: File) {
    setError(undefined);
    setRows([]);
    setProvenance(undefined);
    try {
      if (file.size > 4_000_000) throw new ApiError('PAYLOAD_TOO_LARGE');
      const payload = JSON.parse(await file.text());
      if (!Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 500)
        throw new ApiError('IMPORT_INVALID');
      setRows(payload.rows);
      if (typeof payload.datasetVersion === 'string') setVersion(payload.datasetVersion);
      if (typeof payload.endpoint === 'string' && typeof payload.retrievedAt === 'string' && typeof payload.rawSha256 === 'string')
        setProvenance({ endpoint: payload.endpoint, retrievedAt: payload.retrievedAt, rawSha256: payload.rawSha256 });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('IMPORT_INVALID'));
    }
  }
  async function stage() {
    const result = await save.run<{ id: string }>('/catalog/feeds', { sourceId, datasetVersion: version, rows, provenance });
    if (result) { setSelected(result.id); setPage(1); jobs.reload(); detail.reload(); }
  }
  async function run(job: Job) {
    if (await save.run(`/catalog/feeds/${job.id}/run`, {})) { jobs.reload(); detail.reload(); }
  }
  return <Modal title={t('catalogFeeds')} onClose={close} wide>
    <p>{t('catalogFeedHelp')}</p>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void stage(); }}>
      <Field label={t('source')}>
        <select aria-label={t('source')} value={sourceId} onChange={e => setSource(e.target.value)} required>
          <option value="">{t('selectOption')}</option>
          {sources.data?.items.filter(s => s.canStore).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label={t('feedDatasetVersion')}><input value={version} onChange={e => setVersion(e.target.value)} required maxLength={160} /></Field>
      <FilePicker label={t('feedJsonFile')} accept=".json,application/json"
        onChange={e => { if (e.target.files?.[0]) void load(e.target.files[0]); }} />
      <button className="button primary" disabled={save.busy || !sourceId || !version.trim() || !rows.length}>{t('feedReview')}</button>
    </form>
    <ErrorBanner error={error ?? jobs.error ?? sources.error ?? detail.error} />
    <MutationState state={save} />
    {!jobs.loading && !jobs.data?.items.length && <Empty />}
    <ul className="compact-list">
      {jobs.data?.items.map(job => <li key={job.id}>
        <button className="text-button" onClick={() => { setSelected(job.id); setPage(1); }}>
          <bdi>{job.sourceName} · {job.datasetVersion}</bdi>
        </button>{' '}<Status value={job.state} />
        <p>{t('feedProgress', { current: job.checkpoint, total: job.total })}</p>
        <p>{t('feedOutcome', { accepted: job.accepted, duplicate: job.duplicate, conflict: job.conflict, rejected: job.rejected })}</p>
      </li>)}
    </ul>
    {detail.data && detail.data.id === selected && <section>
      <h3><bdi>{detail.data.sourceName} · {detail.data.datasetVersion}</bdi></h3>
      {detail.data.provenance?.endpoint && <p><bdi>{detail.data.provenance.endpoint}</bdi></p>}
      <ErrorBanner error={detail.data.lastError ? new ApiError(detail.data.lastError) : null} />
      {['STAGED','PAUSED'].includes(detail.data.state) &&
        <button className="button primary" disabled={save.busy} onClick={() => void run(detail.data!)}>
          {t(detail.data.state === 'PAUSED' ? 'retry' : 'feedApprove')}
        </button>}
      <ul className="compact-list">
        {detail.data.items.map(row => <li key={row.rowNumber}>
          <bdi>{row.rowNumber}. {String(row.contents.externalId ?? '')}</bdi>{' '}
          <bdi>{[row.contents.make, row.contents.model, row.contents.manufacturer, row.contents.partNumber, row.contents.year].filter(v => typeof v === 'string' || typeof v === 'number').join(' · ')}</bdi>{' '}
          <Status value={row.outcome} />
          {row.errorCode && <ErrorBanner error={new ApiError(row.errorCode)} />}
        </li>)}
      </ul>
      <div className="pagination">
        <button className="button secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
        <span>{t('page')} {page}</span>
        <button className="button secondary" disabled={page * 50 >= detail.data.total} onClick={() => setPage(page + 1)}>{t('next')}</button>
      </div>
    </section>}
  </Modal>;
}

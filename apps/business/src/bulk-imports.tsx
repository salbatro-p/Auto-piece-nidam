import React, { useEffect, useRef, useState } from 'react';
import { FileUp, RefreshCw } from 'lucide-react';
import { useApp } from './context';
import { api, ApiError } from './api';
import {
  Empty,
  ErrorBanner,
  Field,
  FilePicker,
  MutationState,
  ProductName,
  Status,
  useLoad,
  useMutation,
} from './components';
import { PageHeading } from './operations';
import { dateTime, quantity } from '../../../packages/i18n/src/index';
import { messageKey } from '../../../packages/i18n/src/business';
import type { Source } from './types';

export function BulkImports() {
  const { t, locale } = useApp(),
    sources = useLoad<{ items: Source[] }>('/sources'),
    list = useLoad<{ items: any[] }>('/bulk-imports'),
    save = useMutation();
  const [sourceId, setSource] = useState(''),
    [rows, setRows] = useState<any[]>([]),
    [fileName, setFileName] = useState(''),
    [fileHash, setHash] = useState(''),
    [preview, setPreview] = useState<any>(),
    [error, setError] = useState<unknown>(),
    [reading, setReading] = useState(false),
    [uploading, setUploading] = useState(false),
    [uploaded, setUploaded] = useState(0);
  const job = useRef<string | undefined>(undefined);
  useEffect(() => {
    const timer = setInterval(list.reload, 2000);
    return () => clearInterval(timer);
  }, []);
  async function load(file: File) {
    setReading(true);
    setError(undefined);
    setPreview(undefined);
    job.current = undefined;
    setUploaded(0);
    try {
      if (file.size > 50_000_000) throw new ApiError('PAYLOAD_TOO_LARGE');
      const buffer = await file.arrayBuffer();
      setHash(
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
      );
      const mapped = await new Promise<any[]>((resolve, reject) => {
        const worker = new Worker(new URL('./import-file.worker.ts', import.meta.url), { type: 'module' });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new ApiError('IMPORT_INVALID'));
        }, 60000);
        worker.onmessage = (event) => {
          clearTimeout(timeout);
          worker.terminate();
          event.data.rows
            ? resolve(event.data.rows)
            : reject(new ApiError(messageKey(event.data.code) ? event.data.code : 'IMPORT_INVALID'));
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new ApiError('IMPORT_INVALID'));
        };
        worker.postMessage({ buffer, name: file.name }, [buffer]);
      });
      setRows(mapped);
      setFileName(file.name);
    } catch (e) {
      setError(e);
      setRows([]);
    } finally {
      setReading(false);
    }
  }
  async function validate() {
    setUploading(true);
    setError(undefined);
    try {
      if (!job.current) {
        const prior = list.data?.items.find(
          (j) =>
            j.fileHash === fileHash &&
            j.sourceId === sourceId &&
            ['UPLOADING', 'PREVIEW', 'INVALID'].includes(j.status),
        );
        if (prior) job.current = prior.id;
        else {
          const started = await save.run<any>('/bulk-imports', { sourceId, fileHash, total: rows.length });
          if (!started) return;
          job.current = started.id;
        }
      }
      let state = await api<any>(`/bulk-imports/${job.current}`);
      // Recover the exact in-flight request before selecting the next chunk.
      if (save.pending) {
        if (!(await save.run(save.pending.path, save.pending.body))) return;
        state = await api<any>(`/bulk-imports/${job.current}`);
      }
      let offset = state.uploaded;
      setUploaded(offset);
      while (offset < rows.length) {
        const result = await save.run<any>(`/bulk-imports/${job.current}/chunks`, {
          offset,
          rows: rows.slice(offset, offset + 1000),
        });
        if (!result) return;
        offset = result.uploaded;
        setUploaded(offset);
      }
      const result =
        state.status === 'UPLOADING'
          ? await save.run<any>(`/bulk-imports/${job.current}/validate`, {})
          : state;
      if (result) setPreview(result);
      list.reload();
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <PageHeading title="imports" hint="importHint">
        <button className="icon-button" aria-label={t('refresh')} onClick={list.reload}>
          <RefreshCw size={20} />
        </button>
      </PageHeading>
      <section className="panel import-panel">
        <div className="upload-symbol">
          <FileUp size={32} />
        </div>
        <h2>{t('importFile')}</h2>
        <p>{t('bulkImportHelp')}</p>
        <p>{t('suppliedReviewNotice')}</p>
        <div className="form-grid">
          <Field label={t('source')}>
            <select
              value={sourceId}
              disabled={uploading || !!save.pending}
              onChange={(e) => {
                setSource(e.target.value);
                setPreview(undefined);
                job.current = undefined;
              }}
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
            <FilePicker label={t('importFile')}
              type="file"
              accept=".csv,.xlsx"
              disabled={reading || uploading || !!save.pending}
              onChange={(e) => {
                if (e.target.files?.[0]) void load(e.target.files[0]);
              }}
            />
        </div>
        {fileName && (
          <p>
            <bdi>{fileName}</bdi> · {quantity(rows.length, locale)} {t('row')}
          </p>
        )}
        {uploaded > 0 && <p role="status">{t('importProgress', { done: uploaded, total: rows.length })}</p>}
        <ErrorBanner error={error ?? list.error} />
        <MutationState state={save} />
        <div className="form-actions">
          <button
            className="button primary"
            disabled={!rows.length || !sourceId || reading || uploading}
            onClick={() => void validate()}
          >
            {t(save.pending ? 'resumeImport' : 'validateImport')}
          </button>
        </div>
        {preview && (
          <div className="operation-preview">
            <h3>{t(preview.valid ? 'valid' : 'errors')}</h3>
            <p>
              <bdi>{preview.id}</bdi>
            </p>
            {preview.errors.map((e: any, i: number) => (
              <p key={i}>
                {t('row')} {e.row}: {t(messageKey(e.code) ?? 'IMPORT_INVALID')}
              </p>
            ))}
            {preview.rows?.length > 0 && (
              <div className="table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('sku')}</th>
                      <th>{t('product')}</th>
                      <th>{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r: any) => (
                      <tr key={r.sku}>
                        <td>
                          <bdi dir="ltr">{r.sku}</bdi>
                        </td>
                        <td>
                          <ProductName product={r} />
                        </td>
                        <td>
                          <Status value={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.valid && (
              <button
                className="button primary"
                disabled={save.busy}
                onClick={async () => {
                  if (await save.run(`/bulk-imports/${preview.id}/commit`, {})) {
                    setPreview(undefined);
                    setRows([]);
                    job.current = undefined;
                    list.reload();
                  }
                }}
              >
                {t('commitImport')}
              </button>
            )}
          </div>
        )}
      </section>
      <section className="panel table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
        <table>
          <thead>
            <tr>
              <th>{t('timestamp')}</th>
              <th>{t('importId')}</th>
              <th>{t('row')}</th>
              <th>{t('status')}</th>
              <th>{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((j) => (
              <tr key={j.id}>
                <td>{dateTime(j.createdAt, locale)}</td>
                <td>
                  <bdi>{j.id}</bdi>
                </td>
                <td>{t('importProgress', { done: j.processed, total: j.total })}</td>
                <td>
                  <Status value={j.status} />
                  {j.lastError && <p>{t(messageKey(j.lastError) ?? 'IMPORT_INTERRUPTED')}</p>}
                </td>
                <td>
                  {j.status === 'PAUSED' && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        if (await save.run(`/bulk-imports/${j.id}/commit`, {})) list.reload();
                      }}
                    >
                      {t('resumeImport')}
                    </button>
                  )}
                  {['PAUSED', 'COMMITTED'].includes(j.status) && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        if (await save.run(`/bulk-imports/${j.id}/revert`, {})) list.reload();
                      }}
                    >
                      {t('revertImport')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.items.length && <Empty />}
      </section>
    </>
  );
}

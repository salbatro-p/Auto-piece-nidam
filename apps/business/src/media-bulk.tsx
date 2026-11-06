import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import { api, ApiError } from './api';
import {
  ErrorBanner,
  Field,
  FilePicker,
  Modal,
  MutationState,
  Status,
  useLoad,
  useMutation,
} from './components';
import { MediaLicenseManager } from './media';
import { messageKey } from '../../../packages/i18n/src/business';
import type { ImageManifestRow } from './image-manifest';
type Result = { rowNumber: number; status: string; code?: string; mediaId?: string };
export function MediaBulk() {
  const { t, can } = useApp(),
    [open, setOpen] = useState(false);
  if (!can('catalog')) return null;
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        {t('imageBulk')}
      </button>
      {open && <Batch onClose={() => setOpen(false)} />}
    </>
  );
}
function Batch({ onClose }: { onClose: () => void }) {
  const { t } = useApp(),
    licenses = useLoad<{ items: { id: string; name: string; revokedAt?: string }[] }>('/media/licenses'),
    save = useMutation();
  const [zip, setZip] = useState<File>(),
    [manifest, setManifest] = useState<File>(),
    [license, setLicense] = useState(''),
    [rows, setRows] = useState<ImageManifestRow[]>([]),
    [fileHash, setFileHash] = useState(''),
    [results, setResults] = useState<Result[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const worker = useRef<Worker | undefined>(undefined),
    jobRef = useRef<string | undefined>(undefined),
    sequence = useRef(0),
    pending = useRef(new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>()),
    pause = useRef(false);
  useEffect(() => {
    worker.current = new Worker(new URL('./image-file.worker.ts', import.meta.url), { type: 'module' });
    worker.current.onmessage = (event) => {
      const p = pending.current.get(event.data.id);
      if (!p) return;
      pending.current.delete(event.data.id);
      if (event.data.error) p.reject(new ApiError(event.data.error));
      else p.resolve(event.data);
    };
    return () => {
      pause.current = true;
      worker.current?.terminate();
      for (const p of pending.current.values()) p.reject(new ApiError('NETWORK_ERROR'));
      pending.current.clear();
    };
  }, []);
  function ask(message: object, transfer: Transferable[] = []) {
    return new Promise<any>((resolve, reject) => {
      const id = ++sequence.current;
      pending.current.set(id, { resolve, reject });
      worker.current!.postMessage({ id, ...message }, transfer);
    });
  }
  async function preview() {
    setError(undefined);
    if (!zip || !license) {
      setError(new ApiError('VALIDATION_ERROR'));
      return;
    }
    setBusy(true);
    try {
      const archive = await zip.arrayBuffer(),
        external = manifest ? { name: manifest.name, buffer: await manifest.arrayBuffer() } : undefined;
      const result = await ask(
        { type: 'open', archive, external, license },
        external ? [archive, external.buffer] : [archive],
      );
      setRows(result.rows);
      setFileHash(result.fileHash);
      setResults([]);
      jobRef.current = undefined;
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setError(undefined);
    setBusy(true);
    pause.current = false;
    try {
      if (save.pending && save.pending.path.includes('/rows/')) {
        const recovered = await save.run<Result>(save.pending.path, save.pending.body);
        if (!recovered) return;
        jobRef.current = save.pending.path.split('/')[3];
      }
      const job = jobRef.current
        ? { id: jobRef.current, total: rows.length }
        : await save.run<{ id: string; total: number }>('/media/imports', { fileHash, total: rows.length });
      if (!job) return;
      jobRef.current = job.id;
      const completed: Result[] = [];
      for (let page = 1; page <= Math.ceil(rows.length / 500); page++) {
        const status = await api<{ items: Result[] }>(`/media/imports/${job.id}?page=${page}`);
        completed.push(...status.items);
      }
      setResults(completed);
      const seen = new Set(completed.map((r) => r.rowNumber));
      for (let index = 0; index < rows.length && !pause.current; index++) {
        if (seen.has(index + 1)) continue;
        const { row } = await ask({ type: 'file', index });
        const result = await save.run<Result>(`/media/imports/${job.id}/rows/${index + 1}`, row);
        if (!result) break;
        completed.push(result);
        setResults([...completed]);
        await new Promise((resolve) => setTimeout(resolve, 110));
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const escape = (v: unknown) =>
      '"' +
      String(v ?? '')
        .replace(/^([\s]*[=+@-])/, "'$1")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      'row,filename,sku,manufacturer_part_no,status,error',
      ...results.map((r) =>
        [
          r.rowNumber,
          rows[r.rowNumber - 1]?.filename,
          rows[r.rowNumber - 1]?.sku,
          rows[r.rowNumber - 1]?.manufacturerPartNumber,
          r.status,
          r.code ?? '',
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'image-import-results.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Modal title={t('imageBulk')} onClose={onClose} wide>
      <p className="small">{t('imageBatchHelp')}</p>
      <MediaLicenseManager onSaved={licenses.reload} />
      <fieldset disabled={busy || !!save.pending}>
        <FilePicker
          label={t('imageZip')}
          accept=".zip"
          onChange={(e) => {
            setZip(e.target.files?.[0]);
            setRows([]);
          }}
        />
        <FilePicker
          label={t('imageManifest')}
          accept=".csv,.xlsx"
          onChange={(e) => {
            setManifest(e.target.files?.[0]);
            setRows([]);
          }}
        />
        <Field label={t('mediaLicenses')}>
          <select
            value={license}
            onChange={(e) => {
              setLicense(e.target.value);
              setRows([]);
            }}
          >
            <option value="">—</option>
            {licenses.data?.items
              .filter((l) => !l.revokedAt)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <button className="button secondary" onClick={() => void preview()}>
          {t('previewMapping')}
        </button>
      </fieldset>
      <ErrorBanner error={error || licenses.error} />
      <MutationState state={save} />
      {rows.length > 0 && (
        <>
          <p role="status">{t('batchProgress', { done: results.length, total: rows.length })}</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
            <table>
              <thead>
                <tr>
                  <th>{t('photo')}</th>
                  <th>{t('sku')}</th>
                  <th>{t('manufacturerPartNo')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, index) => {
                  const result = results.find((v) => v.rowNumber === index + 1);
                  return (
                    <tr key={index}>
                      <td>
                        <bdi>{r.filename}</bdi>
                      </td>
                      <td>
                        <bdi>{r.sku}</bdi>
                      </td>
                      <td>
                        <bdi>
                          {r.manufacturerBrand} {r.manufacturerPartNumber}
                        </bdi>
                      </td>
                      <td>
                        {result ? (
                          <>
                            <Status value={result.status} />
                            {result.code && <p>{t(messageKey(result.code) ?? 'VALIDATION_ERROR')}</p>}
                          </>
                        ) : r.clientError ? (
                          t(messageKey(r.clientError) ?? 'VALIDATION_ERROR')
                        ) : (
                          t('reviewRequired')
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small">
            {t('batchProgress', { done: Math.min(rows.length, 50), total: rows.length })}
          </p>
          <div className="form-actions">
            <button className="button primary" disabled={busy} onClick={() => void start()}>
              {t(save.pending ? 'retry' : 'stageBatch')}
            </button>
            {busy && (
              <button
                className="button secondary"
                onClick={() => {
                  pause.current = true;
                }}
              >
                {t('pauseBatch')}
              </button>
            )}
            {results.length > 0 && (
              <button className="button secondary" onClick={download}>
                {t('downloadResults')}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

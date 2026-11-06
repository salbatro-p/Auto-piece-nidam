import React, { useState } from 'react';
import { useApp } from './context';
import { ApiError } from './api';
import { Field, FilePicker, Modal, ErrorBanner, MutationState, Status, useLoad, useMutation } from './components';
import { dateTime, quantity } from '../../../packages/i18n/src/index';
export function OpeningBalances() {
  const { t, can } = useApp(),
    [open, setOpen] = useState(false);
  if (!can('counts')) return null;
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        {t('openingBalances')}
      </button>
      {open && (
        <Modal title={t('openingBalances')} onClose={() => setOpen(false)} wide>
          <OpeningEditor />
        </Modal>
      )}
    </>
  );
}
function OpeningEditor() {
  const { t, user, can, locale, warehouses } = useApp(),
    list = useLoad<{ items: any[] }>('/opening-balances'),
    save = useMutation();
  const [rows, setRows] = useState<any[]>([]),
    [fileHash, setHash] = useState(''),
    [reading, setReading] = useState(false),
    [error, setError] = useState<unknown>(),
    [selected, setSelected] = useState<any>(),
    [note, setNote] = useState('');
  async function load(file: File) {
    setReading(true);
    setRows([]);
    setError(undefined);
    try {
      if (file.size > 2_000_000) throw new ApiError('PAYLOAD_TOO_LARGE');
      const buffer = await file.arrayBuffer();
      setHash(
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join(''),
      );
      const records = await new Promise<any[]>((resolve, reject) => {
        const worker = new Worker(new URL('./import-file.worker.ts', import.meta.url), { type: 'module' }),
          timer = setTimeout(() => {
            worker.terminate();
            reject(new ApiError('IMPORT_INVALID'));
          }, 60000);
        worker.onmessage = (e) => {
          clearTimeout(timer);
          worker.terminate();
          e.data.rows ? resolve(e.data.rows) : reject(new ApiError(e.data.code ?? 'IMPORT_INVALID'));
        };
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new ApiError('IMPORT_INVALID'));
        };
        worker.postMessage({ buffer, name: file.name, mode: 'opening' }, [buffer]);
      });
      setRows(records);
    } catch (e) {
      setError(e);
    } finally {
      setReading(false);
    }
  }
  return (
    <>
      <p>{t('openingHelp')}</p>
      <p>{t('openingColumns')}</p>
      <p>
        {t('actor')}: <bdi>{user.id}</bdi>
      </p>
      <p>
        {t('warehouse')}:{' '}
        {warehouses.map((w) => (
          <bdi key={w.id}>{w.code} · </bdi>
        ))}
      </p>
        <FilePicker label={t('importFile')}
          type="file"
          accept=".csv,.xlsx"
          disabled={reading || save.busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void load(e.target.files[0]);
          }}
        />
      <ErrorBanner error={error} />
      {rows.length > 0 && (
        <>
          <p>{t('importProgress', { done: rows.length, total: rows.length })}</p>
          <button
            className="button primary"
            disabled={save.busy}
            onClick={async () => {
              const result = await save.run<any>('/opening-balances/preview', { fileHash, rows });
              if (result) {
                list.reload();
                setSelected({ ...result, countedBy: user.id, data: { rows: result.rows } });
              }
            }}
          >
            {t('validateImport')}
          </button>
        </>
      )}
      <MutationState state={save} />
      <ErrorBanner error={list.error} />
      <div className="table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
        <table>
          <thead>
            <tr>
              <th>{t('timestamp')}</th>
              <th>{t('status')}</th>
              <th>{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((job) => (
              <tr key={job.id}>
                <td>{dateTime(job.createdAt, locale)}</td>
                <td>
                  <Status value={job.postedId ? 'COMPLETED' : 'REVIEW_REQUIRED'} />
                </td>
                <td>
                  <button className="text-button" onClick={() => setSelected(job)}>
                    {t('view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <section className="operation-preview">
          <h3>{t('preview')}</h3>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
            <table>
              <thead>
                <tr>
                  <th>{t('sku')}</th>
                  <th>{t('warehouse')}</th>
                  <th>{t('binCode')}</th>
                  <th>{t('condition')}</th>
                  <th>{t('quantity')}</th>
                  <th>{t('reference')}</th>
                </tr>
              </thead>
              <tbody>
                {selected.data.rows.map((row: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <bdi>{row.sku}</bdi>
                    </td>
                    <td>
                      <bdi>{row.warehouse}</bdi>
                    </td>
                    <td>
                      <bdi>{row.bin || 'RECEIVING'}</bdi>
                    </td>
                    <td>
                      <Status value={row.condition} />
                    </td>
                    <td>{quantity(row.quantity_counted, locale)}</td>
                    <td>
                      <bdi>{row.source_document}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {can('approve') && selected.countedBy !== user.id && !selected.postedId && (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const posted = await save.run<any>(`/opening-balances/${selected.id}/approve`, { note });
                if (posted) {
                  list.reload();
                  setSelected({ ...selected, postedId: posted.id });
                  setNote('');
                }
              }}
            >
              <Field label={t('reviewNote')}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <button className="button primary" disabled={save.busy}>
                {t('commitImport')}
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}

import React, { useState } from 'react';
import { useApp } from './context';
import { Field, Modal, MutationState, Status, useLoad, useMutation } from './components';
import { dateTime } from '../../../packages/i18n/src/index';
import type { Source, Product } from './types';

export function SourceManager() {
  const { t, locale, can } = useApp(),
    list = useLoad<{ items: (Source & { version: number; checkedAt: string; status: string })[] }>(
      can('catalog') ? '/sources' : '/vehicles',
    ),
    save = useMutation();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [version, setVersion] = useState(1),
    [form, setForm] = useState({
      name: '',
      origin: '',
      license: '',
      canStore: false,
      canDisplay: false,
      canSyndicate: false,
    });
  if (!can('catalog')) return null;
  return (
    <>
      <button
        className="button secondary"
        onClick={() => {
          list.reload();
          setOpen(true);
        }}
      >
        {t('sources')}
      </button>
      {open && (
        <Modal title={t('sources')} onClose={() => setOpen(false)} wide>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('scrollableTable')}>
            <table>
              <thead>
                <tr>
                  <th>{t('source')}</th>
                  <th>{t('sourceFreshness')}</th>
                  <th>{t('status')}</th>
                  <th>{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <bdi>{s.name}</bdi>
                    </td>
                    <td>{dateTime(s.checkedAt, locale)}</td>
                    <td>
                      <Status value={s.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditing(s.id);
                          setVersion(s.version);
                          setForm({
                            name: s.name,
                            origin: s.origin,
                            license: s.license,
                            canStore: s.canStore,
                            canDisplay: s.canDisplay,
                            canSyndicate: s.canSyndicate,
                          });
                        }}
                      >
                        {t('edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{t(editing ? 'edit' : 'addSource')}</h3>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save.run(editing ? `/sources/${editing}/update` : '/sources', {
                  ...form,
                  ...(editing ? { version } : {}),
                })
              ) {
                setEditing(null);
                setForm({
                  name: '',
                  origin: '',
                  license: '',
                  canStore: false,
                  canDisplay: false,
                  canSyndicate: false,
                });
                list.reload();
              }
            }}
          >
            {(['name', 'origin', 'license'] as const).map((key) => (
              <Field key={key} label={t(key)}>
                {key === 'license' ? (
                  <textarea
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                ) : (
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
            {(['canStore', 'canDisplay', 'canSyndicate'] as const).map((key) => (
              <label className="checkbox-row" key={key}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {t(key)}
              </label>
            ))}
            <MutationState state={save} />
            <button className="button primary" disabled={save.busy}>
              {t('save')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function VehicleCreator({ onSaved }: { onSaved: () => void }) {
  const { t, can } = useApp(),
    sources = useLoad<{ items: Source[] }>(can('catalog') ? '/sources' : '/vehicles'),
    save = useMutation();
  const [open, setOpen] = useState(false);
  const [aliases, setAliases] = useState({ ar: '', fr: '', en: '' });
  const [form, setForm] = useState({
    make: '',
    model: '',
    generation: '',
    market: 'MA',
    yearFrom: '',
    yearTo: '',
    engine: '',
    fuel: '',
    transmission: '',
    body: '',
    equipment: '',
    sourceId: '',
    externalId: '',
  });
  if (!can('catalog')) return null;
  return (
    <>
      <button
        className="button primary"
        onClick={() => {
          sources.reload();
          setOpen(true);
        }}
      >
        {t('newVehicle')}
      </button>
      {open && (
        <Modal title={t('newVehicle')} onClose={() => setOpen(false)} wide>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save.run('/vehicles', {
                  ...form,
                  aliases,
                  yearFrom: Number(form.yearFrom),
                  yearTo: Number(form.yearTo),
                })
              ) {
                setOpen(false);
                onSaved();
              }
            }}
          >
            <div className="form-grid">
              {(
                [
                  'make',
                  'model',
                  'generation',
                  'market',
                  'yearFrom',
                  'yearTo',
                  'engine',
                  'fuel',
                  'transmission',
                  'body',
                  'equipment',
                  'externalId',
                ] as const
              ).map((key) => (
                <Field key={key} label={t(key)}>
                  <input
                    inputMode={['yearFrom', 'yearTo'].includes(key) ? 'numeric' : 'text'}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </Field>
              ))}
              <Field label={t('source')}>
                <select
                  value={form.sourceId}
                  onChange={(e) => setForm((f) => ({ ...f, sourceId: e.target.value }))}
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
            </div>
            <fieldset>
              <legend>{t('aliases')}</legend>
              {(['ar', 'fr', 'en'] as const).map((language) => (
                <Field
                  key={language}
                  label={{ ar: 'العربية (AR)', fr: 'Français (FR)', en: 'English (EN)' }[language]}
                >
                  <input
                    lang={language}
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                    value={aliases[language]}
                    onChange={(e) => setAliases({ ...aliases, [language]: e.target.value })}
                  />
                </Field>
              ))}
            </fieldset>
            <MutationState state={save} />
            <button className="button primary" disabled={save.busy}>
              {t('save')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function TranslationReviewer({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const { t, can } = useApp(),
    save = useMutation();
  const [open, setOpen] = useState(false),
    [language, setLanguage] = useState('ar'),
    [note, setNote] = useState('');
  if (!can('catalog')) return null;
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        {t('reviewTranslation')}
      </button>
      {open && (
        <Modal title={t('reviewTranslation')} onClose={() => setOpen(false)}>
          <p>{t('reviewHint')}</p>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save.run(`/products/${product.id}/translations/review`, {
                  locale: language,
                  note,
                  version: (product as any).version,
                })
              ) {
                setOpen(false);
                onSaved();
              }
            }}
          >
            <Field label={t('language')}>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="ar">العربية (AR)</option>
                <option value="fr">Français (FR)</option>
                <option value="en">English (EN)</option>
              </select>
            </Field>
            <div className="panel" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
              <h3>{product.names[language as 'ar'] || '—'}</h3>
              <p>{product.descriptions?.[language as 'ar'] || '—'}</p>
              <p>{product.categoryNames?.[language as 'ar']||product.category}</p>
              {product.companyMetadata?.technicalAttributes?.map((a,i)=><p key={i}><bdi>{a.labels[language as 'ar']||t('translationMissing')}</bdi>: <bdi>{a.value} {a.unit}</bdi></p>)}
            </div>
            <Field label={t('reviewNote')}>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <MutationState state={save} />
            <button className="button primary" disabled={save.busy}>
              {t('approveTranslation')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

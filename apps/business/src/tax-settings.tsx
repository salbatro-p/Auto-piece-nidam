import React, { useEffect, useState } from 'react';
import { useApp } from './context';
import { ErrorBanner, Field, MutationState, useLoad, useMutation } from './components';
import { parseMoney } from '../../../packages/i18n/src/index';
import type { TaxSettings } from '../../../packages/contracts/src/pricing';
export function TaxConfiguration() {
  const { t, notify } = useApp(),
    settings = useLoad<TaxSettings>('/pricing'),
    save = useMutation();
  const [rate, setRate] = useState('0'),
    [inclusive, setInclusive] = useState(false),
    [configured, setConfigured] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    if (settings.data) {
      setRate(String(settings.data.rateBps / 100));
      setInclusive(settings.data.inclusive);
      setConfigured(settings.data.configured);
    }
  }, [settings.data]);
  return (
    <section className="panel settings-panel tax-panel">
      <h2>{t('taxSettings')}</h2>
      <p className="notice warning">{t('taxNotConfigured')}</p>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          try {
            if (
              await save.run('/settings/tax', {
                rateBps: parseMoney(rate),
                inclusive,
                configured,
                version: settings.data?.version,
              })
            ) {
              settings.reload();
              notify('operationSaved');
            }
          } catch (e) {
            setError(e);
          }
        }}
      >
        <Field label={t('taxRate')}>
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <label className="checkbox-row">
          <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
          {t('taxInclusive')}
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={configured} onChange={(e) => setConfigured(e.target.checked)} />
          {t('taxConfigured')}
        </label>
        <ErrorBanner error={error ?? settings.error} />
        <MutationState state={save} />
        <button className="button secondary" disabled={save.busy || !settings.data}>
          {t('save')}
        </button>
      </form>
    </section>
  );
}

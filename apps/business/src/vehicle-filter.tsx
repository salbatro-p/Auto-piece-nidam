import React, { useState } from 'react';
import { useApp } from './context';
import { ErrorBanner, Field, useLoad } from './components';
import { MediaGallery } from './media';
import type { Vehicle } from './types';
const keys = ['make', 'model', 'generation', 'year', 'market', 'engine', 'equipment'] as const;
export function VehicleFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useApp(),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [tab, setTab] = useState<'VEHICLE_PHOTO' | 'EXPLODED_DIAGRAM'>('EXPLODED_DIAGRAM');
  const params = new URLSearchParams(
    Object.entries(filters).filter(([key, val]) => val && (key !== 'year' || /^\d{4}$/.test(val))),
  );
  const list = useLoad<{ facets: Record<string, string[]>; items: Vehicle[]; more: boolean }>(
    '/catalog/vehicle-options?' + params,
  );
  function change(key: string, val: string) {
    const next = { ...filters, [key]: val },
      index = keys.indexOf(key as (typeof keys)[number]);
    for (const downstream of keys.slice(index + 1)) delete next[downstream];
    setFilters(next);
    onChange('');
  }
  return (
    <details className="panel vehicle-filter" open={value ? true : undefined}>
      <summary>{t('selectExactVariant')}</summary>
      <div className="form-grid">
        {keys.map((key) => (
          <Field key={key} label={t(key === 'year' ? 'productionYear' : key)}>
            {key === 'year' ? (
              <input
                inputMode="numeric"
                maxLength={4}
                value={filters.year ?? ''}
                onChange={(e) => change(key, e.target.value)}
              />
            ) : (
              <select value={filters[key] ?? ''} onChange={(e) => change(key, e.target.value)}>
                <option value="">—</option>
                {list.data?.facets[key]?.map((v) => (
                  <option key={v} value={v}>
                    {v || '—'}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ))}
        <Field label={t('selectExactVariant')}>
          <select data-testid="exact-vehicle" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {value && !list.data?.items.some((v) => v.id === value) && (
              <option value={value}>{t('VERIFIED')}</option>
            )}
            {list.data?.items.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} · {v.generation} · {v.yearFrom}–{v.yearTo} · {v.market} · {v.engine} ·{' '}
                {v.equipment || '—'} · {v.transmission} · {v.body}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBanner error={list.error} />
      {list.data?.more && <p>{t('refineVehicle')}</p>}
      <p className="small muted">{t(value ? 'imageNotFitment' : 'variantRequired')}</p>
      {value && <SelectedVehicle id={value} tab={tab} setTab={setTab} />}
    </details>
  );
}
function SelectedVehicle({
  id,
  tab,
  setTab,
}: {
  id: string;
  tab: 'VEHICLE_PHOTO' | 'EXPLODED_DIAGRAM';
  setTab: (v: 'VEHICLE_PHOTO' | 'EXPLODED_DIAGRAM') => void;
}) {
  const { t } = useApp(),
    vehicle = useLoad<Vehicle>(`/vehicles/${id}`);
  return (
    <>
      <ErrorBanner error={vehicle.error} />
      {vehicle.data && (
        <>
          <p>
            <bdi>
              {vehicle.data.make} {vehicle.data.model} · {vehicle.data.generation} · {vehicle.data.yearFrom}–
              {vehicle.data.yearTo} · {vehicle.data.market} · {vehicle.data.engine} · {vehicle.data.equipment}
            </bdi>
          </p>
          <div className="form-actions">
            {(['VEHICLE_PHOTO', 'EXPLODED_DIAGRAM'] as const).map((k) => (
              <button
                className="button secondary"
                type="button"
                aria-pressed={k === tab}
                onClick={() => setTab(k)}
                key={k}
              >
                {t(k)}
              </button>
            ))}
          </div>
          <MediaGallery vehicle={vehicle.data} diagrams={tab === 'EXPLODED_DIAGRAM'} />
        </>
      )}
    </>
  );
}

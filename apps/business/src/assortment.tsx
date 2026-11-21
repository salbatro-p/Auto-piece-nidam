import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ListTree } from 'lucide-react';
import { assortmentGroups, findMerchandiseTypes, merchandiseTypesCsv, type MerchandiseType } from '../../../packages/contracts/src/assortment';
import { useApp } from './context';
import { Field, Modal } from './components';

const pageSize = 18;

export function AssortmentPicker({ onSelect }: { onSelect: (type: MerchandiseType) => void }) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [essentialsOnly, setEssentialsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const matches = open ? findMerchandiseTypes(query, group, essentialsOnly) : [];
  function show() {
    setQuery(''); setGroup(''); setEssentialsOnly(false); setPage(0); setOpen(true);
  }
  function exportMatches() {
    const url = URL.createObjectURL(new Blob([merchandiseTypesCsv(matches)], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'autoparts-merchandise-types.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <button type="button" className="button secondary" onClick={show}>
      <ListTree size={17} aria-hidden="true"/>{t('browseTypes')}
    </button>
    {open && createPortal(<Modal title={t('browseTypes')} onClose={() => setOpen(false)}>
      <div className="assortment-picker">
        <Field label={t('searchType')}><input type="search" value={query} dir="auto"
          onChange={e => {setQuery(e.target.value); setPage(0);}} /></Field>
        <Field label={t('assortmentGroup')}><select value={group} onChange={e => {setGroup(e.target.value); setPage(0);}}>
          <option value="">{t('all')}</option>
          {assortmentGroups.map(g => <option key={g.code} value={g.code}>{g.names[locale]}</option>)}
        </select></Field>
        <label className="assortment-essentials">
          <input type="checkbox" checked={essentialsOnly} onChange={e => {setEssentialsOnly(e.target.checked); setPage(0);}}/>
          {t('counterEssentials')}
        </label>
        <div className="assortment-result-actions">
          <span role="status">{t('typeCount', {count: matches.length})}</span>
          <button type="button" className="text-button" disabled={!matches.length} onClick={exportMatches}>
            <Download size={15} aria-hidden="true"/>{t('downloadTypes')}
          </button>
        </div>
        {matches.length > 0 && <ul className="assortment-list">
          {matches.slice(page*pageSize, (page+1)*pageSize).map(type => <li key={type.code}>
            <button type="button" onClick={() => {onSelect(type); setOpen(false);}}>{type.names[locale]}</button>
          </li>)}
        </ul>}
        {matches.length === 0 && <p>{t('customTypeHint')}</p>}
        {matches.length > pageSize && <div className="pagination">
          <button type="button" className="button secondary" disabled={!page} onClick={() => setPage(page-1)}>{t('previous')}</button>
          <span>{(page+1).toLocaleString(locale)} / {Math.ceil(matches.length/pageSize).toLocaleString(locale)}</span>
          <button type="button" className="button secondary" disabled={(page+1)*pageSize>=matches.length}
            onClick={() => setPage(page+1)}>{t('next')}</button>
        </div>}
      </div>
    </Modal>, document.body)}
  </>;
}

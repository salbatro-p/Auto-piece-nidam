import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Boxes, Camera, CarFront, MapPin, Minimize2, Maximize2, Package, Search, ShoppingCart, Truck } from 'lucide-react';
import { contentValue, quantity } from '../../../packages/i18n/src/index';
import { messageKey, type MessageKey } from '../../../packages/i18n/src/business';
import { api } from './api';
import { Empty, ErrorBanner, Modal, SearchBox, useLoad } from './components';
import { useApp } from './context';
import type { Product } from './types';

type SearchResult = {
  parts: (Pick<Product,'id'|'names'|'sku'|'brand'|'translationStatus'> & { exact: boolean })[];
  vehicles: { id: string; make: string; model: string; generation: string; engine: string; market: string; equipment: string; yearFrom: number; yearTo: number }[];
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string; code: string; bin?: string }[];
  categories: { category: string; names: Product['names'] }[];
};
export type WorkspaceTarget =
  | { kind: 'part'|'vehicle'|'supplier'|'location'; id: string; label?: string }
  | { kind: 'category'; category: string }
  | { kind: 'nav'; page: 'pos'|'catalog'|'vehicles'|'inventory' };

export function WorkspaceShortcuts({ onSearch, onNavigate, onReceive, onPhotos }: {
  onSearch: () => void; onNavigate: (page: 'pos'|'inventory'|'vehicles') => void; onReceive: () => void; onPhotos: () => void;
}) {
  const { t, can, user } = useApp();
  const preferenceKey = 'autoparts:workspace-view:' + user.id;
  const [compact, setCompact] = useState(() => {
    try { return sessionStorage.getItem(preferenceKey) === 'compact'; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(preferenceKey, compact ? 'compact' : 'visual'); } catch {}
  }, [compact, preferenceKey]);
  return <section className={`workspace-launch${compact ? ' compact' : ''}`} aria-label={t('quickActions')}>
    <div className="workspace-hero">
      <div className="workspace-view-controls">
        <button type="button" data-testid="workspace-view-toggle" aria-pressed={compact} onClick={() => setCompact(value => !value)}>
          {compact ? <Maximize2 size={16} aria-hidden="true"/> : <Minimize2 size={16} aria-hidden="true"/>}
          {t(compact ? 'visualWorkspace' : 'compactWorkspace')}
        </button>
      </div>
      <div className="workspace-hero-copy">
        <h2>{t('lookupTitle')}</h2>
        <button type="button" className="workspace-search-launch" onClick={onSearch}>
          <span className="workspace-search-icon" aria-hidden="true"><Search size={22}/></span>
          <span className="workspace-search-copy"><strong>{t('workspaceSearch')}</strong><small>{t('workspaceSearchHint')}</small></span>
          <kbd aria-hidden="true">Ctrl K</kbd><ArrowUpRight aria-hidden="true" size={19}/>
        </button>
      </div>
      <img className="workspace-hero-illustration" src="/garage-dashboard.svg" alt="" aria-hidden="true" width="520" height="340" decoding="async"/>
    </div>
    <div className="workspace-shortcuts" aria-label={t('quickActions')}>
      <button type="button" className="workspace-shortcut" onClick={() => onNavigate('inventory')}>
        <span className="workspace-shortcut-symbol"><Boxes size={26} aria-hidden="true"/></span>
        <span className="workspace-shortcut-name">{t('inventory')}</span><ArrowUpRight className="workspace-shortcut-arrow" aria-hidden="true" size={18}/>
      </button>
      {can('sell') && <button type="button" className="workspace-shortcut" onClick={() => onNavigate('pos')}>
        <span className="workspace-shortcut-symbol"><ShoppingCart size={26} aria-hidden="true"/></span>
        <span className="workspace-shortcut-name">{t('pos')}</span><ArrowUpRight className="workspace-shortcut-arrow" aria-hidden="true" size={18}/>
      </button>}
      <button type="button" className="workspace-shortcut" onClick={() => onNavigate('vehicles')}>
        <span className="workspace-shortcut-symbol"><CarFront size={26} aria-hidden="true"/></span>
        <span className="workspace-shortcut-name">{t('vehicles')}</span><ArrowUpRight className="workspace-shortcut-arrow" aria-hidden="true" size={18}/>
      </button>
    </div>
    {(can('receive') || can('catalog')) && <div className="workspace-priorities">
      <div className="workspace-priorities-heading"><h2>{t('priorityActions')}</h2><span className="workspace-priorities-line" aria-hidden="true"/></div>
      <div className="workspace-priorities-grid">
        {can('receive') && <button type="button" onClick={onReceive}><span className="workspace-priority-icon"><ArrowDownToLine size={19} aria-hidden="true"/></span>{t('receiveStock')}<ArrowUpRight size={16} aria-hidden="true"/></button>}
        {can('catalog') && <button type="button" onClick={onPhotos}><span className="workspace-priority-icon"><Camera size={19} aria-hidden="true"/></span>{t('addPhotos')}<ArrowUpRight size={16} aria-hidden="true"/></button>}
      </div>
    </div>}
  </section>;
}

export function WorkspaceSearch({ close, choose, photoOnly = false }: {
  close: () => void; choose: (target: WorkspaceTarget) => void; photoOnly?: boolean;
}) {
  const { t, locale, can } = useApp();
  const [raw, setRaw] = useState('');
  const [matches, setMatches] = useState<SearchResult>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [retry,setRetry] = useState(0);
  const input = useRef<HTMLDivElement>(null);
  const term = raw.trim();
  useEffect(() => {
    input.current?.querySelector('input')?.focus();
  },[]);
  useEffect(() => {
    setMatches(undefined);
    setError(undefined);
    if (term.length < 2) { setLoading(false); return; }
    setLoading(true);
    let active = true;
    const controller = new AbortController();
    const identifier = /^\d{8,}$/.test(term) || (term.length >= 8 && /\d/.test(term) && /[-/]/.test(term));
    const timer = setTimeout(() => {
      void api<SearchResult>('/workspace/search?q='+encodeURIComponent(term),{ signal: controller.signal })
        .then(result => { if (active) setMatches(result); })
        .catch(err => { if (active) setError(err); })
        .finally(() => { if (active) setLoading(false); });
    },identifier ? 0 : 140);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  },[term,retry]);
  const parts = matches?.parts ?? [];
  const groups: { title: MessageKey; items: React.ReactNode[] }[] = [
    ...([true,false] as const).map(exact => ({
      title: (exact ? 'exactIdentifier' : 'relatedResults') as MessageKey,
      items: parts.filter(p => p.exact === exact).map(p => <button type="button" key={p.id} onClick={() => choose({kind:'part',id:p.id})}>
        <Package size={18} aria-hidden="true"/><span><strong><bdi>{contentValue(p.names,locale,p.translationStatus).value || p.sku}</bdi></strong>
        <small><bdi dir="ltr">{p.sku}</bdi> · <bdi>{p.brand}</bdi></small></span>
      </button>),
    })),
    ...(!photoOnly && matches ? [
      { title:'vehicles' as const, items:matches.vehicles.map(v => <button type="button" key={v.id} onClick={() => choose({kind:'vehicle',id:v.id})}>
        <CarFront size={18} aria-hidden="true"/><span><bdi>{v.make} {v.model} · {v.generation}</bdi><small><bdi>{v.yearFrom}–{v.yearTo} · {v.market} · {v.engine} · {v.equipment}</bdi></small></span>
      </button>) },
      { title:'category' as const, items:matches.categories.map(c => <button type="button" key={c.category} onClick={() => choose({kind:'category',category:c.category})}>
        <Package size={18} aria-hidden="true"/>{contentValue(c.names,locale).value || (messageKey('category_'+c.category) ? t(messageKey('category_'+c.category)!) : c.category)}
      </button>) },
      { title:'suppliers' as const, items:matches.suppliers.map(s => <button type="button" key={s.id} onClick={() => choose({kind:'supplier',id:s.id})}><Truck size={18} aria-hidden="true"/><bdi>{s.name}</bdi></button>) },
      { title:'shelfLocations' as const, items:matches.locations.map(l => <button type="button" key={l.id+':'+l.bin} onClick={() => choose({kind:'location',id:l.id,label:l.bin})}><MapPin size={18} aria-hidden="true"/><bdi>{l.name} · {l.code}{l.bin && ' / '+l.bin}</bdi></button>) },
    ] : []),
  ];
  return <Modal title={t(photoOnly ? 'addPhotos' : 'workspaceSearch')} onClose={close} wide>
    <div ref={input}><SearchBox value={raw} onChange={setRaw} testId="workspace-query"
      label={t('workspaceSearchHint')} onEnter={() => {
        const exact = parts.filter(p => p.exact);
        if (!loading && exact.length === 1) choose({kind:'part',id:exact[0].id});
      }} /></div>
    {term.length < 2 && <p className="muted">{t('searchMinLength')}</p>}
    {loading && <p role="status">{t('loading')}</p>}
    <ErrorBanner error={error} />
    {!!error && <button className="button secondary" onClick={() => setRetry(n => n+1)}>{t('refresh')}</button>}
    {!loading && matches && !groups.some(g => g.items.length) && <Empty title={t('noResults')} />}
    <div className="workspace-results">
      {groups.filter(group => group.items.length).map(group => <section key={group.title}><h3>{t(group.title)}</h3>{group.items}</section>)}
    </div>
    {!photoOnly && term.length < 2 && <div className="toolbar" aria-label={t('quickActions')}>
      {(['pos','catalog','vehicles','inventory'] as const).filter(page => page !== 'pos' || can('sell'))
        .map(page => <button className="button secondary" key={page} onClick={() => choose({kind:'nav',page})}>{t(page)}</button>)}
    </div>}
  </Modal>;
}

type Bin = { id: string; code: string; warehouseId: string; warehouseName: string; warehouseCode: string; onHand: number; quarantine: number; damaged: number };
export function ShelfLocator({ productId }: { productId: string }) {
  const { t,locale,warehouses } = useApp();
  const [open,setOpen] = useState(false);
  const [warehouse,setWarehouse] = useState('');
  const [page,setPage] = useState(1);
  const result = useLoad<{items: Bin[]; more: boolean}>(open
    ? `/workspace/products/${productId}/locations?page=${page}${warehouse ? '&warehouseId='+warehouse : ''}` : null);
  const groups = new Map<string,Bin[]>();
  for (const bin of result.data?.items ?? []) {
    const list = groups.get(bin.warehouseId) ?? [];
    list.push(bin);
    groups.set(bin.warehouseId,list);
  }
  return <details className="panel shelf-locator" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><MapPin size={17} aria-hidden="true"/>{t('shelfLocations')}</summary>
    <p className="muted">{t('scopedBinHint')}</p>
    <select aria-label={t('warehouse')} value={warehouse} onChange={event => { setWarehouse(event.target.value); setPage(1); }}>
      <option value="">{t('allScope')}</option>
      {warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select>
    <ErrorBanner error={result.error} />
    {result.loading ? <p role="status">{t('loading')}</p> : open && <>
      {groups.size === 0 && !result.error && <p>{t('noShelfStock')}</p>}
      {[...groups.values()].map(bins => <section key={bins[0].warehouseId}>
        <h3><bdi>{bins[0].warehouseName} · {bins[0].warehouseCode}</bdi></h3>
        <ul className="shelf-bins">{bins.map(bin => <li key={bin.id}><bdi>{bin.code}</bdi>
          <span>{t('onHand')} <strong>{quantity(bin.onHand,locale)}</strong></span>
          {bin.quarantine > 0 && <span>{t('quarantine')} {quantity(bin.quarantine,locale)}</span>}
          {bin.damaged > 0 && <span>{t('damaged')} {quantity(bin.damaged,locale)}</span>}
        </li>)}</ul>
      </section>)}
      {(page > 1 || result.data?.more) && <div className="pagination">
        <button className="button secondary" disabled={page===1} onClick={() => setPage(page-1)}>{t('previous')}</button>
        <button className="button secondary" disabled={!result.data?.more || page===1000} onClick={() => setPage(page+1)}>{t('next')}</button>
      </div>}
    </>}
  </details>;
}

export function PartSuppliers({ productId }: {productId: string}) {
  const { t,can,locale } = useApp();
  const [open,setOpen] = useState(false);
  const allowed = can('suppliers');
  const data = useLoad<{items:{id:string;name:string;reference:string;leadDays:number}[];more:boolean}>(
    allowed && open ? '/workspace/products/'+productId+'/suppliers' : null,
  );
  if(!allowed)return null;
  return <details className="panel shelf-locator" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><Truck size={17} aria-hidden="true"/>{t('suppliers')}</summary>
    <ErrorBanner error={data.error}/>
    {data.loading ? <p role="status">{t('loading')}</p> : open && <>
      {!data.data?.items.length && !data.error && <p>{t('noRecords')}</p>}
      <ul className="shelf-bins">{data.data?.items.map(item=><li key={item.id}>
        <bdi>{item.name} · {item.reference}</bdi><span>{t('leadDays')} {quantity(item.leadDays,locale)}</span>
      </li>)}</ul>
    </>}
  </details>;
}

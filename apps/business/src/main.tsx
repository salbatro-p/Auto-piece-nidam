import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Boxes,
  CarFront,
  ChevronRight,
  FileUp,
  Gauge,
  LockKeyhole,
  LogOut,
  Menu,
  Package,
  Search,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UsersRound,
  X,
} from 'lucide-react';
import { LanguageSwitcher } from '../../../packages/i18n/src/LanguageSwitcher';
import { direction, resolveLocale, type Locale } from '../../../packages/i18n/src/index';
import { translate, messageKey, type MessageKey } from '../../../packages/i18n/src/business';
import { api, ApiError, setCsrf } from './api';
import { AppContext } from './context';
import { ErrorBanner, Field, Modal } from './components';
import type { Product, User, Warehouse } from './types';
import { Dashboard, Catalog, PointOfSale, Inventory, ProductDetails } from './operations';
import { WorkspaceSearch, WorkspaceShortcuts, type WorkspaceTarget } from './workspace';
import { Purchases, Suppliers, Vehicles, Imports, Audit, Team } from './management';
import './styles.css';
import './refinements.css';
import './workspace.css';
import './premium.css';
import { Invitation } from './invitation';

type Page =
  | 'dashboard'
  | 'pos'
  | 'catalog'
  | 'inventory'
  | 'purchases'
  | 'suppliers'
  | 'vehicles'
  | 'imports'
  | 'audit'
  | 'team';
const navGroups = ['operations','catalogAndVehicles','management'] as const;
const navItems: { id: Page; icon: typeof Gauge; permission?: string; group: typeof navGroups[number] }[] =
  [
    { id: 'dashboard', icon: Gauge, group: 'operations' },
    { id: 'pos', icon: ScanLine, permission: 'sell', group: 'operations' },
    { id: 'catalog', icon: Package, group: 'catalogAndVehicles' },
    { id: 'inventory', icon: Boxes, group: 'operations' },
    { id: 'purchases', icon: ShoppingBag, permission: 'purchases', group: 'management' },
    { id: 'suppliers', icon: Truck, permission: 'suppliers', group: 'management' },
    { id: 'vehicles', icon: CarFront, group: 'catalogAndVehicles' },
    { id: 'imports', icon: FileUp, permission: 'imports', group: 'catalogAndVehicles' },
    { id: 'audit', icon: ShieldCheck, permission: 'audit', group: 'management' },
    { id: 'team', icon: UsersRound, permission: 'staff', group: 'management' },
  ];
const visitor: User = { id: '', name: '', email: '', role: '', locale: 'fr', permissions: [] };
function App() {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(null, navigator.language));
  const [user, setUser] = useState<User | null>(null),
    [passwordOnlyLogin, setPasswordOnlyLogin] = useState(false),
    [starting, setStarting] = useState(true),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [page, setPage] = useState<Page>('dashboard'),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState<MessageKey | null>(null),
    [error, setError] = useState<unknown>(),
    [locked, setLocked] = useState(false);
  const [vehicle, setVehicle] = useState<string>('');
  const [search,setSearch] = useState<'all'|'photos'>();
  const [details,setDetails] = useState<{ product?: Product; error?: unknown; photos?: boolean }>();
  const [posLoaded,setPosLoaded] = useState(false);
  const [posEntry,setPosEntry] = useState<{sku:string}>();
  const [inventoryEntry,setInventoryEntry] = useState<{product?:Product;warehouseId?:string;bin?:string;receipt?:boolean;reviewCounts?:boolean}>();
  const [categoryEntry,setCategoryEntry] = useState<{category:string}>();
  const [coverageEntry,setCoverageEntry] = useState<{queue:'missing'}>();
  const [supplierEntry,setSupplierEntry] = useState<{id:string}>();
  const detailRequest = useRef<AbortController | undefined>(undefined);
  const lastActivity = useRef(Date.now());
  const localeSave = useRef(Promise.resolve());
  const localeChosen = useRef(false);
  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  );
  const can = useCallback((permission: string) => !!user?.permissions.includes(permission), [user]);
  useEffect(() => {
    if (!user || locked) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        setSearch('all');
      }
    };
    window.addEventListener('keydown',onKey);
    return () => window.removeEventListener('keydown',onKey);
  },[user,locked]);
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[page]);
  useEffect(() => {
    const expired = () => {
      if (user) setLocked(true);
    };
    window.addEventListener('autoparts-session-expired', expired);
    return () => window.removeEventListener('autoparts-session-expired', expired);
  }, [user?.id]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
    document.title = `AutoParts Business · ${t(page)}`;
  }, [locale, page, t]);
  useEffect(() => {
    Promise.all([
      api<{ user: User; csrfToken: string }>('/me').catch(() => null),
      api<{ defaultLocale: Locale; passwordOnlyLogin: boolean }>('/config').catch(() => ({ defaultLocale: 'fr' as Locale, passwordOnlyLogin: false })),
    ])
      .then(([session, config]) => {
        setPasswordOnlyLogin(config.passwordOnlyLogin === true);
        if (session) {
          setUser(session.user);
          setCsrf(session.csrfToken);
          setLocale(session.user.locale);
        } else if (!localeChosen.current)
          setLocale(resolveLocale(null, navigator.language, config.defaultLocale));
      })
      .finally(() => setStarting(false));
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (user && !locked)
      void api<{ items: Warehouse[] }>('/warehouses')
        .then((data) => setWarehouses(data.items))
        .catch(setError);
  }, [user?.id, locked]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const lock = useCallback(() => {
    if (!user || locked) return;
    setLocked(true);
    void api('/auth/lock', { method: 'POST', body: {} }).catch(() => {});
  }, [user, locked]);
  useEffect(() => {
    if (!user || locked) return;
    lastActivity.current = Date.now();
    const active = () => {
      lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, active, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > 180000) lock();
    }, 10000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, active));
      clearInterval(timer);
    };
  }, [user?.id, locked, lock]);
  async function switchLocale(next: Locale) {
    localeChosen.current = true;
    setLocale(next);
    if (user && !locked) {
      localeSave.current = localeSave.current.then(async () => {
        try {
          await api('/me/locale', { method: 'PATCH', body: { locale: next } });
        } catch (err) {
          setError(err);
        }
      });
    }
  }
  async function logout() {
    try {
      await localeSave.current;
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError(err);
        return;
      }
    }
    setUser(null);
    try { if (user) sessionStorage.removeItem('autoparts:registration:'+user.id); } catch {}
    setCsrf('');
    setLocked(false);
    setWarehouses([]);
    setPage('dashboard');
    setVehicle('');
    setSearch(undefined);
    detailRequest.current?.abort();
    setDetails(undefined);
    setPosLoaded(false);
    setPosEntry(undefined);
    setInventoryEntry(undefined);
    setCategoryEntry(undefined);
    setCoverageEntry(undefined);
    setSupplierEntry(undefined);
    setLocale(resolveLocale(null, navigator.language));
    setError(undefined);
  }
  function loginSuccess(session: { user: User; csrfToken: string }) {
    setUser(session.user);
    setCsrf(session.csrfToken);
    setLocale(session.user.locale);
    setLocked(false);
    setError(undefined);
    setPage(session.user.role === 'sales' ? 'pos' : session.user.role === 'warehouse' ? 'inventory' : 'dashboard');
    lastActivity.current = Date.now();
  }
  const context = {
    locale,
    changeLocale: (next: Locale) => void switchLocale(next),
    t,
    user: user ?? visitor,
    warehouses,
    online,
    can,
    notify: setNotice,
  };
  const navigate = (next: Page) => {
    if (next === 'pos' && !can('sell')) return;
    if (next !== 'catalog') setCoverageEntry(undefined);
    setPage(next);
    setMenu(false);
  };
  useEffect(() => { if (page === 'pos') setPosLoaded(true); },[page]);
  function closeDetails() {
    detailRequest.current?.abort();
    setDetails(undefined);
  }
  function choose(target: WorkspaceTarget) {
    setSearch(undefined);
    if (target.kind === 'part') {
      const photos = search === 'photos' && can('catalog');
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      setDetails({ photos });
      void api<Product>('/products/'+target.id,{signal:controller.signal})
        .then(product => { if (!controller.signal.aborted) setDetails({ product,photos }); })
        .catch(error => { if (!controller.signal.aborted) setDetails({ error,photos }); });
      return;
    }
    if (target.kind === 'vehicle') {
      setCategoryEntry(undefined);
      setVehicle(target.id);
      navigate('catalog');
    } else if (target.kind === 'category') {
      setVehicle('');
      setCategoryEntry({category:target.category});
      navigate('catalog');
    } else if (target.kind === 'supplier' && can('suppliers')) {
      setSupplierEntry({id:target.id});
      navigate('suppliers');
    } else if (target.kind === 'location') {
      setInventoryEntry({ warehouseId: target.id,bin:target.label });
      navigate('inventory');
    } else if (target.kind === 'nav') navigate(target.page);
  }
  return (
    <AppContext.Provider value={context}>
      <a className="skip-link" href="#main">
        {t('workspace')}
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            A<span>•</span>
          </span>
          <div>
            <strong>
              AutoParts<span className="brand-divider"> / </span>
              <span className="brand-business">Business</span>
            </strong>
            <small>{t('privateWorkspace')}</small>
          </div>
        </div>
        <LanguageSwitcher
          locale={locale}
          onChange={(next) => void switchLocale(next)}
          label={t('language')}
        />
        {user && (
          <div className="header-actions">
            <button type="button" className="icon-button workspace-header-search" data-testid="workspace-search"
              aria-label={t('workspaceSearch')} aria-keyshortcuts="Control+K Meta+K" title={t('workspaceSearch')}
              disabled={locked} onClick={() => setSearch('all')}><Search size={20} aria-hidden="true" /></button>
            <span className="connection">
              <i className={online ? 'online' : 'offline'} />
              {t(online ? 'online' : 'offline')}
            </span>
            <button
              className="icon-button lock-button"
              title={t('lock')}
              aria-label={t('lock')}
              onClick={lock}
            >
              <LockKeyhole size={19} />
            </button>
            <button
              className="icon-button mobile-menu"
              title={t('workspace')}
              aria-label={t('workspace')}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        )}
      </header>
      {!online && (
        <div className="offline-bar" role="status">
          {t('offline')}
        </div>
      )}
      {starting ? (
        <main id="main" className="startup">
          {t('loading')}
        </main>
      ) : !user ? (
        <main id="main" className="login-layout">
          <section className="login-editorial">
            <div className="eyebrow">AUTOPARTS BUSINESS</div>
            <h1>{t('welcome')}</h1>
            <p>{t('signInHint')}</p>
            <div className="illustration">
              <div className="illustration-ring" />
              <div className="illustration-card">
                <Boxes size={44} />
                <strong>{t('inventory')}</strong>
                <div className="illustration-bars">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="illustration-chip">
                <ShieldCheck size={20} />
                {t('privateWorkspace')}
              </div>
            </div>
            <p className="editorial-foot">
              <span className="dot" />
              {t('demoNotice')}
            </p>
          </section>
          <section className="login-form-wrap">
            <div className="eyebrow">{t('privateWorkspace')}</div>
            <h2>{t('signIn')}</h2>
            <p className="muted">{t('inviteOnly')}</p>
            <LoginForm onSuccess={loginSuccess} passwordOnlyLogin={passwordOnlyLogin} />
            <Invitation />
            <div className="demo-login">
              <span className="badge neutral">{t('demo')}</span>
              <p>{t(passwordOnlyLogin ? 'localPasswordHelp' : 'localDemoHelp')}</p>
            </div>
          </section>
        </main>
      ) : (
        <>
          <div className="app-layout">
            <aside className={`sidebar ${menu ? 'menu-open' : ''}`} inert={locked}>
              <div className="workspace-label">
                <span className="workspace-avatar">AP</span>
                <div>
                  <strong>AutoParts Morocco</strong>
                  <small>
                    Casablanca <span className="dot-separator">·</span> {t('demo')}
                  </small>
                </div>
              </div>
              <nav aria-label={t('workspace')}>
                {navGroups.filter(group=>navItems.some(item=>item.group===group&&(!item.permission||can(item.permission)))).map((group) => (
                  <div className="nav-group" key={group}>
                    <div className="nav-label">{t(group)}</div>
                    {navItems
                      .filter((item) => item.group === group && (!item.permission || can(item.permission)))
                      .map((item) => (
                        <button
                          className={`nav-item ${page === item.id ? 'active' : ''}`}
                          key={item.id}
                          data-testid={`nav-${item.id}`}
                          aria-current={page === item.id ? 'page' : undefined}
                          onClick={() => navigate(item.id)}
                        >
                          <item.icon size={20} />
                          <span>{t(item.id)}</span>
                          {page === item.id && <span className="nav-dot" />}
                        </button>
                      ))}
                  </div>
                ))}
              </nav>
              <div className="sidebar-footer">
                <div className="user-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
                <div className="user-details">
                  <strong>
                    <bdi>{user.name}</bdi>
                  </strong>
                  <small>{t(messageKey(user.role.toUpperCase()) ?? 'role')}</small>
                </div>
                <button
                  aria-label={t('logout')}
                  title={t('logout')}
                  data-testid="logout"
                  className="icon-button"
                  onClick={() => void logout()}
                >
                  <LogOut size={18} />
                </button>
              </div>
            </aside>
            <main id="main" className="main-content" inert={locked}>
              <div className="breadcrumb">
                <span>{t('workspace')}</span>
                <ChevronRight size={13} />
                <span>{t(page)}</span>
                <span className="demo-label">{t('demo')}</span>
              </div>
              {!!error && <ErrorBanner error={error} />}
              <div key={user.id}>
                {page === 'dashboard' && <Dashboard navigate={navigate}
                  openMissingPhotos={() => {setCoverageEntry({queue:'missing'});navigate('catalog');}}
                  openCounts={() => {setInventoryEntry({reviewCounts:true});navigate('inventory');}}
                  shortcuts={<WorkspaceShortcuts
                  onSearch={() => setSearch('all')} onNavigate={navigate}
                  onReceive={() => { setInventoryEntry({receipt:true}); navigate('inventory'); }}
                  onPhotos={() => setSearch('photos')}
                />} />}
                {can('sell') && (posLoaded || page === 'pos') && <div hidden={page !== 'pos'}><PointOfSale entry={posEntry} active={page==='pos'} /></div>}
                {page === 'catalog' && (
                  <Catalog vehicleId={vehicle} clearVehicle={() => setVehicle('')} categoryEntry={categoryEntry} coverageEntry={coverageEntry}
                    onIntake={product => { setInventoryEntry({product,receipt:true}); navigate('inventory'); }} />
                )}{' '}
                {page === 'inventory' && <Inventory entry={inventoryEntry} />}
                {page === 'purchases' && <Purchases />}
                {page === 'suppliers' && <Suppliers entry={supplierEntry} />}
                {page === 'vehicles' && (
                  <Vehicles
                    onSelect={(id) => {
                      setVehicle(id);
                      navigate('catalog');
                    }}
                  />
                )}
                {page === 'imports' && <Imports />}
                {page === 'audit' && <Audit />}
                {page === 'team' && <Team />}
              </div>
              <footer className="content-footer">
                <span>
                  <Activity size={13} /> {t('demoNotice')}
                </span>
                <span>AutoParts Business · v0.1</span>
              </footer>
            </main>
          </div>
          {!locked && search && <WorkspaceSearch close={() => setSearch(undefined)} choose={choose} photoOnly={search==='photos'} />}
          {!locked && details && (details.product ? <ProductDetails product={details.product} onClose={closeDetails} startUpload={details.photos}
            onSell={can('sell') ? () => { setPosEntry({sku:details.product!.sku}); closeDetails(); navigate('pos'); } : undefined}
            onReceive={can('receive') ? () => { setInventoryEntry({product:details.product,receipt:true}); closeDetails(); navigate('inventory'); } : undefined}
          /> : <Modal title={t('catalog')} onClose={closeDetails}><ErrorBanner error={details.error} />{!details.error && <p role="status">{t('loading')}</p>}</Modal>)}
          {locked && (
            <section role="dialog" aria-modal="true" aria-labelledby="lock-title" className="lock-overlay">
              <div className="lock-panel">
                <LockKeyhole size={32} />
                <h2 id="lock-title">{t('locked')}</h2>
                <p>{t('lockHint')}</p>
                <LoginForm
                  passwordOnlyLogin={passwordOnlyLogin}
                  email={user.email}
                  expectedId={user.id}
                  onSuccess={(session) => {
                    setUser(session.user);
                    setCsrf(session.csrfToken);
                    setLocked(false);
                    lastActivity.current = Date.now();
                  }}
                />
                <button className="text-button" onClick={() => void logout()}>
                  {t('logout')}
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {notice && (
        <div className="toast" role="status">
          {t(notice)}
        </div>
      )}
    </AppContext.Provider>
  );
}
function LoginForm({
  onSuccess,
  passwordOnlyLogin = false,
  email: initialEmail = '',
  expectedId,
}: {
  onSuccess: (session: { user: User; csrfToken: string }) => void;
  passwordOnlyLogin?: boolean;
  email?: string;
  expectedId?: string;
}) {
  const context = React.useContext(AppContext)!;
  const { t } = context;
  const [email, setEmail] = useState(initialEmail),
    [password, setPassword] = useState(''),
    [totp, setTotp] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <form
      className="login-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!email || !password) {
          setError(new ApiError('VALIDATION_ERROR'));
          return;
        }
        setBusy(true);
        setError(undefined);
        void api<{ user: User; csrfToken: string }>('/auth/login', {
          method: 'POST',
          body: { email, password, ...(!passwordOnlyLogin && totp ? { totp } : {}) },
        })
          .then(async (session) => {
            if (expectedId && session.user.id !== expectedId) {
              setCsrf(session.csrfToken);
              await api('/auth/logout', { method: 'POST', body: {} });
              setCsrf('');
              throw new ApiError('FORBIDDEN');
            }
            setPassword('');
            setTotp('');
            onSuccess(session);
          })
          .catch(setError)
          .finally(() => setBusy(false));
      }}
    >
      <Field label={t('email')}>
        <input
          data-testid="login-email"
          autoComplete="username"
          inputMode="email"
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          readOnly={!!expectedId && !!initialEmail}
        />
      </Field>
      <Field label={t('password')}>
        <input
          data-testid="login-password"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {!passwordOnlyLogin && <Field label={t('totp')} hint={t('totpHelp')}>
        <input
          data-testid="login-totp"
          autoComplete="one-time-code"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          value={totp}
          onChange={(e) => setTotp(e.target.value)}
        />
      </Field>}
      <ErrorBanner error={error} />
      <button type="submit" data-testid="login-submit" className="button primary full" disabled={busy}>
        {busy ? t('loading') : t(expectedId ? 'unlock' : 'login')}
        <ChevronRight size={18} />
      </button>
    </form>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js');

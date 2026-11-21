import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, X, Camera, CircleAlert, Package, Check, Disc3, Cog, Zap, Wrench } from 'lucide-react';
import { api, ApiError, mutationKey } from './api';
import { useApp } from './context';
import { contentValue, money, quantity } from '../../../packages/i18n/src/index';
import { messageKey, type MessageKey } from '../../../packages/i18n/src/business';
import type { Product, Stock } from './types';
import { LanguageSwitcher } from '../../../packages/i18n/src/LanguageSwitcher';
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
/** Keep the file control in the chosen application language rather than the browser's UI locale. */
export function FilePicker({label,hint,...props}:React.InputHTMLAttributes<HTMLInputElement>&{label:string;hint?:string}) {
  const {t}=useApp(),input=useRef<HTMLInputElement>(null),[name,setName]=useState('');
  return <div className="field"><span>{label}</span><button type="button" className="button secondary" disabled={props.disabled} onClick={()=>input.current?.click()} aria-label={`${label}: ${t('chooseFile')}`}>{t('chooseFile')}</button><input {...props} ref={input} hidden type="file" aria-label={label} onChange={event=>{setName(event.target.files?.[0]?.name??'');props.onChange?.(event);}}/><bdi aria-live="polite">{name||t('noFileSelected')}</bdi>{hint&&<small>{hint}</small>}</div>;
}
export function ErrorBanner({ error }: { error: unknown }) {
  const { t } = useApp();
  if (!error) return null;
  const err = error as ApiError;
  return (
    <div role="alert" className="notice error">
      <CircleAlert size={18} />
      <div>
        {t(messageKey(err.code ?? err.message) ?? 'INTERNAL_ERROR')}
        {err.requestId && (
          <small>
            {t('requestId')}: <bdi>{err.requestId}</bdi>
          </small>
        )}
      </div>
    </div>
  );
}
export function Empty({ title, hint }: { title?: string; hint?: string }) {
  const { t } = useApp();
  return (
    <div className="empty">
      <Package size={32} />
      <h3>{title ?? t('noRecords')}</h3>
      {hint && <p>{hint}</p>}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useApp();
  const key = messageKey(value);
  return (
    <span
      className={`badge ${/ACTIVE|SELLABLE|CONFIRMED|COMPLETED|VERIFIED|APPROVED/.test(value) ? 'positive' : 'neutral'}`}
    >
      {key ? t(key) : <bdi>{value}</bdi>}
    </span>
  );
}
export function ProductName({ product }: { product: Product }) {
  const { locale, t } = useApp();
  const content = contentValue(product.names, locale, product.translationStatus);
  return (
    <span className="product-name">
      <bdi lang={content.sourceLocale}>{content.value || product.sku}</bdi>
      {content.missing && <small className="warning-text">{t('translationMissing')}</small>}
    </span>
  );
}
export function ProductVisual({ product }: { product: Product }) {
  const {t}=useApp(),[failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[product.mediaId]);
  const category=(product.category ?? '').toLowerCase();
  const family=/brak|frein|فرامل/.test(category) ? 'brake'
    : /filter|filtre|فلتر/.test(category) ? 'filter'
    : /electric|sensor|electro|capteur|كهرب|حساس/.test(category) ? 'electrical'
    : /engine|motor|moteur|محرك/.test(category) ? 'engine'
    : /suspension|steer|direction|تعليق/.test(category) ? 'mechanical' : 'other';
  const PlaceholderIcon=family==='brake' ? Disc3 : family==='electrical' ? Zap
    : family==='engine' ? Cog : family==='mechanical' ? Wrench : Package;
  const hasExactPhoto=Boolean(product.mediaId&&!failed);
  return (
    <div className={`product-visual visual-${family}`} title={!hasExactPhoto ? t('IMAGE_UNAVAILABLE') : undefined}>
      {hasExactPhoto ? (
        <img alt="" src={`/api/media/${product.mediaId}?size=thumbnail`} loading="lazy" decoding="async" width="64" height="64" onError={()=>setFailed(true)} />
      ) : family === 'filter' ? (
        <svg viewBox="0 0 48 48" width="30" height="30" role="img" aria-label={t('IMAGE_UNAVAILABLE')}
          fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="24" cy="10" rx="13" ry="5"/>
          <ellipse cx="24" cy="10" rx="4" ry="1.5"/>
          <path d="M11 10v26c0 7 26 7 26 0V10M11 32c0 7 26 7 26 0M16 16v15m5-14v16m6-16v16m5-17v15"/>
        </svg>
      ) : (
        <PlaceholderIcon aria-label={t('IMAGE_UNAVAILABLE')} strokeWidth={1.65} size={30} />
      )}
    </div>
  );
}
export function CategoryName({ product }: { product: Product }) {
  const { locale, t } = useApp();
  const custom = contentValue(product.categoryNames, locale, product.translationStatus),
    key = messageKey('category_' + product.category);
  if (product.categoryNames?.[locale]) return <bdi>{custom.value}</bdi>;
  if (key) return <span>{t(key)}</span>;
  return (
    <span>
      <bdi>{custom.value || product.category}</bdi>
      <small className="warning-text">{t('translationMissing')}</small>
    </span>
  );
}
export function totalStock(product: Product, warehouseId?: string): Stock {
  const stocks = (product.stock ?? []).filter((s) => !warehouseId || s.warehouseId === warehouseId);
  return stocks.reduce(
    (sum, s) => ({
      ...sum,
      onHand: sum.onHand + Number(s.onHand),
      reserved: sum.reserved + Number(s.reserved),
      available: sum.available + Number(s.available),
      quarantine: sum.quarantine + Number(s.quarantine),
      damaged: sum.damaged + Number(s.damaged),
    }),
    { warehouseId: '', warehouseName: '', onHand: 0, reserved: 0, available: 0, quarantine: 0, damaged: 0 },
  );
}
export function StockBadge({ value }: { value: number }) {
  const { t, locale } = useApp();
  return (
    <span className={`stock-badge ${value === 0 ? 'zero' : value <= 5 ? 'low' : 'good'}`}>
      <span className="dot" />
      {quantity(value, locale)} <span>{t('PCS')}</span>
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t, locale, changeLocale } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} aria-label={title} className={wide ? 'modal wide' : 'modal'} onCancel={onClose}>
      <div className="modal-languages">
        <LanguageSwitcher locale={locale} onChange={changeLocale} label={t('language')} />
      </div>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" aria-label={t('close')} className="icon-button" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function useLoad<T>(path: string | null, dependencies: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    api<T>(path)
      .then((result) => {
        if (active) {
          setData(result);
          setError(undefined);
        }
      })
      .catch((err) => {
        if (active) setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version, ...dependencies]);
  return { data, error, loading, reload: () => setVersion((n) => n + 1), setData };
}
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const busyRef=useRef(false);
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState<{ path: string; body: unknown; key: string; method: string } | null>(
    null,
  );
  const pendingRef=useRef<typeof pending>(null);
  function updatePending(value:typeof pending){pendingRef.current=value;setPending(value);}
  const { online } = useApp();
  async function run<T>(path: string, body: unknown, method = 'POST',onUploadProgress?:(percent:number)=>void): Promise<T | undefined> {
    if (busyRef.current) return;
    const recovering=pendingRef.current;
    const request = recovering ?? { path, body, key: mutationKey(), method };
    if (!online) {
      setError(new ApiError('NETWORK_ERROR'));
      return;
    }
    busyRef.current=true;setBusy(true);
    setError(undefined);
    try {
      if (recovering) {
        const recovered = await api<{ status: string; response: T }>(
          '/requests/' + encodeURIComponent(request.key),
        );
        if (recovered.status === 'COMMITTED') {
          updatePending(null);
          return recovered.response;
        }
      }
      const result = await api<T>(request.path, {...request,onUploadProgress});
      updatePending(null);
      return result;
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && (err.code === 'NETWORK_ERROR' || (err.status ?? 0) >= 500))
        updatePending(request);
      else updatePending(null);
      return;
    } finally {
      busyRef.current=false;setBusy(false);
    }
  }
  return {
    run,
    busy,
    error,
    pending,
    reset: () => {
      setError(undefined);
      updatePending(null);
    },
  };
}
export function SearchBox({
  value,
  onChange,
  onEnter,
  onScan,
  label,
  testId = 'product-search',
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: (value: string) => void;
  onScan?: (value: string) => void;
  label?: string;
  testId?: string;
  autoFocus?: boolean;
}) {
  const { t } = useApp();
  const [scan, setScan] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <div className="search-box">
        <Search size={20} />
        <input
          data-testid={testId}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          dir="auto"
          value={value}
          placeholder={label ?? t('searchPlaceholder')}
          aria-label={label ?? t('search')}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!e.repeat) {
                onEnter?.(e.currentTarget.value);
                if (onScan) e.currentTarget.select();
              }
            }
          }}
        />
        {value && (
          <button className="icon-button" aria-label={t('clear')} onClick={() => onChange('')}>
            <X size={17} />
          </button>
        )}
        <button
          className="icon-button scan-button"
          onClick={() => {
            if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
              setError(true);
              return;
            }
            setError(false);
            setScan(true);
          }}
          title={t('camera')}
          aria-label={t('camera')}
        >
          <Camera size={20} />
        </button>
      </div>
      {error && (
        <p className="small muted" role="status">
          {t('cameraUnavailable')}
        </p>
      )}
      {scan && (
        <Scanner
          onClose={() => setScan(false)}
          onValue={(code) => {
            onChange(code);
            onScan?.(code);
            setScan(false);
          }}
        />
      )}
    </>
  );
}
type Detector = { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
function Scanner({ onClose, onValue }: { onClose: () => void; onValue: (value: string) => void }) {
  const { t } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stream: MediaStream | undefined,
      stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const fail = () => {
      stream?.getTracks().forEach(track => track.stop());
      if (!stopped) setFailed(true);
    };
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (result) => {
        stream = result;
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const DetectorConstructor = (
          window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => Detector }
        ).BarcodeDetector;
        const detector = new DetectorConstructor({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'],
        });
        const loop = async () => {
          if (stopped || !video.current) return;
          const hits = await detector.detect(video.current);
          if (stopped) return;
          if (hits[0]?.rawValue) onValue(hits[0].rawValue);
          else timer = setTimeout(() => void loop().catch(fail), 200);
        };
        await loop();
      })
      .catch(fail);
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  return (
    <Modal title={t('camera')} onClose={onClose}>
      <p>{t(failed ? 'cameraUnavailable' : 'cameraHint')}</p>
      <video className="camera-preview" ref={video} playsInline muted />
    </Modal>
  );
}
export function MutationState({ state }: { state: ReturnType<typeof useMutation> }) {
  const { t } = useApp();
  return (
    <>
      <ErrorBanner error={state.error} />
      {state.pending && (
        <div className="notice warning">
          <CircleAlert size={18} />
          <div>
            {t('unknownOutcome')}
            <small>
              {t('requestId')}: <bdi>{state.pending.key}</bdi>
            </small>
            <p className="small">{t('retry')}</p>
          </div>
        </div>
      )}
    </>
  );
}
export function Amount({ minor }: { minor: number }) {
  const { locale } = useApp();
  return <bdi>{money(minor, locale)}</bdi>;
}
export function Success({ message }: { message: MessageKey }) {
  const { t } = useApp();
  return (
    <div className="notice success">
      <Check size={18} />
      {t(message)}
    </div>
  );
}

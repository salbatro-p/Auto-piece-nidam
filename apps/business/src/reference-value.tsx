import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CircleAlert } from 'lucide-react';
import { useApp } from './context';

/**
 * Read-only automotive identifiers are copyable but never silently rewritten.
 * The original SKU/OEM/GTIN stays left-to-right even inside an Arabic dialog.
 * Clipboard failures are explicitly shown, with no destructive fallback.
 */
export function ReferenceValue({
  value,
  label,
  testId,
}: {
  value?: string | null;
  label: string;
  testId: string;
}) {
  const { t } = useApp();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);

  const reference = value?.trim() ?? '';
  async function copy() {
    if (reset.current) clearTimeout(reset.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(reference);
      setState('copied');
    } catch {
      setState('failed');
    }
    reset.current = setTimeout(() => setState('idle'), 2400);
  }

  const actionLabel = state === 'copied' ? t('copiedPartReference')
    : state === 'failed' ? t('copyPartReferenceFailed') : t('copyPartReference');

  return (
    <span className="reference-value">
      <bdi dir="ltr" className="reference-identifier">{reference || '—'}</bdi>
      {reference && (
        <button type="button" className="reference-copy-button" data-testid={testId}
          data-copy-state={state} aria-label={`${actionLabel}: ${label}`}
          title={`${actionLabel}: ${label}`} onClick={() => void copy()}>
          {state === 'copied' ? <Check size={17} aria-hidden="true"/>
            : state === 'failed' ? <CircleAlert size={17} aria-hidden="true"/>
            : <Copy size={17} aria-hidden="true"/>}
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'idle' ? '' : actionLabel}
      </span>
    </span>
  );
}

import React, { useState } from 'react';
import { useApp } from './context';
import { api } from './api';
import { ErrorBanner, Field, Modal } from './components';
function newSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return [...crypto.getRandomValues(new Uint8Array(32))].map((v) => alphabet[v % 32]).join('');
}
export function Invitation() {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false),
    [token, setToken] = useState(''),
    [invite, setInvite] = useState<{ email: string; role: string } | null>(null),
    [password, setPassword] = useState(''),
    [secret, setSecret] = useState(''),
    [totp, setTotp] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const privileged = invite && ['owner', 'manager'].includes(invite.role);
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        {t('acceptInvitation')}
      </button>
      {open && (
        <Modal
          title={t('acceptInvitation')}
          onClose={() => {
            setOpen(false);
            setPassword('');
            setSecret('');
            setTotp('');
            setInvite(null);
            setToken('');
            setDone(false);
          }}
        >
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                if (!invite) {
                  const info = await api<{ email: string; role: string }>('/auth/invitation-info', {
                    method: 'POST',
                    body: { token },
                  });
                  setInvite(info);
                  if (['owner', 'manager'].includes(info.role)) setSecret(newSecret());
                } else {
                  await api('/auth/accept-invitation', {
                    method: 'POST',
                    body: { token, password, locale, ...(privileged ? { mfaSecret: secret, totp } : {}) },
                  });
                  setDone(true);
                  setPassword('');
                  setSecret('');
                  setTotp('');
                  setToken('');
                }
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {done ? (
              <div className="notice success" role="status">
                {t('invitationReady')}
              </div>
            ) : (
              <>
                {!invite ? (
                  <Field label={t('inviteToken')}>
                    <textarea dir="ltr" value={token} onChange={(e) => setToken(e.target.value.trim())} />
                  </Field>
                ) : (
                  <>
                    <p>
                      <bdi>{invite.email}</bdi>
                    </p>
                    <Field label={t('password')} hint={t('newPasswordHelp')}>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                    {privileged && (
                      <>
                        <Field label={t('mfaSetup')} hint={t('mfaSetupHelp')}>
                          <input dir="ltr" readOnly value={secret} />
                        </Field>
                        <Field label={t('totp')}>
                          <input
                            dir="ltr"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={totp}
                            onChange={(e) => setTotp(e.target.value)}
                          />
                        </Field>
                      </>
                    )}
                  </>
                )}
                <ErrorBanner error={error} />
                <button className="button primary" disabled={busy}>
                  {t(invite ? 'acceptInvitation' : 'verifyInvitation')}
                </button>
              </>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}

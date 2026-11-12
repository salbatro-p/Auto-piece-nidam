# Local preview password login

On 12 November 2026 the owner explicitly requested removal of the authenticator-code step from the existing local Web Preview. This preference is implemented on `codex/local-password-login`, based on the preserved `ebe8838` checkpoint. No accounts or enrolled MFA secrets are removed, and no inventory migration is required.

Set `LOCAL_PREVIEW_PASSWORD_ONLY=true` in the private local `.env` and restart the API. The existing account then signs in and unlocks with its email and password. The AR/FR/EN interface hides the authenticator field and explains the local login method. The account remains `owner@demo.local`; its password is in the private local access guide. Changing this preference does not register a Gmail account.

The server accepts this preference only when all conditions hold: `NODE_ENV=development`, `DEMO_MODE=true`, a loopback API bind address, a loopback database host, and a request from a loopback address with a local hostname. Production, test environments, public hostnames, remote clients, missing configuration and disabled opt-in continue to require MFA for owner/manager roles. Password checking, rate limits, session expiration, CSRF, permission checks and invitation enrollment remain enforced.

To restore the authenticator requirement, change only `LOCAL_PREVIEW_PASSWORD_ONLY` to `false`, restart the API, and refresh the preview. Existing enrolled authenticators remain valid. No account reset or database restore is needed. Full source rollback, if ever required, should be performed in a separate recovery copy from the verified checkpoint, not by resetting the working database.

The protected pre-change backup is `D:\dipoo\AutoParts-password-login-safety-20261112-001620`: verified Git bundle, 459 working/configuration files, a consistent dump restored with all 45 tables identical, and 2,832 hash-checked private media files. Its `source` and `media` directories and `database.dump` remain the recovery originals; its `test-workspace` and restored verification database were used for isolated testing.

See `docs/evidence/local-password-login.json` for the actual test results and preservation checks. All browser mutations used a separate restored database and media directory. During logout verification, a short owner viewport exposed an existing sidebar overflow problem; the sidebar now scrolls so its logout button stays reachable. No production deployment was performed.

# Hosted staging history

For the current local installation use the [Windows company guide](WINDOWS_COMPANY_GUIDE_AR.md) and the [current acceptance matrix](LOCAL_PHASE1_2026-11-22.md). The following entry records an earlier external staging request, its 15-migration rehearsal and the limitations on that date.

## Archived external staging trial

**Status: BLOCKED for external access.** The owner approved a synthetic staging deployment. No accessible hosting account, deployment credential or DNS control was available in the session. Execution policy rejected starting a public HTTPS tunnel from the workstation. Docker is unavailable on this workstation. Container execution, public certificate issuance and phone/tablet access via a staging URL remain unverified.

The isolated native rehearsal created a fresh PostgreSQL cluster, ran all 15 migrations with a separate non-superuser role, seeded synthetic fixtures and built the accepted frontend. Production-mode API checks verified owner MFA, secure cookies, employee permissions, sale and receipt replay, count approval, ledger reconciliation and protected media. The loopback gateway served the built page behind an access challenge. This is local rehearsal evidence, with public HTTPS still pending. See [the actual results](evidence/staging-rehearsal.json).

The staging Compose file creates a separate database, private media volume and internal application networks. Caddy is the only published service. It obtains HTTPS certificates, redirects HTTP to HTTPS and requires a gateway password before the app login. The API runs in production mode with secure cookies and privileged MFA. A one-shot initializer seeds synthetic records in the staging database only.

Set these in a private environment file on the staging host:

- `STAGING_DOMAIN` for the approved hostname.
- `STAGING_DB_PASSWORD` as unique hex or another URL-safe password.
- `STAGING_DEMO_PASSWORD` as a unique strong password for the synthetic accounts.
- `STAGING_DEMO_TOTP_SECRET` as a fresh 32-character uppercase Base32 secret.
- `STAGING_MFA_KEY` as a fresh 64-character hex encryption key.
- `STAGING_GATE_USER` and `STAGING_GATE_HASH` as the gateway user and Caddy-generated bcrypt hash. Use single quotes around the hash in the private env file to preserve dollar signs.

After hosting access and DNS are available, validate and start on that host:

```sh
docker compose --env-file .env.staging -f infrastructure/staging.compose.yaml config --quiet
docker compose --env-file .env.staging -f infrastructure/staging.compose.yaml up -d --build
```

Send access details using an approved secret channel. Open the approved HTTPS hostname on tablet or phone. After the gateway prompt, use the assigned synthetic account. Test `owner@demo.local`, `sales@demo.local` and `warehouse@demo.local`. Owner and manager enter current TOTP. The browser may offer to add the page to the home screen.

Check trusted TLS, owner MFA, secure cookies, employee role restrictions, stock scope, sale, intake, count review and photo upload. The deployment is Business only. Roll back by building the previous accepted commit against the staging volumes. Restore backups in separate paths first if data recovery is needed.

The existing workstation preview is `http://127.0.0.1:4173/` on the workstation itself. Sign in locally as `owner@demo.local` using the password in the existing private access guide.

The local API rehearsal is reproducible with `scripts/rehearse-staging.mts` and a separate freshly seeded cluster on local port 55434 with database `autoparts_https_pilot` and role `pilot_app`. Run with the private rehearsal environment, `NODE_ENV=production`, `DEMO_MODE=false`, and a new output-file path. The script only accepts that isolated database target and must not be pointed at business data. Keep the rehearsal database and access material out of Git.

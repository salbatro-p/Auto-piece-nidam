# HTTPS staging pilot

**Status: BLOCKED.** The configuration is prepared. External deployment requires explicit owner approval, an isolated host with Docker Compose v2, a DNS name and host access. Docker is unavailable on this workstation. Container execution, certificate issuance and phone/tablet access via the staging URL remain unverified.

The staging Compose file creates a separate database, private media volume and internal application networks. Caddy is the only published service. It obtains HTTPS certificates, redirects HTTP to HTTPS and requires a gateway password before the app login. The API runs in production mode with secure cookies and privileged MFA. A one-shot initializer seeds synthetic records in the staging database only.

Set these in a private environment file on the staging host:

- `STAGING_DOMAIN` for the approved hostname.
- `STAGING_DB_PASSWORD` as unique hex or another URL-safe password.
- `STAGING_DEMO_PASSWORD` as a unique strong password for the synthetic accounts.
- `STAGING_DEMO_TOTP_SECRET` as a fresh 32-character uppercase Base32 secret.
- `STAGING_MFA_KEY` as a fresh 64-character hex encryption key.
- `STAGING_GATE_USER` and `STAGING_GATE_HASH` as the gateway user and Caddy-generated bcrypt hash. Use single quotes around the hash in the private env file to preserve dollar signs.

After approval, validate and start on that host:

```sh
docker compose --env-file .env.staging -f infrastructure/staging.compose.yaml config --quiet
docker compose --env-file .env.staging -f infrastructure/staging.compose.yaml up -d --build
```

Send access details using an approved secret channel. Open the approved HTTPS hostname on tablet or phone. After the gateway prompt, use the assigned synthetic account. Test `owner@demo.local`, `sales@demo.local` and `warehouse@demo.local`. Owner and manager enter current TOTP. The browser may offer to add the page to the home screen.

Check trusted TLS, owner MFA, secure cookies, employee role restrictions, stock scope, sale, intake, count review and photo upload. The deployment is Business only. Roll back by building the previous accepted commit against the staging volumes. Restore backups in separate paths first if data recovery is needed.

The existing workstation preview is `http://127.0.0.1:4173/` on the workstation itself. Sign in locally as `owner@demo.local` using the password in the existing private access guide.

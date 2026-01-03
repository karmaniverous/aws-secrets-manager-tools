# Smoke tests (AWS account required)

These are end-to-end smoke tests that hit a real AWS account and exercise:

- CLI-flag driven execution (no config overlay)
- Config overlay discovery + plugin config interpolation
- `aws secrets push|pull|delete` behavior, including template bootstrap for dotenv edits

## Configure (optional)

Defaults are committed in `smoke/.env`:

- `SMOKE_AWS_PROFILE=JGS-SSO`
- `SMOKE_KEEP_ARTIFACTS=0`

To override locally:

1. Copy `smoke/.env.local.template` to `smoke/.env.local`
2. Edit values (this file is gitignored)

## Run

From repo root:

```bash
npm run smoke:flags
npm run smoke:overlay
```

Notes:

- Both scripts use AWS SSO login-on-demand. If your SSO session is expired,
  you may be prompted to login.
- The smoke tests write `smoke/fixtures/aws-secrets/.env.local` during `pull`
  to validate template bootstrap and format preservation.
  - It is deleted at the end by default.
  - Set `SMOKE_KEEP_ARTIFACTS=1` to keep it for inspection.

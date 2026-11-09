# Running LendLoop in production: what I'd change

This repo is built to be reviewed and run locally. Here is what I would change before real neighbours (or, in a Fluence setting, real clinicians and patients) used it. Most important first.

## 1. Secrets and n8n hardening

- **Move the shared secrets out of plain env vars.** n8n Code nodes read `CONVEX_TO_N8N_SECRET` and `N8N_TO_CONVEX_SECRET` from the environment, which needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. That exposes every env var to every Code node. In production I'd use n8n's external secrets (AWS Secrets Manager / Vault) or a small custom "LendLoop HMAC" credential type, and turn env access back off.
- **Rotate secrets without downtime.** Accept two secrets during rotation (`v1=` signatures checked against current and previous) and add a key id header.
- **Bind the signature to the endpoint.** Sign `timestamp.method.path.body` instead of `timestamp.body`, so a signed body can't be replayed against a different route inside the 5-minute window. Today the strict per-route schema validation makes that impractical, but binding the path is the cleaner guarantee.
- **Lock down the n8n instance.** Put it behind SSO, keep the editor off the public internet (only `/webhook/*` exposed through a reverse proxy with TLS and rate limiting), and run it in queue mode with Postgres and Redis instead of SQLite.
- **Execution data holds personal data.** Execution logs contain names and email addresses. Keep `EXECUTIONS_DATA_PRUNE` on with a short `EXECUTIONS_DATA_MAX_AGE`, and consider `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` so only failed runs are kept for debugging.

## 2. Real delivery and consent

- Replace the mock email node with a real provider (SES, Postmark) using an n8n credential. Use the provider's idempotency key or message id, so a retried send at the provider level is also de-duplicated.
- Add notification preferences and an unsubscribe link. Store consent in Convex and send it in the event, so n8n can skip people who opted out.
- Handle bounces: a provider webhook into n8n, written back to Convex to flag bad addresses.

## 3. Data protection and retention

- **Retention jobs** (Convex cron): delete `outbox` rows after 30 days (they hold a copy of the recipient's email), anonymise returned loans after a set period, and archive the audit log to write-once storage.
- **Account deletion:** a Clerk `user.deleted` webhook (verified with Svix) that removes the user row, soft-deletes their listings and replaces their name on historic loans with "Former member".
- **Keep user records in sync** with Clerk webhooks instead of relying on `ensureUser` at sign-in, and stop storing the email in Convex at all if notifications can be resolved through Clerk's API at send time.
- **Audit log:** add before/after values for sensitive changes (role, Trusted Lender), log admin reads of all loans, and record CLI actions like `grantAdmin`, which today aren't audited.

## 4. Reliability

- **Outbox sweeper:** a Convex cron that re-schedules `pending` rows older than a few minutes, in case a scheduled action was dropped.
- **Alerting:** today failures show up on the admin page. In production they'd also go to Sentry or Datadog, with alerts on: outbox `failed` count > 0, no reminder run in 26 hours, and repeated 401s at the webhook (possible probing or a secret mismatch).
- **Pagination:** the list queries cap at 100–500 rows. Switch them to Convex pagination and denormalise availability onto the tool row so the board doesn't do a lookup per tool.
- **Time zones:** "today" is the UTC date. Store each community's time zone and run the reminder per zone.

## 5. Abuse and product rules

- Rate-limit requests per user (the Convex rate-limiter component), and add a report-listing flow for admins.
- Let lenders message borrowers inside the app instead of sharing contact details, and only reveal contact details after approval.
- Add a dispute state for "lender says not returned" so the lender's `markReturned` isn't the only source of truth.

## 6. Delivery pipeline

- CI on every PR: `npm run lint`, `npm run typecheck`, `npm test`, `next build`, plus a check that exported n8n JSON contains no credentials or secret-looking strings.
- Separate Convex, Clerk and n8n environments for preview, staging and production, deployed with `npx convex deploy` from CI.
- Security headers (CSP with Clerk and Convex origins, HSTS) set in `next.config.ts`, and dependency scanning.

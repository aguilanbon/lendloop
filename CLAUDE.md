# CLAUDE.md — LendLoop (Fluence take-home)

## Why this repo exists
Bon (aguilanbon@gmail.com) is applying for **Fluence International's remote Full-Stack Developer role**: $3.5k–5k/month, a 6-month contract with strong potential for renewal.
Step 1 of their process is this take-home. The finished repo's GitHub link goes into the application email.
The full job post, including the take-home spec, is in [docs/JOB_POST.md](docs/JOB_POST.md). **Read it first. It is the source of truth.**

Bon decided on 2026-11-09 to build this. It's the strongest lead in a wider remote job hunt (repo aguilanbon/job-hunt, cloned at E:\Bon\job-hunt).
Bon is a full-stack engineer with 4+ years in React/Next.js/TypeScript and Node, and production experience on Convex: his own game CrossSwords, in E:\Bon\crossswords. The post explicitly allows using LLMs to write the code.

## What gets judged (from the post)
Code structure and clarity · **security-minded thinking** · UX and practicality · **n8n integration design, reliability and error handling** · documentation and reasoning.
Fluence builds healthcare software for clinicians: privacy, auditability and data minimisation matter to them. Make those visible in the code and the README.

## The spec in short
- **Stack:** Next.js (App Router), Clerk auth, Convex (data + backend), n8n (self-hosted via Docker, or n8n Cloud), TypeScript.
- **Public page:** "LendLoop" with a tagline. A read-only list of available tools from Convex showing **name and category only, no owner details**. A "Sign in to lend or borrow" button (Clerk).
- **Signed in:** list a tool (name, category, condition, description); request to borrow for a date range; approve or decline requests on your own tools; mark a loan returned. All tools with availability, filterable by category. "My listings", "My requests" and "Incoming requests" views. Minimal, nice layout.
- **Roles:**
  - **admin:** remove any listing, view all loans, mark a lender "Trusted Lender".
  - **user:** create, edit and delete only their own listings; act only on requests involving their own tools or their own borrowing.
  - **RBAC must be enforced in Convex functions, not only in the UI.**
- **n8n workflow 1:** when a borrow request is created or changes status, Convex calls an n8n webhook, and n8n notifies the relevant user. Email, Slack, Discord or a logged mock is fine. Send only the fields it needs.
- **n8n workflow 2:** a daily schedule fetches overdue loans from a Convex HTTP endpoint, sends each borrower a reminder, and writes the reminder status back to Convex.
- **Security in both directions:**
  - HMAC-sign webhook payloads and verify signatures on the receiving side.
  - Secrets live in env vars and n8n credentials, never in code or exported workflow JSON.
  - Write-backs are idempotent, so retries never duplicate records or reminders.
  - Retries plus an error workflow, so failures are visible and never silent.
- **Bonus:** show recent automation activity on each loan, e.g. "Reminder sent 2 days ago".
- **Deliverables:**
  - GitHub repo with the source and the exported n8n workflow JSON files.
  - README covering local setup (including n8n, with a docker-compose file), env vars, architecture, and security and data-minimisation decisions.
  - A short note on what you'd change to run this in production.

## Suggested build order
1. Scaffold Next.js (App Router, TS, Tailwind), Convex and Clerk, using the Convex + Clerk integration (`ConvexProviderWithClerk`, `convex/auth.config.ts`).
2. Convex schema:
   - `users`: clerk id, display name, role, `trustedLender`.
   - `tools`
   - `loans` / requests, with a status machine: pending → approved/declined → returned, plus cancelled.
   - `automationEvents`, keyed for idempotency, for the activity feed and reminder status.
3. Auth helpers in Convex: `requireUser`, `requireAdmin`, `requireToolOwner`, `requireLoanParty`. Every query and mutation goes through them.
4. A public query that returns `{ name, category }` only.
5. Outbound webhook:
   - A Convex action, scheduled from mutations, signs `timestamp.body` with HMAC-SHA256 and POSTs to n8n with retries and backoff.
   - n8n verifies the signature and the timestamp freshness.
6. Inbound:
   - Convex HTTP routes for "overdue loans" and "reminder status", both verifying the n8n signature.
   - Write-backs keyed by an idempotency key (loan id + reminder date).
7. n8n: the two workflows plus an error workflow. Export them with no credentials inside.
8. Tests with `convex-test` for the RBAC rules and idempotency, including negative cases (another user can't approve your request).
9. README, `docs/PRODUCTION.md`, docker-compose for n8n.
10. Optional: deploy to Vercel + a Convex prod deployment for a live demo link.

## Local environment notes
- **Docker is not installed on this PC.** For local testing, run n8n with `npx n8n` (Node 24 is installed; if n8n needs an older Node, use n8n Cloud's trial). The repo must still ship a docker-compose file for the reviewers.
- Bon has a Convex account (used for CrossSwords). Clerk needs a free account; Bon creates it and pastes the keys into `.env.local` himself.
- Never commit secrets. Keep `.env.local` and `.env` git-ignored, and commit `.env.example`.

## Git and GitHub
- This folder is under E:/Bon/, so git uses Bon's **personal** identity (aguilanbon) automatically.
- The `gh` CLI's active account is his **work** account. Prefix gh commands with `GH_TOKEN=$(gh auth token --user aguilanbon)` and never run `gh auth switch`.
- Bon likes commits pushed right after they're made.
- The GitHub repo starts **private**. Make it public, or invite Fluence, only when Bon says it's ready to submit.

## The application email (after the build)
Send to **techjobs@fluencetraining.com**. It must include:
- his portfolio
- the GitHub repo link
- optionally 1–2 other projects (CrossSwords: crossswords.expo.app; gantt-task-react-v on npm)
- a short note on a security/privacy measure he built or would build in a healthcare-like setting
- the word **"pineapple"**, the post's read-carefully check for applicants

The post screens out AI-written applications, so the email must be in Bon's own words. A starting draft is in `E:\Bon\job-hunt\docs\Cover notes.md`, section 1.
Resume: `E:\Bon\job-hunt\resume\Bon_Aguilan_Resume.pdf`.

## Working with Bon
- Plain English, short sentences. Explain decisions briefly.
- Bon tests on Android (Pixel 9a) for app work, but this is a web app; check it in a desktop browser.

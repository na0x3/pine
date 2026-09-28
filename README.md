# Varia

Varia is a first version of a human-led transaction alert investigation workspace for financial compliance, fraud, and risk teams. It supports bank, ACH, wire, card, remittance, merchant, crypto, and stablecoin activity in the same case workflow. The AI produces structured decision support; only an authorized analyst records a disposition.

## Local setup

Requires Node.js 22+, npm, and PostgreSQL 16. Docker Compose is included for a local database.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Sign in as `alex@northstar.demo` with `DemoPass123!`. The seeded workspace, names, transactions, and credentials are synthetic. Change or remove demo credentials before any non-demo deployment.

If Docker is unavailable, point `DATABASE_URL` at any PostgreSQL database and run the remaining commands. Seed is idempotent by organization slug.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required. |
| `OPENAI_API_KEY` | Enables a real server-side OpenAI investigation. Optional for synthetic local demo. |
| `OPENAI_MODEL` | Structured-output capable model; defaults to `gpt-4o-mini`. |
| `NEXT_PUBLIC_APP_NAME` | Optional display name. No secret belongs in a `NEXT_PUBLIC_` variable. |
| `NEXT_PUBLIC_DEMO_MODE` | When `true`, prefills the synthetic demo login. Keep `false` outside demos. |

When `OPENAI_API_KEY` is absent, **Investigate with AI** produces a clearly labeled synthetic demo analysis from deterministic signals. It does not call a model or pretend to be an actual AI result. With a key, the server sends case context through the [OpenAI Responses API structured output format](https://developers.openai.com/api/docs/guides/structured-outputs), validates the result with Zod, checks that every factor cites known evidence IDs, and stores the version. No key is sent to the browser.

## Architecture and data model

The Next.js App Router renders the workspace and hosts route handlers. Prisma owns the PostgreSQL schema and migration. The service layer in `src/lib` owns authentication, case assembly, deterministic risk signals, AI analysis, decisions, and exports. Client components handle interaction only.

The primary chain is `Organization → Customer / Account → Transaction → Alert → Investigation → Evidence / RiskSignal / RiskFactor → AnalystDecision`. `User` belongs to one organization and has an `ADMIN`, `MANAGER`, `ANALYST`, or `VIEWER` role. `Session` holds a hash of an opaque cookie token. `AuditLog` records events; its PostgreSQL trigger rejects updates and deletes. Composite foreign keys tie customers, accounts, transactions, alerts, investigations, and evidence to the same organization. Service queries also scope records by organization ID.

Each investigation stores a version number, original context snapshot, structured output, model/source label, signals, factors, and evidence. New runs create new versions. Evidence rows refer to customer fields, transactions, previous alerts, or deterministic signals. The case UI opens the cited evidence when an analyst selects a factor.

## Investigation and decision flow

1. An analyst opens an alert and sees customer, transaction, history, prior alerts, assignment, and audit activity.
2. The server collects up to 80 prior transactions and 20 previous alerts within that organization.
3. `calculateRiskSignals` checks amount anomalies, velocity, new counterparty/country/rail/device, unusual time, account age, KYC, previous alerts, rapid fund movement, small inflows, expected volume, and concentration.
4. The model receives only this case context and an explicit instruction to avoid unsupported facts. Its response must fit a Zod schema. Unknown evidence references reject the investigation. Failures are audited.
5. The analyst can close, request information, escalate, or send the case for suspicious activity review. A note of at least 10 characters is required. The decision, AI recommendation, agreement flag, note, and status transition are recorded together in a database transaction. Viewer accounts cannot mutate cases.
6. JSON and PDF exports include the case, investigation versions, evidence, human decisions, and timeline. Each export is audited.

AI-generated investigation output is decision support only and must be reviewed by an authorized human analyst. The application does not freeze accounts, submit regulatory reports, or make autonomous compliance decisions.

## Synthetic dataset

The seed contains 40 customers, 600 transactions, 20 alerts, 10 historical synthetic investigations, and five users. It includes low, ambiguous, and higher-risk patterns across payment rails. `ALT-01042` is the showcase case: Maya Torres, a verified customer with a roughly 14-month-old account, makes a $21,500 outbound wire to a new business counterparty. The UI shows both the amount anomaly and mitigating KYC/customer history.

## Provider boundary

`src/lib/providers.ts` defines KYC, sanctions, transaction, fraud, blockchain risk, identity, and document provider contracts with deliberately non-authoritative mock implementations. No external screening or financial data integration is active. Providers can later contribute evidence and deterministic signals without changing analyst decision ownership.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The Playwright test requires a running local PostgreSQL database, applied migration, seed data, and a Chromium browser installed with `npx playwright install chromium`. It exercises sign-in, the 20-alert queue, showcase investigation, evidence, human decision, PDF export, and analytics. The API flow tests cover note validation, mutation authorization, and origin checks. Risk engine tests cover historical comparison and movement patterns.

## Security assumptions and MVP limits

The app uses server-side role checks, organization-scoped reads and writes, input validation, origin checks on mutations, HTTP-only same-site session cookies, bcrypt password hashes, and database-backed login/investigation limits. Deploy behind HTTPS and a trusted proxy; protect the database and API key with a secret manager, rotate demo credentials, and set operational backups and monitoring. The local database password in `.env.example` and Docker Compose is for development only.

This is an MVP, not a certified compliance system. It has no SSO, invitation or password reset flow, real KYC/sanctions provider, document storage, queue worker, immutable external audit archive, or regulatory filing. The in-database audit trigger prevents normal record mutation, but database administrators can still change data; production audit assurance needs separate retention and monitoring controls. AI outputs require analyst review and may be incomplete. The synthetic fallback is for demos only. There is no claim of SOC 2, bank certification, or regulatory approval.

## Publication and licensing

The code currently has no open-source license. A public repository is viewable, but a license must be chosen before describing it as open source or inviting reuse. Review rights to `public/profile-avatar.jpg` separately before licensing the asset. The public demo contains only synthetic records; never commit real customer data, API keys, local environment files, or exported investigation reports. The name “Varia” should be checked for trademark conflicts in the markets where it will be used.

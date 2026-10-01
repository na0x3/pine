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

### Use your ChatGPT plan locally, without an API key

Varia supports OpenAI's [Sign in with ChatGPT plan usage for open-source, locally hosted apps](https://developers.openai.com/siwc/token-sharing-open-source). Use a ChatGPT account and plan eligible for that feature. Run Varia on loopback and open the exact host used by the OAuth callback:

```bash
npm run dev -- -H 127.0.0.1
```

Open `http://127.0.0.1:3000`, sign in to Varia, then go to **Settings → Continue with ChatGPT**. Approve plan usage in the browser, return to Settings, choose an available model, and save it. Set `OPENAI_DATA_SHARING_ENABLED="true"` in `.env` and restart Varia before running an AI investigation. Each Varia user connects their own ChatGPT account. The selected model must support the requested structured output; if it does not, choose another model. No OpenAI API key is needed for this path.

OAuth credentials and the host ID are stored in `.varia/chatgpt-connections.json`, which is gitignored and created with owner-only permissions. Keep that local directory private and out of backups or sync services that expose secrets. The OAuth callback and plan usage are restricted to `127.0.0.1`. This path is for a local app; a paid or remotely hosted deployment needs [OpenAI partner access](https://developers.openai.com/siwc/token-sharing-open-source). ChatGPT plan requests use the Responses API with `store: false` and streaming, and are subject to the connected account's model availability and usage limits.

If Docker is unavailable, point `DATABASE_URL` at any PostgreSQL database and run the remaining commands. Seed is idempotent by organization slug.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required. |
| `OPENAI_API_KEY` | Optional server-side API credential for the separate API billing path. Not needed for ChatGPT plan usage. |
| `OPENAI_MODEL` | Structured-output capable model; defaults to `gpt-4o-mini`. |
| `OPENAI_DATA_SHARING_ENABLED` | Must be `true` as well as setting a key to send case context to OpenAI. Defaults to `false`. |
| `TRUSTED_PROXY_HOPS` | Number of trusted reverse-proxy hops for login IP rate limiting. Defaults to `0`, which uses only the per-email limit. Configure only when the proxy sanitizes `X-Forwarded-For`. |
| `NEXT_PUBLIC_APP_NAME` | Optional display name. No secret belongs in a `NEXT_PUBLIC_` variable. |
| `NEXT_PUBLIC_DEMO_MODE` | When `true`, prefills the synthetic demo login. Keep `false` outside demos. |

When neither a connected ChatGPT plan nor an API key is available, or data sharing is disabled, the investigation action produces a clearly labeled synthetic demo analysis from deterministic signals. It does not call a model. With a connected ChatGPT plan and data sharing enabled, the server uses that user's OAuth token. With an API key and data sharing enabled, it uses the separate API billing path. Both paths send minimized case context, validate the result with Zod, check that every factor cites known evidence IDs, and store the version. No credential is sent to the browser.

The model context includes the alert type and score; customer type, country, KYC and risk state, customer tenure, and expected volume; transaction amounts, currencies, directions, timestamps, rails and destination countries; previous alert statuses; and deterministic signals with evidence references. Customer names, account details, counterparty names, contact details, and free-form transaction metadata stay in Varia. `contextSnapshot` records the payload used for each investigation. Enable data sharing only after reviewing your organization's data handling requirements and OpenAI account settings.

## Architecture and data model

The Next.js App Router renders the workspace and hosts route handlers. Prisma owns the PostgreSQL schema and migration. The service layer in `src/lib` owns authentication, case assembly, deterministic risk signals, AI analysis, decisions, and exports. Client components handle interaction only.

The primary chain is `Organization → Customer / Account → Transaction → Alert → Investigation → Evidence / RiskSignal / RiskFactor → AnalystDecision`. `User` belongs to one organization and has an `ADMIN`, `MANAGER`, `ANALYST`, or `VIEWER` role. `Session` holds a hash of an opaque cookie token. `AuditLog` records events; its PostgreSQL trigger rejects updates and deletes. Composite foreign keys tie customers, accounts, transactions, alerts, investigations, and evidence to the same organization. Service queries also scope records by organization ID.

Each investigation stores a version number, minimized model context snapshot, structured output, model/source label, signals, factors, and evidence. New runs create new versions. Evidence rows refer to customer fields, transactions, previous alerts, or deterministic signals. The case UI opens the cited evidence when an analyst selects a factor.

## Investigation and decision flow

1. An analyst opens an alert and sees customer, transaction, history, prior alerts, assignment, and audit activity.
2. The server collects up to 80 prior transactions and 20 previous alerts within that organization.
3. `calculateRiskSignals` checks amount anomalies, velocity, new counterparty/country/rail/device, unusual time, customer tenure, KYC, previous alerts, rapid fund movement, small inflows, expected volume, and concentration.
4. The model receives only this case context and an explicit instruction to avoid unsupported facts. Its response must fit a Zod schema. Unknown evidence references reject the investigation. Failures are audited.
5. The analyst can close, request information, escalate, or send the case for suspicious activity review. A note of at least 10 characters is required. The decision, AI recommendation, agreement flag, note, and status transition are recorded together in a database transaction. Viewer accounts cannot mutate cases.
6. JSON and PDF exports include the case, investigation versions, evidence, human decisions, and timeline. Each export is audited.

AI-generated investigation output is decision support only and must be reviewed by an authorized human analyst. The application does not freeze accounts, submit regulatory reports, or make autonomous compliance decisions.

## Customer and transaction ingestion

`POST /api/customers/ingest` creates a customer profile before transactions arrive. A signed-in administrator or manager, or an organization ingestion key, can call it. `sourceReference` is unique within an organization: an identical retry returns the existing `customerId`; conflicting data returns `409`. The onboarding date is stored separately from the date Varia received the profile, so customer-tenure signals remain meaningful when importing older records. KYC status and risk rating are source-provided assertions; this endpoint does not perform identity checks.

```json
{
  "sourceReference": "processor-customer-123",
  "type": "BUSINESS",
  "businessName": "Example Supply Co.",
  "country": "United States",
  "kycStatus": "VERIFIED",
  "riskRating": "LOW",
  "onboardedAt": "2025-04-10T12:00:00Z",
  "expectedMonthlyVolume": 30000,
  "expectedMonthlyVolumeCurrency": "USD"
}
```

The response contains `customerId` and `duplicate`. Supply that `customerId` when sending transactions. Customer profiles are currently create-only; changes to KYC status, risk rating, or expected volume require a future update endpoint.

`POST /api/transactions/ingest` accepts one transaction at a time from a signed-in administrator or manager, or from a bearer ingestion key. Browser requests require a same-origin request. An administrator creates and revokes organization-scoped keys in Settings; the full key is shown once, then only its hash is stored. A `sourceReference` must be unique within the organization. Repeating an identical transaction returns the existing transaction and alert; reusing a reference with different content returns `409`. The server verifies that the customer belongs to the caller's organization, validates the payload, calculates deterministic risk signals, and creates an alert when there is at least one high-severity signal or two medium-severity signals. The transaction, optional alert, and audit events are saved together.

```json
{
  "sourceReference": "processor-transaction-123",
  "customerId": "demo-customer-001",
  "type": "WIRE",
  "direction": "OUTBOUND",
  "amount": 21500,
  "currency": "USD",
  "timestamp": "2026-09-28T14:30:00Z",
  "counterpartyName": "Example Supply Co.",
  "counterpartyCountry": "United States",
  "paymentRail": "WIRE"
}
```

The response includes `transactionId`, `alertId` (or `null`), and `duplicate`. Send machine requests with `Authorization: Bearer <ingestion key>` and `Content-Type: application/json`. The key grants access only to the customer and transaction ingestion endpoints. A payment provider adapter and verified KYC integration remain outside this MVP. Monetary signals compare only transactions in the same currency, and expected monthly volume has an explicit currency on the customer record.

In the synthetic seed, sign in as `avery@northstar.demo` with `DemoPass123!` to create a key in Settings. Remove or rotate these credentials before any non-demo use.

## Synthetic dataset

The seed contains 40 customers, 600 transactions, 20 alerts, 10 historical synthetic investigations, and five users. It includes low, ambiguous, and higher-risk patterns across payment rails. `ALT-01042` is the showcase case: Maya Torres, a verified customer with a roughly 14-month-old account, makes a $21,500 outbound wire to a new business counterparty. The UI shows both the amount anomaly and mitigating KYC/customer history.

## Provider boundary

`src/lib/providers.ts` defines KYC, sanctions, transaction, fraud, blockchain risk, identity, and document provider contracts with deliberately non-authoritative mock implementations. No external screening or payment-provider connection is active. Providers can later contribute evidence and deterministic signals without changing analyst decision ownership.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The Playwright test requires a running local PostgreSQL database, applied migrations, seed data, and a Chromium browser installed with `npx playwright install chromium`. It exercises sign-in, the 20-alert queue, showcase investigation, evidence, human decision, PDF export, and analytics. The API flow tests cover note validation, mutation authorization, and origin checks. Risk engine tests cover historical comparison, currency separation, and movement patterns.

## Security assumptions and MVP limits

The app uses server-side role checks, organization-scoped reads and writes, input validation, origin checks on mutations, HTTP-only same-site session cookies, bcrypt password hashes, and database-backed login/investigation limits. Deploy behind HTTPS and a trusted proxy; protect the database and API key with a secret manager, rotate demo credentials, and set operational backups and monitoring. The local database password in `.env.example` and Docker Compose is for development only.

This is an MVP, not a certified compliance system. It has no SSO, invitation or password reset flow, real KYC/sanctions provider, customer profile update flow, document storage, queue worker, immutable external audit archive, or regulatory filing. The in-database audit trigger prevents normal record mutation, but database administrators can still change data; production audit assurance needs separate retention and monitoring controls. AI outputs require analyst review and may be incomplete. The synthetic fallback is for demos only. There is no claim of SOC 2, bank certification, or regulatory approval.

## Publication and licensing

The project source code is licensed under MIT in `LICENSE`. Review rights to `public/profile-avatar.jpg` separately before redistributing that asset; it is not covered by the source-code license. The public demo contains only synthetic records; never commit real customer data, API keys, OAuth tokens, local environment files, or exported investigation reports. The name “Varia” should be checked for trademark conflicts in the markets where it will be used. The bundled Noto Sans report fonts retain their SIL Open Font License notice in `assets/fonts/COPYRIGHT`.

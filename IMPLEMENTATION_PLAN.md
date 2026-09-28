# MVP implementation plan

1. Establish a PostgreSQL and Prisma domain model with organization-scoped records, versioned investigations, evidence, decisions, sessions, and append-only audit events.
2. Seed a synthetic organization with analysts, 40 customers, 600 cross-rail transactions, 20 alerts, and 10 investigation snapshots.
3. Build a desktop-first alert workspace and a detailed case view with searchable/filterable alert lists and evidence inspection.
4. Add a deterministic risk engine, structured OpenAI investigations, validated evidence references, and a clearly labeled synthetic fallback for local demo use.
5. Require server-side roles and analyst notes for decisions; expose audit activity, analytics, and JSON/PDF exports.
6. Verify types, build, risk tests, and the main API workflow where a database is available; document local setup and limitations.

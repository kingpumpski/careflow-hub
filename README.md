# CareFlow Hub — Hospital Revenue Operations Center

CareFlow Hub is an enterprise claims-intelligence and pre-authorization platform for hospitals and
healthcare providers. It covers the full revenue cycle: pre-authorization requests, monthly claims
entry, settlement tracking, rejections and appeals, withholding tax, general ledger postings,
schedules, executive analytics and an AI insight layer.

Currency throughout the system is the Ghana Cedi (GH¢).

---

## 1. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript 5, Vite 6 |
| Styling | Tailwind CSS v3 + shadcn/ui, semantic HSL design tokens |
| Charts | Recharts |
| Backend | Lovable Cloud / Supabase-compatible PostgreSQL, Auth, Storage, Edge Functions, Realtime |
| AI | Provider-agnostic server-side AI layer |
| Exports | jsPDF / PDF helpers and XLSX for Excel |
| Tests | Vitest + Playwright dependencies |

---

## 2. Getting started

```sh
npm ci
npm run dev
npm run build
npm test
npx tsc --noEmit
npm run lint
```

The development server listens on port 8080. Environment variables for the backend client are
provided by the project environment and must not be committed to source control.

---

## 3. Project structure

```text
src/
├── App.tsx                     Application shell + route registry
├── App.css                     Global shell chrome (scrollbars, print rules, animations)
├── index.css                   Design tokens and responsive component utilities
├── components/                 Layout, dashboard, AI, shared and shadcn/ui components
├── modules/                    Framework-free domain and security logic
│   ├── claims/                 Claims models and aggregation
│   ├── authorization/          Pre-authorization rules, snapshots and review logic
│   ├── analytics/              KPI calculators and insight generation
│   ├── ai/                     Provider-agnostic AI layer
│   └── security/               RBAC roles, permission matrix and access hooks
├── pages/                      One screen per route
├── hooks/                      Data fetching, search, toast and responsive helpers
├── lib/                        Export and utility helpers
└── integrations/supabase/      Generated backend client/types

supabase/
├── functions/                  Server-side privileged operations and AI endpoints
└── migrations/                 Ordered PostgreSQL schema/security changes
```

---

## 4. Navigation map

| Group | Screens |
| --- | --- |
| **Dashboard** | CareFlow Hub executive dashboard (`/`) |
| **Claims Intelligence** | Monthly Claims Entry, Insurance Companies, Claims Schedule, Settlement Tracking, Outstanding, Rejections, Withholding Tax, Bulk Import, Duplicate Audit, Reports, General Ledger |
| **Pre-Authorization** | Authorization Requests, Pre-Authorization Studio, Patients / Clients, Doctors, Procedures, Procedure Templates, Cost Builder Items, Diagnosis Master |
| **Analytics** | Performance Analytics, Revenue & Trends, Provider Performance, Insurer Scorecard, Service Lines, Fraud Alerts, AI Insights |
| **Administration** | Users & Roles, Audit Logs, Messages, Notifications, Settings |

Menu entries are filtered by the signed-in user's permissions, while database RLS and security-definer
functions remain the authoritative access boundary.

---

## 5. Executive dashboard

KPI cards: Total Claims Submitted, Total Payments Received, Outstanding Balance, Rejected Amount,
Rejection Rate, Collection Rate, Average Settlement Period, and open Pre-Authorizations.

Analytics sections cover claims submission, collections, outstanding balances, rejection trends,
claim status, insurer performance and service-line performance.

The AI insight panel computes deterministic operational signals locally and can enrich them through
the server-side AI layer.

---

## 6. Business rules

- **Outstanding** = (Submitted − Rejected) − Payments − Withholding Tax
- **Rejection Rate** = Rejected ÷ Gross Submitted × 100
- **Collection Rate** = Payments ÷ Gross Submitted × 100
- **Recovery Rate** = Payments ÷ Net Submitted × 100
- **Average Settlement Period** = mean days between `submitted_at` and `paid_at`
- Claims and Pre-Authorization are strictly decoupled: the claims side handles aggregate totals only
  and never stores individual patient data.
- The general ledger uses double-entry postings in `ledger_entries`.

---

## 7. Pre-authorization workflow

```text
Draft ──► Review ──► Freeze revision ──► Handoff queued
  │                         │
  └──── duplicate block ◄──┘
```

The Pre-Authorization Studio validates patient, insurer, facility, procedure, date, diagnosis,
charges and totals before finalization. A frozen request receives a deterministic request number,
a versioned snapshot and SHA-256 fingerprint. The server-side finalization RPC locks the parent row,
registers the document, prepares the handoff and records the submission atomically.

Idempotency is enforced server-side. Replaying the same pre-authorization and idempotency key with
the same snapshot returns the original result; replaying the key with a different snapshot is
rejected as a payload mismatch. Incomplete prior idempotency records are rejected rather than
silently duplicated.

Duplicate detection uses one canonical signature across studio, review and persistence paths:
patient + normalized membership + procedure + normalized procedure date + insurer.

---

## 8. Security model

- Authentication and row-level security are enforced in the database; the UI never decides access.
- Roles live in a dedicated `user_roles` table and are resolved through security-definer helpers.
- Superuser and administrator roles receive the complete permission catalogue.
- Privileged user administration is performed through the server-side `admin-user-action` function.
- Financial and privileged changes are auditable.

---

## 9. AI layer

`src/modules/ai` keeps the application provider-agnostic. Model calls are performed server-side so
provider credentials never reach the browser. The layer supports claims analysis, rejection
explanation, trend identification, forecasting, settlement prediction, management recommendations
and duplicate scrutiny.

---

## 10. Data management

- Bulk import supports CSV/Excel workflows for diagnosis codes, cost items and insurance workbooks.
- Duplicate detection rejects identical rows and records them in the Duplicate Audit view.
- Postgres full-text search powers master/catalog search where configured.
- Reports and schedules export to PDF and Excel, or print directly.

---

## 11. Responsive and mobile behavior

The application shell, dashboard cards, charts, dialogs, tables and Pre-Authorization Studio are
built with narrow-screen constraints in mind. Tables retain their data integrity through contained
horizontal scrolling rather than forcing the whole page wider than the viewport. Charge entry in
Pre-Authorization Studio switches to stacked mobile cards below the desktop table breakpoint.

The Aidah floating assistant also scales down on mobile to preserve usable content width while
retaining a larger desktop touch target.

---

## 12. GitHub Pages routing

The production Pages build uses `/careflow-hub/` as its base path. GitHub Pages receives a copy of
`dist/index.html` as `dist/404.html` so direct navigation or browser refreshes on routes such as
`/careflow-hub/users` are returned to the SPA and then resolved by React Router. The deployment
workflow explicitly verifies that both files remain identical before publishing the artifact.

If a browser still shows a 404 for `/careflow-hub/users`, first confirm that the latest `main`
workflow deployment completed successfully; an older Pages artifact will not contain the SPA
fallback even though the repository workflow now generates and verifies it.

---

## 13. Validation gate

Before treating a change as ready for production review, run:

```sh
npm run lint
npx tsc --noEmit --pretty false
npm test
npm run build
npm run build && cp dist/index.html dist/404.html && npm run verify:pages
```

The final command verifies the GitHub Pages fallback in addition to the normal build. Database
migrations should be applied only against the intended CareFlow Hub Supabase project; never point
the deployment workflow at an unrelated project.

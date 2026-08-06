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
| Frontend | React 18, TypeScript 5, Vite 5 |
| Styling | Tailwind CSS v3 + shadcn/ui, semantic HSL design tokens |
| Charts | Recharts |
| Backend | Lovable Cloud (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| AI | Lovable AI Gateway via server-side edge functions (provider-agnostic layer) |
| Exports | jsPDF / PDF helpers and XLSX for Excel |
| Tests | Vitest + Playwright |

---

## 2. Getting started

```sh
npm i          # install dependencies
npm run dev    # start the dev server (http://localhost:8080)
npm run build  # production build
npx vitest run # run the test suite
```

Environment variables for the backend client are generated automatically and must not be edited
by hand (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`).

---

## 3. Project structure

```text
src/
├── App.tsx                     Application shell + route registry
├── App.css                     Global shell chrome (scrollbars, print rules, animations)
├── index.css                   Design tokens (light/dark) and component utility classes
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        Sidebar + header + responsive mobile drawer
│   │   ├── Sidebar.tsx         Grouped, permission-aware navigation
│   │   ├── Header.tsx          Search, theme switcher, notifications, user menu
│   │   ├── Breadcrumbs.tsx     Route-derived breadcrumb trail
│   │   ├── NotificationsPopover.tsx
│   │   └── UserMenu.tsx        Profile, settings, audit trail, sign out
│   │
│   ├── dashboard/
│   │   ├── KPICard.tsx         Executive KPI tile (tone, trend, progress, drill-down)
│   │   ├── ChartCard.tsx       Chart/section container with title + action slot
│   │   ├── InsightCard.tsx     AI / analytical insight tile
│   │   └── StatCard.tsx        Legacy compact stat tile
│   │
│   ├── preauth/                Authorization request form and cost builder
│   ├── shared/                 Filters, sorting, bulk import, entity dialogs
│   └── ui/                     shadcn/ui primitives
│
├── modules/                    Domain layer (framework-free, testable, reusable)
│   ├── claims/                 InsuranceCompany + ClaimsSummary models, aggregation
│   ├── authorization/          Authorization states, transitions, cost-builder maths
│   ├── analytics/              KPI calculators, trend series, insurer ranking, insights
│   ├── ai/                     Provider-agnostic AI layer (gemini / openai / local-model)
│   └── security/               RBAC roles, permission matrix, usePermissions hook
│
├── pages/                      One screen per route
├── hooks/                      Data fetching, full-text search, toasts, responsiveness
├── lib/                        Export utilities, dedup checks, full-text search helpers
└── integrations/supabase/      Auto-generated backend client and types (do not edit)

supabase/functions/
├── chat/                       AI chat / insights endpoint
├── ai-dedup-check/             Real-time duplicate scrutiny for master data
├── send-preauth-email/         SMTP delivery of authorization PDFs
└── admin-user-action/          Password reset / account deletion (admin only)
```

---

## 4. Navigation map

| Group | Screens |
| --- | --- |
| **Dashboard** | CareFlow Hub executive dashboard (`/`) |
| **Claims Intelligence** | Monthly Claims Entry, Insurance Companies, Claims Schedule, Settlement Tracking, Outstanding, Rejections, Withholding Tax, Bulk Import, Duplicate Audit, Reports, General Ledger |
| **Pre-Authorization** | Authorization Requests, Patients / Clients, Doctors, Procedures, Procedure Templates, Cost Builder Items, Diagnosis Master |
| **Analytics** | Performance Analytics, Revenue & Trends, Provider Performance, Insurer Scorecard, Service Lines, Fraud Alerts, AI Insights |
| **Administration** | Users & Roles, Audit Logs, Messages, Notifications, Settings |

Menu entries are filtered by the signed-in user's permissions, so each role only sees what it can use.

---

## 5. Executive dashboard

KPI cards: Total Claims Submitted, Total Payments Received, Outstanding Balance, Rejected Amount,
Rejection Rate, Collection Rate, Average Settlement Period, and open Pre-Authorizations.

Analytics sections: claims submission trend, payment collection trend, outstanding balance trend,
rejection trend analysis, claim status distribution, insurance company performance chart, and an
insurer performance ranking table.

AI insight panel: deterministic insights are always computed locally (outstanding movement,
receivables concentration, rejection exposure, revenue forecast, settlement prediction) and an
**Ask AI** action enriches them with management recommendations through the AI layer.

---

## 6. Business rules

- **Outstanding** = (Submitted − Rejected) − Payments − Withholding Tax
- **Rejection Rate** = Rejected ÷ Gross Submitted × 100
- **Collection Rate** = Payments ÷ Gross Submitted × 100
- **Recovery Rate** = Payments ÷ Net Submitted × 100
- **Average Settlement Period** = mean days between `submitted_at` and `paid_at`
- Claims and Pre-Authorization are strictly decoupled: the claims side handles **aggregate totals
  only** and never stores individual patient data.
- The general ledger uses double-entry postings in `ledger_entries`.

---

## 7. Pre-authorization workflow

```text
Draft ──► Pending Approval ──► Approved ──► Completed
                 └──► Rejected ──► Draft
```

Every transition writes an immutable versioned snapshot (`preauth_versions`) with editor, timestamp
and change note, plus an audit log entry. Approved requests can be emailed to the insurer with the
generated PDF attached; each attempt is recorded in `preauth_email_log` and shown on the request
timeline. Cost builder rows recalculate line amounts and the grand total automatically, and
procedure templates load a full cost structure in one click.

---

## 8. Security model

- Authentication and row-level security are enforced in the database; the UI never decides access.
- Roles live in a dedicated `user_roles` table (never on profiles) and are resolved by the
  `has_role` security-definer function.
- `src/modules/security` maps roles to UI capabilities:

| Role | Capability summary |
| --- | --- |
| Superuser / Administrator | Full access |
| Claims Manager / Officer | Claims, pre-authorization (incl. approval), master data, reports |
| Finance Officer | Payments, ledger, reports, analytics |
| Data Entry Officer | Claims and pre-authorization data capture, master data |
| Auditor | Read-only across operations plus audit logs |
| Viewer | Read-only operational views |

- All DML on financial tables is captured by `audit_trigger_fn` into `audit_logs` with old and new
  values, surfaced on the Audit Logs screen.

---

## 9. AI layer

`src/modules/ai` keeps the application provider-agnostic:

```text
modules/ai/
├── providers/  gemini.ts | openai.ts | local-model.ts
├── services/   claims-analysis.ts | forecast.ts | insights.ts
├── index.ts    provider registry + setAIProvider()
└── types.ts    AIProvider / AICompletionRequest contracts
```

All model calls run server-side in edge functions, so no API key ever reaches the browser. The AI
layer powers claims performance analysis, rejection explanation, trend identification, revenue
forecasting, outstanding prediction, settlement prediction, management recommendations, and
real-time duplicate detection during data imports.

---

## 10. Data management

- Bulk import with CSV/Excel templates for diagnosis codes, cost items, and multi-sheet insurance
  workbooks (each year sheet is routed to the correct insurer, with prompts to create missing ones).
- Duplicate detection rejects identical rows and records them in the Duplicate Audit view.
- Postgres full-text search (GIN indexes) powers every master/catalog search box via
  `useMasterSearch`.
- Reports and schedules export to PDF and Excel, or print directly without downloading.

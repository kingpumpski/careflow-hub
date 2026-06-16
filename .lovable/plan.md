## MedClaims Enterprise Expansion — Phased Plan

This plan maps the 28-module vision to what's **already built** vs. **net-new** in this project, then sequences the additions so each phase ships a working slice. Modules that don't fit a Ghana medical-claims back-office (e.g. patient EHR, premium collection, SSO/SAML, device tracking) are intentionally excluded — flagged below.

---

### Current state (already in the app)

| Vision module | Status |
|---|---|
| 1. Admin & Security | ✅ Auth, roles (RBAC), audit_logs, settings, logo upload, backups |
| 2. Eligibility & Authorization | ✅ Pre-authorization + catalog items |
| 3. Claims Preparation | ✅ Claims entry, diagnosis codes, procedures |
| 4. Claims Submission | ⚠️ Manual entry only (no e-submission to NHIA — out of scope) |
| 5. Claims Lifecycle | ⚠️ Basic status; needs full lifecycle states |
| 6. Denials / Rejections | ✅ Rejections page (needs categorization + appeals) |
| 8. Liability (Outstanding) | ✅ Outstanding page |
| 9. Reconciliation | ⚠️ Payments page exists; needs underpayment detection |
| 19. Compliance / Audit | ✅ Audit Trail |
| 20. AI Engine | ✅ Chat assistant (needs forecasting tools) |
| 27. Executive Dashboard | ⚠️ Basic dashboard exists |

---

### Phase 1 — Core Operations hardening *(this batch)*

Goal: tighten what exists; no big new surface area.

1. **Claims Lifecycle expansion** — extend `claims.status` enum to: draft, verified, submitted, under_review, queried, approved, partially_approved, rejected, paid, reconciled, closed. Update Claims page UI + status badges + audit.
2. **Denial categorization** — add `denial_category`, `denial_reason`, `root_cause`, `appeal_status`, `appeal_outcome` to `rejections` schema (extend existing). Add Rejections Analysis report.
3. **Liability aging buckets** — extend Outstanding page with 30/60/90/120-day aging columns + totals.
4. **Reconciliation enhancements** — on Payments page, flag short payments (paid < expected) and duplicates; show variance.
5. **Claim Aging report** — new tab in Reports.

### Phase 2 — Compliance & Performance

6. **Provider Performance** (Module 10) — new page ranking doctors by volume, revenue, approval rate, avg cost.
7. **Claims Volume Analytics** (Module 11) — new Reports tab: daily/monthly/annual with breakdown by insurer, department, diagnosis. Recharts heat map.
8. **Turnaround Time** (Module 12) — capture `submitted_at`, `approved_at`, `paid_at` timestamps; report avg days submission→payment per insurer.
9. **Loss Ratio / Profitability** (Module 13) — Reports tab with claims-paid vs claims-submitted ratio per insurer, monthly/quarterly.
10. **Fraud Detection lite** (Module 15) — AI-assisted: flag duplicate diagnosis+patient+date, inflated charges (>3σ from procedure avg), unusually high frequency. Surface on a Fraud Alerts page.
11. **Revenue Leakage** (Module 16) — report on rejected-but-not-appealed claims + underpaid claims = recoverable revenue.

### Phase 3 — Strategic Intelligence

12. **Disease Burden Analytics** (Module 21) — top diagnoses by volume + cost; trend chart; cost-per-diagnosis.
13. **Insurer Profitability Dashboard** (Module 22) — per-insurer scorecard: revenue, paid, denial rate, avg days to pay, risk ranking.
14. **Service Line Profitability** (Module 23) — aggregate procedures by category (lab, imaging, pharmacy, surgical, OPD, IPD); revenue, cost, margin.
15. **Revenue Forecasting** (Module 25) — AI-powered: simple linear/seasonal forecast from `ledger_entries` history → monthly/quarterly projections.
16. **Executive Command Center** (Module 27) — upgrade Dashboard into a CEO view: KPI tiles for revenue, outstanding, loss ratio, recovery rate, compliance score, top risks.
17. **Board Reporting Center** (Module 28) — single button generates a multi-section PDF (executive summary + all key reports) and a PPTX export.

### Explicitly out of scope (will mention to user)

- Module 4 electronic NHIA submission API (no public NHIA endpoint)
- Module 14 contract digitization (admin-only PDFs sufficient)
- Module 17/18 staff incentive scoring (HR territory)
- Module 26 scenario simulator (heavy; can add later if requested)
- SSO/SAML, MFA, device tracking from Module 1 (Lovable Cloud auth is sufficient for now)

---

### This message scope

I'll execute **Phase 1 only** in this turn (items 1–5). Phases 2 and 3 will follow once you confirm Phase 1 is working as you expect.

**Technical details**
- Migration: extend `claims.status` check constraint, add denial fields to `rejections` (or a `claim_rejections` table — confirm if rejections live in their own table; check first), add `submitted_at` / `approved_at` / `paid_at` timestamps to `claims` for Phase 2 prep.
- New report: `src/pages/reports/RejectionAnalysis.tsx` (or new tab in Reports.tsx).
- Outstanding page: add aging-bucket computation in-memory from `claims.created_at` / `claims.claim_date`.
- Payments page: add variance column + duplicate-detection badge.
- All new tables get GRANTs + RLS per project standards.
- Audit triggers already cover new columns automatically.

Reply **approve** to ship Phase 1, or tell me what to add/drop.

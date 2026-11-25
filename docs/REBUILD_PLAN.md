# KPK Election Management System — Rebuild Plan

## Objective
Rebuild the existing KPK Local Government Election Management System as a maintainable multi-page web application backed by Supabase PostgreSQL. Preserve the existing operational pages, terminology, workflows, election rules, calculations, print formats, and exports. Do not replace the application with a generic dashboard.

## Existing application baseline
The legacy application contains these page groups and screens:

### Core and administration
- Master Dashboard
- Settings & Rules
- Upload New District
- Download Templates
- About / Guide
- Checks (validation)
- Problems list
- Backup & Restore
- Full Workbook Export

### District data and geography
- DATA (Census Blocks)
- Tehsils
- Councils (NC/VC)
- Blocks (unique)
- Staff Stations
- Stations
- Tehsil Summary
- Tehsil Export

### Staff, duty and deployment
- Staff Data
- Staffing Demand
- Auto Assignments
- Manual Duty Adjustment
- Form-I — List of Polling Staff
- Form-II — Appointment Orders
- Emergency / Reserve Staff
- Unassigned Staff
- Staff Assignment Format
- Staffing Gap Analysis
- Vacant Posts
- Vacant Stations
- Cross-Tehsil Flow
- Cross-Tehsil Assignments
- Tehsil Duty Summary

### Training
- Master Trainers
- Training Venues
- Staff Training Register
- Training Batches
- Training Attendance
- Training Dashboard
- Training Shortage Report
- Batches Detail Summary
- Training Plan — Presiding & Sr APO
- Training Plan — APO & PO
- Pairs — Presiding & Sr APO
- Pairs — APO & PO
- Presiding/Sr APO Male and Female Batch Lists
- APO/PO Male and Female Batch Lists

### Forms and logistics
- Form-III (Council)
- Form-III Per Station
- Proforma-A (Mayor/Chairman)
- Proforma-B (5 Categories)
- Packing-Data
- Packing-Invoice

The above inventory is taken from the existing application source. During implementation, each page's controls, columns, filters, actions, calculations and print layout must be audited against the source before it is rebuilt.

## Target architecture
- Frontend: React + TypeScript + Vite, with a responsive multi-page application and reusable components.
- Hosting: GitHub Pages (static frontend).
- Backend/database: Supabase Auth + PostgreSQL.
- Data access: typed service/repository layer; no direct localStorage snapshot as the source of truth.
- Security: PostgreSQL Row Level Security (RLS), district-scoped memberships and roles. Never rely on frontend filters for district isolation.
- Database changes: ordered, versioned SQL migrations under `supabase/migrations/`.
- Import/recalculation: transactional PostgreSQL functions/RPCs for multi-table imports and derived calculations where appropriate.
- Realtime: subscribe only to relevant district-scoped changes; refresh authoritative data from PostgreSQL.
- Offline/local cache: optional performance cache only; never treated as authoritative cloud data.

## Data integrity requirements
1. Every operational record belongs to a district.
2. Foreign keys and composite district-aware foreign keys prevent cross-district relationships.
3. DATA upload defines polling-station and staffing demand independently of staff availability.
4. Staff upload fills demand; it must not change demand or erase training plans.
5. Re-import must explicitly support Replace Dataset and Incremental Update modes. Replace is transactional and removes stale children safely; Incremental matches stable identities and preserves omitted records.
6. CNIC exact match updates the existing staff identity. Duplicate CNIC candidates require review. Missing CNIC is flagged; never guess identity.
7. Identical imports must not create unnecessary history/audit events.
8. Preserve original source fields and source rows for traceability; flag uncertain/non-numeric BPS values rather than guessing.
9. Demand, vacancies, training seats, reserve targets, dashboards, forms and exports must derive from the same authoritative records and rules.
10. Reserve percentage is configurable (default 5%); reserve demand is separate from required polling-station posts.
11. If staff are short, keep all required training batches/seats and show vacant seats by batch, date, role and gender.
12. Prevent duplicate duty, duplicate training participation and invalid trainer/participant gender pairing according to configured rules.
13. Attendance, duty changes, removals and replacements must retain stable identities and audit history.
14. Clear All must be explicit, scoped and confirmed; global settings and district data must have separately defined deletion behavior.
15. Provide backups and tested restore procedures before production data migration.

## Existing election rules to preserve and verify
- Presiding Officer: 1 per polling station; combined stations require gender-specific demand as defined by the source rules.
- Senior APO: 1 per polling station; gender-specific demand follows station type/rules.
- APO: 3 per booth, with Senior APO treatment exactly matching the source workbook/application calculation.
- PO: 1 per booth.
- Naib Qasid: 1 per station.
- BPS eligibility and allocation priority must match the existing application and Settings & Rules.
- Presiding/Sr APO training precedes APO/PO training.
- APO and PO participants are grouped together where the existing settings specify combined batches.
- Male and female training groups run separately; trainers must match participant gender.
- Batch counts and schedules are based on required demand and configured capacity, not only the number of staff currently available.
- Existing user-approved allocation, shortfall, reserve and cross-tehsil rules must be captured as automated tests before porting.

## Security and deployment
- Public GitHub repository must contain no Supabase service-role key, database password, private tokens, or personal staff data.
- Browser receives only the Supabase project URL and publishable/anon key; RLS is mandatory.
- Super Admin can manage districts and authorized memberships.
- District users can access only their active district memberships and permitted actions.
- GitHub Pages deploys the static frontend; Supabase hosts PostgreSQL and authentication.
- Production deployment is not complete until RLS, role isolation, import rollback, backups, and two-district concurrent-use tests pass.

## Migration and acceptance sequence
1. Audit the legacy source page-by-page; capture formulas, defaults, filters, exports and print formats.
2. Audit the current Supabase schema and applied migrations; do not assume earlier SQL scripts all succeeded.
3. Design and validate normalized schema, constraints, indexes, RLS and role permissions.
4. Build typed database access and authentication/district context.
5. Port core data and demand calculations with automated tests.
6. Port staff allocation, duty, reserve, training and attendance.
7. Port forms, logistics, dashboards, exports, backups and audit history.
8. Build safe import preview, issue reporting, incremental update and explicit replace workflows.
9. Test Kohat and Peshawar in separate districts, including stale-row removal, duplicate identity, shortage cases, gender rules, concurrent updates and cross-district access denial.
10. Deploy to GitHub Pages only after the acceptance checks pass; then migrate fresh district data with a verified backup.

## Important non-goals
- Do not silently simplify or remove legacy pages.
- Do not use a single JSON payload table as the main database.
- Do not calculate required demand from the available staff roster.
- Do not silently delete staff, attendance or history during DATA re-import.
- Do not claim a migration, SQL execution, deployment or test passed unless it was actually run and verified.

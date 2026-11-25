# Legacy application source audit — 25 November 2026

## Source inspected
- `KPK_LG_Election_System_Audited_Training_Sync_Corrected.html` (3.56 MB).
- The source contains 346 named function declarations and 312 HTML IDs in the inspected file.
- This is a source-code inventory, not a claim that every workflow has been executed or validated in a browser.

## Confirmed functional modules in source
The source includes explicit builders/renderers for:
- DATA-derived stations and demand: `buildStations`, `calcDemand`, `recalcAll`.
- Assignment and vacancies: `autoAssign`, `fillRole`, `buildVacantPosts`, `buildCrossTehsil`, `buildGapAnalysis`, `buildVacantStations`, `buildCrossAssignments`.
- Training: `generateBatches`, `buildAttendance`, `buildTrainingShortage`, `buildTrainingReport`, `buildPlanPresSrApo`, `buildPlanApoPo`, `buildPairs`, `buildBatchDetailsByCategory`.
- Manual duty: `applyManualDutyOverrides`, `renderManualDuty`, `overrideSlot`, `completeManualAppointment`.
- Imports, exports and recovery: `handleUpload`, `importRowsFromSheet`, `importValidateRecord`, `exportAllExcel`, `exportAllJSON`, `makeBackupPayload`, `restoreBackupFile`, `applyBackupPayload`.
- Relational/district prototype: `openDB`, `extractLegacy`, `writeMigrationSnapshot`, `migrateLegacy`, `persistDistrict`, `readDistrict`, `writeState`, `activateDistrict`.

## Source-derived calculation behavior that must be preserved or explicitly approved for change

### Station aggregation
`buildStations(dataRows)` groups rows by the composite key:
`Tehsil | Council Type | Council No | PS No`.
For each station it takes the maximum repeated station-level Booths Male and Booths Female values, sums voter values conditionally by station type, counts DATA rows as blocks, and creates both tehsil-continuous and council-local station numbers.

### Demand calculation
The current `calcDemand(stations)` function calculates:
- Presiding: one male for Male or Combined stations; one female for Female stations.
- Senior APO: same gender pattern as Presiding.
- Male APO: `max(0, 3 × male booths − 1)` for Male or Combined stations.
- Female APO: `max(0, 3 × female booths − 1)` for Female stations; for Combined stations it is `3 × female booths` (no subtraction).
- PO: one per booth, by booth gender, for applicable station types.
- Naib Qasid: explicitly set to zero and excluded from total demand.
- Total demand is the sum of those eight role/gender fields.

This is the actual current source formula. Do not replace it with a generic rule such as 3 APO per booth without confirming the exception and the user-approved election rule. It is a priority for test cases and owner sign-off.

### Assignment
`fillRole` makes two passes: home-tehsil staff first, then cross-tehsil staff. It loops each station and both genders, calculates role/gender need from demand, and only selects available staff matching the requested gender and configured BPS eligibility through `getAvailable`. The function does not intentionally substitute the opposite gender.

### Training batch generation
`generateBatches`:
- Normalizes participant role and gender.
- Uses CNIC as the preferred person identity; otherwise mobile; otherwise a fallback of name + gender + designation.
- Avoids reusing a person within the generation run.
- Filters trainers by gender, availability and training category.
- Filters venues by gender, availability, room, session and capacity.
- Uses a calendar that excludes Sundays unless `include_sunday` is true.
- Treats venue date restrictions as removed; the training calendar controls dates.
- Generates batches from assignments passed into it. This needs careful comparison with the demand-first requirement: required batch seats must not shrink merely because the available roster is short.

## Important implementation risks found
1. **Snapshot serialization is not a normalized operational database.** The legacy application writes multiple arrays and settings into one browser-storage payload. The rebuild must map every section to relational tables and retain import/export compatibility.
2. **Upload behavior is replacement-oriented in this source version.** DATA upload assigns `state.data = rows`; staff upload assigns `state.staff = rows`; trainer and venue uploads replace their respective arrays. This does not implement the requested incremental CNIC merge semantics. The rebuild must introduce explicit Incremental Update and Replace Dataset modes.
3. **Backup restore is destructive to current in-memory state.** `applyBackupPayload` replaces data, staff, trainers, venues, settings, training settings, rules, tehsil map and attendance from the backup payload before recalculation. Cloud restore must be transactional, previewed and district-scoped.
4. **Training batch inputs require a demand-first redesign.** Existing `generateBatches(assignments,...)` takes assignments as its participant input. The new engine must create the required seat/batch structure from demand and capacity first, then attach available staff, leaving vacancies visible.
5. **Legacy staff identity fallback is weaker than CNIC.** The training generator falls back to mobile or name/gender/designation. These are useful for duplicate detection only; they must not silently merge staff identities.
6. **Naib Qasid is not currently part of calculated demand.** Do not silently reintroduce it. Treat as a documented rule requiring explicit decision if policy differs.
7. **Combined-station gender formulas are asymmetric in APO calculation.** This is exactly what the source does; validate against source workbooks and user-approved rules before changing.
8. **The old relational prototype and cloud-connected variants are not proof of a completed cloud migration.** Verify each table, trigger, RLS policy and frontend read/write path independently.

## Required acceptance tests before production
- Station aggregation with repeated census-block rows; Booth counts use MAX rather than SUM.
- Correct station identity across tehsil/council/PS number and independent tehsil/council numbering.
- Male, Female and Combined demand fixtures, including zero booths and multiple booths.
- APO asymmetry in Combined station fixtures is explicitly captured and signed off.
- Staff shortage does not reduce demand or required batch count.
- Opposite-gender staff never fills a vacancy.
- Home-tehsil allocation precedes cross-tehsil allocation.
- CNIC incremental update preserves stable staff ID; duplicate CNIC is flagged; missing CNIC is not guessed.
- Staff re-upload does not erase trainers, venues, attendance or manual duty history.
- Trainer gender/category and room gender/capacity/session conflicts are rejected or surfaced.
- Sunday scheduling matches the include-Sunday setting.
- Attendance survives batch regeneration and participant replacement by stable identity.
- Restore preview, transaction rollback, district isolation and audit log are verified.
- Every report/form/export reconciles to the same canonical records and calculations.

## Current completion status
- Source code inventory and key calculation paths inspected.
- Supabase read-only audit completed separately.
- Authoritative Kohat backup verified separately and confirmed by the user.
- No production database migration, destructive import, policy change or deployment has been performed.
- This audit is an implementation input, not a finished application.

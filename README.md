# KPK Election Management System

First-release browser application for district DATA import, polling-station aggregation and demand calculation.

## Run locally
- Install Node.js 22+
- Run `npm install`
- Run `npm run dev`

## Build
- Run `npm run build`
- Run `npm run test:domain`

## Current first-release scope
- Excel/CSV import (first worksheet)
- Local browser persistence
- Polling-station aggregation from imported DATA
- Male/Female role-wise staffing demand
- Local JSON backup export

## Important limitations
This first release is local-browser mode. It does not yet provide cloud authentication, multi-user synchronization, complete staff assignment, training, attendance, official forms, or production-ready role security. Verify all calculations and imported data before official operational use.
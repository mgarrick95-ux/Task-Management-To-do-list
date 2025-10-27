# Chaos Control — Smart Scheduler v4 (Static)

A zero‑build, GitHub Pages–friendly app. Upload these files to your repo root and push to **main**.

**Included features**
- Recurring tasks (daily • weekdays • weekly • monthly-by-date) with optional end date
- Flexible vs Fixed (fixed stays pinned; missed items roll forward as **Rescheduled**)
- Capacity warning; day stats show **Scheduled** / **Free** in hours:minutes
- Reminders list (overdue or soon + high-priority)
- Search, export/import (JSON)
- “Clear inputs” vs “Clear entire schedule”
- Gold star + quip (and chime) when today is fully complete

**Local storage keys**
- `cc_tasks_v40`, `cc_settings_v40`

**Deploy on GitHub Pages**
- Keep the provided `.github/workflows/deploy.yml`
- Commit to `main`; Actions publishes automatically

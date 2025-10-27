# Chaos Control — Smart Scheduler v3. 

A beautifully unhinged productivity app with flexible scheduling, pinned days, Alberta holiday awareness, search, duplicate detection, and a gold-star reward system that talks back.

Live anywhere: this build is static (React via CDN + Babel), so you can host it on GitHub Pages with zero tooling.

## 🚀 Setup (GitHub Pages)
1) Upload all files in this ZIP to your repository root (replacing older files).
2) Commit to main. Your GitHub Pages workflow will redeploy.
3) Open your Pages URL — you’re live.

## 🧭 Features
- Calm Add Task bar (always visible, expands gently on focus)
- Duration in hours + minutes
- Flexible windows: Today / Next 2 days / This week / By date
- Fixed date + optional time (or Pinned day with float time)
- Auto-scheduler (respects windows, daily capacity, and holidays)
- Missed-task handling (pinned & fixed move forward, flagged as “Missed” with original info)
- High priority = bold red everywhere
- Alberta stat holidays auto-blocked
- Auto-scroll to Today on load
- Day & Week navigation + date picker
- Smart Search (title, priority, status, dates, “missed”, etc.)
- Duplicate detection (file numbers/keywords + same day)
- Gold Star + Smart‑Ass messages when you clear your day
- Export .ics calendar file (import to phone)
- Light/Dark dual-tone color system (pastels in light, rich hues in dark)

## 🔎 Search tips
- `high` → all high priority
- `missed` → missed tasks
- `done` → completed tasks
- `unscheduled` → only unscheduled list
- `Oct 23` → jump contextually to that date
- `36013` → find file/case/task family

## 🧱 Notes
- This build is fully client-side (no backend). All data lives in your browser’s storage.
- Holidays are computed for current and next year; you can extend in `index.html` if you like.

Built with love, caffeine, and questionable time‑management skills.

✨ **Chaos Control Smart Scheduler** —  
for **dysfunctional adults managing total chaos.**

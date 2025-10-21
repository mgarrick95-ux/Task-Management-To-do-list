# Auto‑Scheduling To‑Do App (GitHub Pages Ready)

## Local dev
```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (recommended: GitHub Actions)
1. Commit and push to branch `main`.
2. Go to **Settings → Pages** and set:
   - Source: **GitHub Actions** (not "Deploy from branch").
3. Push any change to `main`—the included workflow builds `dist/` and publishes it to Pages.
4. Your site appears at `https://<username>.github.io/<repo>/`.

Notes:
- `vite.config.js` uses `base: './'` so assets work on subpaths.
- `404.html` redirects to `index.html` for SPA routing fallback.

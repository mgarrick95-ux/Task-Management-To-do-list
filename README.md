# Auto‑Scheduling To‑Do App (GitHub Pages Fixed Template)

This template is pre-configured for GitHub Pages with Vite + React + Tailwind.

## Local dev
```bash
npm install
npm run dev
```

## Deploy (GitHub Pages via Actions)
1. Push this folder to a repo with default branch `main`.
2. In GitHub → **Settings → Pages**: set **Source = GitHub Actions**.
3. Push any change to `main` and watch the **Actions** tab. It will build `dist/` and publish.
4. Your site will appear at `https://<username>.github.io/<repo>/`.

If you still see 404s on assets, set `base: '/<repo>/'` inside `vite.config.js`.

# GitHub Pages Fix Patch

This patch adds:
- `vite.config.js` with the correct `base` for GitHub Pages
- a GitHub Actions workflow that builds the app and deploys `dist/` to Pages automatically

## How to use
1. **Download this ZIP** and unzip into your repo root (same folder as `package.json`).  
   - If prompted, **allow overwriting** existing files.
2. Commit & push:
   ```bash
   git add .
   git commit -m "Fix: GH Pages base + deploy workflow"
   git push
   ```
3. In GitHub:
   - Go to **Settings → Pages**  
   - Set **Source = GitHub Actions** (not "Deploy from branch").
4. Wait for the workflow to finish (1–2 min), then open your site:
   `https://mgarrick95-ux.github.io/Task-Management-To-do-list/`

> If your repo name changes, edit `vite.config.js` and update the `base: '/<your-repo>/'` value.

# Plan: Run Lingo Dungeon on GitHub Pages

Goal: make the game work as a purely static site (no Flask, no SQLite, no droplet) and publish it on GitHub Pages at lingodungeon.com.

Status: **code done and tested on the `github-pages` branch; not yet committed or pushed.** The remaining steps (push, repo Pages settings, Wix DNS) are in [Remaining steps](#remaining-steps).

---

## Decisions (made 2026-11-16)

1. **Leaderboard:** removed.
2. **Name screen:** kept, as local profiles. Each name has its own progress in the browser. LOGOUT returns to the name screen.
3. **Web address:** lingodungeon.com, using DNS records in Wix. The build also works at `raiidahmed.github.io/lingo_pkmn/`.
4. **Flask backend:** deleted from the branch. The previous version is tagged `flask-backend`.

---

## What changes for players

| Feature | Before (droplet) | Now (GitHub Pages) |
|---|---|---|
| Name / login | Server account, works on any device | Local profile in this browser |
| Save and resume | Server | Browser storage |
| Level checkmarks | Server | Browser storage |
| Word bank | Server | Browser storage |
| Accent color | Server (other settings already in the browser) | Browser storage |
| Leaderboard | Shared by all players | Removed |
| Debug "wipe" (tap title 5x) | Wipes every player's data on the server | Wipes this browser's progress |
| Staging site | Separate droplet service | Removed (Pages hosts one site per repo) |

**Tradeoffs:**
- Progress lives in one browser. It doesn't sync across devices, and clearing site data erases it.
- Player data from the old server isn't carried over; we don't have the droplet's database.

---

## What was built

- **`frontend/src/api.js` uses browser storage.** It keeps the same method names and response shapes as the old Flask routes, so the game screens barely changed.
  - All profiles live under one `localStorage` key, `lingo_profiles`, keyed by lowercased name.
  - `lingo_token` now just holds the signed-in profile's key, so the auto-login in `App.jsx` and the logic in `store.js` are unchanged.
  - The rules are ported from the old `backend/db.py`: names stored uppercase and matched case-insensitively, the word bank deduped by Spanish word with newest first, level completions sorted and unique, and only the best score kept.
  - If storage holds bad data, it falls back to empty instead of crashing. Names like `constructor` and `__proto__` work as ordinary profiles.
  - New `api.wipeProgress()` backs the debug wipe.
- **Leaderboard removed:** its page, its route, its buttons on the menu and game-over screens, and its CSS.
- **Image paths:** `renderer.js` and `mouseAssets.js` prefix `import.meta.env.BASE_URL`, and `vite.config.js` uses `base: './'`. One build works at a domain root and under `/lingo_pkmn/`. The app has no URL routes, so relative paths are safe and no 404 fallback page is needed.
- **Dev setup:** the `/api` proxy is gone from `vite.config.js`, and `start.sh` just runs the Vite dev server.
- **Removed:** `backend/`, `deploy/`, `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml`, and the Python entries in `.gitignore`. Removing those workflows in the same commit means the push won't try to SSH into the old droplet.
- **Added `.github/workflows/pages.yml`.** On each push to `main` it builds `frontend/` with Node 24 and deploys it with `actions/upload-pages-artifact@v5` and `actions/deploy-pages@v5`.

## Verification done

- **Storage logic, tested in Node** with a fake `localStorage`:
  - login validation and response shapes
  - word bank dedupe and order
  - level completion
  - save, resume and clearing the save
  - theme validation
  - best score only ever going up
  - separate profiles, and case-insensitive names
  - names like `constructor`, `__proto__` and `null`
  - stale tokens from the old server
  - corrupt storage
  - the debug wipe
- **Built site, played in headless Chrome** at a root URL and under `/lingo_pkmn/`. All checks passed at both:
  - login, menu, no leaderboard button
  - level 1 renders, with all textures and sprites loading from the right path
  - moving, then QUIT, saves a snapshot
  - after a reload you're still signed in, and RESUME works
  - the accent color is saved
  - a second name gets a fresh profile, and the first name keeps its progress
  - the debug wipe works
  - no console errors and no failed requests, except the browser's automatic `/favicon.ico` request; the project has never had a favicon

---

## Remaining steps

1. **Commit, push the branch and the `flask-backend` tag.** Needs your OK.
2. **Switch the repo's Pages source** from "main branch, root" (legacy, serving raw repo files) to "GitHub Actions". Needs your OK. If my token lacks permission, do it in Settings → Pages → Build and deployment → Source.
3. **Merge `github-pages` into `main` and push.** That triggers the first deploy. Check `https://raiidahmed.github.io/lingo_pkmn/`.
4. **Set the custom domain** to `lingodungeon.com` in Settings → Pages. After this, the github.io address redirects to lingodungeon.com.
5. **Change DNS in Wix** (you): Domains → ⋯ (Domain Actions) next to lingodungeon.com → Manage DNS Records.
   - **A (Host)** for the root domain, four records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`. Delete the existing Wix A records.
   - **CNAME (Aliases)**: set `www` to `raiidahmed.github.io`, replacing the current one that points at Wix.
   - Don't leave any other A, AAAA or CNAME records on the root or `www`, or GitHub's HTTPS certificate may not be issued.
6. **Once DNS has updated** (often within an hour; Wix says up to 72), tick "Enforce HTTPS" in Settings → Pages. Then repeat the play-through on lingodungeon.com.

## Out of scope (unless you want them)
- Renaming leftover "Lingo SMT" text (page title, menu header) to "Lingo Dungeon".
- Adding a favicon.
- Export/import of progress, so players can move it between devices.
- Deleting the old droplet, its GitHub secrets, or the `staging` branch.

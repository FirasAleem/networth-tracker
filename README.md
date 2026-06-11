# Net Worth Tracker

A self-hosted personal net worth dashboard with live stock prices, allocation
pie chart, holdings P&L (including free shares), editable cash/bank accounts with
pending amounts, net-worth history, and CSV transaction import/export.

Everything is in **SAR (⃁)** using the official Saudi Riyal symbol. USD holdings
(SAHM, Abyan) are converted at a 3.75 factor.

Runs entirely on **port 2307**, no internet exposure required (only outbound calls
to Yahoo Finance for live prices).

---

## Quick start (Docker — what you'll run on your server)

1. Copy the whole `networth-tracker/` folder to your server.

2. From inside the folder, build and start:

   ```bash
   docker compose up -d --build
   ```

3. Open it in your browser:

   ```
   http://<your-server-ip>:2307
   ```

That's it. The app builds, seeds your initial portfolio + transaction history
(from the CSVs in `seed/`), and starts serving on 2307.

### Day-to-day commands

```bash
docker compose logs -f          # watch logs
docker compose restart          # restart after a config change
docker compose down             # stop and remove the container
docker compose up -d --build    # rebuild after pulling new code
```

---

## Data & persistence

- All data lives in a single SQLite file at `./data/networth.db` on the host,
  mounted into the container. It **survives restarts, rebuilds, and `down`/`up`**.
- To start completely fresh, stop the app and delete the DB:

  ```bash
  docker compose down
  rm -f data/networth.db*
  docker compose up -d
  ```

  On an empty database the app re-seeds:
  - **Holdings** and **cash accounts** — from `server/seed-data.js`
  - **Transactions** — imported from every `.csv` in `seed/`

- To back up, just copy `data/networth.db` somewhere safe.

---

## Your data is kept out of git

The repo is safe to make **public**. Your real figures live in files that are
**gitignored** (committed samples sit next to them):

| Real data (gitignored)        | Committed sample              |
| ----------------------------- | ----------------------------- |
| `server/seed-data.js`         | `server/seed-data.example.js` |
| `seed/*.csv`                  | `seed/example.csv.sample`     |
| `data/networth.db`            | —                             |

On a fresh DB the app seeds from `seed-data.js` if it exists, otherwise from the
example. So a public clone comes up with harmless sample data; your machine and
server keep the real files locally.

**Edit your portfolio:** change `server/seed-data.js` (cash + holdings), swap the
CSVs in `seed/`, then reset the DB (see above) to re-seed.

> Deploying to your server: the gitignore only affects git, not your disk. Copy
> the whole folder (e.g. `rsync`/`scp`) so `seed-data.js`, the CSVs, and/or an
> existing `data/networth.db` come along — then `docker compose up -d --build`.

---

## Using the app

- **Dashboard** — big net-worth number; cash / investments / holdings cards; an
  allocation pie; a **balance-history chart already populated from your CSVs**
  with a time-range selector (1D…Max) that also shows the period P&L; and a
  **holdings list** with live value and P&L per position.
- **Copy to Notes** (top-right) — copies a plain-text snapshot in the original
  notes format (`x=… y=… 100x+y+z+3.75(s+a) = total`), regenerated from live
  data. The eye icon previews exactly what will be copied. Works over plain http
  on a LAN (falls back to `execCommand` when the Clipboard API is unavailable).
- **Holdings** — add/edit/delete positions. Live price, market value, and P&L
  update every 60s. Pick currency (USD auto-converts to SAR). Free shares (cost 0)
  show a **FREE** badge and **∞%** return.
- **Cash & Bank** — edit balances inline. The second field is a *pending* amount
  that's subtracted from your net worth (e.g. money you owe a friend).
- **Transactions** — toggle between **Combined / Bank / Cash** to filter both the
  history chart and the list. Add manually, **Import CSV** (choose which account to
  tag it as), or **Export CSV**.

The Riyal glyph is an SVG, but a real Unicode Riyal Sign (`⃁`) rides along hidden
next to it, so copying an amount copies a currency character too.

---

## Sync & deploy (two repos)

The setup is split across **two git repos**, and — by design — each one only ever
changes from one place:

| Repo | Visibility | Holds | You change it on | Flows to |
| ---- | ---------- | ----- | ---------------- | -------- |
| `networth-tracker` | public  | the code | your **Mac** | → the server |
| `networth-data`    | private | the live `networth.db` | the **server** | → your Mac / anywhere |

The private data repo is cloned **into `./data/`** (which the public repo
gitignores), so the app reads `data/networth.db` with zero extra config and
Docker's `./data` bind-mount keeps working.

**Why one-directional?** Code is only ever written on the Mac; the live DB is
only ever written by the running app on the server. So nothing is ever edited in
two places at once — no merge conflicts, no "which copy is newest." (`sql.js`
loads the DB into memory at startup, so you must never `git pull` data into a
*running* server — it'd be ignored and then overwritten. The server only ever
**pushes** its data.)

### Code: edit on Mac → deploy on server

```bash
# Mac
git push

# server
cd ~/docker/networth-tracker
git pull && docker compose up -d --build      # or: ./deploy.sh
```

### Data: snapshot on the server

```bash
# server, in an SSH session with your agent forwarded (signing needs the key)
~/docker/networth-tracker/backup.sh
```

Commits are signed → they show **Verified** on GitHub. (One-time signing setup:
`gpg.format=ssh`, `commit.gpgsign=true`, `user.signingkey` pointing at a pubkey
file made from the forwarded agent, plus the key added to GitHub as a **Signing
Key**.)

### Full restore — any machine, anywhere, two clones

```bash
git clone git@github.com:FirasAleem/networth-tracker.git
cd networth-tracker
git clone git@github.com:FirasAleem/networth-data.git data
docker compose up -d --build
```

Everything comes back exactly as it was — code from the public repo, your live DB
from the private one.

---

## Local development (optional)

```bash
npm install
npm run dev      # Vite on :5173 (proxies /api to the backend on :2307)
```

For a production-style run without Docker:

```bash
npm run build
npm start         # serves the built app + API on :2307
```

---

## Notes

- Live prices come from Yahoo Finance's public chart endpoint (no API key).
  Aramco uses the Tadawul ticker `2222.SR`. Fetches are **gated by market hours**
  — refreshed every 60s while a ticker's market is open (Tadawul for `.SR`, US
  hours otherwise), and backed off to every 6h when closed, so it doesn't poll
  overnight or on weekends.
- The USD→SAR rate (3.75) is set in `server/index.js` as `USD_TO_SAR`.
- Change the port by editing `docker-compose.yml` (`"2307:2307"`) and the
  `PORT` env var.

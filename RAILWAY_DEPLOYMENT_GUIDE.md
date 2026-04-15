# Pool Visualizer API — Railway Deployment Guide

This guide walks you through deploying the `pool-visualizer-api` repository to Railway and connecting client-side widgets to the live API.

---

## 1) Sign up for Railway

1. Go to **https://railway.app**
2. Click **Start a New Project** (or **Login** if you already have an account)
3. Authenticate with GitHub (recommended), Google, or email

---

## 2) Deploy from the GitHub repository

Repository:
- **https://github.com/creativekingsproductions52-lab/pool-visualizer-api**

Steps:
1. In Railway dashboard, click **New Project**
2. Click **Deploy from GitHub repo**
3. Select `creativekingsproductions52-lab/pool-visualizer-api`
4. If prompted, authorize Railway to access your GitHub repos
5. Railway should auto-detect this as a Node.js app
6. Confirm deployment

Railway will run install + start based on your `package.json`:
- install: `npm install`
- start: `npm start` (which runs `node server.js`)

---

## 3) Add required environment variables

In Railway:
1. Open your service
2. Go to **Variables** tab
3. Add the following keys exactly:

| Variable | Value to set |
|---|---|
| `GOOGLE_API_KEY` | Use the exact value from your local `.env` |
| `OPENROUTER_API_KEY` | Use the exact value from your local `.env` |
| `PORT` | `3001` |

Important:
- Do **not** commit `.env` to GitHub
- Paste the key values directly into Railway Variables UI
- After saving variables, trigger a redeploy (Railway usually redeploys automatically)

---

## 4) Access deployment logs

To view runtime logs:
1. Open your Railway project/service
2. Click the latest deployment
3. Open **Logs**
4. Watch for startup message similar to:
   - `Pool Visualizer API running on port 3001`
5. For request-level debugging, monitor logs while calling endpoints

What to look for during `/api/visualize` requests:
- `[1/7] Geocoding...`
- `[2/7] Fetching satellite map...`
- ... through `[7/7] Generating cinematic video...`

---

## 5) Get the public URL

1. Open the Railway service
2. Go to **Settings** (or **Networking** depending on UI version)
3. Find the generated domain under **Public Domain**
4. It will look like:
   - `https://<your-service>.up.railway.app`

Build endpoint URLs:
- Health: `https://<your-service>.up.railway.app/api/health`
- Visualize: `https://<your-service>.up.railway.app/api/visualize`
- Widget script: `https://<your-service>.up.railway.app/widget/pool-visualizer-widget.js`

---

## 6) Update widget on client sites to use the new public URL

You can wire the API in either of these ways:

### Option A (recommended): set `data-api` per embed

```html
<div
  data-pool-visualizer
  data-title="Pool Visualizer"
  data-color="#3b82f6"
  data-api="https://<your-service>.up.railway.app/api/visualize"
></div>

<script src="https://<your-service>.up.railway.app/widget/pool-visualizer-widget.js"></script>
```

### Option B: set global override before loading widget

```html
<script>
  window._PV_API_URL = 'https://<your-service>.up.railway.app/api/visualize';
</script>
<script src="https://<your-service>.up.railway.app/widget/pool-visualizer-widget.js"></script>
<div data-pool-visualizer></div>
```

### If you host widget JS separately
Make sure the API URL still points to Railway `/api/visualize`.

---

## 7) Test the deployed API once live

### A) Quick health check

```bash
curl -s https://<your-service>.up.railway.app/api/health
```

Expected response:
```json
{"status":"ok"}
```

### B) End-to-end visualize test

```bash
curl -X POST https://<your-service>.up.railway.app/api/visualize \
  -H "Content-Type: application/json" \
  -d '{"address":"1234 Elm Street, Austin TX"}'
```

Expected behavior:
- Request may take ~3–5 minutes
- JSON response with:
  - `success: true`
  - `address`
  - `satellite_image`
  - `oblique_image`
  - `edited_image`
  - `video`

### C) Browser/widget smoke test

1. Create a temporary HTML page with the widget embed snippet
2. Enter a real address
3. Confirm progress messages advance
4. Confirm final tabs show:
   - video
   - edited image
   - satellite image

### D) Failure validation checklist

If failures occur, inspect Railway logs and verify:
- `GOOGLE_API_KEY` is valid and has required Google APIs enabled
- `OPENROUTER_API_KEY` is valid and funded
- Port variable is set to `3001`
- No typo in endpoint path (`/api/visualize`)

---

## 8) Ongoing updates/deploy workflow

For future changes:
1. Push commits to the connected GitHub branch (`main`)
2. Railway auto-redeploys
3. Re-test `/api/health` and one `/api/visualize` request
4. No client-side embed change needed unless your Railway domain changes

---

## 9) Production note

`/api/visualize` is compute- and cost-heavy (Playwright + multiple model/API calls). For production scale:
- Monitor request volume
- Add rate limiting/auth before exposing broadly
- Consider queueing for concurrent loads

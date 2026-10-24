# SlixTV Dashboard & Backend Proxy

This repository contains the official **SlixTV Reseller & Device Management Dashboard**, styled with the **Hotstar theme** (Electric Blue `#1F80E0` & Deep Space Navy `#0C111B`), ready for one-click deployment on **Vercel**.

---

## Features

- **Single-Page Application (SPA)**: Modern, responsive reseller panel for managing activation codes, profiles, devices, and requests.
- **Serverless Edge API Proxy (`/api/[...slug].js`)**: Fully routed edge function that proxies requests to the backend with automated `Host` header rewrites, session cookie persistence, and universal CORS support.
- **Hotstar Theme**: Sleek, high-contrast dark UI matching the SlixTV Android app.
- **Vercel Ready**: Preconfigured with `vercel.json` rewrites and caching rules.

---

## Deployment on Vercel

1. Import this repository in [Vercel](https://vercel.com/new).
2. Framework Preset: **Other** (Root directory: `./`).
3. Click **Deploy**.

Once deployed, your live URL (e.g. `https://slixtv-backend.vercel.app`) serves both:
- **Web Dashboard**: `https://<your-domain>/dashboard`
- **Mobile App API**: `https://<your-domain>/api/v1/*`

---

## Local Development

```bash
# Start local development server on port 4000
npm start
```

Access the panel locally:
- Dashboard: [http://localhost:4000/dashboard](http://localhost:4000/dashboard)
- Login: [http://localhost:4000/login](http://localhost:4000/login)

# Nanogramics — Website + Hosted POS

Run `npm install` once, then run `npm start` from this folder (or double-click `START-PREVIEW.cmd`) and visit http://127.0.0.1:4173. Keep the preview terminal open. Node.js is required. If a preview is already running, reuse it rather than starting another copy.

Website files are in `dist/`. The local Node server serves the agency site at `/`, the browser/PWA POS at `/pos/`, and the PostgreSQL APIs at `/api/*`. The POS no longer needs Electron.

## POS inventory guarantees

- New products receive a server-generated SKU such as `NG-00100001` and a printable Code 39 barcode label.
- The POS catalog cards remain on the dashboard. Products can also be added by scanning a barcode or searching name, price, brand, category, stock quantity, or SKU.
- Counter sales and online orders deduct stock inside PostgreSQL transactions. Insufficient stock rejects the whole transaction instead of silently overselling.
- Online-order edits deduct or restore only the quantity difference; returned/deleted online orders restore stock.
- The installable PWA caches the app and catalog. Counter sales created during a connection outage are deducted locally and queued with an idempotent invoice ID for automatic server sync.

## PostgreSQL setup

1. Run `npm install`.
2. Create `.env.local` and set `DATABASE_URL`. All `.env` files are ignored by git.
3. Run `npm run db:setup` to create the database and the `project_inquiries` table.
4. Start the website with `npm start`; the server loads `.env.local` automatically.

If `DATABASE_URL` is not configured, the website still previews normally and the contact form prepares a downloadable request instead of saving to the database.

Design reference: https://axoninteractives.studio/ — Outfit typography, warm white surfaces, understated borders, black buttons, and a split hero. The content structure and software-agency positioning are informed by https://www.digitalyze.tech/ and tailored to Nanogramics' six services: SaaS, POS, ERP, website development, social media content, and graphic design.

Includes responsive navigation, a detailed Services page, a founder profile for Syed Muzammil Ali, a minimal POS hero showcase, and a separate Samples page with category filters, four real website projects, and five service concepts. Portfolio counts: one POS, one ERP, three social media, four websites. POS, ERP, and social media entries remain clearly labelled concepts. Website projects use owner-supplied screenshots; Neelo and Amra still needs its exact website URL. Sample inquiry links preselect the service and project. The form does not transmit, submit, or persist information. See `CLIENT-ASSETS.md` for the real content and contact setup needed before public launch.

Run `npm run check` for JavaScript syntax, local assets and anchor links, page heading/ID validation, service-option consistency, and portfolio-count checks.

Google Fonts serves Outfit. A sans-serif fallback works if font loading is blocked.

## Deploy on AWS

Use the included production `Dockerfile` with AWS App Runner and Amazon RDS for PostgreSQL. Full networking, secrets, health-check, and custom-domain instructions are in [AWS-DEPLOYMENT.md](AWS-DEPLOYMENT.md).

## Alternative: Deploy on Railway

1. Push this project to a GitHub repository.
2. In Railway, create a new project and choose **Deploy from GitHub repo**.
3. Add a PostgreSQL service to the same Railway project.
4. In the website service variables, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (replace `Postgres` if the database service has a different name).
5. Leave `DATABASE_SSL` unset or set it to `false` for Railway's private PostgreSQL connection.
6. Deploy, then open **Settings > Networking > Generate Domain** to get the public URL.

Railway uses `npm start`, supplies `PORT` automatically, and checks `/api/health` using the included `railway.toml` configuration. The database table is created automatically on the first database-backed request; `npm run db:setup` is optional on Railway.


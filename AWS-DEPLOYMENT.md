# Deploy Nanogramics website + POS on AWS

The website and POS now run as one browser application. `/` serves the Nanogramics website, `/pos/` serves the installable POS, and `/api/pos` connects both POS sales channels to PostgreSQL. Electron is not required.

## Recommended AWS layout

- **AWS App Runner**: builds and runs the included `Dockerfile` over HTTPS.
- **Amazon RDS for PostgreSQL**: stores products, stock, offline/counter sales, online orders, users, and reports.
- **AWS Secrets Manager or App Runner secrets**: holds database and POS secrets.

Keep App Runner and RDS in the same AWS Region. Put RDS in private subnets and allow PostgreSQL port `5432` only from the App Runner VPC connector/security group. Do not make the database public.

## Required runtime variables

```text
DATABASE_URL=postgres://USER:PASSWORD@RDS_HOST:5432/DATABASE
DATABASE_SSL=true
POS_SESSION_SECRET=at-least-32-random-characters
POS_ADMIN_USERNAME=admin
POS_ADMIN_PASSWORD=a-unique-strong-first-admin-password
NODE_ENV=production
PORT=8080
DATABASE_POOL_MAX=10
```

If the RDS certificate is enforced through the connection string/provider, keep `DATABASE_SSL=true`. Rotate `POS_ADMIN_PASSWORD` after first login by using the POS user-management screen.

## App Runner deployment

1. Push this repository to a private GitHub repository or Amazon ECR.
2. Create an RDS PostgreSQL database and an empty application database.
3. Create an App Runner service from the repository and choose the included Dockerfile.
4. Configure port `8080`, health check path `/api/health`, and the variables/secrets above.
5. Attach an App Runner VPC connector that can reach the private RDS instance.
6. Deploy and open `https://YOUR_APP_RUNNER_DOMAIN/pos/`.
7. Add a custom domain in App Runner. Point the supplied DNS validation/alias records from Route 53 or the domain's DNS provider.

The schema is created idempotently on the first API request. App Runner should run at least one warm instance for a checkout that must be continuously available.

## Local container verification

```bash
docker build -t nanogramics-web-pos .
docker run --rm -p 8080:8080 --env-file .env.local nanogramics-web-pos
```

Open `http://localhost:8080/` and `http://localhost:8080/pos/`. The local `.env.local` file must contain a reachable PostgreSQL `DATABASE_URL`.

## Offline behavior

The POS app shell and latest product catalog are cached in the browser. A counter sale made during a network outage is immediately deducted from that device's cached stock and put in a durable browser outbox. It syncs to RDS automatically after connectivity and login return. The server applies every synced sale once and performs the final atomic stock check. Keep the browser profile/device data intact while its status badge shows queued sales.

An internet-disconnected device cannot update central RDS at that exact moment; the status badge makes that state explicit. Other connected tills see central stock, while the offline till sees its locally adjusted stock until reconciliation.

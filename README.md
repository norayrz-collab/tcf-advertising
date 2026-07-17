# TCF Advertising

Live ads-performance dashboard for TCF's ads department, replacing the manual Google Sheets reporting flow. Reads campaign data from the Ads Reporting Google Sheet and each project's own tracking sheet via a service account, and presents it across CF Ads, Ecom Ads, CF Full, Leadgen Ads, PL Ads, and OKR sections.

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.local.example` to `.env.local` and fill in the required values (session secret, shared password hash, Google service account credentials, Upstash Redis).

## Deployment

Configured for Render via `render.yaml`.

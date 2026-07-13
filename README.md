# Handoff: JobRadar Scraper Backend (Workday + Big Tech adapters)

## Overview
JobRadar is a live job-feed aggregator (see `Job Feed.dc.html` in this bundle — a **working** HTML app, not a static mock). It already pulls real postings client-side from the free public APIs of **Greenhouse, Lever, Ashby, and SmartRecruiters** — no keys, no cost.

This handoff is for the missing half: a **server-side scraper** for companies whose career sites can't be fetched from a browser (CORS-blocked / bot-protected): **Workday tenants (Nvidia, Salesforce, Adobe, Qualcomm…), Google, Apple, Meta, Microsoft, Amazon, Netflix, Tesla, Uber, and iCIMS tenants.**

## The user's questions, answered up front
- **"Do I need to run it all the time?"** No. It's a scheduled job (cron). Deploy once; it wakes every 10–15 min, scrapes, writes a `jobs.json`, and goes back to sleep. Nothing runs on the user's machine.
- **"How do I integrate it?"** The frontend already has a **Custom JSON** source type (sidebar → Add company → "Custom JSON URL"). Host `jobs.json` at any CORS-enabled public URL and paste that URL as the slug. Done — no frontend changes needed.
- **Cost:** $0. GitHub Actions (cron + commit to GitHub Pages) or Cloudflare Workers free tier (Cron Triggers + KV) both cover this easily. No paid API keys exist or are needed for any adapter here.

## About the files
- `Job Feed.dc.html` — the working frontend (reference for the data shape it consumes).
- `scraper/main.mjs` — orchestrator: runs all adapters, merges, filters to ≤14 days old, writes `public/jobs.json`.
- `scraper/adapters/workday.mjs` — **working** Workday adapter (public `wday/cxs` JSON endpoint, no auth).
- `scraper/adapters/custom-sites.mjs` — adapters for Microsoft, Amazon, Netflix (Eightfold), Tesla, Uber, Google, Apple + notes for Meta/iCIMS. Endpoints marked `VERIFY` must be tested — they change occasionally.
- `scraper/companies.json` — the company registry (Workday tenants need `tenant`/`host`/`site` — verify each once).
- `scraper/github-workflow-scrape.yml` — move to `.github/workflows/scrape.yml` in the repo.

## Output schema (what the frontend's Custom JSON adapter reads)
```json
{ "jobs": [{
  "id": "string (stable)",
  "title": "Software Engineer II",
  "company": "Nvidia",
  "location": "Santa Clara, CA, United States",
  "url": "https://…direct posting link…",
  "posted": 1751980800000,          // epoch ms, or ISO string
  "description": "plain text, first ~700 chars is enough",
  "salary": "$140K-$210K (optional string)",
  "remote": false
}]}
```
The frontend re-derives everything else (tech tags, salary parsing, experience bucket, US/SG detection, 6h–14d windows) from these fields. Keep `posted` accurate — the whole product is about recency.

## Architecture
```
GitHub Actions cron (every 15 min)
  └─ node scraper/main.mjs
       ├─ workday.mjs   → per-tenant public JSON endpoint
       ├─ custom-sites.mjs → Microsoft / Amazon / Netflix / Tesla / Uber / Google / Apple
       └─ writes public/jobs.json  → served via GitHub Pages (CORS: *)
Frontend (static HTML, hosted anywhere) → fetches jobs.json as a "Custom JSON" source
```

## Implementation notes for Claude Code
1. Node 18+ (native fetch). No dependencies needed except for the Meta/iCIMS fallback (Playwright).
2. **Workday** is the highest-value target and the adapter provided works today: `POST https://{tenant}.{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with `{appliedFacets:{}, limit:20, offset:0, searchText:"software"}`. `postedOn` is fuzzy text ("Posted Today") — parser included. Verify each tenant's `host` (wd1/wd3/wd5/wd12) and `site` name once by watching the network tab on the company's career page.
3. Endpoints in `custom-sites.mjs` marked `VERIFY` should each be smoke-tested; fix response-shape drift rather than rewriting.
4. **Meta** and **iCIMS** have no stable JSON endpoint → use Playwright: load the search page, intercept the XHR the page itself makes, parse that. Run only these two headless; keep the rest as plain fetch.
5. Send a real `User-Agent` and stay polite: one page of newest jobs per company per run is plenty (the frontend only shows ≤14 days).
6. De-dupe by `id`; drop anything older than 14 days before writing.
7. **Do not add LinkedIn** — login-gated, aggressively bot-protected, and scraping it violates their ToS. All jobs on LinkedIn/JobRight originate from these ATS/career-page sources anyway.

## Fidelity
The frontend is high-fidelity AND functional — recreate nothing; just feed it data. All backend work is new code with no UI.

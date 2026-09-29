# Implementation Roadmap

Owner key: **C** = Claude builds it in the repo. **F** = founder does it (accounts, outreach, decisions).

## Phase 1: Foundation (weeks 1 to 4)

Nothing ranks until crawlers can read the pages.

- [ ] **C** Pre-render all public pages to static HTML at build time (Playwright is already in the repo). Cloudflare serves them directly.
- [ ] **C** Per-page title, meta description, canonical, Open Graph and Twitter tags.
- [ ] **C** JSON-LD per page type: Organization, WebSite, Service, FAQPage, BreadcrumbList.
- [ ] **C** `noindex` on login, verify, reset, thank-you, widget, embed, dashboard and admin pages.
- [ ] **C** Generated sitemap index and `robots.txt` cleanup (remove `Crawl-delay`).
- [ ] **C** Remove "500+ movers" and the invented testimonials. Replace with real pilot facts.
- [ ] **C** Home page split: "I'm moving" and "I'm a mover".
- [ ] **C** Auto-deploy the frontend to Cloudflare on merge to `main`.
- [ ] **F** Verify the domain in Google Search Console (DNS TXT record in Cloudflare) and submit the sitemap.
- [ ] **F** Verify in Bing Webmaster Tools (import from Search Console) and submit the sitemap.
- [ ] **F** Turn on Cloudflare Crawler Hints (sends IndexNow pings to Bing automatically).
- [ ] **F** Create a Google Business Profile and Bing Places listing for MoveLeads (service-area business, no public address needed).
- [ ] **F** Decide the brand question in SEO-STRATEGY.md.

## Phase 2: Expansion (weeks 5 to 12)

- [ ] **C** B2B pillar `/moving-leads` and three lead-type pages.
- [ ] **C** `/pricing` rewrite with the price in the title and a calculator.
- [ ] **C** Route page template and the first 50 route pages, with unique data and 301s from `/move/*`.
- [ ] **C** City hubs for the origin and destination cities in those 50 routes.
- [ ] **C** Moving cost calculator page.
- [ ] **C** First two comparison pages (vs Network Leads, vs MoveAdvisor). Factual, sourced, fair.
- [ ] **C** `llms.txt` and FAQ blocks for AI search.
- [ ] **F** Email the authors of the three moving-lead listicles to get listed.
- [ ] **F** Claim free listings: Clutch-style directories, Crunchbase, Product Hunt, LinkedIn company page, AMSA supplier directory (check fees).
- [ ] **C + F** 8 guides published (see CONTENT-CALENDAR.md).

## Phase 3: Scale (weeks 13 to 24)

- [ ] **C** Top 10 B2B state pages, each with that state's lead demand once data exists.
- [ ] **C** Expand to 150 route pages, only where Search Console shows impressions for similar pages.
- [ ] **C** First data report: "Where Americans are moving, from MoveLeads quote data". This is the main link-earning asset.
- [ ] **F** Pitch the data report to local news, real estate blogs and moving-industry newsletters.
- [ ] **F** Founder posts: one LinkedIn post a week for movers, answers on r/moving and moving-industry Facebook groups (no spam; link only when it answers the question).
- [ ] **C** Core Web Vitals pass on mobile.

## Phase 4: Authority (months 7 to 12)

- [ ] **C** Quarterly data report refresh.
- [ ] **C** Remaining state pages and more routes, driven by impressions.
- [ ] **F** Guest posts on moving-software blogs (Supermove, SmartMoving and similar).
- [ ] **F** Partnerships: realtor and Facebook-group partners link to the quote page.
- [ ] **C** Review the brand decision using click-through data.

## Dependencies and risks

| Risk | Mitigation |
|---|---|
| Programmatic pages judged thin or doorway pages | Unique data on every page, launch 50 not 5,000, `noindex` until complete |
| Pre-rendered HTML drifts from the live app | Pre-render runs in the same build that deploys |
| Price estimates seen as quotes | Label as estimates, explain the method, link to the quote form |
| Organic homeowner leads arrive before movers are there to buy them | Keep B2B first in the timeline; route pages go live in the markets where movers exist |
| Founder time for outreach | Outreach templates written by Claude; about 3 hours a week |

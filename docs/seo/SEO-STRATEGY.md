# MoveLeads SEO Strategy

_Created 2026-09-29. Zero ad budget. Organic search (Google + Bing) is the growth channel._

## Goal

Rank on Google and Bing for two audiences, from one platform:

| Audience | What they search | What we want them to do |
|---|---|---|
| **B2B: moving companies** | "moving leads", "buy moving leads", "exclusive moving leads", "moving leads [state]", "how to get moving leads", "[competitor] alternative" | Create a mover account and fund a wallet |
| **B2C: people moving** | "moving cost from [city] to [city]", "movers [city] to [city]", "free moving quotes", "moving cost calculator" | Submit a free quote request (becomes a lead) |

B2C traffic creates the supply (leads). B2B traffic creates the demand (movers who buy them). Both are needed, but they are not equally hard.

## The honest reality

- **B2B is winnable in 2 to 4 months.** "Moving leads" is a small niche. The pages ranking today are small lead sellers ([MoveAdvisor](https://moveadvisor.com/biz/leads), [Network Leads](https://www.network-leads.com/moving-leads), [Mover Matcher](https://movermatcher.com/moving-lead-generation/), [99calls](https://99calls.com/Moving-Leads.htm)) and listicles ([Supermove](https://www.supermove.com/blog/7-sites-to-find-moving-leads-in-2025), [MoversBoost's 58 providers](https://moversboost.com/moving-leads-providers-list/), [Moversville](https://connect.moversville.com/moving-leads/)). Getting listed in those listicles is a free backlink and direct traffic.
- **B2C head terms are not winnable soon.** "Free moving quotes" is owned by Allied, North American, moveBuddha, U.S. News, iMoving and Movers.com. A new domain will not beat them in 2026.
- **B2C long tail IS winnable.** Route pages ("moving from Chicago to Dallas cost") rank on unique data. moveBuddha, MoveAdvisor, iMoving and myGoodMovers all run route pages. We can compete on long-tail routes with our own pricing engine, real distances and real lead data. The volume per page is small; the number of pages is large.
- **Bing is easier than Google** and powers ChatGPT search and Copilot. We submit to Bing on day one and use IndexNow.

## The blocker to fix first: the site is invisible to crawlers

The site is a React single-page app. Every URL returns the **same HTML shell** with the homepage title and an empty `<div id="root">`. Google renders JavaScript slowly and inconsistently; Bing and AI crawlers mostly do not. Today, `/for-movers`, `/pricing` and every `/move/:from/:to` page look identical and empty to them.

**Fix:** pre-render every public page to static HTML at build time, each with its own title, description, canonical, Open Graph and JSON-LD, and real body text. Cloudflare serves those files directly. The app still hydrates for users. No backend changes.

Nothing else in this plan works until this ships.

## Brand decision (needs the founder)

The homeowner funnel already uses the **MoveSmart** logo, but it lives on `moveleads.cloud`. A homeowner who sees "MoveLeads" in a search result may read it as "a company that sells my details". Options:

1. **One domain (recommended now).** B2C pages live under `moveleads.cloud/moving/...`, presented as MoveSmart by MoveLeads. All links and authority build one domain. Cheapest with zero budget.
2. **Two domains.** B2C on its own MoveSmart domain. Better click-through for homeowners, but it starts at zero authority and doubles the link-building work.

Start with option 1. Revisit at month 6 using Search Console click-through data.

## Pillars

1. **Technical foundation.** Pre-rendering, per-page meta, sitemaps, Search Console, Bing Webmaster Tools, IndexNow, Core Web Vitals.
2. **B2B money pages.** Pillar page on moving leads, lead-type pages, state pages, comparison and alternative pages, pricing.
3. **B2C route and city pages.** Programmatic route-cost pages driven by real data, plus a moving cost calculator.
4. **Content that earns links.** Guides for movers (how to get moving leads, how to price a move), guides for homeowners (moving scams, checklists), and data reports from our own lead data.
5. **Free links and listings.** Lead-provider listicles, directories, moving-industry associations, founder posts on LinkedIn and Reddit, Google Business Profile, Bing Places.
6. **AI search (GEO).** Clear answers, FAQs, schema and `llms.txt`, so ChatGPT, Perplexity and Copilot can cite us.

## Guardrails

- **No thin programmatic pages.** Every route or state page must carry unique data: distance, price range from our pricing engine, season effect, home-size table, and real counts once we have them. Pages without enough unique content stay `noindex` until they do.
- **No fake claims.** Remove "500+ movers" and the invented testimonials before pushing traffic to the mover pages. Google's reviewer guidance and FTC rules both penalise fake testimonials.
- **Start small, expand on evidence.** Launch 50 route pages, not 5,000. Add more when Search Console shows impressions.

## KPIs

No baseline exists yet; Search Console is not connected. Targets are directional and get reset after 30 days of data.

| Metric | Baseline | Month 3 | Month 6 | Month 12 |
|---|---|---|---|---|
| Indexed pages (Google) | Unknown, likely under 10 | 80 | 200 | 400+ |
| Keywords in top 100 | Unknown | 150 | 600 | 2,000 |
| B2B keywords in top 10 | 0 | 5 | 20 | 40 |
| Organic clicks per month | Unknown | 300 | 2,000 | 8,000 |
| Organic mover signups per month | 0 | 3 | 10 | 25 |
| Organic quote requests per month | 0 | 10 | 80 | 400 |
| Referring domains | Unknown | 15 | 40 | 100 |
| Core Web Vitals (mobile) | Unmeasured | All green | All green | All green |

## Files in this plan

- [SITE-STRUCTURE.md](SITE-STRUCTURE.md): URL hierarchy and internal linking
- [COMPETITOR-ANALYSIS.md](COMPETITOR-ANALYSIS.md): who ranks and how we win
- [CONTENT-CALENDAR.md](CONTENT-CALENDAR.md): what to publish, week by week
- [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md): phased task list

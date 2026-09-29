# Site Structure

Two sections on one domain. Every page below is pre-rendered to static HTML with its own title, description, canonical and JSON-LD.

## B2B: for moving companies

| URL | Page | Target query | Schema |
|---|---|---|---|
| `/` | Home, split into "I'm moving" and "I'm a mover" | moveleads, moving leads | Organization, WebSite |
| `/moving-leads` | **Pillar:** verified moving leads | moving leads, buy moving leads | Service, FAQPage |
| `/moving-leads/exclusive` | Exclusive (single-buyer) leads | exclusive moving leads | Service, FAQPage |
| `/moving-leads/long-distance` | Long-distance leads | long distance moving leads | Service, FAQPage |
| `/moving-leads/local` | Local leads | local moving leads | Service, FAQPage |
| `/moving-leads/{state}` | State pages, 50 (start with the top 10) | moving leads texas | Service, FAQPage |
| `/pricing` | Lead pricing and calculator | moving leads cost, price per moving lead | Product + Offer, FAQPage |
| `/for-movers` | How it works for movers | moving company lead generation | Service |
| `/compare/{competitor}` | Honest comparisons, e.g. vs Network Leads, vs MoveAdvisor | network leads alternative | Article |
| `/moving-leads/best-providers` | Our own list of lead providers, including us | best moving leads providers | Article, ItemList |
| `/resources/{slug}` | Mover guides | how to get moving leads | Article, HowTo |

## B2C: for people moving (MoveSmart by MoveLeads)

| URL | Page | Target query | Schema |
|---|---|---|---|
| `/get-quote` | Free quote funnel | free moving quotes | WebPage |
| `/moving-cost-calculator` | Calculator tool, using our pricing engine | moving cost calculator | WebApplication, FAQPage |
| `/moving/{origin}-to-{destination}` | Route pages. Replaces `/move/:origin/:dest` with 301 redirects | moving from chicago to dallas cost | Service, FAQPage, BreadcrumbList |
| `/moving/from/{city}` | Hub per origin city, linking its routes | moving from chicago | CollectionPage, BreadcrumbList |
| `/moving/to/{city}` | Hub per destination city | moving to dallas | CollectionPage, BreadcrumbList |
| `/moving/{state}` | State hub | movers texas | CollectionPage |
| `/guides/{slug}` | Homeowner guides | how to avoid moving scams | Article, HowTo |

## Route page contents (the unique data)

Each `/moving/{a}-to-{b}` page carries:

- Driving distance and typical transit days.
- Price range by home size (studio to 5+ bedrooms), from our own pricing engine, labelled as an estimate.
- Season effect (the May to August multiplier) and last-minute effect (within 7 days).
- Cost of living and housing comparison between the two cities (sourced and linked).
- 5 to 8 FAQs specific to that route.
- The quote form, inline.
- Links to the reverse route, both city hubs and 3 nearby routes.

**Launch set:** the 50 busiest interstate corridors (for example NY to FL, CA to TX, IL to TX, CA to AZ, NY to NC). Add more once Search Console shows impressions.

## Internal linking rules

- Every B2C page links to `/get-quote`. Every B2B page links to `/register`.
- Footer links: the B2B pillar, the calculator and the top 10 route pages.
- Route pages link to their reverse route, both city hubs and 3 related routes.
- State pages (B2B) link to route pages that start or end in that state: "movers in Texas buy leads for these routes".
- Guides link to one money page each, with descriptive anchor text.

## Sitemaps

- `sitemap-index.xml` pointing to `sitemap-pages.xml`, `sitemap-b2b.xml`, `sitemap-routes.xml` and `sitemap-guides.xml`.
- Generated at build time from the same route list the pre-renderer uses, with real `lastmod` dates.
- Only indexable pages go in. Pages marked `noindex` stay out.

## Removed from the index

`/login`, `/register` (kept crawlable), `/verify-email*`, `/reset-password`, `/thank-you`, `/feedback`, `/widget-page`, `/embed/*`, `/dashboard/*`, `/admin/*`, `/dev/*` get `noindex`. `robots.txt` keeps blocking `/dashboard`, `/admin` and `/api`. Remove `Crawl-delay`: Google ignores it and it slows Bing.

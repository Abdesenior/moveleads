# Indexation tracking

What Google has indexed compared with what we submitted. Update weekly using [indexation-checklist.md](indexation-checklist.md). Priority routes come from [priority-routes.md](priority-routes.md).

**Source of truth:** Search Console (the Pages report filtered by the sitemap, plus URL Inspection) and Bing Webmaster Tools. **Directional only:** `site:` searches and Performance impressions. Never decide anything from a `site:` count alone.

> **Our URLs differ from the original brief.** The site has no `/routes/` or `/state/` paths, so `inurl:routes` and `inurl:state` would always return 0. The real paths are:
>
> | Page type | Path | Count in sitemap (2026-10-04) |
> |---|---|---|
> | City-to-city routes | `/moving/{city}-to-{city}` | 1,484 |
> | State-to-state pages | `/moving/{state}-to-{state}` | 171 |
> | Route indexes | `/moving`, `/moving/state-to-state` | 2 |
> | City and state hubs | `/moving-to/{place}`, `/moving-from/{place}` | 188 (134 city + 54 state) |
> | Guides | `/resources/{slug}` | 11 |
> | Everything else (home, B2B, legal) | | 22 |
> | **Total** | | **1,878** |
>
> City routes and state pages share `/moving/`, so `site:` cannot split them. For state pages, use the Performance report regex in section D.

## A. Baseline snapshot

| Metric | Baseline (2026-10-04) | After sitemap fix (Date: __/__/__) | +14 days | +30 days | +60 days | Notes |
|---|---|---|---|---|---|---|
| Sitemap URLs (live `/sitemap.xml`) | 1,878 | | | | | Checked live: 200, valid XML |
| GSC: submitted URLs (Sitemaps) | | | | | | Source of truth |
| GSC: indexed URLs (Pages report filtered to the sitemap) | | | | | | Source of truth |
| % indexed (indexed ÷ submitted) | | | | | | |
| Route pages indexed (`site:moveleads.cloud/moving/`) | | | | | | Directional; includes state pages |
| Hub pages indexed (`site:moveleads.cloud/moving-to/` + `/moving-from/`) | | | | | | Directional |
| State pages with impressions (Performance regex) | | | | | | Directional; out of 171 |
| Total indexed (`site:moveleads.cloud`) | | | | | | Directional |
| Not indexed total (Pages > "Why pages aren't indexed") | | | | | | Search Console renamed "Excluded" |
| Bing: indexed pages | | | | | | Bing Webmaster Tools > Sitemaps |

## B. Priority routes indexation tracker

GSC status values: Indexed / Crawled - not indexed / Discovered - not indexed / Excluded / Other.

| # | Route | Full URL | Inspected (Y/N) | Requested indexing (Y/N) | Date requested | GSC status | Last checked | Action taken |
|---|---|---|---|---|---|---|---|---|
| 1 | Dallas to Austin | https://moveleads.cloud/moving/dallas-to-austin | | | | | | |
| 2 | Austin to Dallas | https://moveleads.cloud/moving/austin-to-dallas | | | | | | |
| 3 | Houston to Dallas | https://moveleads.cloud/moving/houston-to-dallas | | | | | | |
| 4 | Houston to Austin | https://moveleads.cloud/moving/houston-to-austin | | | | | | |
| 5 | Jacksonville to Orlando | https://moveleads.cloud/moving/jacksonville-to-orlando | | | | | | |
| 6 | San Antonio to Houston | https://moveleads.cloud/moving/san-antonio-to-houston | | | | | | |
| 7 | Dallas to Houston | https://moveleads.cloud/moving/dallas-to-houston | | | | | | |
| 8 | Fort Worth to Austin | https://moveleads.cloud/moving/fort-worth-to-austin | | | | | | |
| 9 | Austin to Houston | https://moveleads.cloud/moving/austin-to-houston | | | | | | |
| 10 | San Antonio to Austin | https://moveleads.cloud/moving/san-antonio-to-austin | | | | | | |
| 11 | Austin to San Antonio | https://moveleads.cloud/moving/austin-to-san-antonio | | | | | | |
| 12 | Los Angeles to Las Vegas | https://moveleads.cloud/moving/los-angeles-to-las-vegas | | | | | | |
| 13 | Los Angeles to San Diego | https://moveleads.cloud/moving/los-angeles-to-san-diego | | | | | | |
| 14 | San Diego to Los Angeles | https://moveleads.cloud/moving/san-diego-to-los-angeles | | | | | | |
| 15 | Los Angeles to Phoenix | https://moveleads.cloud/moving/los-angeles-to-phoenix | | | | | | |
| 16 | Phoenix to San Diego | https://moveleads.cloud/moving/phoenix-to-san-diego | | | | | | |
| 17 | San Diego to Phoenix | https://moveleads.cloud/moving/san-diego-to-phoenix | | | | | | |
| 18 | St. Louis to Chicago | https://moveleads.cloud/moving/st-louis-to-chicago | | | | | | |
| 19 | Kansas City to St. Louis | https://moveleads.cloud/moving/kansas-city-to-st-louis | | | | | | |
| 20 | Greenville to Charleston | https://moveleads.cloud/moving/greenville-to-charleston | | | | | | |

### Weekly log

| Date | Submitted | Indexed | Not indexed | Top 3 reasons not indexed | Decision |
|---|---|---|---|---|---|
| | | | | | |

## C. What the Search Console statuses mean

| Status | Plain English | What to do |
|---|---|---|
| **Crawled - currently not indexed** | Google read the page and chose not to add it yet. It usually means the page looks thin, too similar to other pages, or not important enough. | Wait 2–4 weeks first. If it lasts 30+ days, add internal links from hubs and related routes and check the page has unique text (costs, drive, city notes). Then request indexing once. |
| **Discovered - currently not indexed** | Google knows the URL exists but hasn't visited it yet. It is common on new sites with many pages: Google is pacing itself. | Be patient. Add links from pages that are already indexed. Don't keep requesting indexing. |
| **Duplicate without user-selected canonical** | Google thinks this page copies another one, and the page doesn't say which version is the main one. | Check the page has a `<link rel="canonical">` pointing to itself. If two pages really are near-copies (e.g. A→B and B→A), make the text more different. |
| **Duplicate, Google chose different canonical than user** | Our page names itself as the main version, but Google picked another page. | Compare the two pages. Make ours more distinct, or accept Google's choice. |
| **Blocked by robots.txt** | Our robots.txt tells Google not to crawl it. | Expected for `/dashboard`, `/admin`, `/dev/`, `/embed/widget/` and `/api/`. If a public page shows up here, fix robots.txt. |
| **Not found (404)** | The URL doesn't exist. | If it's an old or mistyped URL, ignore it. If it's in our sitemap or linked from our pages, fix the link or the page. |
| **Soft 404** | The page loads (200) but looks empty or like an error page to Google. | Open the page with JavaScript off (pre-rendered HTML). If the content is missing, the pre-render failed for that page: rebuild. |
| **Page with redirect** | The URL forwards to another URL. | Fine for old URLs. Our sitemap must list only final URLs, never redirects. |
| **Alternate page with proper canonical tag** | Google found a variant (e.g. with `?from=...` or a tracking tag) that correctly points to the main page. | Nothing. This is working as intended. |
| **Blocked due to unauthorized request (401) / access forbidden (403)** | Google was refused access. | Expected for logged-in areas. For a public page, check Cloudflare security or bot rules aren't blocking Googlebot. |
| **Crawl anomaly** | Older name for an unexplained fetch error. Search Console now reports these as "Server error (5xx)" or other specific reasons. | Run URL Inspection > Test live URL. If it fails, check Cloudflare and Worker logs for that time. |
| **Server error (5xx)** | Our server failed when Google visited. | Check the Worker deploy and logs. One-off spikes during a deploy are usually harmless. |

## D. Weekly quick checks

| Check | How | Pass if |
|---|---|---|
| Sitemap | Open https://moveleads.cloud/sitemap.xml, or run `curl -s -o /dev/null -w "%{http_code}" https://moveleads.cloud/sitemap.xml` | Returns 200, XML loads in the browser, about 1,878 `<loc>` entries |
| Sitemap URL count | `curl -s https://moveleads.cloud/sitemap.xml \| grep -c "<loc>"` | Matches the latest build (1,878 as of 2026-10-04) |
| robots.txt | Open https://moveleads.cloud/robots.txt | `Allow: /`, only app areas disallowed, `Sitemap:` line present |
| Route indexation probe | Google `site:moveleads.cloud/moving/` | Number trends up week over week (directional only) |
| Hub indexation probe | Google `site:moveleads.cloud/moving-to/` and `site:moveleads.cloud/moving-from/` | Trends up (directional) |
| State pages with impressions | Search Console > Performance > Pages > filter "Custom (regex)": `/moving/(alabama\|alaska\|arizona\|arkansas\|california\|colorado\|connecticut\|delaware\|florida\|georgia\|hawaii\|idaho\|illinois\|indiana\|iowa\|kansas\|kentucky\|louisiana\|maine\|maryland\|massachusetts\|michigan\|minnesota\|mississippi\|missouri\|montana\|nebraska\|nevada\|new-hampshire\|new-jersey\|new-mexico\|new-york\|north-carolina\|north-dakota\|ohio\|oklahoma\|oregon\|pennsylvania\|rhode-island\|south-carolina\|south-dakota\|tennessee\|texas\|utah\|vermont\|virginia\|washington\|west-virginia\|wisconsin\|wyoming)-to-` | Count of pages listed trends up. It also catches city routes that share a state name (e.g. `new-york-to-...`, `washington-to-...`); ignore those. |
| URL Inspection sample | Pick 3 random priority routes from section B. Run URL Inspection, note "Page indexing" status and "Last crawl" date | Status and date recorded in section B |

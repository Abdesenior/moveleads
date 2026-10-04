# Weekly indexation checklist

About 15 minutes a week. Run it for at least 8 weeks after the sitemap and title fixes (deployed 2026-10-04). Log results in [indexation-tracking.md](indexation-tracking.md).

**Source of truth:** Search Console (Sitemaps, the Pages report, URL Inspection) and Bing Webmaster Tools. **Directional only:** `site:` searches and Performance impressions.

## Weekly (every ~7 days)

- [ ] **Sitemaps:** Search Console > Sitemaps > `sitemap.xml`. Record "Discovered pages" (submitted), then click through to "See page indexing" and record indexed vs not indexed.
- [ ] **Not indexed:** Pages > "Why pages aren't indexed". Note the total and any new reasons, and log the top 3 reasons with counts.
- [ ] **Indexed:** Pages > indexed count. Note the change from last week.
- [ ] **Performance:** Search results > Pages, last 7 days. Note impressions and clicks for priority routes and any new route pages that appear (directional).
- [ ] **site: probes:** Google `site:moveleads.cloud/moving/`, `site:moveleads.cloud/moving-to/` and `site:moveleads.cloud/moving-from/`. Record the rough counts.
- [ ] **URL Inspection:** take the top 3 priority routes in the tracker that are not yet indexed. If the result says "URL is on Google", mark it Indexed. Otherwise note the status and decide whether to request indexing (see the rules below).
- [ ] **Crawl stats:** Settings > Crawl stats. Look for spikes in server errors (5xx) or "Host status" warnings.
- [ ] **Bing (30 seconds):** Bing Webmaster Tools > Sitemaps: check status is "Success" and note indexed pages.
- [ ] **Log it:** add a row to the weekly log in `indexation-tracking.md` with the date, numbers and notes.
- [ ] **Decide:** nothing / fix something / request indexing / investigate. Write the decision in the log.

## Every 2 weeks

- [ ] Review all 20 priority routes. Mark indexed ones done, and move up the next routes from [priority-routes.csv](priority-routes.csv) if needed.
- [ ] Spot-check 5 random route URLs that are not on the priority list with URL Inspection (e.g. pick from the sitemap). Note how many are indexed.
- [ ] Compare crawl errors with 2 weeks ago. Investigate any clear increase.
- [ ] Fill the +14, +30 or +60 day column in the baseline table when it's due.

## Rules

- **Request indexing for 20 URLs at most per session, and 5–10 per day.** Start with the highest priority. Search Console also enforces its own daily limit.
- **Request each URL once.** Requesting it again doesn't speed anything up. Only request again after you change the page.
- **`site:` counts are rough estimates.** They swing from day to day. Trust Search Console and URL Inspection.
- **Be patient with "Discovered - currently not indexed".** On a new site with about 1,900 pages it can take days to weeks. Add internal links from indexed pages instead of requesting again.
- **"Crawled - currently not indexed" for 30+ days:** if there's no obvious problem, write down a guess and one test in the log (e.g. "add 3 links from hubs" or "make the text less similar to the reverse route"). Check again 2 weeks later.
- **Change one thing at a time** on a group of pages, so you can tell what worked.

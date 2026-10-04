# Search Console and Bing setup

How moveleads.cloud is connected to Google Search Console and Bing Webmaster Tools, how to submit the sitemap, and what to record. Weekly monitoring lives in [indexation-checklist.md](indexation-checklist.md) and [indexation-tracking.md](indexation-tracking.md).

## Current state (2026-10-04)

| Item | Status |
|---|---|
| Sitemap | https://moveleads.cloud/sitemap.xml: 200, valid XML, 1,878 URLs, rebuilt on every deploy with today's `lastmod` |
| robots.txt | https://moveleads.cloud/robots.txt: `Allow: /`, app areas disallowed, `Sitemap:` line present |
| Google verification | Not in the code (no meta tag or HTML file), so it uses DNS. Search Console already shows impressions, so it works. |
| Bing verification | Check in Bing Webmaster Tools. If the site isn't there, import it from Search Console (step 2). |

Keep verification in DNS. A meta tag or HTML file would be one more thing a deploy could break.

## 1. Google Search Console

### Verify (only if the property is missing)

1. Go to https://search.google.com/search-console and click **Add property**.
2. Choose **Domain** (left box) and enter `moveleads.cloud`. A Domain property covers `https://`, `http://`, `www` and every subdomain in one place.
3. Copy the `google-site-verification=...` TXT record.
4. In Cloudflare: **moveleads.cloud > DNS > Records > Add record**. Type `TXT`, name `@`, content = the copied value. Save.
5. Back in Search Console, click **Verify**. It usually works within minutes. If not, wait an hour and try again.
6. Never delete that TXT record. Removing it removes access.

### Submit the sitemap

1. Search Console > **Sitemaps**.
2. Under "Add a new sitemap", enter `https://moveleads.cloud/sitemap.xml` and click **Submit**.
3. Status should change to **Success** within a day. "Discovered pages" should read about 1,878.
4. After big releases (new routes, title changes), submit the same sitemap again. This asks Google to re-read it, and it's harmless.

### Give other people access

Settings > **Users and permissions** > Add user. Use **Restricted** for anyone who only needs to read reports.

## 2. Bing Webmaster Tools

Bing also powers results in DuckDuckGo, Yahoo and ChatGPT search, so it's worth the 5 minutes.

1. Go to https://www.bing.com/webmasters and sign in.
2. Choose **Import from Google Search Console**. Bing copies the verified site and its sitemaps, so no DNS change is needed.
3. If import isn't available, add `https://moveleads.cloud` manually and pick **DNS (CNAME)** verification. Add the CNAME in Cloudflare with the proxy turned **off** (grey cloud).
4. **Sitemaps** > Submit sitemap > `https://moveleads.cloud/sitemap.xml`.
5. Optional: **URL Submission** lets you submit priority routes directly. Bing allows more submissions per day than Google.

## 3. What to record on day 0

Fill these in once, then copy the numbers into the baseline column of [indexation-tracking.md](indexation-tracking.md).

| Item | Where | Value | Date |
|---|---|---|---|
| Google property type | Search Console property picker | Domain / URL prefix | |
| Sitemap status | Search Console > Sitemaps | | |
| Discovered pages (submitted) | Search Console > Sitemaps | | |
| Indexed | Pages, filtered to `sitemap.xml` | | |
| Not indexed | Same view | | |
| Top 3 reasons not indexed | Pages > "Why pages aren't indexed" | | |
| Clicks / impressions, last 28 days | Performance | | |
| Bing sitemap status | Bing > Sitemaps | | |
| Bing indexed pages | Bing > Site Explorer or Sitemaps | | |

## 4. Troubleshooting

| Problem | Fix |
|---|---|
| Sitemap "Couldn't fetch" | Open the sitemap URL in a browser. If it loads, wait 24 hours and resubmit; this is often a temporary Google error. If it doesn't load, check the latest "Deploy to Production" run. |
| Discovered pages much lower than 1,878 | Google may still be reading the file. Wait a day. If it stays low, check that `curl -s https://moveleads.cloud/sitemap.xml \| grep -c "<loc>"` returns 1,878. |
| Verification lost | Check the `google-site-verification` TXT record is still in Cloudflare DNS. |
| Bing CNAME won't verify | Make sure the Cloudflare proxy is off (grey cloud) for that record. |

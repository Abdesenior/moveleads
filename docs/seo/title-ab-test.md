# Title A/B test: plain "Movers from" vs price in title

**Started:** 2026-10-04 (the day it deploys). **Read results:** 2026-11-01 or later (4 weeks). **Code:** `TITLE_TEST_SLUGS` in `client/src/seo/routePages.js`.

## What changed

| | Test group (20 priority routes) | Control (all other route pages) |
|---|---|---|
| Title | `Movers from Dallas to Austin \| MoveLeads` | `Dallas to Austin Movers: $850–$1,750 (2026 Cost)` |
| Description | `Get a free quote from a licensed mover for your Dallas to Austin move. See typical costs by home size and the drive before you book.` | `Moving from Dallas, TX to Austin, TX (195 miles)? A 2-bedroom move costs about $850–$1,750. See costs by home size and get a free quote.` |

The page content, H1 and URLs are unchanged. The test group is the 20 routes in [priority-routes.md](priority-routes.md).

The suggested description said "Compare prices & book with vetted moving companies". It was reworded because MoveLeads matches each request with one mover, so a promise to compare would be inaccurate.

## How to measure

Search Console > **Performance** > Search results. Set the date range to the 28 days after the deploy.

1. **Test group:** add a filter **Page > Custom (regex)** and paste:

   ```
   /moving/(dallas-to-austin|austin-to-dallas|houston-to-dallas|houston-to-austin|jacksonville-to-orlando|san-antonio-to-houston|dallas-to-houston|fort-worth-to-austin|austin-to-houston|san-antonio-to-austin|austin-to-san-antonio|los-angeles-to-las-vegas|los-angeles-to-san-diego|san-diego-to-los-angeles|los-angeles-to-phoenix|phoenix-to-san-diego|san-diego-to-phoenix|st-louis-to-chicago|kansas-city-to-st-louis|greenville-to-charleston)$
   ```

2. **All route pages:** change the filter to **Page > Custom (regex)** `/moving/[a-z-]+-to-[a-z-]+$` and note clicks and impressions. This also counts state pages; that's fine, because they keep their own titles in both periods.
3. **Control group** = all route pages minus the test group. Subtract clicks and impressions, then CTR = control clicks ÷ control impressions. Search Console allows only one Page filter at a time, so you have to subtract.
4. Record the results below. For average position, use the test group's number and compare individual control pages at similar positions.

## Results

| Group | Period | Clicks | Impressions | CTR | Avg position |
|---|---|---|---|---|---|
| Test | 4 weeks after deploy | | | | |
| Control (subtracted) | 4 weeks after deploy | | | | n/a |

## How to decide

- **Compare CTR only at similar positions.** A page in position 3 always gets more clicks than one in position 15. If the groups' average positions differ by more than about 3, compare individual pages at similar positions instead.
- **Need enough data.** Under about 1,000 impressions in the test group, the result is noise. Extend the test another 4 weeks.
- **Clear win** (test CTR at least 20% higher than control at similar position): switch all routes to the new format.
- **Clear loss** (test CTR at least 20% lower): remove `TITLE_TEST_SLUGS` and go back to price titles.
- **In between:** keep the price titles, which are the current default.

Don't change titles on these 20 pages during the test, or the result can't be read.

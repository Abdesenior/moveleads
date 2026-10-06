# Priority routes: first 20 to push

Last updated: 2026-10-06 (Jacksonville to Orlando replaced by Sacramento to Los Angeles after the Oct 6 audit). CSV export: [priority-routes.csv](priority-routes.csv).

20 routes, 15 intrastate (75%), 5 interstate, 7 states (AZ, CA, IL, MO, NV, SC, TX). All are 50–400 miles.

> Verified paths against RoutePage routing: every slug below exists in `ROUTE_PAGES` (`client/src/seo/routePages.js`), resolves through `/moving/:slug` → `RoutePage`, and has a pre-rendered `dist/moving/{slug}.html` and a sitemap entry. The paths in the original brief (`/routes/:from/:to`, `/state/:state`) do not exist on the site and would 404, so they are not used.

## Execution plan

1. **Week 1 (routes 1–5):** Request indexing in Search Console for each URL. Check each hub link listed under Action Items is in place.
2. **Week 2 (routes 6–10):** Same steps. Pull the Search Console query report for routes 1–5 and note impressions and average position.
3. **Week 3 (routes 11–15):** Same steps. For any route 1–5 with impressions but CTR under 1%, test a new title on that route only.
4. **Week 4 (routes 16–20):** Same steps. Add the 20 primary keywords to rank tracking (Semrush or OpenSEO).
5. **Week 6 review:** Compare position and clicks against the week 1 baseline. Move effort to the routes that are moving, and add the next 20 from the CSV.

## Routes

| # | Route | Type | Miles | Primary keyword | Competition | URL |
|---|---|---|---|---|---|---|
| 1 | Dallas to Austin | Intrastate | 195 | dallas to austin movers (320, KD 6) | Low | [/moving/dallas-to-austin](https://moveleads.cloud/moving/dallas-to-austin) |
| 2 | Austin to Dallas | Intrastate | 195 | austin to dallas movers (210, KD 6) | Low | [/moving/austin-to-dallas](https://moveleads.cloud/moving/austin-to-dallas) |
| 3 | Houston to Dallas | Intrastate | 240 | movers from houston to dallas (170, KD 8) | Low | [/moving/houston-to-dallas](https://moveleads.cloud/moving/houston-to-dallas) |
| 4 | Houston to Austin | Intrastate | 165 | movers houston to austin (140, KD 4) | Low | [/moving/houston-to-austin](https://moveleads.cloud/moving/houston-to-austin) |
| 5 | Sacramento to Los Angeles | Intrastate | 385 | movers sacramento to los angeles (40, KD 0) | Low | [/moving/sacramento-to-los-angeles](https://moveleads.cloud/moving/sacramento-to-los-angeles) |
| 6 | San Antonio to Houston | Intrastate | 195 | san antonio to houston drive (1,000, KD 19) | Medium | [/moving/san-antonio-to-houston](https://moveleads.cloud/moving/san-antonio-to-houston) |
| 7 | Dallas to Houston | Intrastate | 240 | movers dallas to houston (140, KD 3) | Low | [/moving/dallas-to-houston](https://moveleads.cloud/moving/dallas-to-houston) |
| 8 | Fort Worth to Austin | Intrastate | 190 | fort worth austin movers (140, KD 9) | Low | [/moving/fort-worth-to-austin](https://moveleads.cloud/moving/fort-worth-to-austin) |
| 9 | Austin to Houston | Intrastate | 165 | austin to houston movers (110, KD 5) | Low | [/moving/austin-to-houston](https://moveleads.cloud/moving/austin-to-houston) |
| 10 | San Antonio to Austin | Intrastate | 80 | austin tx distance from san antonio (720, KD 18) | Medium | [/moving/san-antonio-to-austin](https://moveleads.cloud/moving/san-antonio-to-austin) |
| 11 | Austin to San Antonio | Intrastate | 80 | austin to san antonio movers (50, KD 9) | Low | [/moving/austin-to-san-antonio](https://moveleads.cloud/moving/austin-to-san-antonio) |
| 12 | Los Angeles to Las Vegas | Interstate | 270 | movers los angeles to las vegas (70, KD 3) | Low | [/moving/los-angeles-to-las-vegas](https://moveleads.cloud/moving/los-angeles-to-las-vegas) |
| 13 | Los Angeles to San Diego | Intrastate | 120 | movers los angeles to san diego (90, KD 4) | Low | [/moving/los-angeles-to-san-diego](https://moveleads.cloud/moving/los-angeles-to-san-diego) |
| 14 | San Diego to Los Angeles | Intrastate | 120 | movers san diego to la (70, KD 7) | Low | [/moving/san-diego-to-los-angeles](https://moveleads.cloud/moving/san-diego-to-los-angeles) |
| 15 | Los Angeles to Phoenix | Interstate | 375 | movers los angeles to phoenix (50, KD 1) | Low | [/moving/los-angeles-to-phoenix](https://moveleads.cloud/moving/los-angeles-to-phoenix) |
| 16 | Phoenix to San Diego | Interstate | 355 | san diego distance from phoenix (320, KD 14) | Medium | [/moving/phoenix-to-san-diego](https://moveleads.cloud/moving/phoenix-to-san-diego) |
| 17 | San Diego to Phoenix | Interstate | 355 | moving companies san diego to arizona (50, KD 2) | Low | [/moving/san-diego-to-phoenix](https://moveleads.cloud/moving/san-diego-to-phoenix) |
| 18 | St. Louis to Chicago | Interstate | 295 | st louis cost of living to chicago (480, KD 30) | High | [/moving/st-louis-to-chicago](https://moveleads.cloud/moving/st-louis-to-chicago) |
| 19 | Kansas City to St. Louis | Intrastate | 250 | st louis to kansas city drive (210, KD 17) | Medium | [/moving/kansas-city-to-st-louis](https://moveleads.cloud/moving/kansas-city-to-st-louis) |
| 20 | Greenville to Charleston | Intrastate | 215 | distance greenville sc to charleston sc (170, KD 8) | Low | [/moving/greenville-to-charleston](https://moveleads.cloud/moving/greenville-to-charleston) |

## Route details

### 1. Dallas to Austin (Intrastate, 195 mi)

- **URL:** https://moveleads.cloud/moving/dallas-to-austin
- **Secondary keyword:** moving dallas to austin (110)
- **Why:** Biggest commercial "movers" cluster in the data (700/mo across 3 keywords), KD 2–6. Austin is the #1 Texas inbound city.
- **Actions:** Link from /moving-to/austin and /moving-from/dallas hubs above the fold; request indexing in GSC; add "Dallas to Austin movers" phrase to first paragraph.

### 2. Austin to Dallas (Intrastate, 195 mi)

- **URL:** https://moveleads.cloud/moving/austin-to-dallas
- **Secondary keyword:** movers from austin to dallas (140)
- **Why:** Reverse of #1 with 460/mo of pure mover intent; same low KD.
- **Actions:** Cross-link with /moving/dallas-to-austin; request indexing.

### 3. Houston to Dallas (Intrastate, 240 mi)

- **URL:** https://moveleads.cloud/moving/houston-to-dallas
- **Secondary keyword:** movers houston to dallas (140)
- **Why:** 420/mo of "movers" keywords, KD 4–8; two largest Texas metros.
- **Actions:** Link from /moving-to/dallas hub and /moving-from/houston hub; request indexing.

### 4. Houston to Austin (Intrastate, 165 mi)

- **URL:** https://moveleads.cloud/moving/houston-to-austin
- **Secondary keyword:** houston to austin movers (110)
- **Why:** 320/mo commercial intent, KD 4–5.
- **Actions:** Link from /moving-to/austin hub; request indexing.

### 5. Sacramento to Los Angeles (Intrastate, 385 mi)

- **URL:** https://moveleads.cloud/moving/sacramento-to-los-angeles
- **Secondary keyword:** moving from sacramento to los angeles
- **Why:** Replaces Jacksonville to Orlando (Oct 6 audit: "orlando to jacksonville" results are flights and drive distance, not movers). Pure mover intent, KD 0, and a 385-mile in-state California move.
- **Actions:** Link from /moving-to/los-angeles hub; request indexing.

### 6. San Antonio to Houston (Intrastate, 195 mi)

- **URL:** https://moveleads.cloud/moving/san-antonio-to-houston
- **Secondary keyword:** —
- **Why:** 1,000/mo drive-intent keyword; our drive section answers it with OSRM data.
- **Actions:** Link from /moving-to/houston hub; request indexing; watch CTR, the title leads with price, not drive time.

### 7. Dallas to Houston (Intrastate, 240 mi)

- **URL:** https://moveleads.cloud/moving/dallas-to-houston
- **Secondary keyword:** —
- **Why:** KD 3, pure mover intent.
- **Actions:** Cross-link with /moving/houston-to-dallas; request indexing.

### 8. Fort Worth to Austin (Intrastate, 190 mi)

- **URL:** https://moveleads.cloud/moving/fort-worth-to-austin
- **Secondary keyword:** fort worth austin moving (90)
- **Why:** 230/mo mover intent; few competitors build Fort Worth pages separately from Dallas.
- **Actions:** Link from /moving-from/fort-worth hub and /moving/dallas-to-austin related routes; request indexing.

### 9. Austin to Houston (Intrastate, 165 mi)

- **URL:** https://moveleads.cloud/moving/austin-to-houston
- **Secondary keyword:** —
- **Why:** KD 5 mover keyword; completes the Texas Triangle set.
- **Actions:** Cross-link with /moving/houston-to-austin; request indexing.

### 10. San Antonio to Austin (Intrastate, 80 mi)

- **URL:** https://moveleads.cloud/moving/san-antonio-to-austin
- **Secondary keyword:** austin to san antonio movers (50)
- **Why:** 720/mo distance query on an 80-mile hourly-priced route; good fit for our hourly cost table.
- **Actions:** Link from /moving-to/austin hub; request indexing.

### 11. Austin to San Antonio (Intrastate, 80 mi)

- **URL:** https://moveleads.cloud/moving/austin-to-san-antonio
- **Secondary keyword:** —
- **Why:** Reverse of #10 with direct mover intent.
- **Actions:** Cross-link with /moving/san-antonio-to-austin; request indexing.

### 12. Los Angeles to Las Vegas (Interstate, 270 mi)

- **URL:** https://moveleads.cloud/moving/los-angeles-to-las-vegas
- **Secondary keyword:** movers from los angeles to las vegas (40)
- **Why:** KD 3; LA→Vegas is a top California outbound route and Nevada has no income tax (page states it).
- **Actions:** Link from /moving-to/las-vegas and /moving/california-to-nevada; request indexing.

### 13. Los Angeles to San Diego (Intrastate, 120 mi)

- **URL:** https://moveleads.cloud/moving/los-angeles-to-san-diego
- **Secondary keyword:** —
- **Why:** KD 4 mover intent, high CPC ($39.61) shows paying advertisers.
- **Actions:** Link from /moving-to/san-diego hub; request indexing.

### 14. San Diego to Los Angeles (Intrastate, 120 mi)

- **URL:** https://moveleads.cloud/moving/san-diego-to-los-angeles
- **Secondary keyword:** —
- **Why:** Reverse of #13.
- **Actions:** Add "San Diego to LA" variant to intro copy; cross-link #13; request indexing.

### 15. Los Angeles to Phoenix (Interstate, 375 mi)

- **URL:** https://moveleads.cloud/moving/los-angeles-to-phoenix
- **Secondary keyword:** —
- **Why:** KD 1, the easiest keyword in the set; Arizona is a top-5 U-Haul destination.
- **Actions:** Link from /moving-to/phoenix and /moving/california-to-arizona; request indexing.

### 16. Phoenix to San Diego (Interstate, 355 mi)

- **URL:** https://moveleads.cloud/moving/phoenix-to-san-diego
- **Secondary keyword:** —
- **Why:** 320/mo distance query; page answers 355 mi and drive time.
- **Actions:** Link from /moving-from/phoenix hub; request indexing.

### 17. San Diego to Phoenix (Interstate, 355 mi)

- **URL:** https://moveleads.cloud/moving/san-diego-to-phoenix
- **Secondary keyword:** —
- **Why:** KD 2 commercial query; reverse of #16.
- **Actions:** Cross-link with #16 and /moving/california-to-arizona; request indexing.

### 18. St. Louis to Chicago (Interstate, 295 mi)

- **URL:** https://moveleads.cloud/moving/st-louis-to-chicago
- **Secondary keyword:** movers st louis mo (590, local intent)
- **Why:** 1,070/mo but KD 30 and partly local intent; worth tracking, slower to win.
- **Actions:** Link from /moving-to/chicago hub; request indexing; do not chase "movers st louis mo" (local pack).

### 19. Kansas City to St. Louis (Intrastate, 250 mi)

- **URL:** https://moveleads.cloud/moving/kansas-city-to-st-louis
- **Secondary keyword:** —
- **Why:** 250-mile in-state Missouri route with steady drive-intent demand.
- **Actions:** Cross-link with /moving/st-louis-to-kansas-city; request indexing.

### 20. Greenville to Charleston (Intrastate, 215 mi)

- **URL:** https://moveleads.cloud/moving/greenville-to-charleston
- **Secondary keyword:** —
- **Why:** South Carolina is #3 in net domestic migration (Census V2025); KD 8.
- **Actions:** Link from /moving-to/charleston hub and the top-states guide; request indexing.

## Selection methodology

- **Demand data:** Semrush organic positions for movebuddha.com `/popular-routes/` pages (US, exported 2026-10-03). Volumes are US monthly searches; KD is Semrush keyword difficulty (0–100). Where several keywords hit the same route, volumes were summed.
- **Served only:** a route was kept only if MoveLeads already has a live page for it. Routes we do not serve (San Francisco–Los Angeles, Seattle–Portland, Atlanta–Charlotte, Dallas–Oklahoma City, Pittsburgh–Philadelphia) were dropped.
- **Distance:** 50–400 miles, from OSRM road distances in `routeDistances.js`.
- **Ranking:** low KD with "movers" or "moving" intent first, since those searchers want quotes. Higher-volume distance and drive queries come next because the pages answer them with real road data. High-KD and local-intent keywords come last.
- **Competition guess:** Low = KD under 10, Medium = KD 10–20, High = KD over 20 or a local-pack keyword.
- **Mix:** Texas is heavy (9 of 20) because it has the lowest KD and most mover-intent volume in the data. The list still covers 7 states.
- **Limitation:** volumes come from one competitor's rankings, not a full keyword universe. Recheck against our own Search Console data in about 2 weeks.

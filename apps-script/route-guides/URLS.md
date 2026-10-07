# Route quick-facts pages on Google Apps Script

Project: https://script.google.com/d/1xVwSyRDY93epIk5QMfwXCq1Y8fspTFyNKtMvor7xRS_WeXohQZ44uQcK/edit (account abderrahman.akhattab@gmail.com)
Deployment: AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA (version 1, created 2026-10-07)

Short, distinct summaries of 40 high-demand routes; each links to the full guide on moveleads.cloud. Not copies of the site pages.

Update: `SEMRUSH_CSV=<export.csv> node apps-script/route-guides/build.mjs` (or without the env var to keep routes.json), then `cd apps-script/route-guides && clasp push && clasp redeploy AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA` so the URLs stay the same.

## URLs

- Index: https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec
1. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=albuquerque-to-denver
2. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=st-louis-to-chicago
3. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=san-antonio-to-houston
4. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=san-antonio-to-austin
5. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=dallas-to-austin
6. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=austin-to-dallas
7. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=houston-to-dallas
8. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=boston-to-los-angeles
9. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=san-diego-to-boston
10. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=denver-to-las-vegas
11. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=sioux-falls-to-denver
12. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=phoenix-to-san-diego
13. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=houston-to-austin
14. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=el-paso-to-austin
15. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=fort-worth-to-austin
16. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=boston-to-nashville
17. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=kansas-city-to-st-louis
18. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=boston-to-miami
19. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=los-angeles-to-portland
20. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=kansas-city-to-denver
21. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=greenville-to-charleston
22. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=boston-to-houston
23. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=los-angeles-to-miami
24. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=dallas-to-houston
25. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=atlanta-to-louisville
26. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=los-angeles-to-las-vegas
27. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=austin-to-houston
28. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=sacramento-to-san-francisco
29. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=los-angeles-to-san-diego
30. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=seattle-to-houston
31. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=charlotte-to-austin
32. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=miami-to-charlotte
33. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=philadelphia-to-houston
34. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=houston-to-charlotte
35. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=san-diego-to-los-angeles
36. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=houston-to-el-paso
37. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=houston-to-orlando
38. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=los-angeles-to-phoenix
39. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=san-diego-to-phoenix
40. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=boston-to-denver
41. https://script.google.com/macros/s/AKfycbwqgFTu9CHCx8awIpTsJuTqGz8iZn3LdJt5AqlmLWQVfTDhHr3x9QVATYLV0ba6ogqBCA/exec?route=chicago-to-phoenix

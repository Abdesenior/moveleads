// Data for the homeowner route pages (/moving/:slug), e.g.
// /moving/chicago-to-dallas. Plain JS (no Vite imports): scripts/prerender.mjs
// loads it through seo/routes.js to build the pre-render list and sitemap.
//
// Cost ranges are ESTIMATES derived from published 2026 industry data
// (COST_SOURCE). Never present them as MoveLeads quotes.

import { ROUTE_DISTANCES } from './routeDistances.js';

export const COST_SOURCE = {
  name: 'myGoodMovers 2026 long-distance moving cost data',
  url: 'https://mygoodmovers.com/moving-guide/long-distance-moving-cost',
};
export const HOURLY_SOURCE = {
  name: 'MovingRated movers hourly rates guide (June 2026)',
  url: 'https://movingrated.com/guides/movers-hourly-rates',
};
export const SEASON_SOURCE = {
  name: 'Sirelo long-distance moving cost guide',
  url: 'https://sirelo.com/house-moving/long-distance-moving-costs/',
};

// Full state names by postal code.
export const STATE_NAMES = {AL:'Alabama', AZ:'Arizona', CA:'California', CO:'Colorado', CT:'Connecticut', DC:'Washington, D.C.', FL:'Florida', GA:'Georgia', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', MA:'Massachusetts', MD:'Maryland', MI:'Michigan', MN:'Minnesota', MO:'Missouri', MT:'Montana', NC:'North Carolina', NE:'Nebraska', NJ:'New Jersey', NM:'New Mexico', NV:'Nevada', NY:'New York', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VA:'Virginia', WA:'Washington', WI:'Wisconsin', WY:'Wyoming'};

// zip = a central ZIP, used to pre-fill the quote form (?from=&to=).
// tax: true when the state has no personal income tax on wages.
export const CITIES = {
  'new-york': { name: 'New York', state: 'NY', zip: '10001', tax: false,
    note: 'Most New York buildings need a certificate of insurance (COI) from your mover and a booked elevator slot. On narrow streets a full-size truck may not fit, so some moves use a smaller shuttle truck, which can add cost. Ask about this when you get your quote.' },
  miami: { name: 'Miami', state: 'FL', zip: '33130', tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, so leave room in your schedule for weather delays. Many Miami condos ask for a COI and a reserved elevator, so check your building rules before move day.' },
  'los-angeles': { name: 'Los Angeles', state: 'CA', zip: '90012', tax: false,
    note: 'Some Los Angeles streets need a temporary parking permit for a moving truck, and traffic can stretch a load-out day. Book a weekday morning start if you can.' },
  atlanta: { name: 'Atlanta', state: 'GA', zip: '30303', tax: false,
    note: 'Atlanta traffic around the I-285 perimeter can slow a delivery day, so ask your mover about early starts. Summers are hot and humid; protect electronics and anything heat-sensitive.' },
  charlotte: { name: 'Charlotte', state: 'NC', zip: '28202', tax: false,
    note: 'Charlotte is one of the faster-growing cities in the Southeast, so movers book up in summer. Late summer and fall can bring remnants of Atlantic storms.' },
  austin: { name: 'Austin', state: 'TX', zip: '78701', tax: true,
    note: 'Texas has no state income tax. Austin summers are very hot, so plan loading and unloading for early morning, and keep medication, electronics and candles out of the truck.' },
  phoenix: { name: 'Phoenix', state: 'AZ', zip: '85004', tax: false,
    note: 'Phoenix summers are extremely hot. Schedule an early-morning unload, and move heat-sensitive items like electronics, candles, photos and medication in your car, not the truck.' },
  'las-vegas': { name: 'Las Vegas', state: 'NV', zip: '89101', tax: true,
    note: 'Nevada has no state income tax. Summer heat is intense, so early-morning moves are easier on your crew and your belongings.' },
  seattle: { name: 'Seattle', state: 'WA', zip: '98101', tax: true,
    note: 'Washington has no state income tax on wages. The rainy season runs roughly October to April, so ask your mover how they protect furniture and boxes in wet weather. Some streets need a temporary parking permit for a truck.' },
  denver: { name: 'Denver', state: 'CO', zip: '80202', tax: false,
    note: 'Winter snow can close mountain passes like I-70 and delay deliveries from the west. Denver sits at about 5,280 feet, so plan for the altitude during a physical move day.' },
  'san-francisco': { name: 'San Francisco', state: 'CA', zip: '94103', tax: false,
    note: 'Steep hills and narrow streets mean some San Francisco moves need a shuttle truck, and most blocks need a temporary no-parking permit. Book the permit early.' },
  chicago: { name: 'Chicago', state: 'IL', zip: '60601', tax: false,
    note: 'Chicago high-rises usually need a booked freight elevator and a COI. Winter moves can be cheaper, but snow and ice slow loading, so allow extra time.' },
  dallas: { name: 'Dallas', state: 'TX', zip: '75201', tax: true,
    note: 'Texas has no state income tax. The Dallas–Fort Worth area is spread out, so give your mover your exact new address early to get an accurate estimate. Summers are very hot.' },
  nashville: { name: 'Nashville', state: 'TN', zip: '37203', tax: true,
    note: 'Tennessee has no state income tax on wages. Nashville is growing fast and movers book up in summer, so reserve your date early.' },
  boston: { name: 'Boston', state: 'MA', zip: '02108', tax: false,
    note: 'September 1 is the busiest moving day in Boston because so many leases turn over at once. Avoid it if you can. The city requires a street occupancy permit to reserve space for a truck.' },
  tampa: { name: 'Tampa', state: 'FL', zip: '33602', tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, so keep your move date flexible in late summer.' },
  philadelphia: { name: 'Philadelphia', state: 'PA', zip: '19103', tax: false,
    note: 'Many Philadelphia rowhouse streets are narrow. Reserve curb space with a temporary no-parking permit, and ask your mover whether a smaller truck is needed.' },
  orlando: { name: 'Orlando', state: 'FL', zip: '32801', tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, and summer afternoons often bring thunderstorms, so start early.' },
  washington: { name: 'Washington', state: 'DC', zip: '20001', tax: false,
    note: 'In Washington, DC you can reserve curb space for a moving truck with temporary no-parking signs from the city. Many apartment buildings also require a COI and a reserved elevator.' },
  raleigh: { name: 'Raleigh', state: 'NC', zip: '27601', tax: false,
    note: 'Raleigh and the Research Triangle keep growing, so good movers book up in summer. Late summer and fall can bring storm remnants from the coast.' },
  houston: { name: 'Houston', state: 'TX', zip: '77002', tax: true,
    note: 'Texas has no state income tax. Houston is hot and humid most of the year, and hurricane season runs June 1 to November 30. Heavy rain can flood some streets, so keep your move date flexible in storm season.' },
  'san-diego': { name: 'San Diego', state: 'CA', zip: '92101', tax: false,
    note: 'San Diego weather is mild year-round, so there is no bad-weather season to avoid. Some neighborhoods need a temporary parking permit for a moving truck.' },
  portland: { name: 'Portland', state: 'OR', zip: '97204', tax: false,
    note: 'Oregon has no state sales tax, which helps when you furnish a new home. The rainy season runs roughly October to April, so ask how your mover protects belongings in wet weather.' },
  'salt-lake-city': { name: 'Salt Lake City', state: 'UT', zip: '84101', tax: false,
    note: 'Salt Lake City sits at about 4,200 feet. Winter snow can slow mountain routes into the city, so allow extra delivery time from November to March.' },
  minneapolis: { name: 'Minneapolis', state: 'MN', zip: '55401', tax: false,
    note: 'Minneapolis winters are long and cold. Winter moves can be cheaper, but snow and ice slow loading, so plan for extra time and floor protection.' },
  detroit: { name: 'Detroit', state: 'MI', zip: '48226', tax: false,
    note: 'Detroit winters bring snow and ice, so winter moves need extra time. Summer is the busiest moving season, so book early.' },
  'san-antonio': { name: 'San Antonio', state: 'TX', zip: '78205', tax: true,
    note: 'Texas has no state income tax. San Antonio summers are long and hot, so schedule loading for early morning and keep heat-sensitive items in your car.' },
  jacksonville: { name: 'Jacksonville', state: 'FL', zip: '32202', tax: true,
    note: 'Florida has no state income tax. Jacksonville is the largest city by land area in the contiguous US, so give your mover your exact address for an accurate estimate. Hurricane season runs June 1 to November 30.' },
  columbus: { name: 'Columbus', state: 'OH', zip: '43215', tax: false,
    note: 'Late August is busy in Columbus when Ohio State students move in, so book early if you move then. Winters bring snow, so allow extra time.' },
  indianapolis: { name: 'Indianapolis', state: 'IN', zip: '46204', tax: false,
    note: 'Indianapolis calls itself the Crossroads of America because several major interstates meet here, which helps with deliveries from most directions. Winters bring snow and ice.' },
  'kansas-city': { name: 'Kansas City', state: 'MO', zip: '64106', tax: false,
    note: 'The Kansas City area spans Missouri and Kansas, and the two states tax differently, so confirm which side your new home is on. Spring can bring severe storms.' },
  'st-louis': { name: 'St. Louis', state: 'MO', zip: '63101', tax: false,
    note: 'St. Louis summers are hot and humid and winters are cold. Spring and fall are the most comfortable seasons for a move.' },
  pittsburgh: { name: 'Pittsburgh', state: 'PA', zip: '15222', tax: false,
    note: 'Pittsburgh is known for steep hills, narrow streets and outdoor stairs, so ask your mover about access at both homes. Some moves need a smaller shuttle truck.' },
  baltimore: { name: 'Baltimore', state: 'MD', zip: '21202', tax: false,
    note: 'Many Baltimore homes are rowhouses on narrow streets with steep interior stairs. Ask about temporary parking for the truck and mention stairs when you get quotes.' },
  sacramento: { name: 'Sacramento', state: 'CA', zip: '95814', tax: false,
    note: 'Sacramento summers are very hot and dry. Plan early-morning loading, and keep electronics, candles and medication out of the truck.' },
  albuquerque: { name: 'Albuquerque', state: 'NM', zip: '87102', tax: false,
    note: 'Albuquerque sits at about 5,000 feet, and summers are hot and dry. Stay hydrated on move day and plan for the altitude.' },
  'oklahoma-city': { name: 'Oklahoma City', state: 'OK', zip: '73102', tax: false,
    note: 'Spring is severe-weather and tornado season in Oklahoma City, so keep your moving date flexible and watch forecasts in April and May.' },
  boise: { name: 'Boise', state: 'ID', zip: '83702', tax: false,
    note: 'Boise has grown quickly, so good movers book up in summer. Winters bring snow, and mountain routes into Idaho can slow deliveries.' },
  tucson: { name: 'Tucson', state: 'AZ', zip: '85701', tax: false,
    note: 'Tucson summers are extremely hot. Book an early-morning unload and move heat-sensitive items in your car.' },
  'fort-lauderdale': { name: 'Fort Lauderdale', state: 'FL', zip: '33301', tax: true,
    note: 'Florida has no state income tax. Many Fort Lauderdale condos require a certificate of insurance (COI) from your mover and a reserved elevator. Hurricane season runs June 1 to November 30.' },
  'fort-myers': { name: 'Fort Myers', state: 'FL', zip: '33901', tax: true,
    note: 'Florida has no state income tax. Fort Myers is on the Gulf Coast, where hurricane season runs June 1 to November 30, so keep late-summer move dates flexible.' },
  pensacola: { name: 'Pensacola', state: 'FL', zip: '32502', tax: true,
    note: 'Florida has no state income tax. Pensacola sits on the Gulf Coast in the Florida Panhandle, and hurricane season runs June 1 to November 30.' },
  'daytona-beach': { name: 'Daytona Beach', state: 'FL', zip: '32114', tax: true,
    note: 'Florida has no state income tax. Daytona Beach gets very busy during major race weeks and events, which can affect traffic and hotel availability. Hurricane season runs June 1 to November 30.' },
  'fort-worth': { name: 'Fort Worth', state: 'TX', zip: '76102', tax: true,
    note: 'Texas has no state income tax. Fort Worth is part of the spread-out Dallas–Fort Worth area, so give your mover your exact address for an accurate estimate. Summers are very hot.' },
  'el-paso': { name: 'El Paso', state: 'TX', zip: '79901', tax: true,
    note: 'Texas has no state income tax. El Paso is in the far west of Texas, a long drive from the rest of the state, and its summers are hot and dry.' },
  memphis: { name: 'Memphis', state: 'TN', zip: '38103', tax: true,
    note: 'Tennessee has no state income tax on wages. Memphis summers are hot and humid, so plan early-morning loading.' },
  'new-orleans': { name: 'New Orleans', state: 'LA', zip: '70112', tax: false,
    note: 'Many New Orleans streets are narrow, and some neighborhoods need a parking permit for a moving truck. Hurricane season runs June 1 to November 30.' },
  'baton-rouge': { name: 'Baton Rouge', state: 'LA', zip: '70801', tax: false,
    note: 'Baton Rouge summers are hot and humid, and hurricane season runs June 1 to November 30. LSU move-in weeks are busy, so book early in August.' },
  'virginia-beach': { name: 'Virginia Beach', state: 'VA', zip: '23451', tax: false,
    note: 'Virginia Beach has a large military community, and summer is the busiest season for military moves, so book early. Hurricane season can bring storms in late summer and fall.' },
  buffalo: { name: 'Buffalo', state: 'NY', zip: '14202', tax: false,
    note: 'Buffalo gets heavy lake-effect snow in winter, which can delay moving trucks. Late spring to early fall is the easiest time to move.' },
  omaha: { name: 'Omaha', state: 'NE', zip: '68102', tax: false,
    note: 'Omaha winters are cold and snowy, and spring can bring severe storms. Late spring and early fall are the most comfortable times to move.' },
  tulsa: { name: 'Tulsa', state: 'OK', zip: '74103', tax: false,
    note: 'Spring is severe-weather and tornado season in Tulsa, so keep your moving date flexible in April and May.' },
  birmingham: { name: 'Birmingham', state: 'AL', zip: '35203', tax: false,
    note: 'Birmingham summers are hot and humid, and spring can bring severe storms. Some neighborhoods are hilly, so mention steep driveways when you get quotes.' },
  newark: { name: 'Newark', state: 'NJ', zip: '07102', tax: false,
    note: 'New Jersey has some of the highest property taxes in the country, so compare total housing costs, not just rent or price. Many Newark and Jersey City apartment buildings ask for a certificate of insurance (COI) from your mover.' },
  richmond: { name: 'Richmond', state: 'VA', zip: '23219', tax: false,
    note: 'Richmond is about two hours from Washington, D.C., so many people moving from the D.C. area look here for lower housing costs. Older homes in the Fan and Museum District often have narrow stairs, so mention them when you get quotes.' },
  charleston: { name: 'Charleston', state: 'SC', zip: '29401', tax: false,
    note: 'Charleston is one of the fastest-growing areas in South Carolina. Hurricane season runs from June 1 to November 30, and parts of downtown have narrow streets where a full-size truck may need a permit or a smaller shuttle truck.' },
  greenville: { name: 'Greenville', state: 'SC', zip: '29601', tax: false,
    note: 'Greenville sits between Charlotte and Atlanta on I-85 and has grown fast thanks to manufacturing jobs. Housing costs are lower than in most large Southeast metros.' },
  hartford: { name: 'Hartford', state: 'CT', zip: '06103', tax: false,
    note: 'Hartford is about two hours from both Boston and New York City. Winters are snowy, so movers book up fast in late spring and summer.' },
  louisville: { name: 'Louisville', state: 'KY', zip: '40202', tax: false,
    note: 'Louisville has lower housing costs than most cities its size. Kentucky has a flat state income tax, and many older neighborhoods have narrow streets and tight stairways, so mention access when you get quotes.' },
  milwaukee: { name: 'Milwaukee', state: 'WI', zip: '53202', tax: false,
    note: 'Milwaukee is about 90 miles north of Chicago. Winters are cold and snowy, so a spring to fall move is easier. Many older homes have steep stairs, which movers may price as an extra.' },
  'des-moines': { name: 'Des Moines', state: 'IA', zip: '50309', tax: false,
    note: 'Des Moines has low housing costs and a large insurance and finance job market. Winters are cold, so plan around snow if you move between December and March.' },
  wichita: { name: 'Wichita', state: 'KS', zip: '67202', tax: false,
    note: 'Wichita is the largest city in Kansas and one of the more affordable housing markets in the country. Spring brings severe storms, so leave some room in your schedule.' },
  'sioux-falls': { name: 'Sioux Falls', state: 'SD', zip: '57104', tax: true,
    note: 'South Dakota has no state income tax on wages. Sioux Falls winters are long and cold, so most people prefer to move between April and October.' },
  billings: { name: 'Billings', state: 'MT', zip: '59101', tax: false,
    note: 'Billings is the largest city in Montana. Distances in the state are long, and winter weather on mountain passes can delay a truck, so build in extra delivery time from November to March.' },
  cheyenne: { name: 'Cheyenne', state: 'WY', zip: '82001', tax: true,
    note: 'Wyoming has no state income tax. Cheyenne is about 100 miles north of Denver on I-25, and strong winter winds on I-80 can close roads, so watch the forecast near your move date.' },
  'colorado-springs': { name: 'Colorado Springs', state: 'CO', zip: '80903', tax: false,
    note: 'Colorado Springs is about 70 miles south of Denver and home to several military bases. Some neighborhoods are hilly with steep driveways, so mention access when you get quotes.' },
  boulder: { name: 'Boulder', state: 'CO', zip: '80302', tax: false,
    note: 'Boulder has some of the highest housing costs in Colorado. Many streets near the university are narrow, and the city may require a permit to park a large moving truck.' },
};

// Hand-picked popular routes [from, to, legacy miles]. Distances now come
// from routeDistances.js (OSRM driving data); the third value is unused.
const ROUTES = [
  ['new-york', 'miami', 1280],
  ['new-york', 'los-angeles', 2790],
  ['new-york', 'atlanta', 870],
  ['new-york', 'charlotte', 630],
  ['los-angeles', 'austin', 1380],
  ['los-angeles', 'phoenix', 370],
  ['los-angeles', 'las-vegas', 270],
  ['los-angeles', 'seattle', 1135],
  ['los-angeles', 'denver', 1020],
  ['san-francisco', 'austin', 1760],
  ['chicago', 'dallas', 925],
  ['chicago', 'phoenix', 1750],
  ['chicago', 'atlanta', 715],
  ['chicago', 'nashville', 470],
  ['boston', 'tampa', 1370],
  ['philadelphia', 'orlando', 990],
  ['washington', 'raleigh', 280],
  ['seattle', 'denver', 1320],
  ['dallas', 'denver', 790],
  ['denver', 'phoenix', 820],
  ['los-angeles', 'dallas', 1435],
  ['los-angeles', 'houston', 1545],
  ['los-angeles', 'nashville', 2010],
  ['san-francisco', 'seattle', 810],
  ['san-francisco', 'denver', 1255],
  ['san-francisco', 'portland', 635],
  ['san-diego', 'phoenix', 355],
  ['san-diego', 'austin', 1300],
  ['new-york', 'dallas', 1550],
  ['new-york', 'houston', 1630],
  ['new-york', 'orlando', 1075],
  ['new-york', 'tampa', 1140],
  ['new-york', 'raleigh', 500],
  ['new-york', 'nashville', 890],
  ['boston', 'charlotte', 840],
  ['boston', 'miami', 1510],
  ['chicago', 'denver', 1000],
  ['chicago', 'houston', 1085],
  ['chicago', 'tampa', 1175],
  ['chicago', 'minneapolis', 410],
  ['detroit', 'tampa', 1140],
  ['seattle', 'phoenix', 1420],
  ['seattle', 'austin', 2100],
  ['portland', 'phoenix', 1335],
  ['minneapolis', 'phoenix', 1640],
  ['washington', 'charlotte', 400],
  ['philadelphia', 'charlotte', 540],
  ['houston', 'denver', 1030],
  ['salt-lake-city', 'phoenix', 660],
  ['dallas', 'atlanta', 780],
  ['los-angeles', 'san-antonio', 1355],
  ['los-angeles', 'boise', 850],
  ['los-angeles', 'sacramento', 385],
  ['los-angeles', 'tucson', 490],
  ['san-francisco', 'phoenix', 750],
  ['san-francisco', 'las-vegas', 570],
  ['san-francisco', 'boise', 640],
  ['san-diego', 'las-vegas', 330],
  ['san-diego', 'denver', 1080],
  ['sacramento', 'austin', 1690],
  ['sacramento', 'boise', 525],
  ['seattle', 'boise', 500],
  ['seattle', 'salt-lake-city', 840],
  ['portland', 'boise', 430],
  ['portland', 'denver', 1240],
  ['new-york', 'jacksonville', 940],
  ['new-york', 'columbus', 535],
  ['new-york', 'pittsburgh', 370],
  ['new-york', 'san-antonio', 1830],
  ['new-york', 'denver', 1780],
  ['new-york', 'phoenix', 2410],
  ['boston', 'orlando', 1310],
  ['boston', 'raleigh', 700],
  ['boston', 'denver', 1990],
  ['philadelphia', 'tampa', 1080],
  ['philadelphia', 'atlanta', 780],
  ['baltimore', 'charlotte', 440],
  ['baltimore', 'orlando', 900],
  ['washington', 'tampa', 930],
  ['washington', 'atlanta', 640],
  ['washington', 'orlando', 850],
  ['chicago', 'san-antonio', 1210],
  ['chicago', 'las-vegas', 1750],
  ['chicago', 'orlando', 1160],
  ['chicago', 'charlotte', 760],
  ['chicago', 'kansas-city', 510],
  ['chicago', 'st-louis', 300],
  ['chicago', 'columbus', 355],
  ['detroit', 'orlando', 1150],
  ['detroit', 'atlanta', 730],
  ['minneapolis', 'denver', 915],
  ['minneapolis', 'dallas', 940],
  ['columbus', 'tampa', 1010],
  ['indianapolis', 'tampa', 1000],
  ['indianapolis', 'phoenix', 1740],
  ['kansas-city', 'denver', 605],
  ['st-louis', 'dallas', 635],
  ['oklahoma-city', 'denver', 680],
  ['albuquerque', 'phoenix', 420],
  ['pittsburgh', 'charlotte', 440],
  // Added Oct 2026 from Search Console and Semrush route demand.
  ['boston', 'kansas-city', 0],
  ['boulder', 'chicago', 0],
  ['boulder', 'los-angeles', 0],
  ['boulder', 'san-francisco', 0],
  ['boulder', 'new-york', 0],
  ['boulder', 'seattle', 0],
  ['denver', 'albuquerque', 0],
  ['denver', 'las-vegas', 0],
  ['denver', 'kansas-city', 0],
  ['denver', 'salt-lake-city', 0],
  ['denver', 'omaha', 0],
  ['denver', 'phoenix', 0],
  ['denver', 'billings', 0],
  ['denver', 'wichita', 0],
  ['denver', 'des-moines', 0],
  ['denver', 'louisville', 0],
  ['denver', 'sioux-falls', 0],
  ['denver', 'st-louis', 0],
  ['denver', 'minneapolis', 0],
  ['denver', 'chicago', 0],
  ['colorado-springs', 'albuquerque', 0],
  ['colorado-springs', 'los-angeles', 0],
  ['chicago', 'st-louis', 0],
  ['chicago', 'minneapolis', 0],
  ['st-louis', 'kansas-city', 0],
  ['new-york', 'charleston', 0],
  ['new-york', 'richmond', 0],
  ['new-york', 'louisville', 0],
  ['new-york', 'seattle', 0],
  ['new-york', 'san-francisco', 0],
  ['new-york', 'chicago', 0],
  ['new-york', 'detroit', 0],
  ['new-york', 'columbus', 0],
  ['new-york', 'nashville', 0],
  ['new-york', 'denver', 0],
  ['new-york', 'raleigh', 0],
  ['new-york', 'san-diego', 0],
  ['newark', 'charlotte', 0],
  ['newark', 'los-angeles', 0],
  ['newark', 'san-diego', 0],
  ['newark', 'charleston', 0],
  ['newark', 'raleigh', 0],
  ['boston', 'charlotte', 0],
  ['boston', 'denver', 0],
  ['boston', 'seattle', 0],
  ['boston', 'chicago', 0],
  ['boston', 'los-angeles', 0],
  ['boston', 'san-diego', 0],
  ['boston', 'san-francisco', 0],
  ['boston', 'nashville', 0],
  ['boston', 'philadelphia', 0],
  ['boston', 'washington', 0],
  ['los-angeles', 'chicago', 0],
  ['los-angeles', 'portland', 0],
  ['los-angeles', 'salt-lake-city', 0],
  ['los-angeles', 'boise', 0],
  ['san-diego', 'seattle', 0],
  ['san-diego', 'portland', 0],
  ['san-diego', 'phoenix', 0],
  ['san-diego', 'denver', 0],
  ['san-francisco', 'seattle', 0],
  ['san-francisco', 'portland', 0],
  ['san-francisco', 'boise', 0],
  ['las-vegas', 'salt-lake-city', 0],
  ['chicago', 'charlotte', 0],
  ['chicago', 'denver', 0],
  ['washington', 'chicago', 0],
  ['washington', 'boston', 0],
  ['philadelphia', 'charlotte', 0],
  ['philadelphia', 'los-angeles', 0],
  ['richmond', 'charlotte', 0],
  ['richmond', 'los-angeles', 0],
  ['hartford', 'charlotte', 0],
  ['milwaukee', 'denver', 0],
  ['milwaukee', 'los-angeles', 0],
  ['louisville', 'chicago', 0],
  ['des-moines', 'chicago', 0],
  ['wichita', 'kansas-city', 0],
  ['charleston', 'chicago', 0],
  ['greenville', 'new-york', 0],
  ['greenville', 'chicago', 0],
  ['sacramento', 'portland', 0],
  ['sacramento', 'seattle', 0],
  ['sacramento', 'boise', 0],
  ['sacramento', 'salt-lake-city', 0],
  ['portland', 'boise', 0],
  ['seattle', 'boise', 0],
  ['billings', 'seattle', 0],
  ['sioux-falls', 'chicago', 0],
  ['cheyenne', 'salt-lake-city', 0],
];

// Published ranges (USD) by home size and distance band, from COST_SOURCE.
// Bands: 250-499, 500-999, 1,000-1,499, 1,500-2,499, 2,500+ miles.
// null = not published; filled below by interpolation.
const BAND_LABELS = ['250–499 miles', '500–999 miles', '1,000–1,499 miles', '1,500–2,499 miles', '2,500+ miles'];
const PUBLISHED = {
  Studio: [[1784, 4286], null, null, null, [3087, 6984]],
  '1 bedroom': [[2184, 5584], null, null, null, null],
  '2 bedrooms': [[3284, 6486], [3187, 6286], [3284, 7791], [3884, 10894], [4486, 9986]],
  '3 bedrooms': [[4387, 7791], null, null, [5986, 10894], [6984, 13986]],
  '4+ bedrooms': [[6784, 12486], null, null, [7892, 14884], [9486, 16893]],
};

function interpolate(bands) {
  const out = bands.slice();
  const known = out.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const lo = Math.max(...known.filter((k) => k < i));
    const hi = Math.min(...known.filter((k) => k > i));
    const t = (i - lo) / (hi - lo);
    out[i] = [0, 1].map((j) => out[lo][j] + (out[hi][j] - out[lo][j]) * t);
  }
  return out;
}

// 1 bedroom has one published band: scale the studio/2-bedroom midpoint
// by the ratio observed in that band.
function oneBedroom(studio, twoBed) {
  const [pub] = PUBLISHED['1 bedroom'];
  const ratio = [0, 1].map((j) => pub[j] / ((studio[0][j] + twoBed[0][j]) / 2));
  return studio.map((s, i) => [0, 1].map((j) => ((s[j] + twoBed[i][j]) / 2) * ratio[j]));
}

const COST_TABLE = (() => {
  const studio = interpolate(PUBLISHED.Studio);
  const two = PUBLISHED['2 bedrooms'];
  return {
    Studio: studio,
    '1 bedroom': oneBedroom(studio, two),
    '2 bedrooms': two,
    '3 bedrooms': interpolate(PUBLISHED['3 bedrooms']),
    '4+ bedrooms': interpolate(PUBLISHED['4+ bedrooms']),
  };
})();

const bandFor = (miles) => (miles < 500 ? 0 : miles < 1000 ? 1 : miles < 1500 ? 2 : miles < 2500 ? 3 : 4);
const round50 = (n) => Math.round(n / 50) * 50;
const round100 = (n) => Math.round(n / 100) * 100;
export const usd = (n) => `$${n.toLocaleString('en-US')}`;

// Each published band is placed at its middle distance; a route's price is
// interpolated between those points by its actual miles. This gives every
// route its own estimate instead of one shared number per 500-mile band.
// A running max keeps prices from falling as distance grows (the source's
// 500-999 mile band is slightly cheaper than its 250-499 band).
const BAND_MID_MILES = [375, 750, 1250, 2000, 3000];
const MONOTONIC_TABLE = Object.fromEntries(
  Object.entries(COST_TABLE).map(([size, bands]) => {
    const lo = [], hi = [];
    bands.forEach(([l, h], i) => {
      lo.push(Math.max(l, i ? lo[i - 1] : 0));
      hi.push(Math.max(h, i ? hi[i - 1] : 0));
    });
    return [size, bands.map((_, i) => [lo[i], hi[i]])];
  }),
);

function atMiles(bands, miles) {
  const m = BAND_MID_MILES;
  if (miles <= m[0]) return bands[0];
  if (miles >= m[m.length - 1]) return bands[bands.length - 1];
  const i = m.findIndex((x) => miles < x) - 1;
  const t = (miles - m[i]) / (m[i + 1] - m[i]);
  return [0, 1].map((j) => bands[i][j] + (bands[i + 1][j] - bands[i][j]) * t);
}

export function costRows(miles) {
  return Object.entries(MONOTONIC_TABLE).map(([size, bands]) => {
    const [low, high] = atMiles(bands, miles);
    return { size, low: round50(low), high: round50(high) };
  });
}

export const bandLabel = (miles) => BAND_LABELS[bandFor(miles)];

// Short in-state moves: labor (typical crew and hours by home size) plus the
// drive between the two homes at the crew's hourly rate, from HOURLY_SOURCE.
// Crew rate: 2 movers $80-$120/h, each extra mover $25-$40/h.
const crewRate = (n) => [80 + (n - 2) * 25, 120 + (n - 2) * 40];
export const SHORT_LABOR = [
  { size: 'Studio', crew: '2 movers', hours: '3–5', labor: [240, 600], rate: crewRate(2) },
  { size: '1 bedroom', crew: '2 movers', hours: '3–5', labor: [240, 600], rate: crewRate(2) },
  { size: '2 bedrooms', crew: '3 movers', hours: '5–7', labor: [525, 1260], rate: crewRate(3) },
  { size: '3 bedrooms', crew: '4 movers', hours: '7–10', labor: [980, 2400], rate: crewRate(4) },
  { size: '4+ bedrooms', crew: '4–5 movers', hours: '9–12', labor: [1300, 3000], rate: [crewRate(4)[0], crewRate(5)[1]] },
];

export function shortCostRows(driveHours) {
  return SHORT_LABOR.map((r) => ({
    size: r.size,
    crew: r.crew,
    hours: r.hours,
    low: round50(r.labor[0] + driveHours * r.rate[0]),
    high: round50(r.labor[1] + driveHours * r.rate[1]),
  }));
}

export const routeCostRows = (r) => (r.short ? shortCostRows(r.hours) : costRows(r.miles));
export const driveHours = (miles) => Math.round(miles / 60);
export const cityLabel = (c) => `${c.name}, ${c.state}`;

export const routeSlug = (from, to) => `${from}-to-${to}`;

// Priority hubs (where MoveLeads movers and leads concentrate): every hub
// gets a route page to and from every other city on the site.
export const HUBS = ['orlando', 'jacksonville', 'tampa', 'miami', 'fort-lauderdale', 'houston', 'dallas', 'san-antonio', 'austin', 'atlanta'];
export const MIN_ROUTE_MILES = 250;
// In-state moves of 50-249 miles get "short move" pages priced by the hour.
// Interstate moves are weight-priced under federal rules, so they are excluded.
export const SHORT_MIN_MILES = 50;

const pairKey = (a, b) => [a, b].sort().join('|');

// Unordered city pairs that should get route pages (before the distance filter).
export function candidatePairs() {
  const seen = new Map();
  const add = (a, b) => { if (a !== b) seen.set(pairKey(a, b), [a, b]); };
  ROUTES.forEach(([a, b]) => add(a, b));
  HUBS.forEach((h) => Object.keys(CITIES).forEach((c) => add(h, c)));
  return [...seen.values()];
}

// In-state pairs close enough for an hourly-priced move.
function shortPairs() {
  const keys = Object.keys(CITIES);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (CITIES[keys[i]].state !== CITIES[keys[j]].state) continue;
      const d = ROUTE_DISTANCES[pairKey(keys[i], keys[j])];
      if (d && d[0] >= SHORT_MIN_MILES && d[0] < MIN_ROUTE_MILES) out.push([keys[i], keys[j]]);
    }
  }
  return out;
}

// Every qualifying pair, in both directions, with OSRM driving miles/hours.
const ALL_ROUTES = [...candidatePairs(), ...shortPairs()].flatMap(([a, b]) => {
  const d = ROUTE_DISTANCES[pairKey(a, b)];
  if (!d) return [];
  const short = d[0] < MIN_ROUTE_MILES;
  if (short && (d[0] < SHORT_MIN_MILES || CITIES[a].state !== CITIES[b].state)) return [];
  return [[a, b, d[0], d[1], short], [b, a, d[0], d[1], short]];
});

export const ROUTE_PAGES = Object.fromEntries(
  ALL_ROUTES.map(([from, to, miles, hours, short]) => [
    routeSlug(from, to),
    { fromKey: from, toKey: to, from: CITIES[from], to: CITIES[to], miles, hours, short },
  ]),
);

// Price in the title, like the pages that win these searches
// ("($812+) Chicago to Dallas Movers"). Drop the year when it gets long.
function routeTitle(r, two) {
  const base = `${r.from.name} to ${r.to.name} Movers: ${usd(two.low)}–${usd(two.high)}`;
  return base.length <= 48 ? `${base} (2026 Cost)` : base.length <= 56 ? `${base} (2026)` : base;
}

// SEO metadata for every route page, merged into INDEXABLE_ROUTES.
export const ROUTE_SEO = Object.fromEntries(
  Object.entries(ROUTE_PAGES).map(([slug, r]) => {
    const two = routeCostRows(r).find((c) => c.size === '2 bedrooms');
    return [
      `/moving/${slug}`,
      {
        title: routeTitle(r, two),
        description: `Moving from ${cityLabel(r.from)} to ${cityLabel(r.to)} (${r.miles.toLocaleString('en-US')} miles)? A 2-bedroom move costs about ${usd(two.low)}–${usd(two.high)}. See costs by home size and get a free quote.`,
        changefreq: 'monthly',
        priority: 0.8,
      },
    ];
  }),
);

// Other routes that share an origin or destination, for internal links.
export function relatedRoutes(slug, limit = 6) {
  const r = ROUTE_PAGES[slug];
  return Object.entries(ROUTE_PAGES)
    .filter(([s, o]) => s !== slug && (o.fromKey === r.fromKey || o.toKey === r.toKey || o.fromKey === r.toKey || o.toKey === r.fromKey))
    .slice(0, limit)
    .map(([s, o]) => ({ to: `/moving/${s}`, label: `${o.from.name} to ${o.to.name}` }));
}

// City hub pages: /moving-from/:city and /moving-to/:city.
export function cityRoutes(cityKey, dir) {
  return Object.entries(ROUTE_PAGES)
    .filter(([, r]) => (dir === 'from' ? r.fromKey : r.toKey) === cityKey)
    .map(([slug, r]) => ({ slug, ...r }))
    .sort((a, b) => a.miles - b.miles);
}

export const CITY_HUB_SEO = Object.fromEntries(
  Object.entries(CITIES).flatMap(([key, c]) => {
    const out = [];
    const from = cityRoutes(key, 'from');
    const to = cityRoutes(key, 'to');
    if (from.length) {
      out.push([`/moving-from/${key}`, {
        title: `Moving from ${c.name}, ${c.state}: Costs to ${from.length} Popular Destinations`,
        description: `Distances and typical long-distance moving costs from ${c.name} to ${from.slice(0, 3).map((r) => r.to.name).join(', ')} and more. Get a free moving quote.`,
        changefreq: 'monthly',
        priority: 0.7,
      }]);
    }
    if (to.length) {
      out.push([`/moving-to/${key}`, {
        title: `Moving to ${c.name}, ${c.state}: Costs, Tips and Free Quotes`,
        description: `What to know before moving to ${c.name}, plus distances and typical moving costs from ${to.slice(0, 3).map((r) => r.from.name).join(', ')} and more.`,
        changefreq: 'monthly',
        priority: 0.7,
      }]);
    }
    return out;
  }),
);

// City coordinates (from each city's ZIP) for the cost calculator.
export const COORDS = {"new-york":[40.7484,-73.9967],"miami":[25.7672,-80.2059],"los-angeles":[34.0614,-118.2385],"atlanta":[33.7525,-84.3888],"charlotte":[35.229,-80.8419],"austin":[30.2713,-97.7426],"phoenix":[33.4557,-112.0686],"las-vegas":[36.1721,-115.1224],"seattle":[47.6114,-122.3305],"denver":[39.7491,-104.9946],"san-francisco":[37.7725,-122.4147],"chicago":[41.8858,-87.6181],"dallas":[32.7904,-96.8044],"nashville":[36.1504,-86.7916],"boston":[42.3576,-71.0684],"tampa":[27.9614,-82.4597],"philadelphia":[39.9513,-75.1741],"orlando":[28.5399,-81.3727],"washington":[38.9122,-77.0177],"raleigh":[35.7727,-78.6324],"houston":[29.7594,-95.3594],"san-diego":[32.7185,-117.1593],"portland":[45.5181,-122.6745],"salt-lake-city":[40.7559,-111.8967],"minneapolis":[44.9835,-93.2683],"detroit":[42.3333,-83.0484],"san-antonio":[29.4237,-98.4925],"jacksonville":[30.3299,-81.6517],"columbus":[39.9671,-83.0044],"indianapolis":[39.772,-86.1535],"kansas-city":[39.1052,-94.5699],"st-louis":[38.6346,-90.1913],"pittsburgh":[40.4477,-79.9933],"baltimore":[39.2998,-76.6075],"sacramento":[38.5804,-121.4922],"albuquerque":[35.0818,-106.6482],"oklahoma-city":[35.4726,-97.5199],"boise":[43.6322,-116.2052],"tucson":[32.2139,-110.9694],"fort-lauderdale":[26.1216,-80.1288],"fort-myers":[26.6204,-81.8725],"pensacola":[30.4095,-87.2229],"daytona-beach":[29.2012,-81.0371],"fort-worth":[32.7589,-97.328],"el-paso":[31.7584,-106.4783],"memphis":[35.144,-90.048],"new-orleans":[29.9605,-90.0753],"baton-rouge":[30.4492,-91.1856],"virginia-beach":[36.8585,-76.0019],"buffalo":[42.887,-78.8779],"omaha":[41.259,-95.9409],"tulsa":[36.1539,-95.9954],"birmingham":[33.521,-86.8066],"newark":[40.7357,-74.1724],"richmond":[37.5407,-77.436],"charleston":[32.7765,-79.9311],"greenville":[34.8526,-82.394],"hartford":[41.7658,-72.6734],"louisville":[38.2527,-85.7585],"milwaukee":[43.0389,-87.9065],"des-moines":[41.5868,-93.625],"wichita":[37.6872,-97.3301],"sioux-falls":[43.5446,-96.7311],"billings":[45.7833,-108.5007],"cheyenne":[41.14,-104.8202],"colorado-springs":[38.8339,-104.8214],"boulder":[40.015,-105.2705]};

// Road miles ≈ straight-line distance × 1.18 (the median ratio across our
// hand-checked routes). Known routes use their own figure.
export function estimateMiles(fromKey, toKey) {
  const known = ROUTE_DISTANCES[pairKey(fromKey, toKey)];
  if (known) return { miles: known[0], hours: known[1], exact: true };
  const [a, b] = [COORDS[fromKey], COORDS[toKey]];
  if (!a || !b) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  const straight = 2 * 3958.8 * Math.asin(Math.sqrt(h));
  return { miles: Math.round((straight * 1.18) / 10) * 10, exact: false };
}

// Full cost matrix for the calculator's reference table.
export function costMatrix() {
  return {
    bands: BAND_LABELS,
    rows: Object.entries(COST_TABLE).map(([size, bands]) => ({
      size,
      cells: bands.map(([lo, hi]) => `${usd(round100(lo))}–${usd(round100(hi))}`),
    })),
  };
}

// Time zones (standard UTC offset). Arizona does not observe daylight saving.
const ZONES = {
  Eastern: ['new-york', 'miami', 'atlanta', 'charlotte', 'boston', 'tampa', 'philadelphia', 'orlando', 'washington', 'raleigh', 'detroit', 'jacksonville', 'columbus', 'indianapolis', 'pittsburgh', 'baltimore', 'fort-lauderdale', 'fort-myers', 'daytona-beach', 'virginia-beach', 'buffalo', 'newark', 'richmond', 'charleston', 'greenville', 'hartford', 'louisville'],
  Central: ['chicago', 'dallas', 'nashville', 'houston', 'austin', 'san-antonio', 'minneapolis', 'kansas-city', 'st-louis', 'oklahoma-city', 'pensacola', 'fort-worth', 'memphis', 'new-orleans', 'baton-rouge', 'omaha', 'tulsa', 'birmingham', 'milwaukee', 'des-moines', 'wichita', 'sioux-falls'],
  Mountain: ['denver', 'salt-lake-city', 'albuquerque', 'boise', 'el-paso', 'phoenix', 'tucson', 'billings', 'cheyenne', 'colorado-springs', 'boulder'],
  Pacific: ['los-angeles', 'las-vegas', 'seattle', 'san-francisco', 'san-diego', 'portland', 'sacramento'],
};
const OFFSET = { Eastern: -5, Central: -6, Mountain: -7, Pacific: -8 };
const ARIZONA = new Set(['phoenix', 'tucson']);
export const cityZone = (key) => Object.keys(ZONES).find((z) => ZONES[z].includes(key));

// Plain-English time zone change for a move, or null when there is none.
export function timeZoneNote(fromKey, toKey) {
  const a = cityZone(fromKey);
  const b = cityZone(toKey);
  if (!a || !b) return null;
  const az = ARIZONA.has(fromKey) || ARIZONA.has(toKey)
    ? ' Arizona does not observe daylight saving time, so from March to November it matches Pacific time.'
    : '';
  if (a === b) return az ? `Both cities are on ${a} standard time.${az}` : null;
  const diff = OFFSET[b] - OFFSET[a];
  const hrs = Math.abs(diff) === 1 ? '1 hour' : `${Math.abs(diff)} hours`;
  return `You move from ${a} to ${b} time, so you ${diff > 0 ? 'lose' : 'gain'} ${hrs}.${az}`;
}

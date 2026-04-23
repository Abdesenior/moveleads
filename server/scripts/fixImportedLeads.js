require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const zipcodes = require('zipcodes');
const Lead = require('../models/Lead');
const { calculateAuctionPrice } = require('../utils/pricingEngine');
const { calculateLeadScore } = require('../services/scoringService');

function milesFromZips(a, b) {
  const o = zipcodes.lookup(String(a)), d = zipcodes.lookup(String(b));
  if (!o || !d) return 0;
  const R = 3959, dLat = (d.latitude - o.latitude) * Math.PI / 180, dLon = (d.longitude - o.longitude) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(o.latitude*Math.PI/180)*Math.cos(d.latitude*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
}

function normPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d;
}

const HOME_SIZE_NORM = {
  'studio': 'Studio',
  '1_bedroom': '1 Bedroom', '1 bedroom': '1 Bedroom',
  '2_bedroom': '2 Bedroom', '2 bedroom': '2 Bedroom',
  '3_bedroom': '3 Bedroom', '3 bedroom': '3 Bedroom',
  '4_bedroom': '4 Bedroom', '4 bedroom': '4 Bedroom',
  '5_bedroom': '5+ Bedroom', '5+ bedroom': '5+ Bedroom',
};

const ROWS = [
  { firstName:'Jamie',    lastName:'Castro',           email:'jamiecastro80@gmail.com',        phone:'(830) 305-0318', originCity:'New Braunfels',    originState:'TX', originZip:'78130', destinationCity:'Canonsburg',      destinationState:'PA', destinationZip:'15317', moveSize:'1_bedroom', moveDate:'2026-06-12' },
  { firstName:'Philip',   lastName:'Kellerman',        email:'philkellerman77@gmail.com',       phone:'(352) 262-5421', originCity:'Duluth',           originState:'GA', originZip:'30097', destinationCity:'Orlando',         destinationState:'FL', destinationZip:'32829', moveSize:'2_bedroom', moveDate:'2026-05-31' },
  { firstName:'Angela',   lastName:'Davids',           email:'angewah@aol.com',                phone:'(206) 981-8410', originCity:'White House',      originState:'TN', originZip:'37188', destinationCity:'Freeport',        destinationState:'NY', destinationZip:'11520', moveSize:'2_bedroom', moveDate:'2026-05-30' },
  { firstName:'Katie',    lastName:'LeBlanc',          email:'katieleblanc5121@gmail.com',      phone:'(936) 707-2609', originCity:'Texas City',       originState:'TX', originZip:'77591', destinationCity:'Spring Lake',     destinationState:'NC', destinationZip:'28307', moveSize:'studio',    moveDate:'2026-04-29' },
  { firstName:'Bill',     lastName:'Piazza',           email:'billpiazza411@gmail.com',         phone:'(541) 539-8553', originCity:'Chiloquin',        originState:'OR', originZip:'97624', destinationCity:'Las Vegas',       destinationState:'NV', destinationZip:'89146', moveSize:'studio',    moveDate:'2026-05-30' },
  { firstName:'Belle',    lastName:'Davila',           email:'belenisedavila@gmail.com',        phone:'(845) 891-4043', originCity:'Poughkeepsie',     originState:'NY', originZip:'12601', destinationCity:'Kissimmee',       destinationState:'FL', destinationZip:'34744', moveSize:'2_bedroom', moveDate:'2026-05-07' },
  { firstName:'Susan K.', lastName:'Robertson',        email:'skrobertson@wowway.net',          phone:'(706) 339-3054', originCity:'Augusta',          originState:'GA', originZip:'30904', destinationCity:'Augusta',         destinationState:'GA', destinationZip:'30909', moveSize:'2_bedroom', moveDate:'2026-05-30' },
  { firstName:'Nancy',    lastName:'Johncox',          email:'nannyree831@yahoo.com',           phone:'(585) 331-9647', originCity:'Holley',           originState:'NY', originZip:'14470', destinationCity:'Hamlin',          destinationState:'NY', destinationZip:'14464', moveSize:'2_bedroom', moveDate:'2026-05-31' },
  { firstName:'Bethany',  lastName:'Knowles',          email:'cbknowles@sbcglobal.net',         phone:'(817) 343-6874', originCity:'Fort Worth',       originState:'TX', originZip:'76179', destinationCity:'Nogal',           destinationState:'NM', destinationZip:'88341', moveSize:'studio',    moveDate:'2026-05-09' },
  { firstName:'Cheryl',   lastName:'Russ',             email:'cheryl9404@gmail.com',            phone:'(630) 561-5463', originCity:'Morris',           originState:'IL', originZip:'60450', destinationCity:'St. Petersburg',  destinationState:'FL', destinationZip:'33707', moveSize:'studio',    moveDate:'2026-05-01' },
  { firstName:'Kim',      lastName:'Ingram',           email:'kimberlyingramsimon@gmail.com',   phone:'(917) 957-6206', originCity:'Durham',           originState:'NC', originZip:'27703', destinationCity:'Charlotte',       destinationState:'NC', destinationZip:'28262', moveSize:'1_bedroom', moveDate:'2026-04-24' },
  { firstName:'Amy',      lastName:'White',            email:'amywhitewriting@gmail.com',       phone:'(913) 704-7408', originCity:'Elgin',            originState:'SC', originZip:'29045', destinationCity:'Columbia',        destinationState:'SC', destinationZip:'29223', moveSize:'3_bedroom', moveDate:'2026-06-20' },
  { firstName:'Joe',      lastName:'Parks',            email:'Honkycat2@gmail.com',             phone:'(615) 522-7196', originCity:'Old Hickory',      originState:'TN', originZip:'37138', destinationCity:'Dublin',          destinationState:'OH', destinationZip:'43016', moveSize:'studio',    moveDate:'2026-05-12' },
  { firstName:'Priscilla',lastName:'Thornhill',        email:'pristhornhill@gmail.com',         phone:'(210) 251-9926', originCity:'Saint Petersburg', originState:'FL', originZip:'33716', destinationCity:'Helotes',         destinationState:'TX', destinationZip:'78023', moveSize:'studio',    moveDate:'2026-05-09' },
  { firstName:'Alexandra',lastName:'Davis',            email:'adavis032893@yahoo.com',          phone:'(225) 573-0738', originCity:'Baton Rouge',      originState:'LA', originZip:'70809', destinationCity:'Richmond',        destinationState:'VA', destinationZip:'23222', moveSize:'1_bedroom', moveDate:'2026-05-25' },
  { firstName:'Cynthia',  lastName:'Brahmi',           email:'Cynthiabrahmi@gmail.com',         phone:'(626) 230-2158', originCity:'Kalispell',        originState:'MT', originZip:'59901', destinationCity:'Bend',            destinationState:'OR', destinationZip:'97701', moveSize:'1_bedroom', moveDate:'2026-06-25' },
  { firstName:'Really',   lastName:'Me',               email:'labyrinth2278@gmail.com',         phone:'(714) 999-1234', originCity:'Garden Grove',     originState:'CA', originZip:'92845', destinationCity:'Van Nuys',        destinationState:'CA', destinationZip:'91401', moveSize:'1_bedroom', moveDate:'2026-05-21' },
  { firstName:'Delarosa', lastName:'Herbert',          email:'rdh637@gmail.com',                phone:'(660) 864-7289', originCity:'Kansas City',      originState:'MO', originZip:'64118', destinationCity:'Kansas City',     destinationState:'MO', destinationZip:'64151', moveSize:'2_bedroom', moveDate:'2026-11-30' },
  { firstName:'Elizabeth',lastName:'Locket',           email:'elizabethlhoffman@yahoo.com',     phone:'(701) 290-4793', originCity:'Las Vegas',        originState:'NV', originZip:'89146', destinationCity:'Dickinson',       destinationState:'ND', destinationZip:'58601', moveSize:'studio',    moveDate:'2026-05-05' },
  { firstName:'Elizabeth',lastName:'Leonard',          email:'elizabeth_leonard_3@yahoo.com',   phone:'(214) 355-8389', originCity:'Frankfort',        originState:'KY', originZip:'40601', destinationCity:'Princeton',       destinationState:'TX', destinationZip:'75407', moveSize:'2_bedroom', moveDate:'2026-05-07' },
  { firstName:'Busola',   lastName:'Ad',               email:'busola.yakubu@yahoo.co.uk',       phone:'(208) 973-5227', originCity:'Boise',            originState:'ID', originZip:'83703', destinationCity:'Holyoke',         destinationState:'MA', destinationZip:'01040', moveSize:'1_bedroom', moveDate:'2026-05-30' },
  { firstName:'Mich',     lastName:'Mozley',           email:'redpb97@yahoo.com',               phone:'(512) 710-8810', originCity:'Buda',             originState:'TX', originZip:'78610', destinationCity:'Buda',            destinationState:'TX', destinationZip:'78610', moveSize:'2_bedroom', moveDate:'2026-04-27' },
  { firstName:'Jedd',     lastName:'Joseph',           email:'emiliram2020@yahoo.com',          phone:'(352) 228-5243', originCity:'Athens',           originState:'GA', originZip:'30605', destinationCity:'Lawrenceville',   destinationState:'GA', destinationZip:'30043', moveSize:'3_bedroom', moveDate:'2026-05-29' },
  { firstName:'Charmaine',lastName:'Duke',             email:'gigmoolah20@gmail.com',           phone:'(347) 672-0607', originCity:'Riverview',        originState:'FL', originZip:'33579', destinationCity:'Loganville',      destinationState:'GA', destinationZip:'30052', moveSize:'2_bedroom', moveDate:'2026-04-25' },
  { firstName:'Sweety',   lastName:'Pe',               email:'Supraza123@gmail.com',            phone:'(470) 208-2749', originCity:'Alpharetta',       originState:'GA', originZip:'30004', destinationCity:'Suwanee',         destinationState:'GA', destinationZip:'30024', moveSize:'studio',    moveDate:'2026-06-22' },
  { firstName:'Nikkia',   lastName:'Kelly',            email:'nikkiqueensnyc@gmail.com',        phone:'(706) 223-2633', originCity:'Stockbridge',      originState:'GA', originZip:'30253', destinationCity:'Albemarle',       destinationState:'NC', destinationZip:'28001', moveSize:'2_bedroom', moveDate:'2026-05-01' },
  { firstName:'Sara',     lastName:'Aquino',           email:'sara.aquino921@gmail.com',        phone:'(516) 924-4409', originCity:'Hempstead',        originState:'NY', originZip:'11550', destinationCity:'Macon',           destinationState:'GA', destinationZip:'31220', moveSize:'studio',    moveDate:'2026-04-29' },
  { firstName:'Hannah',   lastName:'Mccall',           email:'Hannahemccall@gmail.com',         phone:'(334) 714-7498', originCity:'Troy',             originState:'AL', originZip:'36079', destinationCity:'Troy',            destinationState:'AL', destinationZip:'36079', moveSize:'2_bedroom', moveDate:'2026-05-07' },
  { firstName:'Terence',  lastName:'James',            email:'wallstreetnyc1914@ymail.com',     phone:'(719) 922-1835', originCity:'Colorado Springs', originState:'CO', originZip:'80922', destinationCity:'Colorado Springs',destinationState:'CO', destinationZip:'80922', moveSize:'2_bedroom', moveDate:'2026-04-29' },
  { firstName:'Antonio',  lastName:'Colmenares',       email:'amiguelbap@gmail.com',            phone:'(331) 274-2086', originCity:'Aurora',           originState:'IL', originZip:'60506', destinationCity:'Westerville',     destinationState:'OH', destinationZip:'43081', moveSize:'1_bedroom', moveDate:'2026-04-28' },
  { firstName:'Stephen',  lastName:'Byars',            email:'byars1216@gmail.com',             phone:'(908) 247-9621', originCity:'Kenilworth',       originState:'NJ', originZip:'07033', destinationCity:'Kenilworth',      destinationState:'NJ', destinationZip:'07033', moveSize:'2_bedroom', moveDate:'2026-04-29' },
  { firstName:'Hanna',    lastName:'Suarez',           email:'hannA10suarez@yahoo.com',         phone:'(860) 608-1788', originCity:'Kirkland',         originState:'WA', originZip:'98033', destinationCity:'San Luis Obispo', destinationState:'CA', destinationZip:'93405', moveSize:'2_bedroom', moveDate:'2026-07-01' },
  { firstName:'ALBERT',   lastName:'KAFFENBERGER',     email:'eros.models.69@gmail.com',        phone:'(213) 357-3945', originCity:'Devils Lake',      originState:'ND', originZip:'58301', destinationCity:'Los Angeles',     destinationState:'CA', destinationZip:'91367', moveSize:'studio',    moveDate:'2026-05-07' },
  { firstName:'Torie',    lastName:'Hawkins',          email:'lani_grl@me.com',                phone:'(803) 397-0119', originCity:'Columbia',         originState:'SC', originZip:'29210', destinationCity:'Houston',         destinationState:'TX', destinationZip:'77095', moveSize:'studio',    moveDate:'2026-05-28' },
  { firstName:'Roy',      lastName:'Penland',          email:'roypen30@yahoo.com',              phone:'(217) 621-4175', originCity:'Champaign',        originState:'IL', originZip:'61822', destinationCity:'Champaign',       destinationState:'IL', destinationZip:'61822', moveSize:'3_bedroom', moveDate:'2026-05-30' },
  { firstName:'Johnnese', lastName:'Hartson',          email:'tootsmh@gmail.com',               phone:'(313) 721-5481', originCity:'Detroit',          originState:'MI', originZip:'48213', destinationCity:'Detroit',         destinationState:'MI', destinationZip:'48204', moveSize:'2_bedroom', moveDate:'2026-04-24' },
  { firstName:'Ravin',    lastName:'Mahesh',           email:'ravin.maheshkumar@gmail.com',     phone:'(904) 322-4391', originCity:'Philadelphia',     originState:'PA', originZip:'19102', destinationCity:'Daytona Beach',   destinationState:'FL', destinationZip:'32124', moveSize:'2_bedroom', moveDate:'2026-06-12' },
  { firstName:'Liyan',    lastName:'Prince',           email:'yarias@live.com',                phone:'(386) 848-3239', originCity:'Atlanta',          originState:'GA', originZip:'30340', destinationCity:'Atlanta',         destinationState:'GA', destinationZip:'30340', moveSize:'2_bedroom', moveDate:'2026-05-16' },
  { firstName:'Phil',     lastName:'Junior',           email:'dindouphi50@gmail.com',           phone:'(774) 606-5178', originCity:'Attleboro',        originState:'MA', originZip:'02703', destinationCity:'Valrico',         destinationState:'FL', destinationZip:'33596', moveSize:'1_bedroom', moveDate:'2026-05-07' },
  { firstName:'Misty',    lastName:'Libby',            email:'mlibby01@gmail.com',              phone:'(781) 608-0084', originCity:'Malden',           originState:'MA', originZip:'02148', destinationCity:'Plaistow',        destinationState:'NH', destinationZip:'03865', moveSize:'1_bedroom', moveDate:'2026-06-26' },
  { firstName:'Synai',    lastName:'Willis',           email:'synaiterry1@gmail.com',           phone:'(267) 206-6701', originCity:'Hatfield',         originState:'PA', originZip:'19440', destinationCity:'Oviedo',          destinationState:'FL', destinationZip:'32765', moveSize:'studio',    moveDate:'2026-05-01' },
  { firstName:'Briana',   lastName:'Turner',           email:'brianaturner334@gmail.com',       phone:'(661) 466-7590', originCity:'Tehachapi',        originState:'CA', originZip:'93561', destinationCity:'Phoenix',         destinationState:'AZ', destinationZip:'85009', moveSize:'studio',    moveDate:'2026-07-18' },
  { firstName:'Jo Anne',  lastName:'Ryan',             email:'jryan.jar@gmail.com',             phone:'(585) 721-8302', originCity:'New Smyrna Beach', originState:'FL', originZip:'32169', destinationCity:'New Smyrna Beach',destinationState:'FL', destinationZip:'32169', moveSize:'2_bedroom', moveDate:'2026-05-22' },
  { firstName:'Gerardo',  lastName:'Bolanos',          email:'lalito720@icloud.com',            phone:'(951) 275-6464', originCity:'Riverside',        originState:'CA', originZip:'92508', destinationCity:'Colorado Springs',destinationState:'CO', destinationZip:'80951', moveSize:'studio',    moveDate:'2026-05-08' },
  { firstName:'Hardin',   lastName:'Jo',               email:'johardin08@gmail.com',            phone:'(336) 552-2342', originCity:'Greensboro',       originState:'NC', originZip:'27411', destinationCity:'Florence',        destinationState:'SC', destinationZip:'29505', moveSize:'1_bedroom', moveDate:'2026-05-30' },
  { firstName:'Kiki',     lastName:'Francis',          email:'kenniqua7@gmail.com',             phone:'(267) 242-1400', originCity:'Willow Grove',     originState:'PA', originZip:'19090', destinationCity:'Davenport',       destinationState:'FL', destinationZip:'33837', moveSize:'2_bedroom', moveDate:'2026-04-25' },
  { firstName:'Katerina', lastName:'Richardson',       email:'katerina.richardson@icloud.com',  phone:'(972) 946-5555', originCity:'Frisco',           originState:'TX', originZip:'75034', destinationCity:'Broomfield',      destinationState:'CO', destinationZip:'80023', moveSize:'2_bedroom', moveDate:'2026-05-19' },
  { firstName:'Sherry',   lastName:'Baker',            email:'evasb3159@gmail.com',             phone:'(760) 883-7387', originCity:'Apple Valley',     originState:'CA', originZip:'92307', destinationCity:'Mountain Mesa',   destinationState:'CA', destinationZip:'93240', moveSize:'2_bedroom', moveDate:'2026-05-30' },
  { firstName:'Amaree',   lastName:'Abram',            email:'jamielott_24@yahoo.com',          phone:'(409) 454-2557', originCity:'Knoxville',        originState:'TN', originZip:'37909', destinationCity:'Port Arthur',     destinationState:'TX', destinationZip:'77655', moveSize:'studio',    moveDate:'2026-05-16' },
  { firstName:'Sharon',   lastName:'Torres',           email:'Thmpurs@yahoo.com',               phone:'(209) 271-3265', originCity:'Stockton',         originState:'CA', originZip:'95210', destinationCity:'Jackson',         destinationState:'CA', destinationZip:'95642', moveSize:'1_bedroom', moveDate:'2026-07-15' },
  { firstName:'Ash',      lastName:'Aiad',             email:'ash3949@yahoo.com',               phone:'(310) 621-6029', originCity:'North Hills',      originState:'CA', originZip:'91343', destinationCity:'Los Angeles',     destinationState:'CA', destinationZip:'90034', moveSize:'studio',    moveDate:'2026-05-01' },
  { firstName:'Olivia',   lastName:'Meenan',           email:'olivia.meenan@icloud.com',        phone:'(360) 298-4371', originCity:'Phoenix',          originState:'AZ', originZip:'85054', destinationCity:'Friday Harbor',   destinationState:'WA', destinationZip:'98250', moveSize:'2_bedroom', moveDate:'2026-06-05' },
  { firstName:'Lauren',   lastName:'Kimmel',           email:'laurenvkimmel@gmail.com',         phone:'(725) 340-8885', originCity:'Overton',          originState:'NV', originZip:'89040', destinationCity:'Cedar City',      destinationState:'UT', destinationZip:'84720', moveSize:'1_bedroom', moveDate:'2026-04-24' },
  { firstName:'Doug',     lastName:'Bartlett',         email:'dougbartlett1958.com@icloud.com', phone:'(409) 658-1710', originCity:'Port Neches',      originState:'TX', originZip:'77651', destinationCity:'Groves',          destinationState:'TX', destinationZip:'77619', moveSize:'1_bedroom', moveDate:'2026-04-29' },
  { firstName:'Amber',    lastName:'Perkins',          email:'ambperkins13@gmail.com',          phone:'(434) 826-9200', originCity:'Palmyra',          originState:'VA', originZip:'22963', destinationCity:'Crozet',          destinationState:'VA', destinationZip:'22932', moveSize:'2_bedroom', moveDate:'2026-04-29' },
  { firstName:'Isabella', lastName:'Juhl',             email:'bellagrace0116@gmail.com',        phone:'(360) 954-0852', originCity:'Vancouver',        originState:'WA', originZip:'98684', destinationCity:'Charleston',      destinationState:'SC', destinationZip:'29414', moveSize:'studio',    moveDate:'2026-04-25' },
  { firstName:'Veronika', lastName:'Gasoyan',          email:'gas.vero@yahoo.com',              phone:'(818) 233-2351', originCity:'Van Nuys',         originState:'CA', originZip:'91411', destinationCity:'Van Nuys',        destinationState:'CA', destinationZip:'91406', moveSize:'1_bedroom', moveDate:'2026-05-20' },
  { firstName:'Adena',    lastName:'Tullar',           email:'tadenam333@gmail.com',            phone:'(810) 259-3844', originCity:'Buckeye',          originState:'AZ', originZip:'85396', destinationCity:'',                destinationState:'MI', destinationZip:'48059', moveSize:'3_bedroom', moveDate:'2026-07-06' },
  { firstName:'John',     lastName:'Johnson',          email:'johnsdjsjw@gmail.com',            phone:'(530) 987-6654', originCity:'Pensacola',        originState:'FL', originZip:'32503', destinationCity:'Sacramento',      destinationState:'CA', destinationZip:'95821', moveSize:'studio',    moveDate:'2026-04-28' },
  { firstName:'Mylee',    lastName:'Wright',           email:'braydonandmylee@gmail.com',       phone:'(806) 218-6562', originCity:'Killeen',          originState:'TX', originZip:'76543', destinationCity:'Wolfforth',       destinationState:'TX', destinationZip:'79382', moveSize:'studio',    moveDate:'2026-04-24' },
  { firstName:'Pamela',   lastName:'Bloomberg',        email:'pjbloomberg@gmail.com',           phone:'(563) 343-7750', originCity:'Bettendorf',       originState:'IA', originZip:'52722', destinationCity:'Clearwater',      destinationState:'FL', destinationZip:'33755', moveSize:'studio',    moveDate:'2026-05-07' },
  { firstName:'Elisa',    lastName:'Panduro Barajas',  email:'elisa.p.barajas@gnail.com',       phone:'(559) 308-0236', originCity:'Visalia',          originState:'CA', originZip:'93292', destinationCity:'Lemon Grove',     destinationState:'CA', destinationZip:'91945', moveSize:'1_bedroom', moveDate:'2026-04-24' },
  { firstName:'Mya',      lastName:'Barber',           email:'myabarber1990@gmail.com',         phone:'(503) 473-5896', originCity:'Scappoose',        originState:'OR', originZip:'97056', destinationCity:'Salt Lake City',  destinationState:'UT', destinationZip:'84111', moveSize:'1_bedroom', moveDate:'2026-08-16' },
  { firstName:'Amy',      lastName:'Markham',          email:'markham.amy31@gmail.com',         phone:'(618) 444-3623', originCity:'Las Vegas',        originState:'NV', originZip:'89146', destinationCity:'Alton',           destinationState:'IL', destinationZip:'62002', moveSize:'2_bedroom', moveDate:'2026-06-24' },
  { firstName:'Rebecca',  lastName:'Bolger',           email:'bbr317@yahoo.com',                phone:'(360) 399-0653', originCity:'Burlington',       originState:'WA', originZip:'98233', destinationCity:'Snohomish',       destinationState:'WA', destinationZip:'98290', moveSize:'2_bedroom', moveDate:'2026-05-15' },
  { firstName:'Ken',      lastName:'Rose',             email:'kennethrose2014@gmail.com',       phone:'(760) 885-2876', originCity:'Pahrump',          originState:'NV', originZip:'89061', destinationCity:'Las Vegas',       destinationState:'NV', destinationZip:'89147', moveSize:'2_bedroom', moveDate:'2026-05-06' },
  { firstName:'Jeanette', lastName:'Brooks',           email:'rjeanette96@yahoo.com',           phone:'(412) 583-5840', originCity:'Allison Park',     originState:'PA', originZip:'15101', destinationCity:'Saint Petersburg',destinationState:'FL', destinationZip:'33713', moveSize:'studio',    moveDate:'2026-05-07' },
  { firstName:'Megan',    lastName:'Lentz',            email:'meganlentzcontact@gmail.com',     phone:'(424) 302-1466', originCity:'Los Angeles',      originState:'CA', originZip:'90004', destinationCity:'San Francisco',   destinationState:'CA', destinationZip:'94109', moveSize:'2_bedroom', moveDate:'2026-05-25' },
  { firstName:'Dawn',     lastName:'Jones',            email:'grammydawnjones@gmail.com',       phone:'(315) 404-2203', originCity:'Little Falls',     originState:'NY', originZip:'13365', destinationCity:'Austin',          destinationState:'TX', destinationZip:'78701', moveSize:'studio',    moveDate:'2026-05-30' },
  { firstName:'Megan',    lastName:'King',             email:'kingmeg3300@gmail.com',           phone:'(442) 230-2782', originCity:'Barstow',          originState:'CA', originZip:'92311', destinationCity:'Lawton',          destinationState:'OK', destinationZip:'73503', moveSize:'2_bedroom', moveDate:'2026-06-29' },
  { firstName:'Sunshine', lastName:'Rawlinson',        email:'sunshineonyxw@gmail.com',         phone:'(304) 654-7883', originCity:'Orlando',          originState:'FL', originZip:'32829', destinationCity:'Nashville',       destinationState:'TN', destinationZip:'37027', moveSize:'2_bedroom', moveDate:'2026-09-14' },
  { firstName:'Sam',      lastName:'Jain',             email:'kundaliya.sandeep18@gmail.com',   phone:'(405) 692-4188', originCity:'Irving',           originState:'TX', originZip:'75062', destinationCity:'Fort Worth',      destinationState:'TX', destinationZip:'76177', moveSize:'studio',    moveDate:'2026-05-09' },
  { firstName:'Relonda',  lastName:'Ballard',          email:'relondaballard24@gmail.com',      phone:'(413) 391-6689', originCity:'Springfield',      originState:'MA', originZip:'01109', destinationCity:'Springfield',     destinationState:'MA', destinationZip:'01107', moveSize:'2_bedroom', moveDate:'2026-05-01' },
  { firstName:'Kizzie',   lastName:'Wilkins',          email:'londonskyw@icloud.com',           phone:'(916) 355-1012', originCity:'Roseville',        originState:'CA', originZip:'95747', destinationCity:'Elk Grove',       destinationState:'CA', destinationZip:'95758', moveSize:'2_bedroom', moveDate:'2026-05-01' },
  { firstName:'Jean',     lastName:'Luquis Merced',    email:'jean_luquis@hotmail.com',         phone:'(224) 383-4666', originCity:'Kissimmee',        originState:'FL', originZip:'34744', destinationCity:'Green Bay',       destinationState:'WI', destinationZip:'54311', moveSize:'2_bedroom', moveDate:'2026-06-23' },
  { firstName:'Shay',     lastName:'Johnson',          email:'Savannahjohnson111@yahoo.com',    phone:'(832) 450-7800', originCity:'Houston',          originState:'TX', originZip:'77069', destinationCity:'Stockton',        destinationState:'CA', destinationZip:'95219', moveSize:'studio',    moveDate:'2026-05-12' },
  { firstName:'Darian',   lastName:'Hoffman',          email:'Darianhoffman@icloud.com',        phone:'(808) 779-7728', originCity:'Escondido',        originState:'CA', originZip:'92027', destinationCity:'Killeen',         destinationState:'TX', destinationZip:'76541', moveSize:'1_bedroom', moveDate:'2026-05-14' },
  { firstName:'Alejandra',lastName:'Mena',             email:'alejandritamena25@gmail.com',     phone:'(708) 264-3988', originCity:'Merrillville',     originState:'IN', originZip:'46410', destinationCity:'Braidwood',       destinationState:'IL', destinationZip:'60408', moveSize:'1_bedroom', moveDate:'2026-05-06' },
  { firstName:'Ashley',   lastName:'Nobles',           email:'butterflygirl6114@gmail.com',     phone:'(478) 832-1276', originCity:'Macon',            originState:'GA', originZip:'31204', destinationCity:'Warner Robins',   destinationState:'GA', destinationZip:'31093', moveSize:'1_bedroom', moveDate:'2026-05-08' },
  { firstName:'Brigid',   lastName:'Brumby',           email:'covetbrigid@me.com',              phone:'(970) 920-0000', originCity:'Round Top',        originState:'TX', originZip:'78954', destinationCity:'Snowmass Village',destinationState:'CO', destinationZip:'81615', moveSize:'2_bedroom', moveDate:'2026-05-26' },
  { firstName:'Alisa',    lastName:'Young',            email:'alisayoung0210@gmail.com',        phone:'(470) 433-6276', originCity:'Erie',             originState:'PA', originZip:'16509', destinationCity:'Columbia',        destinationState:'SC', destinationZip:'29206', moveSize:'studio',    moveDate:'2026-05-02' },
  { firstName:'Kevin',    lastName:'Colvin',           email:'keno_charlie1@yahoo.com',         phone:'(917) 753-3987', originCity:'Waldorf',          originState:'MD', originZip:'20602', destinationCity:'Waldorf',         destinationState:'MD', destinationZip:'20602', moveSize:'2_bedroom', moveDate:'2026-05-20' },
  { firstName:'Niyen',    lastName:'King',             email:'niyenking2436@gmail.com',         phone:'(858) 999-6146', originCity:'Los Angeles',      originState:'CA', originZip:'90057', destinationCity:'Denver',          destinationState:'CO', destinationZip:'80264', moveSize:'2_bedroom', moveDate:'2026-05-21' },
  { firstName:'Cheleey',  lastName:'Le',               email:'chelseylee09@yahoo.com',          phone:'(616) 448-4437', originCity:'Grand Rapids',     originState:'MI', originZip:'49508', destinationCity:'Grand Prairie',   destinationState:'TX', destinationZip:'75050', moveSize:'studio',    moveDate:'2026-06-15' },
  { firstName:'Holly',    lastName:'Riley',            email:'hzriley84@gmail.com',             phone:'(231) 730-3930', originCity:'Utica',            originState:'MI', originZip:'48317', destinationCity:'Jamestown',       destinationState:'NC', destinationZip:'27282', moveSize:'1_bedroom', moveDate:'2026-05-10' },
  { firstName:'James',    lastName:'VanSumeren',       email:'mike-giants@hotmail.com',         phone:'(703) 494-2442', originCity:'Woodbridge',       originState:'VA', originZip:'22191', destinationCity:'Killeen',         destinationState:'TX', destinationZip:'76549', moveSize:'1_bedroom', moveDate:'2026-06-12' },
  { firstName:'Mi',       lastName:'Ega',              email:'mindiegan@gmail.com',             phone:'(218) 966-4993', originCity:'Wesley Chapel',    originState:'FL', originZip:'33543', destinationCity:'Hibbing',         destinationState:'MN', destinationZip:'55746', moveSize:'1_bedroom', moveDate:'2026-05-31' },
  { firstName:'Michelle', lastName:'Ochoa',            email:'Brownbears.mlp@gmail.com',        phone:'(262) 233-0793', originCity:'Darien',           originState:'WI', originZip:'53114', destinationCity:'Phoenix',         destinationState:'AZ', destinationZip:'85027', moveSize:'1_bedroom', moveDate:'2026-05-23' },
  { firstName:'Melissa',  lastName:'Robinson',         email:'created1969@hotmail.com',         phone:'(513) 465-9373', originCity:'Middletown',       originState:'OH', originZip:'45042', destinationCity:'New Port Richey', destinationState:'FL', destinationZip:'34653', moveSize:'studio',    moveDate:'2026-05-22' },
  { firstName:'Carol',    lastName:'Nelson',           email:'avtwirler@aol.com',               phone:'(702) 684-6642', originCity:'Ruidoso',          originState:'NM', originZip:'88345', destinationCity:'North Las Vegas', destinationState:'NV', destinationZip:'89084', moveSize:'1_bedroom', moveDate:'2026-06-01' },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Inserting', ROWS.length, 'leads...\n');

  let inserted = 0, skipped = 0;

  for (const row of ROWS) {
    try {
      const homeSize = HOME_SIZE_NORM[row.moveSize.toLowerCase()] || '2 Bedroom';
      const originZip = row.originZip.replace(/\D/g, '').slice(0, 5);
      const destinationZip = row.destinationZip.replace(/\D/g, '').slice(0, 5);
      const miles = milesFromZips(originZip, destinationZip);
      const distance = miles > 100 ? 'Long Distance' : 'Local';
      const moveDate = new Date(row.moveDate);
      const customerPhone = normPhone(row.phone);
      const customerEmail = row.email.trim();

      const scoring = calculateLeadScore({ homeSize, miles, moveDate }, miles, 'mobile', moveDate);
      const pricing = await calculateAuctionPrice({ homeSize, miles, moveDate, grade: scoring.grade });

      const lead = new Lead({
        customerName: `${row.firstName} ${row.lastName}`.trim(),
        customerEmail,
        customerPhone,
        originCity: row.originCity,
        originZip,
        destinationCity: row.destinationCity,
        destinationZip,
        homeSize,
        moveDate,
        distance,
        miles,
        route: `${row.originCity} → ${row.destinationCity}`,
        status: 'READY_FOR_DISTRIBUTION',
        isVerified: true,
        grade: scoring.grade,
        score: scoring.score,
        scoreFactors: scoring.scoreFactors,
        buyNowPrice: pricing.buyNowPrice,
        startingBidPrice: pricing.startingBidPrice,
        currentBidPrice: pricing.startingBidPrice,
        price: pricing.buyNowPrice,
        auctionStatus: 'active',
        auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        statusHistory: [{ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() }],
      });

      await lead.save();
      console.log(`  ✓ ${customerEmail} | ${homeSize} | ${row.moveDate} | $${pricing.buyNowPrice}`);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ${row.email}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone — inserted: ${inserted}, skipped: ${skipped}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });

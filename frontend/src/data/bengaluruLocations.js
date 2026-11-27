const locationGroups = {
  north: [
    'Hebbal', 'Hebbal Kempapura', 'Amruthahalli', 'Dasarahalli (Hebbal)', 'Byatarayanapura', 'Kodigehalli',
    'Sahakar Nagar', 'Judicial Layout', 'Jakkur', 'Yelahanka', 'Yelahanka New Town', 'Allalasandra', 'Kogilu',
    'Agrahara', 'Thanisandra', 'Nagawara', 'Hegde Nagar', 'GKVK', 'Vidyaranyapura', 'Jalahalli',
    'Doddabommasandra', 'BEL Circle', 'MS Palya', 'Attur Layout', 'Ramagondanahalli (Yelahanka)', 'Singanayakanahalli'
  ],
  airport: [
    'Bagalur', 'Bettahalasur', 'Chikkajala', 'Doddajala', 'Hunasamaranahalli', 'Sathanur', 'Razack Palya',
    'Shettigere', 'Sadahalli', 'Kempegowda International Airport', 'Airport Cargo Terminal', 'KIADB Aerospace Park',
    'Devanahalli', 'Vijayapura', 'Doddaballapura'
  ],
  immediateCorridor: [
    'Esteem Mall', 'Hebbal Junction', 'Hebbal Police Station', 'Anand Nagar', 'Ganganagar', 'RT Nagar', 'Sanjay Nagar',
    'KEB Layout', 'Geddalahalli (Sanjay Nagar)', 'RMV Extension', 'RMV 2nd Stage', 'Dollars Colony', 'Bhoopasandra',
    'Nagashettyhalli', 'Veterinary College', 'CBI Junction', 'Mekhri Circle', 'Sadashivanagar', 'Palace Grounds',
    'Cauvery Theatre', 'Palace Guttahalli', 'BDA Office', 'BDA Flyover', 'Lower Palace Orchards',
    'Upper Palace Orchards', 'Jayamahal', 'Vasanth Nagar', 'High Grounds', 'Windsor Square', 'Sophia Circle', 'Chalukya Circle'
  ],
  central: [
    'Cunningham Road', 'Millers Road', 'Shivajinagar', 'Cantonment', 'Benson Town', 'Richards Town', 'Frazer Town',
    'Cooke Town', 'Cox Town', 'Pulakeshinagar', 'Vidhana Soudha', 'Cubbon Park', 'Race Course Road',
    'Kumara Krupa Road', 'Seshadripuram', 'Gandhi Nagar', 'Majestic', 'KSR Railway Station', 'KR Circle',
    'Hudson Circle', 'MG Road', 'Brigade Road', 'Commercial Street', 'Richmond Town', 'Langford Town',
    'Shantinagar', 'Residency Road', 'Ashok Nagar', 'Wilson Garden', 'KR Market', 'Chamarajpet', 'UB City',
    'Museum Road', 'Richmond Circle', 'Corporation Circle', 'Town Hall', 'Lalbagh'
  ],
  east: [
    'HBR Layout', 'HRBR Layout', 'Kalyan Nagar', 'Kammanahalli', 'Banaswadi', 'Hennur', 'Horamavu', 'Babusapalya',
    'Kothanur', 'Hennur Gardens', 'Ramamurthy Nagar', 'TC Palya', 'Kasturi Nagar', 'Kaggadasapura', 'CV Raman Nagar',
    'Benniganahalli', 'KR Puram', 'Tin Factory', 'Old Madras Road', 'Dooravani Nagar', 'Ulsoor', 'Indiranagar',
    'Domlur', 'Jeevan Bima Nagar', 'HAL', 'New Thippasandra', 'Baiyappanahalli', 'Lingarajapuram'
  ],
  easternIt: [
    'Mahadevapura', 'Hoodi', 'Whitefield', 'ITPL', 'Kadugodi', 'Brookefield', 'AECS Layout', 'Kundalahalli',
    'Marathahalli', 'Doddanekundi', 'Varthur', 'Panathur', 'Bellandur', 'Devarabeesanahalli', 'Gunjur',
    'Sarjapur Road', 'Hoskote', 'Budigere Cross', 'Bagmane Tech Park', 'Manyata Tech Park', 'Embassy Tech Village',
    'RMZ Ecospace', 'RMZ Ecoworld'
  ],
  westNorthWest: [
    'Yeshwanthpur', 'Mathikere', 'IISc Campus', 'Gokula', 'Malleswaram', 'Rajajinagar', 'Mahalakshmi Layout',
    'Nandini Layout', 'Laggere', 'Peenya', 'Yeshwanthpur Industrial Area', 'Goraguntepalya', 'Jalahalli Cross',
    'T. Dasarahalli', 'Nagasandra', 'Bagalakunte', 'Chikkabanavara', 'Hesaraghatta', 'Madavara', 'Nelamangala',
    'Tumkur Road', 'Subramanyanagar', 'Srirampura', 'Okalipuram'
  ],
  southWest: [
    'Vijayanagar', 'Basaveshwaranagar', 'Kamakshipalya', 'Magadi Road', 'Nagarbhavi', 'Chandra Layout',
    'Deepanjali Nagar', 'Kengeri', 'RR Nagar', 'Kumbalgodu', 'Uttarahalli', 'Banashankari', 'Bidadi',
    'Ramanagara', 'Mysore Road', 'BSK 2nd Stage', 'BSK 3rd Stage', 'BSK 6th Stage', 'Padmanabhanagar'
  ],
  south: [
    'Basavanagudi', 'Hanumanthanagar', 'Jayanagar', 'JP Nagar', 'BTM Layout', 'Madiwala', 'Koramangala',
    'Adugodi', 'Dairy Circle', 'Silk Board', 'HSR Layout', 'Bommanahalli', 'Begur', 'Arekere', 'Hulimavu',
    'Bannerghatta Road', 'Gottigere', 'Konanakunte', 'Anjanapura', 'Kanakapura Road', 'Kumaraswamy Layout',
    'Tilak Nagar', 'Jayadeva Hospital'
  ],
  southernItIndustrial: [
    'Electronic City Phase 1', 'Electronic City Phase 2', 'Singasandra', 'Kudlu Gate', 'Hosa Road',
    'Beratena Agrahara', 'Bommasandra', 'Jigani', 'Chandapura', 'Attibele', 'Anekal', 'Sarjapur', 'Hosur Road'
  ],
  externalPeripheral: [
    'Chikkaballapura', 'Bagepalli', 'Gauribidanur', 'Tumakuru', 'Dabaspet', 'Kolar', 'Malur', 'Bangarapet',
    'Mysuru', 'Mandya', 'Hosur', 'Chintamani', 'Hindupur', 'Anantapur', 'Kanakapura', 'Magadi',
    'Other Karnataka', 'Other State'
  ]
};

export const bengaluruLocations = [...new Set(Object.values(locationGroups).flat())];

export const bengaluruLocationAliases = {
  KIA: ['Kempegowda International Airport'],
  BIAL: ['Kempegowda International Airport'],
  Airport: ['Kempegowda International Airport'],
  Mekri: ['Mekhri Circle'],
  Mehkri: ['Mekhri Circle'],
  Mekhri: ['Mekhri Circle'],
  KRP: ['KR Puram'],
  'KR Puram': ['KR Puram'],
  Krishnarajapura: ['KR Puram'],
  Yeshwantpur: ['Yeshwanthpur'],
  Yesvantpur: ['Yeshwanthpur'],
  Malleshwaram: ['Malleswaram'],
  Malleswaram: ['Malleswaram'],
  'R T Nagar': ['RT Nagar'],
  'RT Nagar': ['RT Nagar'],
  'Rajarajeshwari Nagar': ['RR Nagar'],
  'R R Nagar': ['RR Nagar'],
  'E-City': ['Electronic City Phase 1', 'Electronic City Phase 2'],
  'Electronic City': ['Electronic City Phase 1', 'Electronic City Phase 2'],
  Manyata: ['Manyata Tech Park'],
  Manayata: ['Manyata Tech Park'],
  Guttahalli: ['Palace Guttahalli'],
  'Palace Guttahalli': ['Palace Guttahalli'],
  Chalukya: ['Chalukya Circle'],
  'Basaveshwara Circle': ['Chalukya Circle'],
  Cauvery: ['Cauvery Theatre'],
  'Kaveri Theatre': ['Cauvery Theatre'],
  Majestic: ['Majestic'],
  'Kempegowda Bus Station': ['Majestic'],
  KBS: ['Majestic'],
  'City Railway Station': ['KSR Railway Station'],
  SBC: ['KSR Railway Station'],
  Sophia: ['Sophia Circle'],
  'Sofia Circle': ['Sophia Circle'],
  Tumkur: ['Tumakuru'],
  Tumakuru: ['Tumakuru'],
  Mysore: ['Mysuru'],
  Mysuru: ['Mysuru']
};

export function normalizeLocationSearch(value = '') {
  return String(value)
    .toLocaleLowerCase('en-IN')
    .replace(/[.(),-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const aliasesByLocation = Object.entries(bengaluruLocationAliases).reduce((index, [alias, locations]) => {
  locations.forEach((location) => {
    if (!index[location]) index[location] = [];
    index[location].push(alias);
  });
  return index;
}, {});

export function findBengaluruLocations(query, limit = 12) {
  const normalizedQuery = normalizeLocationSearch(query);
  if (!normalizedQuery) return bengaluruLocations.slice(0, limit);

  return bengaluruLocations
    .map((location, originalIndex) => {
      const terms = [location, ...(aliasesByLocation[location] || [])].map(normalizeLocationSearch);
      const exact = terms.some((term) => term === normalizedQuery);
      const startsWith = terms.some((term) => term.startsWith(normalizedQuery));
      const partial = terms.some((term) => term.includes(normalizedQuery));
      return { location, originalIndex, rank: exact ? 0 : startsWith ? 1 : partial ? 2 : 3 };
    })
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.location.localeCompare(b.location) || a.originalIndex - b.originalIndex)
    .slice(0, limit)
    .map((entry) => entry.location);
}

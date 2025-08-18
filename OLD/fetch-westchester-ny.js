#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const { Client } = require('pg');

// CORRECT Westchester County, NY region IDs
// Format: 6_XXXXX for cities in New York
const WESTCHESTER_REGIONS = [
  { name: 'Mount Kisco', regionId: '6_12517', type: 'city' },
  // We need to find the other city codes through testing
  // These are common Westchester cities we should try
];

// Potential city codes to test (based on typical Redfin patterns)
const CITIES_TO_TEST = [
  { name: 'Bedford', codes: ['6_9660', '6_1455', '6_30056'] },
  { name: 'Chappaqua', codes: ['6_11226', '6_3993', '6_30115'] },
  { name: 'Scarsdale', codes: ['6_30986', '6_16949', '6_21080'] },
  { name: 'White Plains', codes: ['6_32383', '6_24273', '6_30749'] },
  { name: 'Rye', codes: ['6_30943', '6_16664', '6_20799'] },
  { name: 'Bronxville', codes: ['6_30088', '6_2400', '6_10837'] },
  { name: 'Yorktown Heights', codes: ['6_33219', '6_25478', '6_33220'] },
  { name: 'Armonk', codes: ['6_29516', '6_814', '6_8570'] },
  { name: 'Katonah', codes: ['6_31476', '6_11014', '6_15090'] }
];

const CONFIG = {
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: 'redfin-com-data.p.rapidapi.com',
  databaseUrl: process.env.DATABASE_URL
};

function makeRequest(path) {
  const options = {
    method: 'GET',
    hostname: CONFIG.rapidApiHost,
    port: null,
    path: path,
    headers: {
      'x-rapidapi-key': CONFIG.rapidApiKey,
      'x-rapidapi-host': CONFIG.rapidApiHost
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        try {
          const data = JSON.parse(body.toString());
          resolve(data);
        } catch (error) {
          resolve({ error: body.toString() });
        }
      });
    });
    req.on('error', (error) => reject(error));
    req.end();
  });
}

async function findValidRegionIds() {
  console.log('🔍 Finding valid Westchester NY region IDs...\n');
  
  const validRegions = [
    { name: 'Mount Kisco', regionId: '6_12517', type: 'city' } // We know this one works
  ];
  
  for (const city of CITIES_TO_TEST) {
    console.log(`Testing ${city.name}...`);
    
    for (const code of city.codes) {
      try {
        const result = await makeRequest(`/properties/search-sale?regionId=${code}&limit=1`);
        
        if (result.data && result.data[0]) {
          const prop = result.data[0].homeData;
          const cityName = prop.addressInfo?.city;
          const state = prop.addressInfo?.state;
          
          if (state === 'NY' && cityName) {
            console.log(`  ✅ Found NY city: ${code} = ${cityName}, ${state}`);
            
            // Check if it's the city we're looking for
            if (cityName.toLowerCase().includes(city.name.toLowerCase().split(' ')[0])) {
              validRegions.push({ name: city.name, regionId: code, type: 'city' });
              console.log(`  🎯 MATCH! ${city.name} = ${code}`);
              break; // Found it, move to next city
            }
          }
        }
        
        await new Promise(r => setTimeout(r, 500)); // Rate limiting
      } catch (error) {
        // Ignore errors and continue
      }
    }
  }
  
  return validRegions;
}

async function fetchPropertiesForRegion(region, dbClient) {
  console.log(`\n📍 Fetching properties for ${region.name}, NY...`);
  
  let totalSaved = 0;
  
  try {
    // Fetch active listings
    const salePath = `/properties/search-sale?regionId=${region.regionId}&limit=15`;
    const saleResult = await makeRequest(salePath);
    
    if (saleResult.data) {
      console.log(`  Found ${saleResult.data.length} active listings`);
      
      for (const item of saleResult.data) {
        if (item.homeData && item.homeData.addressInfo?.state === 'NY') {
          await savePropertyToDatabase(item.homeData, item.listingData, dbClient, region.name);
          totalSaved++;
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Fetch sold properties
    const soldPath = `/properties/search-sold?regionId=${region.regionId}&limit=15`;
    const soldResult = await makeRequest(soldPath);
    
    if (soldResult.data) {
      console.log(`  Found ${soldResult.data.length} sold properties`);
      
      for (const item of soldResult.data) {
        if (item.homeData && item.homeData.addressInfo?.state === 'NY') {
          await savePropertyToDatabase(item.homeData, item.listingData, dbClient, region.name, 'sold');
          totalSaved++;
        }
      }
    }
    
    console.log(`  💾 Saved ${totalSaved} properties from ${region.name}`);
    
  } catch (error) {
    console.error(`  Error: ${error.message}`);
  }
  
  return totalSaved;
}

async function savePropertyToDatabase(homeData, listingData, client, cityName, status = 'active') {
  const listing = listingData || {};
  const address = homeData.addressInfo;
  
  // Only save if it's actually in NY
  if (address?.state !== 'NY') return;
  
  try {
    const query = `
      INSERT INTO properties (
        id, property_id, address, beds, baths, sqft, acres,
        district, asking_price, sold_price, listing_date, sale_date,
        dom, property_type, year_built, status, lat, lng,
        mls_id, redfin_url, photos, description, location
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT (property_id) DO UPDATE SET
        address = EXCLUDED.address,
        beds = EXCLUDED.beds,
        baths = EXCLUDED.baths,
        sqft = EXCLUDED.sqft,
        status = EXCLUDED.status,
        asking_price = EXCLUDED.asking_price,
        sold_price = EXCLUDED.sold_price,
        updated_at = NOW()
    `;
    
    const values = [
      homeData.propertyId || `ny-${Date.now()}-${Math.random()}`,
      homeData.propertyId || `ny-${Date.now()}-${Math.random()}`,
      address?.formattedStreetLine || 'Address not available',
      listing.beds || 0,
      listing.baths || 0,
      listing.sqft || 0,
      listing.lotSize ? (listing.lotSize / 43560).toFixed(2) : 0,
      determineSchoolDistrict(address?.city || cityName),
      listing.price || 0,
      listing.soldPrice || null,
      listing.listingDate ? new Date(listing.listingDate) : new Date(),
      listing.soldDate ? new Date(listing.soldDate) : null,
      listing.daysOnMarket || 0,
      homeData.propertyType || 'Single Family',
      listing.yearBuilt || null,
      status === 'sold' ? 'sold' : (listing.pending ? 'pending' : 'active'),
      address?.centroid?.lat || 41.0,
      address?.centroid?.lon || -73.7,
      listing.mlsId || null,
      homeData.url ? `https://www.redfin.com${homeData.url}` : '',
      JSON.stringify(homeData.photosInfo || []),
      listing.description || '',
      `${address?.city || cityName}, NY`
    ];
    
    await client.query(query, values);
  } catch (err) {
    console.error(`    Error saving: ${err.message}`);
  }
}

function determineSchoolDistrict(city) {
  const cityLower = (city || '').toLowerCase();
  
  if (cityLower.includes('bedford')) return 'Bedford Central';
  if (cityLower.includes('chappaqua')) return 'Chappaqua Central';
  if (cityLower.includes('mount kisco') || cityLower.includes('kisco')) return 'Bedford Central';
  if (cityLower.includes('yorktown')) return 'Yorktown Central';
  if (cityLower.includes('scarsdale')) return 'Scarsdale';
  if (cityLower.includes('bronxville')) return 'Bronxville';
  if (cityLower.includes('rye')) return 'Rye City';
  if (cityLower.includes('white plains')) return 'White Plains';
  if (cityLower.includes('armonk')) return 'Byram Hills';
  if (cityLower.includes('katonah')) return 'Katonah-Lewisboro';
  
  return 'Westchester County';
}

async function main() {
  console.log('🏠 Fetching REAL Westchester County, NY Properties');
  console.log('================================================\n');
  
  const client = new Client({ connectionString: CONFIG.databaseUrl });
  await client.connect();
  
  // Find valid region IDs
  const validRegions = await findValidRegionIds();
  
  console.log(`\n✅ Found ${validRegions.length} valid NY regions`);
  validRegions.forEach(r => console.log(`  - ${r.name}: ${r.regionId}`));
  
  // Fetch properties for each valid region
  let totalSaved = 0;
  
  for (const region of validRegions) {
    const saved = await fetchPropertiesForRegion(region, client);
    totalSaved += saved;
    await new Promise(r => setTimeout(r, 2000)); // Rate limiting between regions
  }
  
  console.log('\n================================================');
  console.log(`✅ Total properties saved: ${totalSaved}`);
  
  // Check final count
  const countResult = await client.query('SELECT COUNT(*) FROM properties WHERE location LIKE \'%, NY\'');
  console.log(`📊 Total NY properties in database: ${countResult.rows[0].count}`);
  
  await client.end();
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
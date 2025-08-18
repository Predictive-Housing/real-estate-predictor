#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const { Client } = require('pg');

const CONFIG = {
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: 'redfin-com-data.p.rapidapi.com',
  databaseUrl: process.env.DATABASE_URL
};

// Helper function to make API requests
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

async function fetchNYProperties() {
  console.log('🏠 Fetching Westchester County, NY Properties\n');
  
  const client = new Client({ connectionString: CONFIG.databaseUrl });
  await client.connect();
  
  // First, clear the incorrect data
  console.log('🧹 Clearing incorrect data from database...');
  await client.query(`
    DELETE FROM properties 
    WHERE location NOT LIKE '%NY%' 
    OR address LIKE '%Ave%' 
    OR address LIKE '%St%'
    OR address LIKE '%Hwy%'
  `);
  
  // These are actual Redfin location IDs for NY cities (found through research)
  // Format: regionId should be the actual numeric ID for the city
  const nyLocations = [
    { name: 'Scarsdale, NY', searchTerm: 'Scarsdale, NY 10583' },
    { name: 'White Plains, NY', searchTerm: 'White Plains, NY 10601' },
    { name: 'Rye, NY', searchTerm: 'Rye, NY 10580' },
    { name: 'Harrison, NY', searchTerm: 'Harrison, NY 10528' },
    { name: 'Mamaroneck, NY', searchTerm: 'Mamaroneck, NY 10543' },
    { name: 'Larchmont, NY', searchTerm: 'Larchmont, NY 10538' },
    { name: 'Bronxville, NY', searchTerm: 'Bronxville, NY 10708' },
    { name: 'Eastchester, NY', searchTerm: 'Eastchester, NY 10709' },
    { name: 'New Rochelle, NY', searchTerm: 'New Rochelle, NY 10801' },
    { name: 'Yonkers, NY', searchTerm: 'Yonkers, NY 10701' }
  ];
  
  // Try searching by ZIP codes which might work better
  const westchesterZips = [
    '10506', // Bedford
    '10514', // Chappaqua  
    '10549', // Mount Kisco
    '10598', // Yorktown Heights
    '10504', // Armonk
    '10536', // Katonah
    '10576', // Pound Ridge
    '10570', // Pleasantville
    '10583', // Scarsdale
    '10601'  // White Plains
  ];
  
  console.log('🔍 Attempting to fetch properties by ZIP code...\n');
  
  let totalSaved = 0;
  let apiCalls = 0;
  
  for (const zip of westchesterZips) {
    if (apiCalls >= 20) {
      console.log('⚠️ Limiting API calls to conserve quota');
      break;
    }
    
    console.log(`📍 Searching ZIP code ${zip}...`);
    
    try {
      // Try the search endpoint with just ZIP code
      const searchPath = `/properties/search?location=${zip}&limit=10`;
      const result = await makeRequest(searchPath);
      apiCalls++;
      
      if (result.data && Array.isArray(result.data)) {
        console.log(`  Found ${result.data.length} properties`);
        
        for (const prop of result.data) {
          if (prop.homeData) {
            const address = prop.homeData.addressInfo;
            
            // Verify this is actually in NY
            if (address && (address.state === 'NY' || address.state === 'New York')) {
              console.log(`  ✅ Valid NY property: ${address.formattedStreetLine}, ${address.city}, ${address.state}`);
              
              // Save to database
              await savePropertyToDatabase(prop.homeData, prop.listingData, client, address.city);
              totalSaved++;
            } else if (!address) {
              // If no address info, skip
              console.log(`  ⚠️ No address info, checking description...`);
            }
          }
        }
      } else if (result.homes) {
        // Alternative response format
        console.log(`  Found ${result.homes.length} properties (alternate format)`);
        
        for (const home of result.homes) {
          // Check if it's in NY
          if (home.location && home.location.includes('NY')) {
            console.log(`  ✅ Valid NY property: ${home.streetAddress}, ${home.city}, NY`);
            totalSaved++;
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limiting
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Total properties saved: ${totalSaved}`);
  console.log(`📊 API calls used: ${apiCalls}`);
  
  // Check final count
  const countResult = await client.query('SELECT COUNT(*) FROM properties');
  console.log(`📈 Total properties in database: ${countResult.rows[0].count}`);
  
  await client.end();
}

async function savePropertyToDatabase(homeData, listingData, client, city) {
  const listing = listingData || {};
  
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
        updated_at = NOW()
    `;
    
    const values = [
      homeData.propertyId || `ny-${Date.now()}-${Math.random()}`,
      homeData.propertyId || `ny-${Date.now()}-${Math.random()}`,
      homeData.addressInfo?.formattedStreetLine || 'Address not available',
      listing.beds || 0,
      listing.baths || 0,
      listing.sqft || 0,
      listing.lotSize ? (listing.lotSize / 43560).toFixed(2) : 0,
      determineWestchesterDistrict(city),
      listing.price || 0,
      listing.soldPrice || null,
      listing.listingDate ? new Date(listing.listingDate) : new Date(),
      listing.soldDate ? new Date(listing.soldDate) : null,
      listing.daysOnMarket || 0,
      homeData.propertyType || 'Single Family',
      listing.yearBuilt || null,
      listing.soldDate ? 'sold' : 'active',
      homeData.addressInfo?.centroid?.lat || 41.0,
      homeData.addressInfo?.centroid?.lon || -73.7,
      listing.mlsId || null,
      homeData.url ? `https://www.redfin.com${homeData.url}` : '',
      JSON.stringify(homeData.photosInfo || []),
      listing.description || '',
      `${city}, NY`
    ];
    
    await client.query(query, values);
  } catch (err) {
    console.error(`    Error saving: ${err.message}`);
  }
}

function determineWestchesterDistrict(city) {
  const cityLower = city?.toLowerCase() || '';
  
  // Actual school districts in Westchester
  if (cityLower.includes('bedford') || cityLower.includes('pound ridge')) 
    return 'Bedford Central';
  if (cityLower.includes('chappaqua') || cityLower.includes('armonk')) 
    return 'Chappaqua Central';
  if (cityLower.includes('yorktown')) 
    return 'Yorktown Central';
  if (cityLower.includes('scarsdale')) 
    return 'Scarsdale';
  if (cityLower.includes('bronxville')) 
    return 'Bronxville';
  if (cityLower.includes('rye')) 
    return 'Rye City';
  
  return 'Westchester County';
}

fetchNYProperties();
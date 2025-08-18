#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const { Client } = require('pg');

// Configuration - These are actual Redfin region IDs for Westchester County
const CONFIG = {
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: 'redfin-com-data.p.rapidapi.com',
  databaseUrl: process.env.DATABASE_URL,
  regions: [
    { name: 'Bedford', regionId: '6_9949', type: 'city' },
    { name: 'Mount Kisco', regionId: '6_17633', type: 'city' },
    { name: 'Chappaqua', regionId: '6_11407', type: 'city' },
    { name: 'Yorktown Heights', regionId: '6_27052', type: 'city' },
    { name: 'Armonk', regionId: '6_8632', type: 'city' },
    { name: 'Pound Ridge', regionId: '6_19778', type: 'city' },
    { name: 'Katonah', regionId: '6_15259', type: 'city' }
  ]
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
          console.log('Response:', body.toString().substring(0, 200));
          resolve({ error: 'Invalid JSON response' });
        }
      });
    });
    req.on('error', (error) => reject(error));
    req.end();
  });
}

// Fetch properties for sale and recently sold
async function fetchComprehensiveData(region, dbClient) {
  console.log(`\n📍 Fetching data for ${region.name}...`);
  
  const allProperties = [];
  let apiCallCount = 0;
  
  try {
    // 1. Fetch properties for sale
    console.log('  🏠 Fetching active listings...');
    const salePath = `/properties/search-sale?regionId=${region.regionId}&limit=20`;
    const saleResults = await makeRequest(salePath);
    apiCallCount++;
    
    if (saleResults.data && Array.isArray(saleResults.data)) {
      console.log(`    Found ${saleResults.data.length} active listings`);
      for (const prop of saleResults.data) {
        if (prop.homeData) {
          allProperties.push({
            ...prop.homeData,
            listingData: prop.listingData,
            searchType: 'active',
            region: region.name
          });
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    
    // 2. Fetch recently sold properties
    console.log('  💰 Fetching recently sold...');
    const soldPath = `/properties/search-sold?regionId=${region.regionId}&limit=20`;
    const soldResults = await makeRequest(soldPath);
    apiCallCount++;
    
    if (soldResults.data && Array.isArray(soldResults.data)) {
      console.log(`    Found ${soldResults.data.length} sold properties`);
      for (const prop of soldResults.data) {
        if (prop.homeData) {
          allProperties.push({
            ...prop.homeData,
            listingData: prop.listingData,
            searchType: 'sold',
            region: region.name
          });
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    
    // 3. Fetch property details for top properties (limit to save API calls)
    const detailedProperties = [];
    const propsToDetail = allProperties.slice(0, 5); // Only detail first 5 to save API calls
    
    for (const prop of propsToDetail) {
      if (prop.propertyId && apiCallCount < 15) { // Limit API calls per region
        console.log(`  🔍 Getting details for property ${prop.propertyId}...`);
        
        const detailPath = `/properties/detail?propertyId=${prop.propertyId}`;
        const details = await makeRequest(detailPath);
        apiCallCount++;
        
        if (details && !details.error) {
          detailedProperties.push({
            ...prop,
            details: details.data || details
          });
        } else {
          detailedProperties.push(prop);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        detailedProperties.push(prop);
      }
    }
    
    // Add remaining properties without details
    detailedProperties.push(...allProperties.slice(5));
    
    console.log(`  ✅ Total properties found: ${detailedProperties.length}`);
    console.log(`  📊 API calls used: ${apiCallCount}`);
    
    // Save to database
    let savedCount = 0;
    for (const prop of detailedProperties) {
      try {
        await savePropertyToDatabase(prop, dbClient);
        savedCount++;
      } catch (err) {
        console.error(`    Error saving property: ${err.message}`);
      }
    }
    
    console.log(`  💾 Saved ${savedCount} properties to database`);
    
    return { apiCallCount, propertiesFound: detailedProperties.length, savedCount };
    
  } catch (error) {
    console.error(`  ❌ Error fetching data for ${region.name}:`, error.message);
    return { apiCallCount, propertiesFound: 0, savedCount: 0 };
  }
}

// Save property to database
async function savePropertyToDatabase(prop, dbClient) {
  const listing = prop.listingData || {};
  const details = prop.details || {};
  
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
      acres = EXCLUDED.acres,
      asking_price = EXCLUDED.asking_price,
      sold_price = EXCLUDED.sold_price,
      status = EXCLUDED.status,
      dom = EXCLUDED.dom,
      description = EXCLUDED.description,
      updated_at = NOW()
  `;
  
  const status = prop.searchType === 'sold' ? 'sold' : 
                 (listing.pending ? 'pending' : 'active');
  
  const values = [
    prop.propertyId || `redfin-${Date.now()}-${Math.random()}`,
    prop.propertyId || `redfin-${Date.now()}-${Math.random()}`,
    prop.addressInfo?.formattedStreetLine || details.address || 'Address not available',
    listing.beds || details.beds || 0,
    listing.baths || details.baths || 0,
    listing.sqft || details.sqft || 0,
    listing.lotSize ? (listing.lotSize / 43560).toFixed(2) : 0,
    determineSchoolDistrict(prop.region),
    listing.price || details.price || 0,
    listing.soldPrice || details.soldPrice || null,
    listing.listingDate ? new Date(listing.listingDate) : new Date(),
    listing.soldDate ? new Date(listing.soldDate) : null,
    listing.daysOnMarket || details.dom || 0,
    prop.propertyType || details.propertyType || 'Single Family',
    listing.yearBuilt || details.yearBuilt || null,
    status,
    prop.addressInfo?.centroid?.lat || details.lat || 41.2048,
    prop.addressInfo?.centroid?.lon || details.lng || -73.7032,
    listing.mlsId || details.mlsId || null,
    prop.url ? `https://www.redfin.com${prop.url}` : '',
    JSON.stringify(prop.photosInfo || details.photos || []),
    listing.description || details.description || '',
    prop.region
  ];
  
  await dbClient.query(query, values);
}

// Determine school district
function determineSchoolDistrict(location) {
  const locationLower = location.toLowerCase();
  if (locationLower.includes('bedford') || locationLower.includes('pound ridge') || locationLower.includes('katonah')) 
    return 'Bedford Central';
  if (locationLower.includes('chappaqua') || locationLower.includes('armonk')) 
    return 'Chappaqua Central';
  if (locationLower.includes('yorktown') || locationLower.includes('kisco')) 
    return 'Yorktown Central';
  return 'Northern Westchester';
}

// Main function
async function fetchAllComprehensiveData() {
  console.log('🚀 Starting Comprehensive Redfin Data Fetch');
  console.log('=========================================\n');
  
  const client = new Client({
    connectionString: CONFIG.databaseUrl,
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Supabase database\n');
    
    let totalAPICalls = 0;
    let totalProperties = 0;
    let totalSaved = 0;
    
    // Fetch data for each region
    for (const region of CONFIG.regions) {
      if (totalAPICalls >= 80) {
        console.log('\n⚠️ Approaching API limit, stopping fetch');
        break;
      }
      
      const result = await fetchComprehensiveData(region, client);
      totalAPICalls += result.apiCallCount;
      totalProperties += result.propertiesFound;
      totalSaved += result.savedCount;
      
      // Delay between regions
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n=========================================');
    console.log('📊 Final Statistics:');
    console.log(`  Total API calls used: ${totalAPICalls}/100`);
    console.log(`  Total properties found: ${totalProperties}`);
    console.log(`  Total properties saved: ${totalSaved}`);
    
    // Get total count from database
    const countResult = await client.query('SELECT COUNT(*) FROM properties');
    console.log(`  Total properties in database: ${countResult.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await client.end();
  }
}

// Run if executed directly
if (require.main === module) {
  fetchAllComprehensiveData()
    .then(() => {
      console.log('\n✅ Data fetch completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { fetchAllComprehensiveData };
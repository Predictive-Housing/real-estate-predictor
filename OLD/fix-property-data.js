#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const { Client } = require('pg');

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

async function updateExistingProperties() {
  console.log('🔧 Fixing existing property data...\n');
  
  const client = new Client({ connectionString: CONFIG.databaseUrl });
  await client.connect();
  
  // First, clear all properties to start fresh
  await client.query('TRUNCATE TABLE properties');
  console.log('✅ Cleared old data\n');
  
  // Mount Kisco region ID that we know works
  const regionId = '6_12517';
  
  // Fetch active listings
  console.log('📍 Fetching Mount Kisco active listings...');
  const salePath = `/properties/search-sale?regionId=${regionId}&limit=20`;
  const saleResult = await makeRequest(salePath);
  
  let savedCount = 0;
  
  if (saleResult.data) {
    console.log(`Found ${saleResult.data.length} active listings\n`);
    
    for (const item of saleResult.data) {
      if (item.homeData) {
        const home = item.homeData;
        
        // Extract data from the correct location in the response
        const beds = home.beds || 0;
        const baths = home.baths || home.bathInfo?.computedTotalBaths || 0;
        const price = home.priceInfo?.amount || home.priceInfo?.homePrice?.int64Value || 0;
        const sqft = home.sqftInfo?.amount || 0;
        const yearBuilt = home.yearBuilt?.yearBuilt || null;
        const daysOnMarket = home.daysOnMarket?.daysOnMarket || 0;
        const address = home.addressInfo;
        
        console.log(`  Saving: ${address?.formattedStreetLine} - ${beds}bd/${baths}ba, ${sqft}sqft, $${parseInt(price).toLocaleString()}`);
        
        await saveProperty(home, 'active', client);
        savedCount++;
      }
    }
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Fetch sold properties
  console.log('\n📍 Fetching Mount Kisco sold properties...');
  const soldPath = `/properties/search-sold?regionId=${regionId}&limit=20`;
  const soldResult = await makeRequest(soldPath);
  
  if (soldResult.data) {
    console.log(`Found ${soldResult.data.length} sold properties\n`);
    
    for (const item of soldResult.data) {
      if (item.homeData) {
        const home = item.homeData;
        
        const beds = home.beds || 0;
        const baths = home.baths || home.bathInfo?.computedTotalBaths || 0;
        const price = home.priceInfo?.amount || home.priceInfo?.homePrice?.int64Value || 0;
        const sqft = home.sqftInfo?.amount || 0;
        const address = home.addressInfo;
        
        console.log(`  Saving: ${address?.formattedStreetLine} - ${beds}bd/${baths}ba, ${sqft}sqft, $${parseInt(price).toLocaleString()}`);
        
        await saveProperty(home, 'sold', client);
        savedCount++;
      }
    }
  }
  
  console.log(`\n✅ Total properties saved: ${savedCount}`);
  
  // Verify the data
  const result = await client.query(`
    SELECT address, beds, baths, sqft, asking_price, status 
    FROM properties 
    WHERE asking_price > 0
    LIMIT 5
  `);
  
  console.log('\nSample properties with data:');
  result.rows.forEach(r => {
    console.log(`  ${r.address}: ${r.beds}bd/${r.baths}ba, ${r.sqft}sqft, $${parseInt(r.asking_price).toLocaleString()} (${r.status})`);
  });
  
  await client.end();
}

async function saveProperty(home, status, client) {
  const address = home.addressInfo;
  
  // Extract all data from the correct locations
  const beds = home.beds || 0;
  const baths = home.baths || home.bathInfo?.computedTotalBaths || 0;
  const price = parseInt(home.priceInfo?.amount || home.priceInfo?.homePrice?.int64Value || 0);
  const sqft = parseInt(home.sqftInfo?.amount || 0);
  const yearBuilt = home.yearBuilt?.yearBuilt || null;
  const daysOnMarket = parseInt(home.daysOnMarket?.daysOnMarket || 0);
  const lotSize = home.lotSize?.amount || 0;
  const lastSoldPrice = home.lastSaleData?.lastSoldPrice || null;
  const lastSoldDate = home.lastSaleData?.lastSoldDate || null;
  
  // Determine if sold based on status or lastSaleData
  const isSold = status === 'sold' || (lastSoldPrice && lastSoldDate && !price);
  
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
        asking_price = EXCLUDED.asking_price,
        sold_price = EXCLUDED.sold_price,
        dom = EXCLUDED.dom,
        year_built = EXCLUDED.year_built,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
    
    const values = [
      home.propertyId,
      home.propertyId,
      address?.formattedStreetLine || 'Address not available',
      beds,
      baths,
      sqft,
      lotSize ? (lotSize / 43560).toFixed(2) : 0,
      determineSchoolDistrict(address?.city),
      isSold ? 0 : price,  // If sold, asking price is 0
      isSold ? (price || lastSoldPrice) : null,  // If sold, use price as sold price
      home.listingAddedDate || new Date(),
      isSold ? (lastSoldDate || new Date()) : null,
      daysOnMarket,
      home.propertyType === 3 ? 'Condo' : 'Single Family',
      yearBuilt,
      isSold ? 'sold' : 'active',
      address?.centroid?.centroid?.latitude || 41.2,
      address?.centroid?.centroid?.longitude || -73.7,
      home.mlsId || null,
      home.url ? `https://www.redfin.com${home.url}` : '',
      JSON.stringify(home.photos?.smallPhotos || []),
      '',  // Description not in this API response
      `${address?.city || 'Mount Kisco'}, NY`
    ];
    
    await client.query(query, values);
  } catch (err) {
    console.error(`    Error saving: ${err.message}`);
  }
}

function determineSchoolDistrict(city) {
  const cityLower = (city || '').toLowerCase();
  
  if (cityLower.includes('bedford')) return 'Bedford Central';
  if (cityLower.includes('mount kisco') || cityLower.includes('kisco')) return 'Bedford Central';
  if (cityLower.includes('chappaqua')) return 'Chappaqua Central';
  if (cityLower.includes('yorktown')) return 'Yorktown Central';
  
  return 'Bedford Central';  // Default for Mount Kisco area
}

updateExistingProperties()
  .then(() => {
    console.log('\n✅ Data fix complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
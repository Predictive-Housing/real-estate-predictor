#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const { Client } = require('pg');

// Configuration
const CONFIG = {
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: 'redfin-com-data.p.rapidapi.com',
  databaseUrl: process.env.DATABASE_URL,
  locations: [
    { name: 'Bedford', regionId: '9949', zipCode: '10506' },
    { name: 'Mount Kisco', regionId: '17633', zipCode: '10549' },
    { name: 'Chappaqua', regionId: '11407', zipCode: '10514' },
    { name: 'Yorktown Heights', regionId: '27052', zipCode: '10598' }
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

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);
        try {
          const data = JSON.parse(body.toString());
          resolve(data);
        } catch (error) {
          resolve(body.toString());
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Search for properties and save to database
async function searchAndSaveProperties(location, dbClient) {
  console.log(`Searching properties in ${location.name}...`);
  
  try {
    const searchPath = `/properties/search-sale?regionId=6_${location.regionId}&limit=15`;
    const searchResults = await makeRequest(searchPath);
    
    if (!searchResults || !searchResults.data) {
      console.log(`No results for ${location.name}`);
      return 0;
    }

    const properties = searchResults.data || [];
    console.log(`Found ${properties.length} properties in ${location.name}`);
    
    let savedCount = 0;
    
    for (const home of properties) {
      if (home.homeData && home.homeData.propertyId) {
        try {
          const prop = home.homeData;
          const listing = home.listingData || {};
          
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
              status = EXCLUDED.status,
              updated_at = NOW()
            RETURNING id
          `;
          
          const values = [
            prop.propertyId,
            prop.propertyId,
            prop.addressInfo?.formattedStreetLine || 'Address not available',
            listing.beds || 0,
            listing.baths || 0,
            listing.sqft || 0,
            listing.lotSize ? (listing.lotSize / 43560).toFixed(2) : 0,
            determineSchoolDistrict(location.name),
            listing.price || 0,
            listing.soldPrice || null,
            listing.listingDate ? new Date(listing.listingDate) : new Date(),
            listing.soldDate ? new Date(listing.soldDate) : null,
            listing.daysOnMarket || 0,
            prop.propertyType || 'Single Family',
            listing.yearBuilt || null,
            listing.soldDate ? 'sold' : (listing.pending ? 'pending' : 'active'),
            prop.addressInfo?.centroid?.lat || 41.2048,
            prop.addressInfo?.centroid?.lon || -73.7032,
            listing.mlsId || null,
            prop.url ? `https://www.redfin.com${prop.url}` : '',
            JSON.stringify(prop.photosInfo || []),
            listing.description || '',
            location.name
          ];
          
          const result = await dbClient.query(query, values);
          if (result.rows.length > 0) {
            console.log(`  ✓ Saved property: ${prop.addressInfo?.formattedStreetLine || prop.propertyId}`);
            savedCount++;
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`  ✗ Error saving property:`, error.message);
        }
      }
    }
    
    return savedCount;
  } catch (error) {
    console.error(`Error searching in ${location.name}:`, error.message);
    return 0;
  }
}

// Determine school district based on location
function determineSchoolDistrict(location) {
  const locationLower = location.toLowerCase();
  if (locationLower.includes('bedford')) return 'Bedford Central';
  if (locationLower.includes('chappaqua')) return 'Chappaqua Central';
  if (locationLower.includes('yorktown') || locationLower.includes('kisco')) return 'Yorktown Central';
  return 'Northern Westchester';
}

// Main function
async function fetchAndSaveToSupabase() {
  console.log('Starting Redfin data fetch to Supabase...');
  console.log('================================');
  
  const client = new Client({
    connectionString: CONFIG.databaseUrl,
  });
  
  try {
    await client.connect();
    console.log('Connected to Supabase database\n');
    
    let totalSaved = 0;
    
    for (const location of CONFIG.locations) {
      const savedCount = await searchAndSaveProperties(location, client);
      totalSaved += savedCount;
      
      // Delay between locations
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('================================');
    console.log(`Total properties saved: ${totalSaved}`);
    
    // Show total count in database
    const countResult = await client.query('SELECT COUNT(*) FROM properties');
    console.log(`Total properties in database: ${countResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await client.end();
  }
}

// Run if executed directly
if (require.main === module) {
  fetchAndSaveToSupabase()
    .then(() => {
      console.log('\nData fetch completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { fetchAndSaveToSupabase };
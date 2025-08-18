#!/usr/bin/env node

require('dotenv').config();
const https = require('https');

const CONFIG = {
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: 'redfin-com-data.p.rapidapi.com'
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

async function findNYRegions() {
  console.log('🔍 Finding correct region IDs for Westchester County, NY...\n');
  
  // Try searching with full location strings including state
  const locations = [
    'Bedford, NY 10506',
    'Mount Kisco, NY 10549', 
    'Chappaqua, NY 10514',
    'Yorktown Heights, NY 10598',
    'Armonk, NY 10504',
    'Pound Ridge, NY 10576',
    'Katonah, NY 10536',
    'Pleasantville, NY 10570',
    'Scarsdale, NY 10583'
  ];
  
  console.log('Testing location searches with ZIP codes:\n');
  
  for (const location of locations) {
    console.log(`\n📍 Testing: ${location}`);
    
    try {
      // Try search-sale endpoint with location string
      const searchPath = `/properties/search-sale?location=${encodeURIComponent(location)}&limit=2`;
      const result = await makeRequest(searchPath);
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        console.log(`  ✅ Found ${result.data.length} properties`);
        
        // Check first property to verify it's in NY
        const firstProp = result.data[0];
        if (firstProp.homeData) {
          const address = firstProp.homeData.addressInfo;
          console.log(`  📍 Sample address: ${address?.formattedStreetLine || 'N/A'}`);
          console.log(`  📍 City: ${address?.city || 'N/A'}, State: ${address?.state || 'N/A'}`);
          
          // Try to extract region ID if available
          if (firstProp.homeData.regionId) {
            console.log(`  🔑 Region ID: ${firstProp.homeData.regionId}`);
          }
        }
      } else if (result.errors) {
        console.log(`  ❌ Error: ${JSON.stringify(result.errors)}`);
      } else {
        console.log(`  ⚠️ No properties found`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n\n========================================');
  console.log('💡 Trying alternative approach with auto-complete...\n');
  
  // Try auto-complete to get exact region IDs
  for (const location of ['Bedford, NY', 'Chappaqua, NY', 'Mount Kisco, NY']) {
    try {
      const autoCompletePath = `/auto-complete?location=${encodeURIComponent(location)}`;
      const result = await makeRequest(autoCompletePath);
      
      console.log(`\n🔍 Auto-complete for "${location}":`);
      if (result.data) {
        console.log('  Results:', JSON.stringify(result, null, 2).substring(0, 500));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
}

findNYRegions();
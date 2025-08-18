#!/usr/bin/env node

const https = require('https');
require('dotenv').config();

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
          resolve(body.toString());
        }
      });
    });
    req.on('error', (error) => reject(error));
    req.end();
  });
}

async function exploreAPI() {
  console.log('🔍 Exploring Redfin API Endpoints...\n');
  
  // Test different endpoints
  const endpoints = [
    {
      name: 'Search Sale Properties - Bedford',
      path: '/properties/search-sale?location=Bedford%2C%20NY&limit=5'
    },
    {
      name: 'Search Sold Properties - Bedford', 
      path: '/properties/search-sold?location=Bedford%2C%20NY&limit=5'
    },
    {
      name: 'Property Details',
      path: '/properties/detail?propertyId=106341400'
    },
    {
      name: 'Similar Homes',
      path: '/properties/similar-homes?propertyId=106341400&limit=5'
    },
    {
      name: 'Nearby Homes',
      path: '/properties/nearby-homes?propertyId=106341400&limit=5'
    },
    {
      name: 'Property History',
      path: '/properties/history?propertyId=106341400'
    },
    {
      name: 'Market Insights',
      path: '/properties/market-insights?regionId=6_9949'
    }
  ];

  let callCount = 0;
  
  for (const endpoint of endpoints) {
    if (callCount >= 7) {
      console.log('\n⚠️ Stopping to conserve API calls (7 calls made)');
      break;
    }
    
    console.log(`\n📍 Testing: ${endpoint.name}`);
    console.log(`   Path: ${endpoint.path}`);
    
    try {
      const result = await makeRequest(endpoint.path);
      callCount++;
      
      // Show structure of response
      if (result.data) {
        if (Array.isArray(result.data)) {
          console.log(`   ✅ Success: Got ${result.data.length} results`);
          if (result.data[0]) {
            console.log('   Sample fields:', Object.keys(result.data[0]).slice(0, 5).join(', '));
          }
        } else {
          console.log(`   ✅ Success: Got object with keys:`, Object.keys(result.data).slice(0, 5).join(', '));
        }
      } else if (result.status === false) {
        console.log(`   ❌ Error:`, result.message || 'Unknown error');
      } else {
        console.log(`   ℹ️ Response keys:`, Object.keys(result).join(', '));
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`   ❌ Error:`, error.message);
    }
  }
  
  console.log(`\n\n📊 API Calls Used: ${callCount}/100 (monthly limit)`);
}

exploreAPI();
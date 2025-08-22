#!/usr/bin/env node

/**
 * Test RapidAPI Redfin location autocomplete endpoint
 * This endpoint can search by address and return property details
 */

const https = require('https');

const CONFIG = {
  rapidApiKey: 'c579c4651fmsh0acb02673fe070fp1c7197jsn48189ac247f6',
  rapidApiHost: 'redfin-com-data.p.rapidapi.com'
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

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);
        try {
          const data = JSON.parse(body.toString());
          resolve(data);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testLocationAutocomplete() {
  console.log('🔍 Testing RapidAPI Redfin location/autocomplete endpoint...\n');
  
  // Test with a known address from our data
  const testAddress = '248 Pound Ridge Rd, Bedford, NY 10506';
  console.log(`Test address: ${testAddress}\n`);
  
  // Try the location autocomplete endpoint
  const path = `/locations/auto-complete?location=${encodeURIComponent(testAddress)}`;
  
  console.log(`📡 Testing: Location Autocomplete`);
  console.log(`   Path: ${path}\n`);
  
  try {
    const result = await makeRequest(path);
    
    console.log('✅ Response received!\n');
    
    // Check if we have data
    if (result.data && Array.isArray(result.data)) {
      console.log(`Found ${result.data.length} results:\n`);
      
      // Show each result
      result.data.forEach((item, index) => {
        console.log(`Result ${index + 1}:`);
        console.log(`  Type: ${item.type || 'unknown'}`);
        console.log(`  Display: ${item.display || 'N/A'}`);
        console.log(`  ID: ${item.id || 'N/A'}`);
        console.log(`  URL: ${item.url || 'N/A'}`);
        
        // If it has a URL field, that's what we want!
        if (item.url) {
          const fullUrl = item.url.startsWith('http') 
            ? item.url 
            : `https://www.redfin.com${item.url}`;
          console.log(`  🎯 Full Redfin URL: ${fullUrl}`);
        }
        
        console.log('  Raw data:', JSON.stringify(item).substring(0, 200));
        console.log('');
      });
    } else {
      console.log('Response structure:', Object.keys(result));
      console.log('Full response:', JSON.stringify(result).substring(0, 500));
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Run the test
testLocationAutocomplete()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
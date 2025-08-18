#!/usr/bin/env node

const https = require('https');

// Test property: 185 Harriman Rd (we know it listed at $899K and sold for $999K)
const propertyId = '20085960';

// Test the hidden Redfin API endpoints
async function testHiddenEndpoints() {
  console.log('🔍 Testing Redfin Hidden API Endpoints\n');
  console.log('Property: 185 Harriman Rd, Mount Kisco');
  console.log('Known: Listed $899,000 → Sold $999,000\n');
  
  const endpoints = [
    {
      name: 'AVM Historical Data',
      url: `https://www.redfin.com/stingray/api/home/details/avmHistoricalData?propertyId=${propertyId}&accessLevel=3&type=json`
    },
    {
      name: 'Below The Fold',
      url: `https://www.redfin.com/stingray/api/home/details/belowTheFold?propertyId=${propertyId}&accessLevel=3`
    },
    {
      name: 'Above The Fold', 
      url: `https://www.redfin.com/stingray/api/home/details/aboveTheFold?propertyId=${propertyId}&accessLevel=3`
    },
    {
      name: 'Property Parcel',
      url: `https://www.redfin.com/stingray/api/home/details/propertyParcel?propertyId=${propertyId}&accessLevel=3`
    },
    {
      name: 'Listing Activity',
      url: `https://www.redfin.com/stingray/api/home/details/listingActivity?propertyId=${propertyId}&accessLevel=3`
    }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📍 Testing: ${endpoint.name}`);
    console.log(`   URL: ${endpoint.url}`);
    
    try {
      const data = await fetchEndpoint(endpoint.url);
      
      if (data) {
        // Look for price-related fields
        const jsonStr = JSON.stringify(data);
        
        // Check for specific price fields
        if (data.avmHistoricalData) {
          console.log('   ✅ Found AVM Historical Data!');
          console.log('   Data:', JSON.stringify(data.avmHistoricalData, null, 2).substring(0, 500));
        }
        
        if (data.priceHistory) {
          console.log('   ✅ Found Price History!');
          console.log('   Data:', JSON.stringify(data.priceHistory, null, 2).substring(0, 500));
        }
        
        if (data.propertyHistory) {
          console.log('   ✅ Found Property History!');
          console.log('   Data:', JSON.stringify(data.propertyHistory, null, 2).substring(0, 500));
        }
        
        if (data.listingHistory) {
          console.log('   ✅ Found Listing History!');
          console.log('   Data:', JSON.stringify(data.listingHistory, null, 2).substring(0, 500));
        }
        
        // Search for price patterns
        const priceMatches = jsonStr.match(/\d{6,7}/g);
        if (priceMatches) {
          const uniquePrices = [...new Set(priceMatches)];
          console.log('   Found potential prices:', uniquePrices.map(p => '$' + parseInt(p).toLocaleString()));
        }
        
        // Look for 899000 (listing price) or 999000 (sold price)
        if (jsonStr.includes('899000')) {
          console.log('   🎯 FOUND LISTING PRICE $899,000!');
        }
        if (jsonStr.includes('999000')) {
          console.log('   🎯 FOUND SOLD PRICE $999,000!');
        }
        
      } else {
        console.log('   ❌ No data or access denied');
      }
      
    } catch (error) {
      console.log('   ❌ Error:', error.message);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

function fetchEndpoint(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.redfin.com/'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          // Not JSON, might be HTML or error
          if (data.includes('Access Denied') || data.includes('403')) {
            resolve(null);
          } else {
            console.log('   Response preview:', data.substring(0, 200));
            resolve(null);
          }
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

testHiddenEndpoints();
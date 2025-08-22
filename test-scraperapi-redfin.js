#!/usr/bin/env node

/**
 * Test ScraperAPI for getting Redfin property URLs
 * 
 * Note: You'll need to sign up for a free ScraperAPI account at:
 * https://www.scraperapi.com/
 * 
 * They offer 1,000 free API credits per month
 */

const http = require('http');
const https = require('https');

// ScraperAPI key
const SCRAPERAPI_KEY = '3a726054e900493c96df55b1b63e13f1';

/**
 * Use ScraperAPI to scrape a Redfin search page
 */
async function scrapeRedfinSearch(address) {
  // Construct Redfin search URL
  const redfinSearchUrl = `https://www.redfin.com/searchpage?query=${encodeURIComponent(address)}`;
  
  // ScraperAPI endpoint
  const scraperApiUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(redfinSearchUrl)}&render=true`;
  
  console.log('🔍 Searching for:', address);
  console.log('📡 Redfin URL:', redfinSearchUrl);
  console.log('🌐 ScraperAPI URL:', scraperApiUrl.replace(SCRAPERAPI_KEY, 'YOUR_KEY'));
  
  return new Promise((resolve, reject) => {
    http.get(scraperApiUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Parse the HTML response to find the property URL
        // Look for the first property link in the search results
        const urlMatch = data.match(/href="(\/[A-Z]{2}\/[^"]+\/home\/\d+)"/);
        
        if (urlMatch) {
          const propertyUrl = `https://www.redfin.com${urlMatch[1]}`;
          resolve(propertyUrl);
        } else {
          // Try alternative pattern
          const altMatch = data.match(/window\.__reactServerState\.InitialContext.*?"url":"(\/[A-Z]{2}\/[^"]+\/home\/\d+)"/);
          if (altMatch) {
            const propertyUrl = `https://www.redfin.com${altMatch[1]}`;
            resolve(propertyUrl);
          } else {
            resolve(null);
          }
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Alternative: Use HasData API (also has free tier)
 */
async function searchWithHasData(address) {
  // HasData requires sign up at: https://hasdata.com/
  const HASDATA_API_KEY = 'YOUR_HASDATA_KEY_HERE';
  
  // Parse address components
  const parts = address.split(',').map(p => p.trim());
  const zipMatch = parts[2]?.match(/(\d{5})/);
  const zipCode = zipMatch ? zipMatch[1] : '';
  
  const options = {
    method: 'GET',
    hostname: 'api.hasdata.com',
    path: `/redfin/listing?zip_code=${zipCode}&listing_type=for_sale`,
    headers: {
      'x-api-key': HASDATA_API_KEY
    }
  };
  
  return new Promise((resolve, reject) => {
    https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Find matching property by address
          const property = json.data?.find(p => 
            p.address?.toLowerCase().includes(parts[0].toLowerCase())
          );
          
          if (property?.url) {
            resolve(property.url);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject).end();
  });
}

// Test addresses
const testAddresses = [
  '248 Pound Ridge Rd, Bedford, NY 10506',
  '28 Stone Paddock Pl, Bedford, NY 10506'
];

async function runTests() {
  console.log('=' .repeat(60));
  console.log('TESTING REDFIN SCRAPER APIS');
  console.log('=' .repeat(60));
  console.log('\n⚠️  NOTE: You need to sign up for free accounts at:');
  console.log('   - ScraperAPI: https://www.scraperapi.com/');
  console.log('   - HasData: https://hasdata.com/');
  console.log('\nBoth offer free tiers with 1000+ requests/month\n');
  console.log('=' .repeat(60));
  
  if (SCRAPERAPI_KEY === 'YOUR_SCRAPERAPI_KEY_HERE') {
    console.log('\n❌ Please add your ScraperAPI key to this script first!');
    console.log('   Sign up free at: https://www.scraperapi.com/\n');
    return;
  }
  
  for (const address of testAddresses) {
    console.log(`\n📍 Testing: ${address}`);
    
    try {
      const url = await scrapeRedfinSearch(address);
      if (url) {
        console.log(`   ✅ Found Redfin URL: ${url}`);
      } else {
        console.log('   ⚠️ No property URL found in search results');
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

runTests();
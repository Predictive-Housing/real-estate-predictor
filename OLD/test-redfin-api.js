#!/usr/bin/env node

// Test script to verify Redfin API connection with minimal requests
const https = require('https');

const CONFIG = {
  rapidApiKey: 'c579c4651fmsh0acb02673fe070fp1c7197jsn48189ac247f6',
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

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);
        try {
          const data = JSON.parse(body.toString());
          resolve(data);
        } catch (error) {
          // If not JSON, return raw text
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

async function testAPI() {
  console.log('Testing Redfin API connection...\n');
  
  try {
    // Test 1: Search for sale properties in Bedford, NY
    console.log('Test 1: Searching for properties in Bedford, NY (for sale)...');
    const saleSearch = await makeRequest('/properties/search-sale?location=Bedford%2C%20NY&limit=5');
    console.log('Response:', JSON.stringify(saleSearch, null, 2).substring(0, 500) + '...\n');
    
    // Test 2: Search for rent properties (using the example from your code)
    console.log('Test 2: Testing rental search endpoint...');
    const rentSearch = await makeRequest('/properties/search-rent?regionId=6_13410&limit=2');
    console.log('Response:', JSON.stringify(rentSearch, null, 2).substring(0, 500) + '...\n');
    
    console.log('API tests completed successfully!');
    console.log('Note: We only made 2 API calls to conserve your free tier limit.');
    
  } catch (error) {
    console.error('Error during API test:', error);
  }
}

// Run the test
testAPI();
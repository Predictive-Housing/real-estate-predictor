#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;

// Load known listing prices
function loadKnownListingPrices() {
  try {
    const data = fs.readFileSync('listing-price-corrections.json', 'utf8');
    const parsed = JSON.parse(data);
    console.log('✅ Loaded listing prices for', Object.keys(parsed.properties).length, 'properties');
    return parsed.properties;
  } catch (error) {
    console.log('❌ Error loading listing prices:', error.message);
    return {};
  }
}

// ATTOM API request
function makeAttomRequest(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const path = endpoint + (queryString ? `?${queryString}` : '');
  
  const options = {
    method: 'GET',
    hostname: 'api.gateway.attomdata.com',
    path: path,
    headers: {
      'apikey': ATTOM_API_KEY,
      'Accept': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function testHybridSystem() {
  console.log('\n🚀 Testing Hybrid System with Known Prices\n');
  console.log('═'.repeat(60));
  
  // Load known prices
  const knownPrices = loadKnownListingPrices();
  
  // Test specific properties we know about
  const testProperties = [
    { address: '2 Stratford Dr', city: 'Mount Kisco' },
    { address: '185 Harriman Rd', city: 'Mount Kisco' }
  ];
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  for (const prop of testProperties) {
    console.log(`\n📍 ${prop.address}, ${prop.city}`);
    console.log('─'.repeat(40));
    
    // Get ATTOM data
    console.log('📊 ATTOM Data:');
    const attomResponse = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
      address1: prop.address,
      address2: `${prop.city}, NY`
    });
    
    if (attomResponse?.property?.[0]) {
      const attomData = attomResponse.property[0];
      console.log(`   Beds: ${attomData.building?.rooms?.beds || 0}`);
      console.log(`   Baths: ${attomData.building?.rooms?.bathstotal || 0}`);
      console.log(`   Sqft: ${attomData.building?.size?.universalsize || 0}`);
      console.log(`   Sale: $${attomData.sale?.amount?.saleamt?.toLocaleString() || 'N/A'}`);
      console.log(`   Sale Date: ${attomData.sale?.saleTransDate || 'N/A'}`);
    } else {
      console.log('   ❌ Not found in ATTOM');
    }
    
    // Get known listing price
    console.log('\n📝 Known Listing Price:');
    const knownData = knownPrices[prop.address];
    if (knownData) {
      console.log(`   Listing: $${knownData.listingPrice.toLocaleString()}`);
      console.log(`   Sold: $${knownData.soldPrice.toLocaleString()}`);
      console.log(`   Verified: ${knownData.verified ? '✅' : '❌'}`);
      console.log(`   Notes: ${knownData.notes}`);
      
      // Calculate difference
      if (knownData.listingPrice && knownData.soldPrice) {
        const diff = knownData.soldPrice - knownData.listingPrice;
        const percent = ((diff / knownData.listingPrice) * 100).toFixed(1);
        console.log(`\n📈 Analysis:`);
        console.log(`   Difference: ${diff >= 0 ? '+' : ''}$${Math.abs(diff).toLocaleString()} (${percent}%)`);
      }
    } else {
      console.log('   ❌ No known listing price');
    }
    
    // Update database
    if (knownData && attomResponse?.property?.[0]) {
      const attomData = attomResponse.property[0];
      
      // Find the property in database
      const result = await client.query(
        'SELECT id FROM properties WHERE address = $1 LIMIT 1',
        [prop.address]
      );
      
      if (result.rows.length > 0) {
        await client.query(`
          UPDATE properties
          SET
            asking_price = $1,
            sold_price = $2,
            beds = CASE WHEN $3 > 0 THEN $3 ELSE beds END,
            baths = CASE WHEN $4 > 0 THEN $4 ELSE baths END,
            sqft = CASE WHEN $5 > 0 THEN $5 ELSE sqft END
          WHERE id = $6
        `, [
          knownData.listingPrice,
          knownData.soldPrice || attomData.sale?.amount?.saleamt,
          attomData.building?.rooms?.beds || 0,
          attomData.building?.rooms?.bathstotal || 0,
          attomData.building?.size?.universalsize || 0,
          result.rows[0].id
        ]);
        
        console.log('\n✅ Database updated');
      } else {
        console.log('\n⚠️ Property not found in database');
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Show final database state
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Final Database State:');
  
  const finalResult = await client.query(`
    SELECT address, asking_price, sold_price, beds, baths, sqft
    FROM properties
    WHERE address IN ('2 Stratford Dr', '185 Harriman Rd')
  `);
  
  console.log('\nProperties with updated data:');
  finalResult.rows.forEach(row => {
    console.log(`\n${row.address}:`);
    console.log(`  Asking: $${row.asking_price?.toLocaleString() || 'N/A'}`);
    console.log(`  Sold: $${row.sold_price?.toLocaleString() || 'N/A'}`);
    console.log(`  ${row.beds}bd/${row.baths}ba, ${row.sqft}sqft`);
    
    if (row.asking_price && row.sold_price) {
      const diff = row.sold_price - row.asking_price;
      const percent = ((diff / row.asking_price) * 100).toFixed(1);
      console.log(`  Difference: ${diff >= 0 ? '+' : ''}${percent}%`);
    }
  });
  
  await client.end();
}

// Run test
testHybridSystem()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
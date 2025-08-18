#!/usr/bin/env node

const https = require('https');
const { Client } = require('pg');
require('dotenv').config();

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;

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
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.log('Parse error:', e.message);
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

async function fetchPropertyData(address, city, state = 'NY') {
  console.log(`\n📍 Fetching: ${address}, ${city}, ${state}`);
  
  // Get all events for comprehensive data
  const allEvents = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
    address1: address,
    address2: `${city}, ${state}`
  });
  
  if (!allEvents || !allEvents.property || allEvents.property.length === 0) {
    console.log('   ❌ Property not found');
    return null;
  }
  
  const prop = allEvents.property[0];
  const attomId = prop.identifier?.attomId;
  
  console.log(`   ✅ Found property (ATTOM ID: ${attomId})`);
  
  // Extract sale history
  const salesData = [];
  if (prop.saleHistory && prop.saleHistory.length > 0) {
    console.log(`   📊 ${prop.saleHistory.length} sale records found:`);
    
    for (const sale of prop.saleHistory) {
      const saleData = {
        date: sale.saleTransDate,
        amount: sale.saleTransAmount?.saleAmt || 0,
        type: sale.saleTransType,
        document: sale.saleDocNum,
        listingPrice: sale.listingPrice || null,
        pricePerSqft: sale.saleTransAmount?.saleAmtPerSqFt || null,
        recordingDate: sale.saleRecordingDate
      };
      
      salesData.push(saleData);
      
      console.log(`     ${saleData.date}: $${saleData.amount.toLocaleString()} ${saleData.listingPrice ? `(Listed: $${saleData.listingPrice.toLocaleString()})` : ''}`);
    }
  }
  
  // Extract property details
  const propertyDetails = {
    attomId: attomId,
    address: prop.address?.oneLine || address,
    beds: prop.building?.rooms?.beds || 0,
    baths: prop.building?.rooms?.bathsTotal || 0,
    sqft: prop.building?.size?.universalSize || 0,
    yearBuilt: prop.summary?.yearBuilt || null,
    lotSize: prop.lot?.lotSize1 || 0,
    propertyType: prop.summary?.propClass || 'Single Family',
    lat: prop.location?.latitude || null,
    lng: prop.location?.longitude || null,
    assessedValue: prop.assessment?.assessed?.assdTtlValue || 0,
    taxAmount: prop.assessment?.tax?.taxAmt || 0,
    salesHistory: salesData
  };
  
  return propertyDetails;
}

async function updateDatabaseWithAttomData() {
  console.log('🏠 Fetching Property Data from ATTOM\n');
  console.log('=====================================');
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Get properties from database that need updating
  const result = await client.query(`
    SELECT DISTINCT ON (address) address, location, sold_price 
    FROM properties 
    WHERE location LIKE '%NY%'
    ORDER BY address, sold_price DESC NULLS LAST
    LIMIT 20
  `);
  
  console.log(`Found ${result.rows.length} properties to update\n`);
  
  let updatedCount = 0;
  let withListingPrice = 0;
  
  for (const row of result.rows) {
    const address = row.address;
    const location = row.location || 'Mount Kisco, NY';
    const city = location.split(',')[0].trim();
    
    const attomData = await fetchPropertyData(address, city);
    
    if (attomData && attomData.salesHistory.length > 0) {
      // Find the most recent sale
      const recentSale = attomData.salesHistory[0];
      
      // Update database with ATTOM data
      const updateQuery = `
        UPDATE properties 
        SET 
          asking_price = COALESCE($1, asking_price),
          sold_price = COALESCE($2, sold_price),
          beds = CASE WHEN $3 > 0 THEN $3 ELSE beds END,
          baths = CASE WHEN $4 > 0 THEN $4 ELSE baths END,
          sqft = CASE WHEN $5 > 0 THEN $5 ELSE sqft END,
          year_built = COALESCE($6, year_built)
        WHERE address = $7
      `;
      
      await client.query(updateQuery, [
        recentSale.listingPrice,
        recentSale.amount,
        attomData.beds,
        attomData.baths,
        attomData.sqft,
        attomData.yearBuilt,
        address
      ]);
      
      updatedCount++;
      if (recentSale.listingPrice) withListingPrice++;
    }
    
    // Rate limiting - ATTOM has limits
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n=====================================');
  console.log(`✅ Updated ${updatedCount} properties`);
  console.log(`📊 ${withListingPrice} properties have listing prices`);
  
  // Show sample of updated data
  const sample = await client.query(`
    SELECT address, asking_price, sold_price, 
           (sold_price - asking_price) as difference
    FROM properties 
    WHERE asking_price > 0 AND sold_price > 0
    AND status = 'sold'
    ORDER BY sold_price DESC
    LIMIT 5
  `);
  
  console.log('\nSample Updated Properties:');
  sample.rows.forEach(row => {
    const diff = row.difference;
    const percent = ((diff / row.asking_price) * 100).toFixed(1);
    console.log(`${row.address}:`);
    console.log(`  Listed: $${parseInt(row.asking_price).toLocaleString()}`);
    console.log(`  Sold: $${parseInt(row.sold_price).toLocaleString()}`);
    console.log(`  Difference: ${diff >= 0 ? '+' : ''}$${Math.abs(parseInt(diff)).toLocaleString()} (${percent}%)\n`);
  });
  
  await client.end();
}

// Run if called directly
if (require.main === module) {
  updateDatabaseWithAttomData()
    .then(() => {
      console.log('✅ ATTOM data fetch complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
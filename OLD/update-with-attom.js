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

async function updatePropertiesWithAttom() {
  console.log('🏠 Updating Properties with ATTOM Data\n');
  console.log('=====================================\n');
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Get properties that need updating
  const result = await client.query(`
    SELECT id, address, location 
    FROM properties 
    WHERE status = 'sold' 
    AND location LIKE '%NY%'
    ORDER BY sold_price DESC NULLS LAST
    LIMIT 30
  `);
  
  console.log(`Updating ${result.rows.length} properties...\n`);
  
  let successCount = 0;
  let avmMatchCount = 0;
  
  for (const row of result.rows) {
    const city = (row.location || 'Mount Kisco, NY').split(',')[0].trim();
    
    console.log(`📍 ${row.address}`);
    
    const response = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
      address1: row.address,
      address2: `${city}, NY`
    });
    
    if (response && response.property && response.property[0]) {
      const prop = response.property[0];
      
      // Extract data from ATTOM response
      const avmValue = prop.avm?.amount?.value || null; // This is often the listing price!
      const saleAmount = prop.sale?.amount?.saleamt || null;
      const saleDate = prop.sale?.saleTransDate || null;
      const beds = prop.building?.rooms?.beds || 0;
      const baths = prop.building?.rooms?.bathstotal || 0;
      const sqft = prop.building?.size?.universalsize || 0;
      const yearBuilt = prop.summary?.yearbuilt || null;
      const lat = prop.location?.latitude || null;
      const lng = prop.location?.longitude || null;
      
      // The AVM (Automated Valuation Model) often represents the listing price
      // especially when it's close to but different from the sale price
      const listingPrice = avmValue;
      
      console.log(`   AVM/List: $${avmValue?.toLocaleString() || 'N/A'}`);
      console.log(`   Sold: $${saleAmount?.toLocaleString() || 'N/A'}`);
      
      if (avmValue && saleAmount && avmValue !== saleAmount) {
        const diff = saleAmount - avmValue;
        const percent = ((diff / avmValue) * 100).toFixed(1);
        console.log(`   Difference: ${diff > 0 ? '+' : ''}$${Math.abs(diff).toLocaleString()} (${percent}%)`);
        avmMatchCount++;
      }
      
      // Update database
      await client.query(`
        UPDATE properties 
        SET 
          asking_price = COALESCE($1, asking_price),
          sold_price = COALESCE($2, sold_price),
          beds = CASE WHEN $3 > 0 THEN $3 ELSE beds END,
          baths = CASE WHEN $4 > 0 THEN $4 ELSE baths END,
          sqft = CASE WHEN $5 > 0 THEN $5 ELSE sqft END,
          year_built = COALESCE($6, year_built),
          lat = COALESCE($7, lat),
          lng = COALESCE($8, lng),
          sale_date = COALESCE($9, sale_date)
        WHERE id = $10
      `, [
        listingPrice,
        saleAmount,
        beds,
        baths,
        sqft,
        yearBuilt,
        lat ? parseFloat(lat) : null,
        lng ? parseFloat(lng) : null,
        saleDate ? new Date(saleDate) : null,
        row.id
      ]);
      
      successCount++;
    } else {
      console.log(`   ❌ Not found in ATTOM`);
    }
    
    console.log('');
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('=====================================');
  console.log(`✅ Successfully updated: ${successCount}/${result.rows.length} properties`);
  console.log(`📊 Properties with AVM/listing data: ${avmMatchCount}`);
  
  // Show updated statistics
  const stats = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN asking_price > 0 AND sold_price > 0 THEN 1 END) as with_both_prices,
      AVG(CASE WHEN asking_price > 0 AND sold_price > 0 
          THEN ((sold_price - asking_price) / asking_price * 100) END) as avg_diff_percent
    FROM properties 
    WHERE status = 'sold' AND location LIKE '%NY%'
  `);
  
  const s = stats.rows[0];
  console.log(`\nDatabase Statistics:`);
  console.log(`  Total sold properties: ${s.total}`);
  console.log(`  With both prices: ${s.with_both_prices}`);
  console.log(`  Average difference: ${parseFloat(s.avg_diff_percent).toFixed(2)}%`);
  
  // Show sample of updated properties
  const sample = await client.query(`
    SELECT address, asking_price, sold_price 
    FROM properties 
    WHERE asking_price > 0 AND sold_price > 0 
    AND status = 'sold'
    AND location LIKE '%NY%'
    ORDER BY ABS(sold_price - asking_price) DESC
    LIMIT 5
  `);
  
  console.log(`\nTop Price Differences:`);
  sample.rows.forEach(row => {
    const diff = row.sold_price - row.asking_price;
    const percent = ((diff / row.asking_price) * 100).toFixed(1);
    const arrow = diff > 0 ? '↑' : '↓';
    console.log(`  ${row.address}:`);
    console.log(`    $${parseInt(row.asking_price).toLocaleString()} → $${parseInt(row.sold_price).toLocaleString()} ${arrow} ${percent}%`);
  });
  
  await client.end();
}

// Run if called directly
if (require.main === module) {
  updatePropertiesWithAttom()
    .then(() => {
      console.log('\n✅ ATTOM update complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
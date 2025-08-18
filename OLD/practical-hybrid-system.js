#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;

// ============================================
// Load Known Listing Prices
// ============================================

function loadKnownListingPrices() {
  try {
    const data = fs.readFileSync('listing-price-corrections.json', 'utf8');
    return JSON.parse(data).properties;
  } catch (error) {
    // Don't log here, just return empty object
    return {};
  }
}

// ============================================
// ATTOM API Functions
// ============================================

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

async function getAttomData(address, city, state = 'NY') {
  const response = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
    address1: address,
    address2: `${city}, ${state}`
  });
  
  if (!response?.property?.[0]) {
    return null;
  }
  
  const prop = response.property[0];
  
  return {
    attomId: prop.identifier?.attomId,
    beds: prop.building?.rooms?.beds || 0,
    baths: prop.building?.rooms?.bathstotal || 0,
    sqft: prop.building?.size?.universalsize || 0,
    yearBuilt: prop.summary?.yearbuilt || null,
    lotSize: prop.lot?.lotsize1 || 0,
    saleAmount: prop.sale?.amount?.saleamt || null,
    saleDate: prop.sale?.saleTransDate || null,
    saleType: prop.sale?.amount?.saletranstype || null,
    assessedValue: prop.assessment?.assessed?.assdttlvalue || 0,
    marketValue: prop.assessment?.market?.mktttlvalue || 0,
    lat: parseFloat(prop.location?.latitude) || null,
    lng: parseFloat(prop.location?.longitude) || null,
    propertyType: prop.summary?.proptype || 'SFR',
    address: prop.address?.oneLine || address
  };
}

// ============================================
// Main Processing Function
// ============================================

async function processPropertyWithHybridData(address, city, state = 'NY') {
  console.log(`\n📍 Processing: ${address}`);
  
  // Step 1: Get ATTOM data
  console.log('   📊 Fetching ATTOM data...');
  const attomData = await getAttomData(address, city, state);
  
  if (attomData) {
    console.log(`      ✅ Found - ${attomData.beds}bd/${attomData.baths}ba, ${attomData.sqft}sqft`);
    if (attomData.saleAmount) {
      console.log(`      💰 Sale: $${attomData.saleAmount.toLocaleString()} (${attomData.saleDate})`);
    }
  } else {
    console.log('      ❌ Not found in ATTOM');
  }
  
  // Step 2: Check for known listing price
  const knownPrices = loadKnownListingPrices();
  const knownData = knownPrices[address];
  
  let listingPrice = null;
  let listingSource = null;
  
  if (knownData) {
    listingPrice = knownData.listingPrice;
    listingSource = knownData.verified ? 'Verified' : 'Estimated';
    console.log(`   📝 Listing price: $${listingPrice.toLocaleString()} (${listingSource})`);
  } else {
    console.log('   ⚠️  No known listing price');
  }
  
  // Step 3: Combine the data
  const combinedData = {
    address,
    city,
    state,
    // From ATTOM
    beds: attomData?.beds || 0,
    baths: attomData?.baths || 0,
    sqft: attomData?.sqft || 0,
    yearBuilt: attomData?.yearBuilt,
    lotSize: attomData?.lotSize,
    lat: attomData?.lat,
    lng: attomData?.lng,
    propertyType: attomData?.propertyType,
    assessedValue: attomData?.assessedValue,
    marketValue: attomData?.marketValue,
    // Prices
    listingPrice: listingPrice,
    soldPrice: attomData?.saleAmount || knownData?.soldPrice || null,
    saleDate: attomData?.saleDate || knownData?.soldDate,
    // Source tracking
    dataSource: {
      propertyData: attomData ? 'ATTOM' : 'None',
      listingPrice: listingSource || 'None',
      soldPrice: attomData?.saleAmount ? 'ATTOM' : (knownData?.soldPrice ? 'Known' : 'None')
    }
  };
  
  // Calculate difference
  if (combinedData.listingPrice && combinedData.soldPrice) {
    const diff = combinedData.soldPrice - combinedData.listingPrice;
    const percent = ((diff / combinedData.listingPrice) * 100).toFixed(1);
    console.log(`   📈 Analysis: ${diff >= 0 ? '↑' : '↓'} ${diff >= 0 ? '+' : ''}$${Math.abs(diff).toLocaleString()} (${percent}%)`);
    
    combinedData.priceDifference = diff;
    combinedData.percentDifference = parseFloat(percent);
  }
  
  return combinedData;
}

// ============================================
// Database Update
// ============================================

async function updateDatabaseWithPracticalSystem() {
  console.log('🚀 Practical Hybrid System (ATTOM + Known Prices)\n');
  console.log('═'.repeat(60));
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Get properties to update
  const result = await client.query(`
    SELECT id, address, location, sold_price
    FROM properties
    WHERE status = 'sold'
    AND location LIKE '%NY%'
    ORDER BY sold_price DESC NULLS LAST
    LIMIT 30
  `);
  
  console.log(`Processing ${result.rows.length} properties...`);
  
  const processedData = [];
  let attomSuccessCount = 0;
  let listingPriceCount = 0;
  
  for (const row of result.rows) {
    const city = (row.location || 'Mount Kisco, NY').split(',')[0].trim();
    const data = await processPropertyWithHybridData(row.address, city);
    
    if (data.dataSource.propertyData === 'ATTOM') {
      attomSuccessCount++;
    }
    if (data.listingPrice) {
      listingPriceCount++;
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
      data.listingPrice,
      data.soldPrice,
      data.beds,
      data.baths,
      data.sqft,
      data.yearBuilt,
      data.lat,
      data.lng,
      data.saleDate ? new Date(data.saleDate) : null,
      row.id
    ]);
    
    processedData.push(data);
    
    // Rate limiting for ATTOM API
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY\n');
  
  console.log(`✅ Properties processed: ${result.rows.length}`);
  console.log(`📊 ATTOM data found: ${attomSuccessCount}`);
  console.log(`📝 Listing prices available: ${listingPriceCount}`);
  
  const withBothPrices = processedData.filter(d => d.listingPrice && d.soldPrice);
  
  if (withBothPrices.length > 0) {
    console.log(`\n📈 Properties with complete pricing: ${withBothPrices.length}`);
    
    const avgDiff = withBothPrices.reduce((sum, d) => sum + d.percentDifference, 0) / withBothPrices.length;
    console.log(`📊 Average difference: ${avgDiff.toFixed(1)}%`);
    
    // Show extremes
    const sorted = withBothPrices.sort((a, b) => b.percentDifference - a.percentDifference);
    
    console.log('\n🔝 Highest over asking:');
    sorted.slice(0, 3).forEach(p => {
      if (p.percentDifference > 0) {
        console.log(`   ${p.address}: +${p.percentDifference}%`);
      }
    });
    
    console.log('\n🔻 Biggest under asking:');
    sorted.slice(-3).forEach(p => {
      if (p.percentDifference < 0) {
        console.log(`   ${p.address}: ${p.percentDifference}%`);
      }
    });
  }
  
  // Properties needing listing prices
  const needsListingPrice = processedData.filter(d => !d.listingPrice && d.soldPrice);
  if (needsListingPrice.length > 0) {
    console.log(`\n⚠️  Properties needing listing prices: ${needsListingPrice.length}`);
    console.log('   Add to listing-price-corrections.json:');
    needsListingPrice.slice(0, 5).forEach(p => {
      console.log(`   - ${p.address} (sold: $${p.soldPrice?.toLocaleString() || 'N/A'})`);
    });
  }
  
  await client.end();
}

// Run if called directly
if (require.main === module) {
  updateDatabaseWithPracticalSystem()
    .then(() => {
      console.log('\n✅ Update complete!');
      console.log('\n💡 To add more listing prices:');
      console.log('   Edit listing-price-corrections.json with verified prices from Redfin');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
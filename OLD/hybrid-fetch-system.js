#!/usr/bin/env node

const https = require('https');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { Client } = require('pg');
require('dotenv').config();

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;

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
  console.log(`   📊 Fetching ATTOM data...`);
  
  const response = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
    address1: address,
    address2: `${city}, ${state}`
  });
  
  if (!response?.property?.[0]) {
    console.log(`      ❌ Not found in ATTOM`);
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
    assessedValue: prop.assessment?.assessed?.assdttlvalue || 0,
    marketValue: prop.assessment?.market?.mktttlvalue || 0,
    lat: parseFloat(prop.location?.latitude) || null,
    lng: parseFloat(prop.location?.longitude) || null,
    propertyType: prop.summary?.proptype || 'SFR'
  };
}

// ============================================
// Redfin Scraping Functions
// ============================================

async function scrapeRedfin(address, city, state = 'NY') {
  console.log(`   🌐 Scraping Redfin for listing price...`);
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Search for the property on Redfin
    const searchUrl = `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent(address + ', ' + city + ', ' + state)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    
    const searchResults = await page.content();
    const searchData = JSON.parse(searchResults.replace(/<[^>]*>/g, ''));
    
    if (searchData.payload?.exactMatch?.id) {
      const propertyUrl = `https://www.redfin.com${searchData.payload.exactMatch.url}`;
      console.log(`      Found property URL: ${propertyUrl}`);
      
      // Go to property page
      await page.goto(propertyUrl, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(2000);
      
      // Get page content
      const html = await page.content();
      const $ = cheerio.load(html);
      
      // Look for price history section
      let listingPrice = null;
      let soldPrice = null;
      
      // Try to find the property history table
      $('.PropertyHistoryEventRow, [data-rf-test-id="property-history-event-row"]').each((i, elem) => {
        const event = $(elem).find('.event-col, [data-rf-test-id="event-col"]').text().trim();
        const price = $(elem).find('.price-col, [data-rf-test-id="price-col"]').text().trim();
        
        if (event.toLowerCase().includes('listed') && price && price !== '—') {
          const priceNum = parseInt(price.replace(/[$,]/g, ''));
          if (priceNum > 0 && !listingPrice) {
            listingPrice = priceNum;
            console.log(`      ✅ Found listing price: $${priceNum.toLocaleString()}`);
          }
        }
        
        if (event.toLowerCase().includes('sold') && price && price !== '—') {
          const priceNum = parseInt(price.replace(/[$,]/g, ''));
          if (priceNum > 0 && !soldPrice) {
            soldPrice = priceNum;
            console.log(`      ✅ Found sold price: $${priceNum.toLocaleString()}`);
          }
        }
      });
      
      // Alternative: Look in the page's JSON data
      if (!listingPrice) {
        const scripts = $('script').toArray();
        for (const script of scripts) {
          const content = $(script).html();
          if (content && content.includes('__PRELOADED_STATE__')) {
            const match = content.match(/window\.__PRELOADED_STATE__\s*=\s*({.*?});/s);
            if (match) {
              try {
                const data = JSON.parse(match[1]);
                // Look for listing price in the data structure
                const findListingPrice = (obj) => {
                  if (typeof obj !== 'object' || !obj) return null;
                  
                  if (obj.listingPrice) return obj.listingPrice;
                  if (obj.originalListPrice) return obj.originalListPrice;
                  
                  for (const value of Object.values(obj)) {
                    const found = findListingPrice(value);
                    if (found) return found;
                  }
                  return null;
                };
                
                const foundPrice = findListingPrice(data);
                if (foundPrice) {
                  listingPrice = foundPrice;
                  console.log(`      ✅ Found listing price in JSON: $${foundPrice.toLocaleString()}`);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }
      
      await browser.close();
      return { listingPrice, soldPrice, source: 'Redfin' };
    }
    
    await browser.close();
    console.log(`      ❌ Property not found on Redfin`);
    return null;
    
  } catch (error) {
    console.log(`      ❌ Scraping error: ${error.message}`);
    await browser.close();
    return null;
  }
}

// ============================================
// Zillow Scraping Functions (Backup)
// ============================================

async function scrapeZillow(address, city, state = 'NY') {
  console.log(`   🏠 Scraping Zillow for listing price...`);
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Format address for Zillow URL
    const formattedAddress = `${address}-${city}-${state}`.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    const zillowUrl = `https://www.zillow.com/homes/${formattedAddress}_rb/`;
    
    await page.goto(zillowUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const html = await page.content();
    const $ = cheerio.load(html);
    
    let listingPrice = null;
    let soldPrice = null;
    
    // Look for price history
    $('.hdp__sc-jc99t3-1').each((i, elem) => {
      const text = $(elem).text();
      if (text.includes('Listed for') || text.includes('Listing price')) {
        const match = text.match(/\$[\d,]+/);
        if (match) {
          listingPrice = parseInt(match[0].replace(/[$,]/g, ''));
          console.log(`      ✅ Found listing price: $${listingPrice.toLocaleString()}`);
        }
      }
      if (text.includes('Sold for')) {
        const match = text.match(/\$[\d,]+/);
        if (match) {
          soldPrice = parseInt(match[0].replace(/[$,]/g, ''));
          console.log(`      ✅ Found sold price: $${soldPrice.toLocaleString()}`);
        }
      }
    });
    
    await browser.close();
    return { listingPrice, soldPrice, source: 'Zillow' };
    
  } catch (error) {
    console.log(`      ❌ Zillow scraping error: ${error.message}`);
    await browser.close();
    return null;
  }
}

// ============================================
// Main Hybrid System
// ============================================

async function fetchPropertyWithHybridSystem(address, city, state = 'NY') {
  console.log(`\n📍 Processing: ${address}, ${city}, ${state}`);
  console.log('─'.repeat(50));
  
  // Step 1: Get reliable data from ATTOM
  const attomData = await getAttomData(address, city, state);
  
  // Step 2: Try to scrape listing price from Redfin
  let scrapedData = await scrapeRedfin(address, city, state);
  
  // Step 3: If Redfin fails, try Zillow
  if (!scrapedData || !scrapedData.listingPrice) {
    scrapedData = await scrapeZillow(address, city, state);
  }
  
  // Step 4: Combine the data
  const combinedData = {
    address,
    city,
    state,
    // From ATTOM (reliable property data)
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
    // Listing price from scraping
    listingPrice: scrapedData?.listingPrice || null,
    // Sale price (prefer ATTOM as it's from public records)
    soldPrice: attomData?.saleAmount || scrapedData?.soldPrice || null,
    saleDate: attomData?.saleDate,
    // Data sources
    dataSources: {
      propertyData: attomData ? 'ATTOM' : 'None',
      listingPrice: scrapedData?.source || 'None'
    }
  };
  
  // Calculate difference if we have both prices
  if (combinedData.listingPrice && combinedData.soldPrice) {
    combinedData.priceDifference = combinedData.soldPrice - combinedData.listingPrice;
    combinedData.percentDifference = ((combinedData.priceDifference / combinedData.listingPrice) * 100).toFixed(1);
    
    console.log(`\n   📈 Price Analysis:`);
    console.log(`      Listed: $${combinedData.listingPrice.toLocaleString()}`);
    console.log(`      Sold: $${combinedData.soldPrice.toLocaleString()}`);
    console.log(`      Difference: ${combinedData.priceDifference >= 0 ? '+' : ''}$${Math.abs(combinedData.priceDifference).toLocaleString()} (${combinedData.percentDifference}%)`);
  }
  
  return combinedData;
}

// ============================================
// Database Update Function
// ============================================

async function updateDatabaseWithHybridData() {
  console.log('🚀 Hybrid Data Fetch System (ATTOM + Web Scraping)\n');
  console.log('═'.repeat(60));
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Get properties to update
  const result = await client.query(`
    SELECT id, address, location
    FROM properties
    WHERE status = 'sold'
    AND location LIKE '%NY%'
    ORDER BY sold_price DESC NULLS LAST
    LIMIT 10
  `);
  
  console.log(`\nProcessing ${result.rows.length} properties...\n`);
  
  const results = [];
  
  for (const row of result.rows) {
    const city = (row.location || 'Mount Kisco, NY').split(',')[0].trim();
    const data = await fetchPropertyWithHybridSystem(row.address, city);
    
    // Update database
    if (data.listingPrice || data.soldPrice) {
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
          lng = COALESCE($8, lng)
        WHERE id = $9
      `, [
        data.listingPrice,
        data.soldPrice,
        data.beds,
        data.baths,
        data.sqft,
        data.yearBuilt,
        data.lat,
        data.lng,
        row.id
      ]);
      
      results.push(data);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Show summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY\n');
  
  const withBothPrices = results.filter(r => r.listingPrice && r.soldPrice);
  
  console.log(`✅ Successfully processed: ${results.length} properties`);
  console.log(`📈 Properties with both prices: ${withBothPrices.length}`);
  
  if (withBothPrices.length > 0) {
    const avgDiff = withBothPrices.reduce((sum, r) => sum + parseFloat(r.percentDifference), 0) / withBothPrices.length;
    console.log(`📊 Average price difference: ${avgDiff.toFixed(1)}%`);
    
    console.log('\nTop differences:');
    withBothPrices
      .sort((a, b) => Math.abs(b.priceDifference) - Math.abs(a.priceDifference))
      .slice(0, 3)
      .forEach(prop => {
        console.log(`  ${prop.address}: ${prop.percentDifference}% (${prop.dataSources.listingPrice})`);
      });
  }
  
  await client.end();
}

// Run if called directly
if (require.main === module) {
  updateDatabaseWithHybridData()
    .then(() => {
      console.log('\n✅ Hybrid fetch complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
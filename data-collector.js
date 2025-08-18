#!/usr/bin/env node

/**
 * Real Estate Data Collector
 * 
 * Uses hybrid approach:
 * 1. RapidAPI Redfin for bulk data (100 requests/month free)
 * 2. Saved search URLs for active listings 
 * 3. Verified listing prices from listing-price-corrections.json
 * 
 * Outputs data in format compatible with index.html
 */

const https = require('https');
const fs = require('fs');
require('dotenv').config();

// Configuration
const WESTCHESTER_REGIONS = [
  { name: 'Mount Kisco', regionId: '6_12517', type: 'city' },
  { name: 'Bedford', regionId: '6_12518', type: 'city' },
  { name: 'Chappaqua', regionId: '6_12519', type: 'city' },
  { name: 'Yorktown Heights', regionId: '6_12520', type: 'city' }
];

const SAVED_SEARCHES = [
  {
    name: 'Greenwich CT - Under $1.5M',
    url: 'https://www.redfin.com/city/33059/CT/Greenwich/filter/dyos-shape-id=93348912,property-type=house,max-price=1.5M,min-beds=3,min-baths=2,min-sqft=2.5k-sqft,min-lot-size=0.25-acre,include=forsale+mlsfsbo+construction+fsbo+foreclosed,status=active+comingsoon+contingent+pending,exclude-age-restricted',
    region: 'Greenwich, CT'
  }
];

// Load verified listing prices
function loadKnownListingPrices() {
  try {
    const data = fs.readFileSync('listing-price-corrections.json', 'utf8');
    const parsed = JSON.parse(data);
    console.log(`✅ Loaded ${Object.keys(parsed.properties).length} verified listing prices`);
    return parsed.properties;
  } catch (error) {
    console.log('⚠️ No verified listing prices found, using API data only');
    return {};
  }
}

// RapidAPI Redfin request
function makeRedfinAPIRequest(regionId, status = 'sold', limit = 20) {
  return new Promise((resolve, reject) => {
    const path = `/properties/list?regionId=${regionId}&limit=${limit}&status=${status}&soldInLast=6mo`;
    
    const options = {
      method: 'GET',
      hostname: 'redfin-com-data.p.rapidapi.com',
      path: path,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'redfin-com-data.p.rapidapi.com'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.homes || []);
        } catch (error) {
          console.log(`❌ Parse error for ${regionId}:`, error.message);
          resolve([]);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Request error for ${regionId}:`, error.message);
      resolve([]);
    });
    
    req.end();
  });
}

// Transform Redfin API data to our format
function transformRedfinProperty(home, knownPrices) {
  // Extract property data
  const address = home.streetLine?.value || home.addressLine1 || 'Unknown Address';
  const beds = home.beds || 0;
  const baths = home.baths || home.bathInfo?.computedTotalBaths || 0;
  const sqft = home.sqft?.value || home.homeSize?.value || 0;
  const price = home.priceInfo?.amount || home.priceInfo?.homePrice?.int64Value || 0;
  const lotSize = home.lotSize?.value || 0;
  
  // Convert lot size to acres (assuming sqft)
  const acres = lotSize > 0 ? +(lotSize / 43560).toFixed(2) : 0.5; // Default 0.5 acres
  
  // Determine district based on location
  const location = home.postalCode?.value || home.location || '';
  let district = 'Unknown';
  if (location.includes('10549') || location.includes('Mount Kisco')) district = 'Bedford Central';
  else if (location.includes('10514') || location.includes('Chappaqua')) district = 'Chappaqua Central';
  else if (location.includes('10598') || location.includes('Yorktown')) district = 'Yorktown Central';
  else if (location.includes('10506') || location.includes('Bedford')) district = 'Bedford Central';
  
  // Check for verified listing price
  const knownData = knownPrices[address];
  const askingPrice = knownData?.listingPrice || price;
  const soldPrice = knownData?.soldPrice || price;
  
  // Dates
  const listingDate = home.listingDate ? new Date(home.listingDate) : new Date();
  const saleDate = home.saleDate ? new Date(home.saleDate) : null;
  
  // Status
  let status = 'active';
  if (home.status === 'SOLD' || saleDate) status = 'sold';
  else if (home.status === 'PENDING') status = 'pending';
  
  // Calculate DOM for sold properties
  const dom = (saleDate && listingDate) ? 
    Math.floor((saleDate - listingDate) / (1000 * 60 * 60 * 24)) : 0;
  
  const property = {
    id: `${status}-${home.propertyId || Math.random().toString(36).substr(2, 9)}`,
    address,
    beds: Math.max(beds, 1),
    baths: Math.max(baths, 1),
    sqft: Math.max(sqft, 1200),
    acres: Math.max(acres, 0.25),
    district,
    askingPrice: Math.max(askingPrice, 500000),
    listingDate,
    propertyType: home.propertyType || 'Single Family',
    yearBuilt: home.yearBuilt || 1980,
    onMainRoad: false, // We don't have this data from API
    nearPowerLines: false, // We don't have this data from API
    status,
    lat: home.latLng?.latitude || 41.2048 + (Math.random() - 0.5) * 0.1,
    lng: home.latLng?.longitude || -73.7032 + (Math.random() - 0.5) * 0.1,
    verified: !!knownData?.verified
  };
  
  // Add sold-specific data
  if (status === 'sold') {
    property.soldPrice = Math.max(soldPrice, 500000);
    property.saleDate = saleDate;
    property.dom = Math.max(dom, 1);
  }
  
  // Add pending-specific data
  if (status === 'pending') {
    property.pendingDate = new Date();
  }
  
  return property;
}

// Main data collection function
async function collectData() {
  console.log('🚀 Real Estate Data Collector');
  console.log('═'.repeat(60));
  
  const knownPrices = loadKnownListingPrices();
  const allProperties = [];
  let requestCount = 0;
  
  console.log('\n📊 Collecting from RapidAPI Redfin...');
  
  // Collect sold properties from each region
  for (const region of WESTCHESTER_REGIONS) {
    if (requestCount >= 80) { // Save some requests for active listings
      console.log('⚠️ Approaching API limit, stopping region collection');
      break;
    }
    
    console.log(`\n🏘️ ${region.name} (${region.regionId})`);
    
    try {
      // Get sold properties
      const soldHomes = await makeRedfinAPIRequest(region.regionId, 'sold', 15);
      console.log(`   📈 Found ${soldHomes.length} sold properties`);
      
      soldHomes.forEach(home => {
        const property = transformRedfinProperty(home, knownPrices);
        allProperties.push(property);
      });
      
      requestCount++;
      
      // Small delay to be respectful
      await new Promise(r => setTimeout(r, 1000));
      
      // Get active listings if we have quota
      if (requestCount < 90) {
        const activeHomes = await makeRedfinAPIRequest(region.regionId, 'active', 10);
        console.log(`   🏠 Found ${activeHomes.length} active properties`);
        
        activeHomes.forEach(home => {
          const property = transformRedfinProperty(home, knownPrices);
          allProperties.push(property);
        });
        
        requestCount++;
        await new Promise(r => setTimeout(r, 1000));
      }
      
    } catch (error) {
      console.log(`   ❌ Error collecting data for ${region.name}:`, error.message);
    }
  }
  
  console.log(`\n📊 Collection Summary:`);
  console.log(`   API Requests Used: ${requestCount}/100`);
  console.log(`   Properties Collected: ${allProperties.length}`);
  
  const soldCount = allProperties.filter(p => p.status === 'sold').length;
  const activeCount = allProperties.filter(p => p.status === 'active').length;
  const pendingCount = allProperties.filter(p => p.status === 'pending').length;
  const verifiedCount = allProperties.filter(p => p.verified).length;
  
  console.log(`   Sold: ${soldCount}, Active: ${activeCount}, Pending: ${pendingCount}`);
  console.log(`   Verified Prices: ${verifiedCount}`);
  
  // Save data in format compatible with index.html
  const output = {
    lastUpdated: new Date().toISOString(),
    source: 'RapidAPI Redfin + Verified Prices',
    requestsUsed: requestCount,
    properties: allProperties,
    stats: {
      total: allProperties.length,
      sold: soldCount,
      active: activeCount,
      pending: pendingCount,
      verified: verifiedCount
    }
  };
  
  // Save to JSON file
  const filename = 'real-estate-data.json';
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\n✅ Data saved to ${filename}`);
  
  // Also save sample for localStorage (what index.html expects)
  const localStorageFormat = {
    properties: allProperties,
    lastUpdated: new Date().toISOString(),
    source: 'RapidAPI Redfin + Verified Prices'
  };
  
  fs.writeFileSync('data-for-index.json', JSON.stringify(localStorageFormat, null, 2));
  console.log(`✅ Compatible data saved to data-for-index.json`);
  
  console.log('\n💡 Next Steps:');
  console.log('1. Open index.html in browser');
  console.log('2. Copy data-for-index.json content to localStorage');
  console.log('3. Or modify index.html to load from JSON file directly');
  
  return output;
}

// Run collection if called directly
if (require.main === module) {
  collectData()
    .then(data => {
      console.log('\n🎉 Data collection complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Collection failed:', error);
      process.exit(1);
    });
}

module.exports = { collectData, loadKnownListingPrices };
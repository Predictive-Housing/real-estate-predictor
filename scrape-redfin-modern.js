#!/usr/bin/env node

/**
 * Modern Redfin scraper using node-fetch
 * Cleaner implementation with fetch API
 */

import fetch from 'node-fetch';
import fs from 'fs';

const SCRAPERAPI_KEY = '3a726054e900493c96df55b1b63e13f1';

// Your Redfin search URL with all filters
const REDFIN_SEARCH_URL = 'https://www.redfin.com/city/33059/CT/Greenwich/filter/dyos-shape-id=93348912,property-type=house,max-price=1.5M,min-beds=3,min-baths=2,min-sqft=2.5k-sqft,min-lot-size=0.25-acre,include=forsale+mlsfsbo+construction+fsbo+foreclosed,status=active+comingsoon+contingent+pending,exclude-age-restricted';

async function scrapeRedfinSearch() {
  console.log('🔍 Scraping Redfin search results...\n');
  console.log('Filters:');
  console.log('  - Location: Greenwich, CT');
  console.log('  - Type: House');
  console.log('  - Max Price: $1.5M');
  console.log('  - Min Beds: 3');
  console.log('  - Min Baths: 2');
  console.log('  - Min Sqft: 2,500');
  console.log('  - Min Lot: 0.25 acre');
  console.log('  - Status: Active, Coming Soon, Contingent, Pending\n');

  const scraperApiUrl = `https://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(REDFIN_SEARCH_URL)}&render=true`;

  try {
    console.log('📡 Fetching data from ScraperAPI...\n');
    
    const response = await fetch(scraperApiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Save raw HTML for debugging
    fs.writeFileSync('redfin-search-raw.html', html);
    console.log('📄 Saved raw HTML to redfin-search-raw.html\n');
    
    // Parse properties from the HTML
    const properties = parseProperties(html);
    
    // Save to JSON
    const output = {
      searchUrl: REDFIN_SEARCH_URL,
      scrapedAt: new Date().toISOString(),
      totalProperties: properties.length,
      properties: properties
    };
    
    fs.writeFileSync('redfin-properties.json', JSON.stringify(output, null, 2));
    console.log(`✅ Saved ${properties.length} properties to redfin-properties.json`);
    
    return properties;
    
  } catch (error) {
    console.error('❌ Error fetching data:', error.message);
    throw error;
  }
}

function parseProperties(html) {
  const properties = [];
  
  // Look for property URLs in the HTML
  const urlPattern = /href="(\/[A-Z]{2}\/[^"]+\/home\/\d+)"/g;
  const urls = new Set();
  let match;
  
  while ((match = urlPattern.exec(html)) !== null) {
    urls.add(`https://www.redfin.com${match[1]}`);
  }
  
  console.log(`Found ${urls.size} unique property URLs\n`);
  
  // Try to extract property data from React state in the page
  const jsonPattern = /window\.__reactServerState\s*=\s*({.*?});/s;
  const jsonMatch = html.match(jsonPattern);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      console.log('Found React server state data\n');
      
      // Navigate through the data structure to find properties
      const searchPath = data?.searchPageState?.homes?.homes || 
                        data?.InitialContext?.searchPageState?.homes?.homes ||
                        data?.searchResults?.homes?.homes;
      
      if (searchPath && Array.isArray(searchPath)) {
        searchPath.forEach(home => {
          const property = extractPropertyData(home);
          if (property) {
            properties.push(property);
          }
        });
        
        console.log(`Extracted ${properties.length} properties with full details\n`);
        return properties;
      }
    } catch (e) {
      console.log('Could not parse React data, using URL extraction only\n');
    }
  }
  
  // Fallback: Create properties from URLs only
  if (properties.length === 0 && urls.size > 0) {
    Array.from(urls).forEach((url, index) => {
      const addressInfo = parseAddressFromUrl(url);
      properties.push({
        id: `property-${index + 1}`,
        url: url,
        address: addressInfo?.fullAddress || 'Address not extracted',
        street: addressInfo?.street || '',
        city: addressInfo?.city || '',
        state: addressInfo?.state || '',
        zip: addressInfo?.zip || '',
        redfinPropertyId: addressInfo?.propertyId || null,
        price: 0,
        beds: 0,
        baths: 0,
        sqft: 0,
        status: 'Active'
      });
    });
  }
  
  return properties;
}

function extractPropertyData(home) {
  try {
    // Extract all available data from the home object
    const mlsId = home.mlsId?.value || home.mlsNumber || null;
    const price = home.price?.value || home.priceInfo?.amount || 0;
    const beds = home.beds || home.bedrooms || 0;
    const baths = home.baths || home.bathrooms || 0;
    const sqft = home.sqft?.value || home.squareFeet || 0;
    const lotSize = home.lotSize?.value || 0;
    
    // Build URL if not provided
    let url = home.url;
    if (url && !url.startsWith('http')) {
      url = `https://www.redfin.com${url}`;
    }
    
    // Parse address components
    const address = home.streetLine?.value || home.address || '';
    const city = home.city || '';
    const state = home.state || '';
    const zip = home.zip || home.zipCode || '';
    
    return {
      id: mlsId || `home-${home.propertyId || Math.random()}`,
      mlsId: mlsId,
      redfinPropertyId: home.propertyId || null,
      url: url,
      address: address,
      fullAddress: `${address}, ${city}, ${state} ${zip}`.trim(),
      city: city,
      state: state,
      zip: zip,
      price: price,
      beds: beds,
      baths: baths,
      sqft: sqft,
      lotSize: lotSize,
      acres: lotSize ? (lotSize / 43560).toFixed(2) : 0,
      yearBuilt: home.yearBuilt?.value || null,
      propertyType: home.propertyType || 'Single Family',
      status: home.listingStatus || home.status || 'Active',
      listingDate: home.timeOnRedfin?.value || home.listingDate || null,
      daysOnMarket: home.dom || home.daysOnMarket || 0,
      photos: home.photos || [],
      description: home.description || '',
      agent: home.listingAgent || null,
      brokerage: home.listingBroker || null
    };
  } catch (e) {
    return null;
  }
}

function parseAddressFromUrl(url) {
  // URL format: https://www.redfin.com/STATE/CITY/STREET-ZIP/home/ID
  const match = url.match(/\/([A-Z]{2})\/([^\/]+)\/([^\/]+)\/home\/(\d+)/);
  
  if (!match) return null;
  
  const [, state, city, streetZip, propertyId] = match;
  
  // Parse street and zip from the combined part
  const streetZipMatch = streetZip.match(/(.+)-(\d{5})$/);
  if (!streetZipMatch) return null;
  
  const [, street, zip] = streetZipMatch;
  
  // Convert slug format back to normal address
  const streetName = street
    .split('-')
    .map(word => {
      // Keep numbers as-is, capitalize other words
      return /^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  const cityName = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return {
    fullAddress: `${streetName}, ${cityName}, ${state} ${zip}`,
    street: streetName,
    city: cityName,
    state: state,
    zip: zip,
    propertyId: propertyId
  };
}

function displaySample(properties) {
  console.log('\n📋 Sample Properties:');
  console.log('=' .repeat(60));
  
  properties.slice(0, 5).forEach((prop, index) => {
    console.log(`\n${index + 1}. ${prop.fullAddress || prop.address || 'Property ' + (index + 1)}`);
    if (prop.price) console.log(`   💰 Price: $${prop.price.toLocaleString()}`);
    if (prop.beds) console.log(`   🛏️  ${prop.beds} beds | 🚿 ${prop.baths} baths | 📐 ${prop.sqft.toLocaleString()} sqft`);
    if (prop.acres) console.log(`   🌳 Lot: ${prop.acres} acres`);
    if (prop.status) console.log(`   📌 Status: ${prop.status}`);
    if (prop.url) console.log(`   🔗 ${prop.url}`);
  });
  
  console.log('\n' + '=' .repeat(60));
}

// Create URL mapping for frontend
async function createUrlMapping(properties) {
  const urlMapping = {};
  
  properties.forEach(prop => {
    const address = prop.fullAddress || prop.address;
    if (address && prop.url) {
      // Create multiple key formats for better matching
      urlMapping[address.toLowerCase()] = prop.url;
      
      // Also add without state/zip for partial matches
      if (prop.street && prop.city) {
        const shortAddress = `${prop.street}, ${prop.city}`;
        urlMapping[shortAddress.toLowerCase()] = prop.url;
        
        // Just street and city without commas
        const simpleAddress = `${prop.street} ${prop.city}`;
        urlMapping[simpleAddress.toLowerCase()] = prop.url;
      }
    }
  });
  
  fs.writeFileSync('redfin-url-mapping.json', JSON.stringify(urlMapping, null, 2));
  console.log(`\n🗺️  Created URL mapping for ${Object.keys(urlMapping).length} address variations`);
  console.log('📁 Saved to redfin-url-mapping.json');
  
  return urlMapping;
}

// Main execution
async function main() {
  try {
    const properties = await scrapeRedfinSearch();
    displaySample(properties);
    await createUrlMapping(properties);
    
    console.log(`\n✅ Scraping complete! Found ${properties.length} properties.`);
    console.log('📁 Check redfin-properties.json for full data');
    console.log('🗺️  Check redfin-url-mapping.json for address→URL mapping\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the scraper
main();
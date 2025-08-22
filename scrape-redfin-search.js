#!/usr/bin/env node

/**
 * Scrape Redfin search results using ScraperAPI
 * Gets all properties from your custom Redfin search with filters
 */

const http = require('http');
const fs = require('fs');

const SCRAPERAPI_KEY = '3a726054e900493c96df55b1b63e13f1';

// Your Redfin search URL with all filters
const REDFIN_SEARCH_URL = 'https://www.redfin.com/city/33059/CT/Greenwich/filter/dyos-shape-id=93348912,property-type=house,max-price=1.5M,min-beds=3,min-baths=2,min-sqft=2.5k-sqft,min-lot-size=0.25-acre,include=forsale+mlsfsbo+construction+fsbo+foreclosed,status=active+comingsoon+contingent+pending,exclude-age-restricted';

function scrapeRedfinSearch() {
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

  const scraperApiUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(REDFIN_SEARCH_URL)}&render=true`;

  return new Promise((resolve, reject) => {
    http.get(scraperApiUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Save raw HTML for debugging
        fs.writeFileSync('redfin-search-raw.html', data);
        console.log('📄 Saved raw HTML to redfin-search-raw.html\n');
        
        // Parse properties from the HTML
        const properties = parseProperties(data);
        
        // Save to JSON
        const output = {
          searchUrl: REDFIN_SEARCH_URL,
          scrapedAt: new Date().toISOString(),
          totalProperties: properties.length,
          properties: properties
        };
        
        fs.writeFileSync('redfin-properties.json', JSON.stringify(output, null, 2));
        console.log(`✅ Saved ${properties.length} properties to redfin-properties.json`);
        
        resolve(properties);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function parseProperties(html) {
  const properties = [];
  
  // Look for property cards in the HTML
  // Redfin uses various patterns, let's try multiple
  
  // Pattern 1: Look for home cards with URLs
  const urlPattern = /href="(\/[A-Z]{2}\/[^"]+\/home\/\d+)"/g;
  const urls = [];
  let match;
  
  while ((match = urlPattern.exec(html)) !== null) {
    const url = `https://www.redfin.com${match[1]}`;
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  
  console.log(`Found ${urls.length} property URLs\n`);
  
  // Pattern 2: Try to extract property data from JSON in the page
  const jsonPattern = /window\.__reactServerState\.InitialContext\s*=\s*({.*?});/s;
  const jsonMatch = html.match(jsonPattern);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      console.log('Found React data in page\n');
      
      // Navigate through the data structure to find properties
      // This structure can vary, so we need to explore it
      if (data?.searchPageState?.homes?.homes) {
        const homes = data.searchPageState.homes.homes;
        
        homes.forEach(home => {
          const property = {
            id: home.mlsId?.value || home.propertyId,
            address: home.streetLine?.value || '',
            city: home.city || '',
            state: home.state || '',
            zip: home.zip || '',
            price: home.price?.value || 0,
            beds: home.beds || 0,
            baths: home.baths || 0,
            sqft: home.sqft?.value || 0,
            lotSize: home.lotSize?.value || 0,
            yearBuilt: home.yearBuilt?.value || null,
            url: home.url ? `https://www.redfin.com${home.url}` : null,
            mlsId: home.mlsId?.value || null,
            propertyType: home.propertyType || 'Single Family',
            status: home.listingStatus || 'Active',
            listingDate: home.timeOnRedfin?.value || null,
            photos: home.photos || []
          };
          
          properties.push(property);
        });
        
        console.log(`Extracted ${properties.length} properties with details\n`);
      }
    } catch (e) {
      console.log('Could not parse React data:', e.message);
    }
  }
  
  // If we couldn't extract detailed data, at least return the URLs
  if (properties.length === 0 && urls.length > 0) {
    urls.forEach((url, index) => {
      properties.push({
        id: `property-${index + 1}`,
        url: url,
        address: 'Address not extracted - visit URL',
        price: 0,
        beds: 0,
        baths: 0,
        sqft: 0
      });
    });
  }
  
  // Pattern 3: Look for property data in other formats
  if (properties.length === 0) {
    // Try to find properties in alternative data structures
    const altPattern = /"mlsId":\s*"([^"]+)"/g;
    const mlsIds = new Set();
    
    while ((match = altPattern.exec(html)) !== null) {
      mlsIds.add(match[1]);
    }
    
    if (mlsIds.size > 0) {
      console.log(`Found ${mlsIds.size} MLS IDs\n`);
    }
  }
  
  return properties;
}

// Display sample properties
function displaySample(properties) {
  console.log('\n📋 Sample Properties:');
  console.log('=' .repeat(60));
  
  properties.slice(0, 5).forEach((prop, index) => {
    console.log(`\n${index + 1}. ${prop.address || 'Property ' + (index + 1)}`);
    if (prop.city) console.log(`   ${prop.city}, ${prop.state} ${prop.zip}`);
    if (prop.price) console.log(`   Price: $${prop.price.toLocaleString()}`);
    if (prop.beds) console.log(`   Beds: ${prop.beds} | Baths: ${prop.baths} | Sqft: ${prop.sqft}`);
    if (prop.url) console.log(`   URL: ${prop.url}`);
  });
  
  console.log('\n' + '=' .repeat(60));
}

// Run the scraper
scrapeRedfinSearch()
  .then(properties => {
    displaySample(properties);
    console.log(`\n✅ Scraping complete! Found ${properties.length} properties.`);
    console.log('📁 Check redfin-properties.json for full data');
    console.log('📄 Check redfin-search-raw.html for raw HTML\n');
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
  });
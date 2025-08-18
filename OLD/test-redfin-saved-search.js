#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function testRedfinSavedSearch() {
  console.log('🔍 Testing Redfin Saved Search URL');
  console.log('═'.repeat(60));
  
  const searchUrl = 'https://www.redfin.com/city/33059/CT/Greenwich/filter/dyos-shape-id=93348912,property-type=house,max-price=1.5M,min-beds=3,min-baths=2,min-sqft=2.5k-sqft,min-lot-size=0.25-acre,include=forsale+mlsfsbo+construction+fsbo+foreclosed,status=active+comingsoon+contingent+pending,exclude-age-restricted';
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌐 Loading Redfin search page...');
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for results to load
    await new Promise(r => setTimeout(r, 5000));
    
    // Try to find property cards/listings
    const properties = await page.evaluate(() => {
      // Try multiple selectors for property listings
      const selectors = [
        '[data-rf-test-id="mapListingCard"]',
        '.SearchResult',
        '.HomeCard',
        '[class*="SearchResult"]',
        '[class*="HomeCard"]'
      ];
      
      let propertyElements = [];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          propertyElements = elements;
          console.log(`Found ${elements.length} properties using selector: ${selector}`);
          break;
        }
      }
      
      const properties = [];
      
      propertyElements.forEach((element, index) => {
        try {
          // Extract property data
          const addressEl = element.querySelector('[data-rf-test-id="property-address"], .address, [class*="address"]');
          const priceEl = element.querySelector('[data-rf-test-id="property-price"], .price, [class*="price"]');
          const bedsEl = element.querySelector('[data-rf-test-id="property-beds"], .beds, [class*="beds"]');
          const bathsEl = element.querySelector('[data-rf-test-id="property-baths"], .baths, [class*="baths"]');
          const sqftEl = element.querySelector('[data-rf-test-id="property-sqft"], .sqft, [class*="sqft"]');
          const mlsEl = element.querySelector('[data-rf-test-id="property-mls-id"], .mls, [class*="mls"]');
          
          // Try to get property URL
          const linkEl = element.querySelector('a[href*="/home/"]');
          
          const property = {
            index: index + 1,
            address: addressEl?.textContent?.trim() || 'N/A',
            price: priceEl?.textContent?.trim() || 'N/A',
            beds: bedsEl?.textContent?.trim() || 'N/A',
            baths: bathsEl?.textContent?.trim() || 'N/A',
            sqft: sqftEl?.textContent?.trim() || 'N/A',
            mls: mlsEl?.textContent?.trim() || 'N/A',
            url: linkEl?.href || 'N/A',
            rawText: element.textContent?.trim().substring(0, 200) || 'N/A'
          };
          
          properties.push(property);
        } catch (error) {
          console.log(`Error processing property ${index + 1}:`, error.message);
        }
      });
      
      return {
        properties,
        totalFound: propertyElements.length,
        pageTitle: document.title,
        pageUrl: window.location.href
      };
    });
    
    console.log(`\n📊 Results:`);
    console.log(`   Page Title: ${properties.pageTitle}`);
    console.log(`   Properties Found: ${properties.totalFound}`);
    console.log(`   Extracted Properties: ${properties.properties.length}`);
    
    // Show first few properties
    console.log(`\n🏠 Sample Properties:\n`);
    properties.properties.slice(0, 5).forEach(prop => {
      console.log(`${prop.index}. ${prop.address}`);
      console.log(`   Price: ${prop.price}`);
      console.log(`   ${prop.beds} beds, ${prop.baths} baths, ${prop.sqft}`);
      if (prop.url !== 'N/A') {
        console.log(`   URL: ${prop.url}`);
      }
      console.log(`   MLS: ${prop.mls}`);
      console.log('');
    });
    
    // Check for pagination or "Load More" functionality
    const pagination = await page.evaluate(() => {
      const loadMoreBtn = document.querySelector('[data-rf-test-id="load-more"], .load-more, [class*="load-more"]');
      const nextBtn = document.querySelector('[data-rf-test-id="next-page"], .next, [class*="next"]');
      const totalCount = document.querySelector('[data-rf-test-id="total-count"], .total-count, [class*="total"]');
      
      return {
        hasLoadMore: !!loadMoreBtn,
        hasNext: !!nextBtn,
        totalText: totalCount?.textContent?.trim() || 'N/A'
      };
    });
    
    console.log(`📄 Pagination Info:`);
    console.log(`   Total Results Text: ${pagination.totalText}`);
    console.log(`   Has Load More: ${pagination.hasLoadMore}`);
    console.log(`   Has Next Page: ${pagination.hasNext}`);
    
    await browser.close();
    
    return {
      success: true,
      propertiesFound: properties.properties.length,
      properties: properties.properties,
      pagination
    };
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    await browser.close();
    return { success: false, error: error.message };
  }
}

// Run test
testRedfinSavedSearch()
  .then(result => {
    console.log('\n' + '═'.repeat(60));
    if (result.success) {
      console.log(`✅ Successfully extracted data from ${result.propertiesFound} properties`);
      console.log('\n💡 Recommendations:');
      console.log('1. This URL structure can be automated for data collection');
      console.log('2. Property URLs can be used for detailed scraping');
      console.log('3. Much more cost-effective than ATTOM API');
      console.log('4. Can be combined with your existing listing-price-corrections.json');
    } else {
      console.log(`❌ Failed to extract data: ${result.error}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
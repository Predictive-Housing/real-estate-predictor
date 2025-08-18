#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function scrapeRedfinSearch() {
  console.log('🔍 Advanced Redfin Search Scraper');
  console.log('═'.repeat(60));
  
  const searchUrl = 'https://www.redfin.com/city/33059/CT/Greenwich/filter/dyos-shape-id=93348912,property-type=house,max-price=1.5M,min-beds=3,min-baths=2,min-sqft=2.5k-sqft,min-lot-size=0.25-acre,include=forsale+mlsfsbo+construction+fsbo+foreclosed,status=active+comingsoon+contingent+pending,exclude-age-restricted';
  
  const browser = await puppeteer.launch({ 
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1024 }
  });
  
  try {
    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌐 Loading Redfin search page...');
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Wait for page to fully load
    console.log('⏳ Waiting for content to load...');
    await new Promise(r => setTimeout(r, 10000));
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'redfin-search-debug.png', fullPage: true });
    console.log('📸 Screenshot saved as redfin-search-debug.png');
    
    // Try to interact with the page to trigger any lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // Look for all possible property container selectors
    const properties = await page.evaluate(() => {
      // Get page HTML for debugging
      const pageHTML = document.body.innerHTML.substring(0, 2000);
      console.log('Page HTML sample:', pageHTML);
      
      // Try many different selectors
      const selectors = [
        '.HomeCard',
        '.SearchResult',
        '[data-rf-test-id="searchResultCard"]',
        '[data-rf-test-id="result-card"]',
        '.resultsContainer .result',
        '.listing-result',
        '.home-card',
        '.property-card',
        '[class*="Home"]',
        '[class*="Result"]',
        '[class*="Card"]',
        '[class*="Property"]',
        'div[data-url*="/home/"]',
        'a[href*="/home/"]',
        '.HomeCardContainer',
        '.PropertySearchCard'
      ];
      
      let foundElements = [];
      let usedSelector = '';
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector "${selector}": found ${elements.length} elements`);
        if (elements.length > 0) {
          foundElements = Array.from(elements);
          usedSelector = selector;
          break;
        }
      }
      
      // If no specific containers found, look for any links to properties
      if (foundElements.length === 0) {
        const links = document.querySelectorAll('a[href*="/home/"]');
        console.log(`Found ${links.length} property links`);
        foundElements = Array.from(links);
        usedSelector = 'a[href*="/home/"]';
      }
      
      // Extract property data
      const properties = [];
      
      foundElements.forEach((element, index) => {
        try {
          // Get all text content
          const allText = element.textContent || '';
          
          // Try to find address, price, beds/baths
          const addressMatch = allText.match(/(\d+\s+[^,]+(?:,\s*[^,]+)*)/);
          const priceMatch = allText.match(/\$[\d,]+/);
          const bedsMatch = allText.match(/(\d+)\s*(?:bd|bed|bedroom)/i);
          const bathsMatch = allText.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath|bathroom)/i);
          const sqftMatch = allText.match/([\d,]+)\s*(?:sq\s*ft|sqft)/i);
          
          // Get URL if it's a link or contains a link
          let url = '';
          if (element.tagName === 'A') {
            url = element.href;
          } else {
            const linkEl = element.querySelector('a[href*="/home/"]');
            url = linkEl ? linkEl.href : '';
          }
          
          const property = {
            index: index + 1,
            address: addressMatch ? addressMatch[1].trim() : 'N/A',
            price: priceMatch ? priceMatch[0] : 'N/A',
            beds: bedsMatch ? bedsMatch[1] : 'N/A',
            baths: bathsMatch ? bathsMatch[1] : 'N/A',
            sqft: sqftMatch ? sqftMatch[1] : 'N/A',
            url: url || 'N/A',
            selector: usedSelector,
            textSample: allText.substring(0, 100) + '...'
          };
          
          // Only include if we found at least some data
          if (property.address !== 'N/A' || property.price !== 'N/A' || property.url !== 'N/A') {
            properties.push(property);
          }
        } catch (error) {
          console.log(`Error processing element ${index}:`, error.message);
        }
      });
      
      return {
        properties,
        totalElements: foundElements.length,
        usedSelector,
        pageTitle: document.title,
        url: window.location.href
      };
    });
    
    console.log(`\n📊 Extraction Results:`);
    console.log(`   Selector Used: ${properties.usedSelector}`);
    console.log(`   Elements Found: ${properties.totalElements}`);
    console.log(`   Properties Extracted: ${properties.properties.length}`);
    
    if (properties.properties.length > 0) {
      console.log(`\n🏠 Properties Found:\n`);
      properties.properties.forEach(prop => {
        console.log(`${prop.index}. ${prop.address}`);
        console.log(`   Price: ${prop.price} | ${prop.beds} beds | ${prop.baths} baths | ${prop.sqft} sqft`);
        if (prop.url !== 'N/A') {
          console.log(`   URL: ${prop.url}`);
        }
        console.log(`   Sample: ${prop.textSample}`);
        console.log('');
      });
    } else {
      console.log('\n❌ No properties extracted. Checking page structure...');
      
      // Debug: show page structure
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          bodyText: document.body.innerText.substring(0, 500),
          linkCount: document.querySelectorAll('a').length,
          divCount: document.querySelectorAll('div').length,
          hasReactRoot: !!document.querySelector('#root, [data-react-root]'),
          scripts: Array.from(document.scripts).length
        };
      });
      
      console.log('📄 Page Debug Info:');
      console.log(`   Title: ${pageInfo.title}`);
      console.log(`   Links: ${pageInfo.linkCount}`);
      console.log(`   Divs: ${pageInfo.divCount}`);
      console.log(`   Has React: ${pageInfo.hasReactRoot}`);
      console.log(`   Scripts: ${pageInfo.scripts}`);
      console.log(`   Body Text: ${pageInfo.bodyText}...`);
    }
    
    // Keep browser open for manual inspection
    console.log('\n🔍 Browser will stay open for 30 seconds for manual inspection...');
    await new Promise(r => setTimeout(r, 30000));
    
    await browser.close();
    
    return properties;
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    await browser.close();
    return { error: error.message };
  }
}

// Run scraper
scrapeRedfinSearch()
  .then(result => {
    console.log('\n' + '═'.repeat(60));
    if (result.properties && result.properties.length > 0) {
      console.log(`✅ Success! Found ${result.properties.length} properties`);
    } else {
      console.log('❌ No properties found - may need different approach');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
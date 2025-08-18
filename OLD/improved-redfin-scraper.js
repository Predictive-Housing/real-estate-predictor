#!/usr/bin/env node

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function scrapeRedfinByDirectURL(propertyUrl) {
  console.log(`\n🌐 Scraping: ${propertyUrl}`);
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set a more complete user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set additional headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
    
    // Go to the property page
    await page.goto(propertyUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    // Wait for the page to fully load
    await new Promise(r => setTimeout(r, 5000));
    
    // Try to wait for history table to load
    try {
      await page.waitForSelector('.PropertyHistoryTable', { timeout: 5000 });
    } catch (e) {
      console.log('   History table not found, trying alternative selectors...');
    }
    
    // Extract the page content
    const content = await page.evaluate(() => {
      // Try multiple selectors for property history
      const selectors = [
        '[data-rf-test-id="property-history-event-row"]',
        '.PropertyHistoryEventRow',
        'tbody tr',
        '.history-row',
        '[class*="PropertyHistory"] tr'
      ];
      
      let historyRows = [];
      for (const selector of selectors) {
        const rows = document.querySelectorAll(selector);
        if (rows.length > 0) {
          historyRows = rows;
          break;
        }
      }
      
      const history = [];
      
      historyRows.forEach(row => {
        const text = row.textContent || '';
        // Try multiple patterns to extract data
        const date = row.querySelector('[data-rf-test-id="date-col"], .date-col, td:first-child')?.textContent?.trim();
        const event = row.querySelector('[data-rf-test-id="event-col"], .event-col, td:nth-child(2)')?.textContent?.trim();
        const price = row.querySelector('[data-rf-test-id="price-col"], .price-col, td:nth-child(3)')?.textContent?.trim();
        
        if (date && event) {
          history.push({ date, event, price: price || '—', text });
        } else if (text.includes('Listed') || text.includes('Sold')) {
          // Try to extract from raw text
          const priceMatch = text.match(/\$[\d,]+/);
          if (priceMatch) {
            history.push({ 
              date: 'Unknown', 
              event: text.includes('Listed') ? 'Listed' : 'Sold',
              price: priceMatch[0],
              text
            });
          }
        }
      });
      
      // Also try to get data from Redux store or React props
      let storeData = null;
      try {
        // Check for __INITIAL_STATE__ or similar
        if (window.__INITIAL_STATE__) {
          storeData = window.__INITIAL_STATE__;
        } else if (window.__reactRouterData) {
          storeData = window.__reactRouterData;
        }
      } catch (e) {
        // Ignore errors
      }
      
      return {
        history,
        pageTitle: document.title,
        currentPrice: document.querySelector('.statsValue')?.textContent?.trim(),
        storeData: storeData
      };
    });
    
    console.log('   Page title:', content.pageTitle);
    console.log('   Current price shown:', content.currentPrice);
    
    // Parse the history for listing and sold prices
    let listingPrice = null;
    let soldPrice = null;
    let listingDate = null;
    let soldDate = null;
    
    if (content.history && content.history.length > 0) {
      console.log(`   Found ${content.history.length} history events:`);
      
      content.history.forEach(item => {
        console.log(`     ${item.date}: ${item.event} - ${item.price}`);
        
        if (item.event.toLowerCase().includes('listed') && item.price && item.price !== '—') {
          const price = parseInt(item.price.replace(/[$,]/g, ''));
          if (price > 0 && !listingPrice) {
            listingPrice = price;
            listingDate = item.date;
          }
        }
        
        if (item.event.toLowerCase().includes('sold') && item.price && item.price !== '—') {
          const price = parseInt(item.price.replace(/[$,]/g, ''));
          if (price > 0) {
            soldPrice = price;
            soldDate = item.date;
          }
        }
      });
    } else {
      console.log('   No history events found');
      
      // Try alternative method: look in page source
      const pageSource = await page.content();
      const $ = cheerio.load(pageSource);
      
      // Look for JSON-LD structured data
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const data = JSON.parse($(elem).html());
          if (data['@type'] === 'Product' || data['@type'] === 'RealEstateListing') {
            if (data.offers?.price) {
              console.log(`   Found price in JSON-LD: $${data.offers.price}`);
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
    }
    
    await browser.close();
    
    const result = {
      listingPrice,
      listingDate,
      soldPrice,
      soldDate,
      source: 'Redfin',
      url: propertyUrl
    };
    
    if (listingPrice) {
      console.log(`   ✅ Listing price: $${listingPrice.toLocaleString()} (${listingDate})`);
    }
    if (soldPrice) {
      console.log(`   ✅ Sold price: $${soldPrice.toLocaleString()} (${soldDate})`);
    }
    
    return result;
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    await browser.close();
    return null;
  }
}

// Test with known properties
async function testScraping() {
  const testProperties = [
    {
      address: '2 Stratford Dr',
      url: 'https://www.redfin.com/NY/Mount-Kisco/2-Stratford-Dr-10549/home/50321125',
      expectedListing: 1525000
    },
    {
      address: '185 Harriman Rd',
      url: 'https://www.redfin.com/NY/Mount-Kisco/185-Harriman-Rd-10549/home/20085960',
      expectedListing: 899000
    }
  ];
  
  console.log('🔍 Testing Redfin Scraper\n');
  console.log('═'.repeat(60));
  
  for (const prop of testProperties) {
    console.log(`\nProperty: ${prop.address}`);
    console.log(`Expected listing price: $${prop.expectedListing.toLocaleString()}`);
    
    const result = await scrapeRedfinByDirectURL(prop.url);
    
    if (result && result.listingPrice) {
      if (result.listingPrice === prop.expectedListing) {
        console.log('   ✅ CORRECT! Matches expected listing price');
      } else {
        console.log(`   ⚠️ MISMATCH: Got $${result.listingPrice.toLocaleString()}, expected $${prop.expectedListing.toLocaleString()}`);
      }
    } else {
      console.log('   ❌ Failed to extract listing price');
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Run test
testScraping()
  .then(() => {
    console.log('\n✅ Scraping test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
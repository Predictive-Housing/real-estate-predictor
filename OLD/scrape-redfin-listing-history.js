#!/usr/bin/env node

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { Client } = require('pg');
require('dotenv').config();

async function scrapeRedfin(address, propertyUrl) {
  console.log(`\n🔍 Scraping: ${address}`);
  console.log(`   URL: ${propertyUrl}`);
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Go to the property page
    await page.goto(propertyUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for content to load
    await page.waitForSelector('.home-main-stats-variant', { timeout: 5000 }).catch(() => {});
    
    // Get the page content
    const html = await page.content();
    const $ = cheerio.load(html);
    
    // Extract price history from the page
    const priceHistory = [];
    
    // Look for price history section
    $('.PropertyHistoryEventRow').each((i, elem) => {
      const date = $(elem).find('.date-col').text().trim();
      const event = $(elem).find('.event-col').text().trim();
      const price = $(elem).find('.price-col').text().trim();
      
      if (price && price !== '—') {
        priceHistory.push({ date, event, price });
      }
    });
    
    // Also check for JSON data in script tags
    const scripts = $('script').toArray();
    let listingData = null;
    
    for (const script of scripts) {
      const content = $(script).html();
      if (content && content.includes('listingHistory')) {
        // Try to extract JSON data
        const match = content.match(/window\.__PRELOADED_STATE__\s*=\s*({.*?});/s);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            if (data.propertyDetails) {
              listingData = data.propertyDetails;
            }
          } catch (e) {
            // Not valid JSON
          }
        }
      }
    }
    
    // Look for specific price elements
    const currentPrice = $('.home-main-stats-variant .statsValue').first().text().trim();
    
    // Check property history table
    const historyTable = $('#property-history-transition-node table');
    if (historyTable.length) {
      console.log('   ✅ Found property history table');
      
      historyTable.find('tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const date = cells.eq(0).text().trim();
          const event = cells.eq(1).text().trim();
          const price = cells.eq(2).text().trim();
          
          if (event.toLowerCase().includes('listed') && price) {
            console.log(`   📍 Listed: ${date} - ${price}`);
          }
          if (event.toLowerCase().includes('sold') && price) {
            console.log(`   📍 Sold: ${date} - ${price}`);
          }
        }
      });
    }
    
    console.log(`   Current price shown: ${currentPrice}`);
    if (priceHistory.length > 0) {
      console.log('   Price history found:', priceHistory);
    }
    
    await browser.close();
    return { currentPrice, priceHistory, listingData };
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    await browser.close();
    return null;
  }
}

async function updatePropertyWithScrapedData() {
  console.log('🏠 Scraping Redfin for Listing History\n');
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Test with a few known properties
  const testProperties = [
    {
      address: '185 Harriman Rd',
      url: 'https://www.redfin.com/NY/Mount-Kisco/185-Harriman-Rd-10549/home/20085960'
    },
    {
      address: '28 James Rd',
      url: 'https://www.redfin.com/NY/Bedford-Corners/28-James-Rd-10549/home/20073678'
    },
    {
      address: '15 Woodland Rd',
      url: 'https://www.redfin.com/NY/Bedford-Hills/15-Woodland-Rd-10507/home/20055607'
    }
  ];
  
  for (const prop of testProperties) {
    const data = await scrapeRedfin(prop.address, prop.url);
    
    if (data && data.priceHistory.length > 0) {
      // Look for listing price
      const listingEvent = data.priceHistory.find(h => 
        h.event.toLowerCase().includes('listed')
      );
      
      if (listingEvent) {
        const listingPrice = parseInt(listingEvent.price.replace(/[$,]/g, ''));
        console.log(`   💰 Original listing price: $${listingPrice.toLocaleString()}`);
        
        // Update database
        await client.query(
          `UPDATE properties SET asking_price = $1 WHERE address = $2`,
          [listingPrice, prop.address]
        );
      }
    }
    
    // Delay between requests
    await new Promise(r => setTimeout(r, 3000));
  }
  
  await client.end();
}

// Run if called directly
if (require.main === module) {
  updatePropertyWithScrapedData()
    .then(() => {
      console.log('\n✅ Scraping complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
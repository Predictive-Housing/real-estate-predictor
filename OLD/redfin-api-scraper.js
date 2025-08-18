#!/usr/bin/env node

const https = require('https');
const puppeteer = require('puppeteer');

async function getRedfinDataViaAPI(propertyUrl) {
  console.log(`\n🔍 Fetching Redfin data for: ${propertyUrl}`);
  
  // Extract property ID from URL
  const match = propertyUrl.match(/\/home\/(\d+)$/);
  if (!match) {
    console.log('   ❌ Could not extract property ID from URL');
    return null;
  }
  
  const propertyId = match[1];
  console.log(`   Property ID: ${propertyId}`);
  
  // Try Redfin's initial data API endpoint
  const apiUrl = `https://www.redfin.com/stingray/api/home/details/belowTheFold?propertyId=${propertyId}&accessLevel=1`;
  
  return new Promise((resolve) => {
    https.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': propertyUrl
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data.replace('{}&&', ''));
          
          // Look for property history
          const propertyHistory = json?.payload?.propertyHistoryInfo?.events || [];
          
          let listingPrice = null;
          let soldPrice = null;
          let listingDate = null;
          let soldDate = null;
          
          console.log(`   Found ${propertyHistory.length} history events`);
          
          propertyHistory.forEach(event => {
            console.log(`     ${event.eventDate}: ${event.eventDescription} - $${event.price?.toLocaleString() || 'N/A'}`);
            
            if (event.eventDescription?.toLowerCase().includes('listed')) {
              if (!listingPrice && event.price) {
                listingPrice = event.price;
                listingDate = event.eventDate;
              }
            }
            
            if (event.eventDescription?.toLowerCase().includes('sold')) {
              if (event.price) {
                soldPrice = event.price;
                soldDate = event.eventDate;
              }
            }
          });
          
          // Also check in other fields
          if (!listingPrice) {
            // Check originalListPrice field
            if (json?.payload?.originalListPrice) {
              listingPrice = json.payload.originalListPrice;
              console.log(`   Found original list price: $${listingPrice.toLocaleString()}`);
            }
            
            // Check listingHistory
            const listingHistory = json?.payload?.listingHistory || [];
            for (const listing of listingHistory) {
              if (listing.price && !listingPrice) {
                listingPrice = listing.price;
                listingDate = listing.listedDate;
                console.log(`   Found in listing history: $${listingPrice.toLocaleString()}`);
                break;
              }
            }
          }
          
          resolve({
            listingPrice,
            listingDate,
            soldPrice,
            soldDate,
            source: 'Redfin API'
          });
          
        } catch (error) {
          console.log(`   ❌ Error parsing API response: ${error.message}`);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ API request error: ${error.message}`);
      resolve(null);
    });
  });
}

async function getRedfinDataWithBrowser(propertyUrl) {
  console.log(`\n🌐 Using browser to fetch Redfin data...`);
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Intercept API responses
    let propertyData = null;
    
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/stingray/api/') || url.includes('graphql')) {
        try {
          const data = await response.json();
          if (data?.payload?.propertyHistoryInfo || data?.payload?.listingHistory) {
            propertyData = data;
            console.log('   ✅ Intercepted property data from API');
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
    
    await page.goto(propertyUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    
    // Try to extract from intercepted data
    if (propertyData) {
      const history = propertyData?.payload?.propertyHistoryInfo?.events || [];
      let listingPrice = null;
      let soldPrice = null;
      
      history.forEach(event => {
        if (event.eventDescription?.toLowerCase().includes('listed') && event.price) {
          if (!listingPrice) {
            listingPrice = event.price;
            console.log(`   Found listing price: $${listingPrice.toLocaleString()}`);
          }
        }
        if (event.eventDescription?.toLowerCase().includes('sold') && event.price) {
          soldPrice = event.price;
          console.log(`   Found sold price: $${soldPrice.toLocaleString()}`);
        }
      });
      
      await browser.close();
      return { listingPrice, soldPrice, source: 'Redfin Browser' };
    }
    
    // Fallback: try to extract from page
    const pageData = await page.evaluate(() => {
      const scripts = Array.from(document.scripts);
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('__NEXT_DATA__') || text.includes('__PRELOADED_STATE__')) {
          try {
            const match = text.match(/\{.*"propertyHistory".*\}/);
            if (match) {
              return JSON.parse(match[0]);
            }
          } catch (e) {
            // Continue
          }
        }
      }
      return null;
    });
    
    await browser.close();
    
    if (pageData) {
      console.log('   Found embedded data in page');
      // Extract prices from pageData
      // This would need more parsing logic based on the structure
    }
    
    return null;
    
  } catch (error) {
    console.log(`   ❌ Browser error: ${error.message}`);
    await browser.close();
    return null;
  }
}

// Test function
async function testRedfinScraping() {
  const testProperties = [
    {
      address: '2 Stratford Dr',
      url: 'https://www.redfin.com/NY/Mount-Kisco/2-Stratford-Dr-10549/home/50321125',
      expectedListing: 1525000,
      expectedSold: 1625000
    },
    {
      address: '185 Harriman Rd', 
      url: 'https://www.redfin.com/NY/Mount-Kisco/185-Harriman-Rd-10549/home/20085960',
      expectedListing: 899000,
      expectedSold: 999000
    }
  ];
  
  console.log('🔍 Testing Redfin Data Extraction\n');
  console.log('═'.repeat(60));
  
  for (const prop of testProperties) {
    console.log(`\nProperty: ${prop.address}`);
    console.log(`Expected: Listed $${prop.expectedListing.toLocaleString()}, Sold $${prop.expectedSold.toLocaleString()}`);
    
    // Try API method first
    let result = await getRedfinDataViaAPI(prop.url);
    
    if (!result || !result.listingPrice) {
      // Fallback to browser method
      result = await getRedfinDataWithBrowser(prop.url);
    }
    
    if (result) {
      console.log(`\n   Results from ${result.source}:`);
      if (result.listingPrice) {
        const match = result.listingPrice === prop.expectedListing ? '✅' : '⚠️';
        console.log(`   ${match} Listing: $${result.listingPrice.toLocaleString()}`);
      }
      if (result.soldPrice) {
        const match = result.soldPrice === prop.expectedSold ? '✅' : '⚠️';
        console.log(`   ${match} Sold: $${result.soldPrice.toLocaleString()}`);
      }
    } else {
      console.log('   ❌ Failed to extract data');
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('\n' + '═'.repeat(60));
}

// Run test
if (require.main === module) {
  testRedfinScraping()
    .then(() => {
      console.log('\n✅ Test complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
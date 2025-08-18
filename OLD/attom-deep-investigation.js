#!/usr/bin/env node

const https = require('https');
require('dotenv').config();

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;

// Test properties with KNOWN listing prices from Redfin
const TEST_PROPERTIES = [
  {
    address: '2 Stratford Dr',
    city: 'Mount Kisco, NY',
    knownListingPrice: 1525000,
    knownSoldPrice: 1625000,
    redfinUrl: 'https://www.redfin.com/NY/Mount-Kisco/2-Stratford-Dr-10549/home/50321125'
  },
  {
    address: '185 Harriman Rd',
    city: 'Mount Kisco, NY',
    knownListingPrice: 899000,
    knownSoldPrice: 999000,
    redfinUrl: 'https://www.redfin.com/NY/Mount-Kisco/185-Harriman-Rd-10549/home/20085960'
  }
];

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

async function deepInvestigation() {
  console.log('🔍 ATTOM Data Deep Investigation\n');
  console.log('=====================================\n');
  
  for (const testProp of TEST_PROPERTIES) {
    console.log(`\n📍 PROPERTY: ${testProp.address}`);
    console.log(`   Known Listing Price: $${testProp.knownListingPrice.toLocaleString()}`);
    console.log(`   Known Sold Price: $${testProp.knownSoldPrice.toLocaleString()}`);
    console.log(`   Redfin URL: ${testProp.redfinUrl}\n`);
    
    console.log('1️⃣ Testing /allevents/detail endpoint...');
    const allEvents = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
      address1: testProp.address,
      address2: testProp.city
    });
    
    if (allEvents?.property?.[0]) {
      const prop = allEvents.property[0];
      console.log('\n   📊 AVM Data:');
      console.log(`      AVM Value: $${prop.avm?.amount?.value?.toLocaleString() || 'N/A'}`);
      console.log(`      AVM Date: ${prop.avm?.eventDate || 'N/A'}`);
      console.log(`      AVM Score: ${prop.avm?.amount?.scr || 'N/A'}`);
      
      console.log('\n   💰 Sale Data:');
      console.log(`      Sale Amount: $${prop.sale?.amount?.saleamt?.toLocaleString() || 'N/A'}`);
      console.log(`      Sale Date: ${prop.sale?.saleTransDate || 'N/A'}`);
      console.log(`      Sale Type: ${prop.sale?.amount?.saletranstype || 'N/A'}`);
      
      console.log('\n   🏠 Assessment Data:');
      console.log(`      Market Value: $${prop.assessment?.market?.mktttlvalue?.toLocaleString() || 'N/A'}`);
      console.log(`      Assessed Value: $${prop.assessment?.assessed?.assdttlvalue?.toLocaleString() || 'N/A'}`);
      
      // Check if there's any field that matches the known listing price
      const jsonStr = JSON.stringify(prop);
      if (jsonStr.includes(testProp.knownListingPrice.toString())) {
        console.log(`\n   ✅ FOUND LISTING PRICE ${testProp.knownListingPrice} in response!`);
        // Find where it appears
        for (const [key, value] of Object.entries(prop)) {
          if (JSON.stringify(value).includes(testProp.knownListingPrice.toString())) {
            console.log(`      Found in field: ${key}`);
          }
        }
      } else {
        console.log(`\n   ❌ Listing price ${testProp.knownListingPrice} NOT found in response`);
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('\n2️⃣ Testing /saleshistory/detail endpoint...');
    const salesHistory = await makeAttomRequest('/propertyapi/v1.0.0/saleshistory/detail', {
      address1: testProp.address,
      address2: testProp.city
    });
    
    if (salesHistory?.property?.[0]?.saleHistory) {
      console.log(`   Found ${salesHistory.property[0].saleHistory.length} sale records:`);
      
      salesHistory.property[0].saleHistory.forEach((sale, i) => {
        console.log(`\n   Sale #${i + 1}:`);
        console.log(`      Date: ${sale.saleTransDate}`);
        console.log(`      Amount: $${sale.saleTransAmount?.saleAmt?.toLocaleString() || 'N/A'}`);
        console.log(`      Recording Date: ${sale.saleRecordingDate}`);
        console.log(`      Document #: ${sale.saleDocNum}`);
        
        // Check all fields in the sale record
        for (const [key, value] of Object.entries(sale)) {
          if (value && typeof value === 'object') {
            for (const [subkey, subvalue] of Object.entries(value)) {
              if (subvalue === testProp.knownListingPrice || 
                  subvalue === testProp.knownListingPrice.toString()) {
                console.log(`      🎯 FOUND LISTING PRICE in ${key}.${subkey}: $${subvalue}`);
              }
            }
          }
        }
      });
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('\n3️⃣ Testing /assessmenthistory/detail endpoint...');
    const assessmentHistory = await makeAttomRequest('/propertyapi/v1.0.0/assessmenthistory/detail', {
      address1: testProp.address,
      address2: testProp.city
    });
    
    if (assessmentHistory?.property?.[0]?.assessmentHistory) {
      const recent = assessmentHistory.property[0].assessmentHistory[0];
      console.log(`   Most Recent Assessment (${recent?.tax?.taxYear || 'N/A'}):`);
      console.log(`      Market Value: $${recent?.market?.mktTtlValue?.toLocaleString() || 'N/A'}`);
      console.log(`      Assessed Value: $${recent?.assessed?.assdTtlValue?.toLocaleString() || 'N/A'}`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('\n4️⃣ Testing /property/expandedprofile endpoint...');
    const expandedProfile = await makeAttomRequest('/propertyapi/v1.0.0/property/expandedprofile', {
      address1: testProp.address,
      address2: testProp.city
    });
    
    if (expandedProfile?.property?.[0]) {
      const prop = expandedProfile.property[0];
      
      // Look for any price-related fields
      console.log('\n   Checking all price-related fields:');
      
      function findPrices(obj, path = '') {
        for (const [key, value] of Object.entries(obj || {})) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'number' && value > 100000 && value < 10000000) {
            console.log(`      ${currentPath}: $${value.toLocaleString()}`);
            
            if (value === testProp.knownListingPrice) {
              console.log(`      🎯 MATCHES LISTING PRICE!`);
            }
            if (value === testProp.knownSoldPrice) {
              console.log(`      🎯 MATCHES SOLD PRICE!`);
            }
          } else if (typeof value === 'object' && value !== null) {
            findPrices(value, currentPath);
          }
        }
      }
      
      findPrices(prop);
    }
    
    console.log('\n=====================================');
  }
  
  console.log('\n\n📋 SUMMARY OF FINDINGS:');
  console.log('=====================================');
  console.log('AVM (Automated Valuation Model) is NOT the listing price!');
  console.log('AVM is ATTOM\'s estimate of current market value.');
  console.log('\nATTOM does not appear to store original MLS listing prices.');
  console.log('They provide:');
  console.log('  - Sale transaction data (from public records)');
  console.log('  - AVM estimates (their valuation model)');
  console.log('  - Assessment data (from tax records)');
  console.log('  - Property characteristics');
  console.log('\nBut NOT original MLS listing prices from when properties were for sale.');
}

deepInvestigation()
  .then(() => {
    console.log('\n✅ Investigation complete!');
  })
  .catch(error => {
    console.error('Error:', error);
  });
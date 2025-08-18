#!/usr/bin/env node

const https = require('https');
require('dotenv').config();

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;

// Test property: 185 Harriman Rd, Mount Kisco, NY 10549
const testAddress = {
  address1: '185 Harriman Rd',
  address2: 'Mount Kisco, NY 10549'
};

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
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.log('Raw response:', data.substring(0, 500));
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

async function testAttomAPI() {
  console.log('🔍 Testing ATTOM Data API\n');
  console.log('Test Property: 185 Harriman Rd, Mount Kisco, NY 10549\n');
  
  // 1. Test Property Detail endpoint
  console.log('1️⃣ Testing Property Detail Endpoint...');
  const propertyDetail = await makeAttomRequest('/propertyapi/v1.0.0/property/detail', {
    address1: '185 Harriman Rd',
    address2: 'Mount Kisco, NY'
  });
  
  if (propertyDetail && propertyDetail.property) {
    console.log('✅ Property found!');
    console.log('   Address:', propertyDetail.property[0]?.address?.oneLine);
    console.log('   Property ID:', propertyDetail.property[0]?.identifier?.attomId);
    console.log('   Lot size:', propertyDetail.property[0]?.lot?.lotSize1);
    console.log('   Year built:', propertyDetail.property[0]?.summary?.yearBuilt);
  } else {
    console.log('❌ Property not found or error');
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // 2. Test Sales History endpoint - THIS IS WHAT WE NEED!
  console.log('\n2️⃣ Testing Sales History Endpoint...');
  const salesHistory = await makeAttomRequest('/propertyapi/v1.0.0/saleshistory/detail', {
    address1: '185 Harriman Rd',
    address2: 'Mount Kisco, NY'
  });
  
  if (salesHistory && salesHistory.property) {
    console.log('✅ Sales history found!');
    const sales = salesHistory.property[0]?.saleHistory;
    if (sales && sales.length > 0) {
      console.log(`   Found ${sales.length} sale records:\n`);
      
      sales.forEach((sale, i) => {
        console.log(`   Sale #${i + 1}:`);
        console.log(`     Date: ${sale.saleTransDate}`);
        console.log(`     Amount: $${sale.saleTransAmount?.saleAmt?.toLocaleString()}`);
        console.log(`     Type: ${sale.saleTransType}`);
        console.log(`     Document: ${sale.saleDocNum}`);
        console.log(`     Listing Price: ${sale.listingPrice ? '$' + sale.listingPrice.toLocaleString() : 'N/A'}`);
        console.log('');
      });
    }
  } else {
    console.log('❌ Sales history not found');
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // 3. Test Assessment History endpoint
  console.log('3️⃣ Testing Assessment History Endpoint...');
  const assessmentHistory = await makeAttomRequest('/propertyapi/v1.0.0/assessmenthistory/detail', {
    address1: '185 Harriman Rd',
    address2: 'Mount Kisco, NY'
  });
  
  if (assessmentHistory && assessmentHistory.property) {
    console.log('✅ Assessment history found!');
    const assessments = assessmentHistory.property[0]?.assessmentHistory;
    if (assessments && assessments.length > 0) {
      console.log(`   Found ${assessments.length} assessment records`);
      const latest = assessments[0];
      console.log(`   Latest assessment (${latest.tax?.taxYear}):`);
      console.log(`     Market value: $${latest.market?.mktTtlValue?.toLocaleString()}`);
      console.log(`     Tax amount: $${latest.tax?.taxAmt?.toLocaleString()}`);
    }
  } else {
    console.log('❌ Assessment history not found');
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // 4. Test Property Search by area
  console.log('\n4️⃣ Testing Area Search (Mount Kisco, NY)...');
  const areaSearch = await makeAttomRequest('/propertyapi/v1.0.0/property/basicprofile', {
    postalcode: '10549',
    orderby: 'saleTransDate',
    page: 1,
    pagesize: 5
  });
  
  if (areaSearch && areaSearch.property) {
    console.log(`✅ Found ${areaSearch.property.length} properties in area`);
    areaSearch.property.forEach((prop, i) => {
      console.log(`   ${i + 1}. ${prop.address?.oneLine}`);
    });
  } else {
    console.log('❌ Area search failed');
  }
  
  // 5. Test All Events endpoint - Most comprehensive!
  console.log('\n5️⃣ Testing All Events Endpoint (Comprehensive History)...');
  const allEvents = await makeAttomRequest('/propertyapi/v1.0.0/allevents/detail', {
    address1: '185 Harriman Rd',
    address2: 'Mount Kisco, NY'
  });
  
  if (allEvents && allEvents.property) {
    console.log('✅ All events found!');
    const prop = allEvents.property[0];
    
    if (prop.saleHistory) {
      console.log('\n   Sale Events:');
      prop.saleHistory.forEach(sale => {
        console.log(`     ${sale.saleTransDate}: $${sale.saleTransAmount?.saleAmt?.toLocaleString()}`);
      });
    }
    
    if (prop.assessmentHistory) {
      console.log('\n   Recent Assessments:');
      prop.assessmentHistory.slice(0, 2).forEach(assessment => {
        console.log(`     ${assessment.tax?.taxYear}: $${assessment.market?.mktTtlValue?.toLocaleString()}`);
      });
    }
  } else {
    console.log('❌ All events not found');
  }
}

testAttomAPI()
  .then(() => {
    console.log('\n✅ ATTOM API test complete!');
  })
  .catch((error) => {
    console.error('Error:', error);
  });
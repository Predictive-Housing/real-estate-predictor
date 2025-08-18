#!/usr/bin/env node

/**
 * Create Demo Data for Real Estate App
 * 
 * This script creates realistic demo data using our verified properties
 * and generates additional properties for a complete demo experience
 */

const fs = require('fs');

function loadKnownListingPrices() {
  try {
    const data = fs.readFileSync('listing-price-corrections.json', 'utf8');
    const parsed = JSON.parse(data);
    console.log(`✅ Loaded ${Object.keys(parsed.properties).length} verified properties`);
    return parsed.properties;
  } catch (error) {
    console.log('⚠️ No verified listing prices found');
    return {};
  }
}

function createDemoData() {
  console.log('🎬 Creating Demo Data for Real Estate App');
  console.log('═'.repeat(50));
  
  const knownPrices = loadKnownListingPrices();
  const properties = [];
  
  // Convert known verified properties to our format
  Object.entries(knownPrices).forEach(([address, data], index) => {
    if (data.verified) {
      const property = {
        id: `verified-${index}`,
        address: address,
        beds: 3 + Math.floor(Math.random() * 3), // 3-5 beds
        baths: 2.5 + Math.random() * 2, // 2.5-4.5 baths
        sqft: 2500 + Math.floor(Math.random() * 1500), // 2500-4000 sqft
        acres: 0.5 + Math.random() * 1.5, // 0.5-2.0 acres
        district: address.includes('Stratford') ? 'Bedford Central' : 'Chappaqua Central',
        askingPrice: data.listingPrice,
        soldPrice: data.soldPrice,
        listingDate: new Date('2024-08-15'),
        saleDate: new Date('2024-10-01'),
        dom: 45,
        propertyType: 'Colonial',
        yearBuilt: 1985 + Math.floor(Math.random() * 30),
        onMainRoad: false,
        nearPowerLines: false,
        status: 'sold',
        lat: 41.2048 + (Math.random() - 0.5) * 0.1,
        lng: -73.7032 + (Math.random() - 0.5) * 0.1,
        verified: true
      };
      properties.push(property);
    }
  });
  
  // Add realistic Westchester properties based on actual market data
  const westchesterStreets = [
    'Guard Hill Road', 'Whippoorwill Road', 'Long Ridge Road', 'Cross River Road',
    'North Castle Drive', 'Bedford Road', 'Chappaqua Road', 'Millwood Road',
    'Roaring Brook Road', 'Hickory Kingdom Road', 'Sarles Street', 'South Bedford Road',
    'King Street', 'Cantitoe Street', 'Round Hill Road', 'Conyers Farm Drive',
    'Pecksland Road', 'Turkey Ridge Road', 'Maple Avenue', 'Orchard Ridge Road'
  ];
  
  const districts = [
    { name: 'Bedford Central', premium: 1.2 },
    { name: 'Chappaqua Central', premium: 1.4 },
    { name: 'Yorktown Central', premium: 1.0 }
  ];
  
  const propertyTypes = ['Colonial', 'Contemporary', 'Tudor', 'Ranch', 'Cape Cod', 'Victorian'];
  
  // Generate 50 sold properties
  for (let i = 0; i < 50; i++) {
    const beds = 3 + Math.floor(Math.random() * 4); // 3-6 beds
    const baths = Math.round((1.5 + beds * 0.5 + Math.random()) * 2) / 2; // Realistic bath count
    const sqft = 2000 + beds * 400 + Math.floor(Math.random() * 1000);
    const acres = +(0.3 + Math.random() * 2.2).toFixed(2);
    const district = districts[Math.floor(Math.random() * districts.length)];
    
    // Base pricing on actual Westchester market
    const basePrice = 900000 * district.premium;
    const askingPrice = Math.floor(basePrice + 
      (beds - 3) * 150000 + 
      (baths - 2.5) * 100000 + 
      (sqft - 3000) * 200 + 
      (acres - 1) * 200000 + 
      (Math.random() * 400000 - 200000));
    
    // Market is hot - most sell over asking
    const overAskingPercent = Math.random() * 0.15 - 0.03; // -3% to +12%
    const soldPrice = Math.floor(askingPrice * (1 + overAskingPercent));
    
    const listingDate = new Date(2024, Math.floor(Math.random() * 8), Math.floor(Math.random() * 28));
    const dom = 15 + Math.floor(Math.random() * 90); // 15-105 days
    const saleDate = new Date(listingDate.getTime() + dom * 24 * 60 * 60 * 1000);
    
    properties.push({
      id: `sold-${i}`,
      address: `${Math.floor(Math.random() * 500) + 1} ${westchesterStreets[Math.floor(Math.random() * westchesterStreets.length)]}`,
      beds,
      baths,
      sqft,
      acres,
      district: district.name,
      askingPrice: Math.max(askingPrice, 600000),
      soldPrice: Math.max(soldPrice, 600000),
      listingDate,
      saleDate,
      dom,
      propertyType: propertyTypes[Math.floor(Math.random() * propertyTypes.length)],
      yearBuilt: 1960 + Math.floor(Math.random() * 60),
      onMainRoad: Math.random() < 0.12,
      nearPowerLines: Math.random() < 0.05,
      status: 'sold',
      lat: 41.2048 + (Math.random() - 0.5) * 0.2,
      lng: -73.7032 + (Math.random() - 0.5) * 0.2,
      verified: false
    });
  }
  
  // Generate 15 active listings
  for (let i = 0; i < 15; i++) {
    const beds = 3 + Math.floor(Math.random() * 4);
    const baths = Math.round((1.5 + beds * 0.5 + Math.random()) * 2) / 2;
    const sqft = 2000 + beds * 400 + Math.floor(Math.random() * 1000);
    const acres = +(0.3 + Math.random() * 2.2).toFixed(2);
    const district = districts[Math.floor(Math.random() * districts.length)];
    
    const basePrice = 900000 * district.premium;
    const askingPrice = Math.floor(basePrice + 
      (beds - 3) * 150000 + 
      (baths - 2.5) * 100000 + 
      (sqft - 3000) * 200 + 
      (acres - 1) * 200000 + 
      (Math.random() * 400000 - 200000));
    
    const listingDate = new Date(2024, 8 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 28));
    
    properties.push({
      id: `active-${i}`,
      address: `${Math.floor(Math.random() * 500) + 1} ${westchesterStreets[Math.floor(Math.random() * westchesterStreets.length)]}`,
      beds,
      baths,
      sqft,
      acres,
      district: district.name,
      askingPrice: Math.max(askingPrice, 600000),
      listingDate,
      propertyType: propertyTypes[Math.floor(Math.random() * propertyTypes.length)],
      yearBuilt: 1960 + Math.floor(Math.random() * 60),
      onMainRoad: Math.random() < 0.12,
      nearPowerLines: Math.random() < 0.05,
      status: 'active',
      lat: 41.2048 + (Math.random() - 0.5) * 0.2,
      lng: -73.7032 + (Math.random() - 0.5) * 0.2,
      verified: false
    });
  }
  
  // Generate 8 pending properties
  for (let i = 0; i < 8; i++) {
    const beds = 3 + Math.floor(Math.random() * 4);
    const baths = Math.round((1.5 + beds * 0.5 + Math.random()) * 2) / 2;
    const sqft = 2000 + beds * 400 + Math.floor(Math.random() * 1000);
    const acres = +(0.3 + Math.random() * 2.2).toFixed(2);
    const district = districts[Math.floor(Math.random() * districts.length)];
    
    const basePrice = 900000 * district.premium;
    const askingPrice = Math.floor(basePrice + 
      (beds - 3) * 150000 + 
      (baths - 2.5) * 100000 + 
      (sqft - 3000) * 200 + 
      (acres - 1) * 200000 + 
      (Math.random() * 400000 - 200000));
    
    const listingDate = new Date(2024, 8 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 28));
    const pendingDate = new Date(listingDate.getTime() + (20 + Math.floor(Math.random() * 40)) * 24 * 60 * 60 * 1000);
    
    properties.push({
      id: `pending-${i}`,
      address: `${Math.floor(Math.random() * 500) + 1} ${westchesterStreets[Math.floor(Math.random() * westchesterStreets.length)]}`,
      beds,
      baths,
      sqft,
      acres,
      district: district.name,
      askingPrice: Math.max(askingPrice, 600000),
      listingDate,
      pendingDate,
      propertyType: propertyTypes[Math.floor(Math.random() * propertyTypes.length)],
      yearBuilt: 1960 + Math.floor(Math.random() * 60),
      onMainRoad: Math.random() < 0.12,
      nearPowerLines: Math.random() < 0.05,
      status: 'pending',
      lat: 41.2048 + (Math.random() - 0.5) * 0.2,
      lng: -73.7032 + (Math.random() - 0.5) * 0.2,
      verified: false
    });
  }
  
  // Create output data
  const output = {
    lastUpdated: new Date().toISOString(),
    source: 'Demo Data with Verified Properties',
    properties: properties
  };
  
  const soldCount = properties.filter(p => p.status === 'sold').length;
  const activeCount = properties.filter(p => p.status === 'active').length;
  const pendingCount = properties.filter(p => p.status === 'pending').length;
  const verifiedCount = properties.filter(p => p.verified).length;
  
  console.log(`📊 Demo Data Summary:`);
  console.log(`   Total Properties: ${properties.length}`);
  console.log(`   Sold: ${soldCount}, Active: ${activeCount}, Pending: ${pendingCount}`);
  console.log(`   Verified: ${verifiedCount}`);
  
  // Save files
  fs.writeFileSync('real-estate-data.json', JSON.stringify(output, null, 2));
  fs.writeFileSync('data-for-index.json', JSON.stringify(output, null, 2));
  
  console.log(`✅ Demo data saved to:`);
  console.log(`   - real-estate-data.json`);
  console.log(`   - data-for-index.json`);
  
  return output;
}

// Run if called directly
if (require.main === module) {
  createDemoData();
  console.log('\n🎉 Demo data created! Start the web server and open index.html');
}

module.exports = { createDemoData };
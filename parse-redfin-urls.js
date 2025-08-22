#!/usr/bin/env node

/**
 * Parse Redfin URLs to extract addresses and create a mapping
 */

const fs = require('fs');

// Load the scraped data
const data = JSON.parse(fs.readFileSync('redfin-properties.json', 'utf8'));

// Parse address from Redfin URL
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

// Process all properties
const processedProperties = data.properties.map(prop => {
  const addressInfo = parseAddressFromUrl(prop.url);
  
  if (addressInfo) {
    return {
      ...prop,
      address: addressInfo.fullAddress,
      street: addressInfo.street,
      city: addressInfo.city,
      state: addressInfo.state,
      zip: addressInfo.zip,
      redfinPropertyId: addressInfo.propertyId
    };
  }
  
  return prop;
});

// Create a mapping file for the frontend
const urlMapping = {};
processedProperties.forEach(prop => {
  if (prop.address && prop.address !== 'Address not extracted - visit URL') {
    // Create multiple key formats for better matching
    urlMapping[prop.address.toLowerCase()] = prop.url;
    
    // Also add without state/zip for partial matches
    const shortAddress = `${prop.street}, ${prop.city}`;
    urlMapping[shortAddress.toLowerCase()] = prop.url;
    
    // Just street and city without commas
    const simpleAddress = `${prop.street} ${prop.city}`;
    urlMapping[simpleAddress.toLowerCase()] = prop.url;
  }
});

// Save the processed data
const output = {
  ...data,
  properties: processedProperties,
  urlMapping: urlMapping
};

fs.writeFileSync('redfin-properties-parsed.json', JSON.stringify(output, null, 2));

// Create a simple mapping file for the frontend
fs.writeFileSync('redfin-url-mapping.json', JSON.stringify(urlMapping, null, 2));

console.log('✅ Parsed addresses from URLs');
console.log(`📊 Processed ${processedProperties.length} properties`);
console.log(`🔗 Created URL mapping for ${Object.keys(urlMapping).length} addresses`);
console.log('\nSample mappings:');

// Show samples
Object.entries(urlMapping).slice(0, 5).forEach(([address, url]) => {
  console.log(`\n${address}`);
  console.log(`  → ${url}`);
});

console.log('\n📁 Files created:');
console.log('  - redfin-properties-parsed.json (full data)');
console.log('  - redfin-url-mapping.json (address to URL mapping)');
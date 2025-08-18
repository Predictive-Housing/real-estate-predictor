#!/usr/bin/env node

// Redfin API data fetcher for Northern Westchester
// Areas: Bedford, Mt. Kisco, Chappaqua, Yorktown Heights

const https = require('https');
const fs = require('fs');

// Configuration
const CONFIG = {
  rapidApiKey: process.env.RAPIDAPI_KEY || 'c579c4651fmsh0acb02673fe070fp1c7197jsn48189ac247f6',
  rapidApiHost: 'redfin-com-data.p.rapidapi.com',
  locations: [
    { name: 'Bedford', regionId: '9949', zipCode: '10506' },
    { name: 'Mount Kisco', regionId: '17633', zipCode: '10549' },
    { name: 'Chappaqua', regionId: '11407', zipCode: '10514' },
    { name: 'Yorktown Heights', regionId: '27052', zipCode: '10598' }
  ]
};

// Helper function to make API requests
function makeRequest(path) {
  const options = {
    method: 'GET',
    hostname: CONFIG.rapidApiHost,
    port: null,
    path: path,
    headers: {
      'x-rapidapi-key': CONFIG.rapidApiKey,
      'x-rapidapi-host': CONFIG.rapidApiHost
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);
        try {
          const data = JSON.parse(body.toString());
          resolve(data);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Search for properties in a specific location
async function searchProperties(location) {
  console.log(`Searching properties in ${location.name}...`);
  
  try {
    // Search for sale properties using regionId
    let searchPath = `/properties/search-sale?regionId=6_${location.regionId}&limit=10`;
    let searchResults = await makeRequest(searchPath);
    
    if (!searchResults || !searchResults.data) {
      console.log(`No results for ${location.name}`);
      return [];
    }

    const properties = searchResults.data || [];
    console.log(`Found ${properties.length} properties in ${location.name}`);
    
    // Get detailed info for each property
    const detailedProperties = [];
    for (const home of properties.slice(0, 10)) { // Limit to 10 per location to avoid rate limits
      if (home.homeData && home.homeData.propertyId) {
        try {
          console.log(`  Adding property ${home.homeData.propertyId}...`);
          
          // Use the search result data directly (detail endpoint may cost extra)
          const property = {
            ...home.homeData,
            listingData: home.listingData,
            location: location.name,
            fetchedAt: new Date().toISOString()
          };
          
          detailedProperties.push(property);
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`  Error processing property ${home.homeData.propertyId}:`, error.message);
        }
      }
    }
    
    return detailedProperties;
  } catch (error) {
    console.error(`Error searching in ${location.name}:`, error.message);
    return [];
  }
}

// Transform Redfin data to our app format
function transformProperty(redfinProperty) {
  // Extract listing data if available
  const listing = redfinProperty.listingData || {};
  
  // Extract relevant fields from Redfin data
  const transformed = {
    id: redfinProperty.propertyId || `redfin-${Date.now()}`,
    address: redfinProperty.addressInfo?.formattedStreetLine || redfinProperty.address || 'Address not available',
    beds: listing.beds || redfinProperty.beds || 0,
    baths: listing.baths || redfinProperty.baths || 0,
    sqft: listing.sqft || redfinProperty.sqft || 0,
    acres: listing.lotSize ? (listing.lotSize / 43560).toFixed(2) : 0,
    district: determineSchoolDistrict(redfinProperty.location || redfinProperty.addressInfo?.city),
    askingPrice: listing.price || redfinProperty.price || 0,
    soldPrice: listing.soldPrice || null,
    listingDate: listing.listingDate ? new Date(listing.listingDate) : new Date(),
    saleDate: listing.soldDate ? new Date(listing.soldDate) : null,
    dom: listing.daysOnMarket || 0,
    propertyType: redfinProperty.propertyType || 'Single Family',
    yearBuilt: listing.yearBuilt || null,
    status: determineStatus(listing),
    lat: redfinProperty.addressInfo?.centroid?.lat || 41.2048,
    lng: redfinProperty.addressInfo?.centroid?.lon || -73.7032,
    
    // Additional Redfin-specific fields
    mlsId: listing.mlsId || redfinProperty.mlsId,
    redfinUrl: redfinProperty.url ? `https://www.redfin.com${redfinProperty.url}` : '',
    photos: redfinProperty.photosInfo || [],
    description: listing.description || '',
    
    // Features
    onMainRoad: false, // Would need to determine based on address
    nearPowerLines: false, // Would need additional data
    
    // Original Redfin data for reference
    _original: redfinProperty
  };
  
  return transformed;
}

// Determine school district based on location
function determineSchoolDistrict(location) {
  if (!location) return 'Unknown';
  
  const locationLower = location.toLowerCase();
  if (locationLower.includes('bedford')) return 'Bedford Central';
  if (locationLower.includes('chappaqua')) return 'Chappaqua Central';
  if (locationLower.includes('yorktown') || locationLower.includes('kisco')) return 'Yorktown Central';
  
  return 'Northern Westchester';
}

// Determine property status
function determineStatus(listing) {
  if (listing.soldDate || listing.soldPrice) return 'sold';
  if (listing.pending || listing.status === 'pending') return 'pending';
  if (listing.status === 'active' || listing.price) return 'active';
  return 'active'; // Default to active for search results
}

// Main function to fetch all data
async function fetchAllData() {
  console.log('Starting Redfin data fetch...');
  console.log('================================');
  
  const allProperties = [];
  
  for (const location of CONFIG.locations) {
    const properties = await searchProperties(location);
    allProperties.push(...properties);
    
    // Delay between locations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('================================');
  console.log(`Total properties fetched: ${allProperties.length}`);
  
  // Transform all properties
  const transformedProperties = allProperties.map(transformProperty);
  
  // Save to JSON file
  const outputData = {
    lastUpdated: new Date().toISOString(),
    propertyCount: transformedProperties.length,
    locations: CONFIG.locations.map(l => l.name),
    properties: transformedProperties
  };
  
  const outputPath = './redfin-data.json';
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`Data saved to ${outputPath}`);
  
  // Also save a backup with timestamp
  const backupPath = `./data-backups/redfin-data-${Date.now()}.json`;
  if (!fs.existsSync('./data-backups')) {
    fs.mkdirSync('./data-backups');
  }
  fs.writeFileSync(backupPath, JSON.stringify(outputData, null, 2));
  console.log(`Backup saved to ${backupPath}`);
  
  return outputData;
}

// Run if executed directly
if (require.main === module) {
  fetchAllData()
    .then(() => {
      console.log('Data fetch completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fetching data:', error);
      process.exit(1);
    });
}

module.exports = { fetchAllData, transformProperty, makeRequest };
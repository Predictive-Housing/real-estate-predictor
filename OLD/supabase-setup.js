#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { Client } = require('pg');

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;

async function setupDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to Supabase database');

    // Read and execute schema
    const schema = fs.readFileSync('./schema.sql', 'utf8');
    await client.query(schema);
    console.log('Schema created successfully');

    // Check if we have existing JSON data to migrate
    if (fs.existsSync('./redfin-data.json')) {
      console.log('Found existing redfin-data.json, migrating to database...');
      
      const data = JSON.parse(fs.readFileSync('./redfin-data.json', 'utf8'));
      const properties = data.properties || [];
      
      for (const prop of properties) {
        try {
          const query = `
            INSERT INTO properties (
              id, property_id, address, beds, baths, sqft, acres,
              district, asking_price, sold_price, listing_date, sale_date,
              dom, property_type, year_built, status, lat, lng,
              mls_id, redfin_url, photos, description, location
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
            )
            ON CONFLICT (property_id) DO UPDATE SET
              address = EXCLUDED.address,
              beds = EXCLUDED.beds,
              baths = EXCLUDED.baths,
              sqft = EXCLUDED.sqft,
              acres = EXCLUDED.acres,
              asking_price = EXCLUDED.asking_price,
              sold_price = EXCLUDED.sold_price,
              status = EXCLUDED.status,
              updated_at = NOW()
          `;
          
          const values = [
            prop.id || prop.propertyId,
            prop.propertyId || prop.id,
            prop.address || prop.addressInfo?.formattedStreetLine,
            prop.beds || 0,
            prop.baths || 0,
            prop.sqft || 0,
            prop.acres || 0,
            prop.district,
            prop.askingPrice || prop.listingData?.price,
            prop.soldPrice || prop.listingData?.soldPrice,
            prop.listingDate,
            prop.saleDate || prop.soldDate,
            prop.dom || 0,
            prop.propertyType || 'Single Family',
            prop.yearBuilt || prop.listingData?.yearBuilt,
            prop.status || 'active',
            prop.lat || prop.addressInfo?.centroid?.lat,
            prop.lng || prop.addressInfo?.centroid?.lon,
            prop.mlsId || prop.listingData?.mlsId,
            prop.redfinUrl,
            JSON.stringify(prop.photos || prop.photosInfo || []),
            prop.description || prop.listingData?.description || '',
            prop.location
          ];
          
          await client.query(query, values);
          console.log(`  ✓ Migrated property: ${prop.address || prop.id}`);
        } catch (err) {
          console.error(`  ✗ Error migrating property ${prop.id}:`, err.message);
        }
      }
      
      console.log(`\nMigration complete! ${properties.length} properties processed.`);
    }
    
    // Show count of properties in database
    const countResult = await client.query('SELECT COUNT(*) FROM properties');
    console.log(`\nTotal properties in database: ${countResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

// Run setup
setupDatabase();
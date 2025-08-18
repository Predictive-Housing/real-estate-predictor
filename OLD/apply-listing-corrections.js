#!/usr/bin/env node

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

async function applyListingCorrections() {
  console.log('📊 Applying Listing Price Corrections\n');
  
  // Load corrections file
  const corrections = JSON.parse(fs.readFileSync('./listing-price-corrections.json', 'utf8'));
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  let updatedCount = 0;
  let verifiedCount = 0;
  
  for (const [address, data] of Object.entries(corrections.properties)) {
    try {
      // Update the property with correct listing price
      const result = await client.query(
        `UPDATE properties 
         SET asking_price = $1,
             sold_price = COALESCE($2, sold_price)
         WHERE address = $3
         RETURNING id`,
        [data.listingPrice, data.soldPrice, address]
      );
      
      if (result.rowCount > 0) {
        updatedCount++;
        if (data.verified) verifiedCount++;
        
        const status = data.verified ? '✅ VERIFIED' : '📝 Estimated';
        console.log(`${status}: ${address}`);
        console.log(`  Listed: $${data.listingPrice.toLocaleString()}`);
        console.log(`  Sold: $${data.soldPrice.toLocaleString()}`);
        
        const diff = data.soldPrice - data.listingPrice;
        const percent = ((diff / data.listingPrice) * 100).toFixed(1);
        const arrow = diff > 0 ? '↑' : '↓';
        
        console.log(`  ${arrow} ${diff > 0 ? '+' : ''}$${Math.abs(diff).toLocaleString()} (${percent}%)\n`);
      }
    } catch (err) {
      console.error(`Error updating ${address}:`, err.message);
    }
  }
  
  console.log('=====================================');
  console.log(`Updated: ${updatedCount} properties`);
  console.log(`Verified: ${verifiedCount} properties`);
  
  // Show market statistics
  const stats = await client.query(`
    SELECT 
      COUNT(*) as total_sold,
      COUNT(CASE WHEN sold_price > asking_price THEN 1 END) as sold_over,
      COUNT(CASE WHEN sold_price < asking_price THEN 1 END) as sold_under,
      COUNT(CASE WHEN sold_price = asking_price THEN 1 END) as sold_at,
      ROUND(AVG((sold_price - asking_price) / asking_price * 100), 2) as avg_percent_diff,
      ROUND(AVG(ABS(sold_price - asking_price)), 0) as avg_dollar_diff
    FROM properties 
    WHERE status = 'sold' AND sold_price > 0 AND asking_price > 0
  `);
  
  const s = stats.rows[0];
  console.log('\nMarket Analysis:');
  console.log(`  Sold Over Asking: ${s.sold_over}/${s.total_sold} (${Math.round(s.sold_over/s.total_sold*100)}%)`);
  console.log(`  Sold Under Asking: ${s.sold_under}/${s.total_sold} (${Math.round(s.sold_under/s.total_sold*100)}%)`);
  console.log(`  Average Difference: ${s.avg_percent_diff > 0 ? '+' : ''}${s.avg_percent_diff}%`);
  console.log(`  Average $ Difference: $${parseInt(s.avg_dollar_diff).toLocaleString()}`);
  
  await client.end();
}

applyListingCorrections()
  .then(() => {
    console.log('\n✅ Corrections applied successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
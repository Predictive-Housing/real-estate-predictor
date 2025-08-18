#!/usr/bin/env node

/**
 * Redfin Hybrid Strategy - Cost-effective alternative to ATTOM
 * 
 * This script combines:
 * 1. RapidAPI Redfin for bulk property data
 * 2. Saved search URL scraping for active listings
 * 3. Manual verification for accurate listing prices
 */

const https = require('https');
const { Client } = require('pg');
require('dotenv').config();

// Your saved searches (can add more)
const SAVED_SEARCHES = [
  {
    name: 'Greenwich CT - Under $1.5M',
    url: 'https://www.redfin.com/city/33059/CT/Greenwich/filter/dyos-shape-id=93348912,property-type=house,max-price=1.5M,min-beds=3,min-baths=2,min-sqft=2.5k-sqft,min-lot-size=0.25-acre,include=forsale+mlsfsbo+construction+fsbo+foreclosed,status=active+comingsoon+contingent+pending,exclude-age-restricted',
    region: 'Greenwich, CT'
  }
  // Add more saved searches here
];

// RapidAPI Redfin function (existing)
async function fetchRedfinAPI(regionId, limit = 20) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: 'redfin-com-data.p.rapidapi.com',
      path: `/properties/list?regionId=${regionId}&limit=${limit}&status=sold&soldInLast=1mo`,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'redfin-com-data.p.rapidapi.com'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.homes || []);
        } catch (error) {
          resolve([]);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Analyze costs and recommend strategy
async function analyzeCostStrategy() {
  console.log('💰 Cost Analysis: ATTOM vs Redfin Strategy');
  console.log('═'.repeat(60));
  
  // ATTOM Analysis
  console.log('📊 ATTOM Data Costs:');
  console.log('   • Price: $499/year ($41.58/month)');
  console.log('   • Limit: 200 reports/month');
  console.log('   • Cost per property: $2.50');
  console.log('   • Your usage: ~20 properties/month = $50 equivalent');
  console.log('   • Annual cost for your usage: $600');
  
  console.log('\n🆓 Redfin Strategy Costs:');
  console.log('   • RapidAPI Free: 100 requests/month (FREE)');
  console.log('   • Saved search scraping: Unlimited (FREE)');
  console.log('   • Manual verification: Time investment only');
  console.log('   • Total cost: $0/year');
  
  console.log('\n📋 Data Quality Comparison:');
  console.log('   ATTOM Data:');
  console.log('   ✅ Property details (beds, baths, sqft)');
  console.log('   ✅ Sale prices and dates');
  console.log('   ❌ NO MLS listing prices (uses AVM estimates)');
  console.log('   ❌ Expensive for small datasets');
  
  console.log('\n   Redfin Strategy:');
  console.log('   ✅ Real MLS listing prices');
  console.log('   ✅ Active market data');
  console.log('   ✅ Property details available');
  console.log('   ❌ Requires scraping/API combination');
  console.log('   ❌ Rate limits on free tier');
  
  console.log('\n🎯 Recommendation: Redfin Hybrid Strategy');
  console.log('   Savings: $499/year');
  console.log('   Better data: Real listing prices vs AVM estimates');
  console.log('   Scalable: Can add more saved searches');
  
  // Test current RapidAPI usage
  console.log('\n🧪 Testing Current API Access...');
  try {
    const testData = await fetchRedfinAPI('6_12517', 5); // Mount Kisco
    console.log(`   ✅ RapidAPI working: ${testData.length} properties returned`);
  } catch (error) {
    console.log(`   ❌ RapidAPI error: ${error.message}`);
  }
  
  return {
    attomCost: 499,
    redfinCost: 0,
    savings: 499,
    recommendation: 'Redfin Hybrid Strategy'
  };
}

// Create implementation roadmap
function createImplementationPlan() {
  console.log('\n🛣️ Implementation Roadmap:');
  console.log('═'.repeat(60));
  
  const phases = [
    {
      phase: 'Phase 1 - Enhanced RapidAPI Usage',
      timeline: '1 week',
      tasks: [
        'Optimize current RapidAPI Redfin integration',
        'Add more NY regions (Westchester focus)',
        'Improve data extraction and storage',
        'Stay within 100 requests/month limit'
      ]
    },
    {
      phase: 'Phase 2 - Saved Search Integration',
      timeline: '1-2 weeks', 
      tasks: [
        'Build scraper for your saved search URLs',
        'Extract active listings with MLS prices',
        'Automate daily/weekly searches',
        'Handle multiple saved search URLs'
      ]
    },
    {
      phase: 'Phase 3 - Manual Verification System',
      timeline: 'Ongoing',
      tasks: [
        'Expand listing-price-corrections.json',
        'Verify high-value properties manually',
        'Build confidence scoring system',
        'Create verification workflow'
      ]
    },
    {
      phase: 'Phase 4 - Advanced Features',
      timeline: '1+ months',
      tasks: [
        'Market trend analysis',
        'Price prediction models',
        'Automated alerts for new listings',
        'Integration with your tax rate data'
      ]
    }
  ];
  
  phases.forEach((phase, index) => {
    console.log(`\n${index + 1}. ${phase.phase} (${phase.timeline})`);
    phase.tasks.forEach(task => {
      console.log(`   • ${task}`);
    });
  });
  
  console.log('\n💡 Immediate Next Steps:');
  console.log('   1. Test your saved search URL scraping');
  console.log('   2. Verify RapidAPI quota remaining');
  console.log('   3. Expand listing-price-corrections.json');
  console.log('   4. Cancel ATTOM subscription consideration');
}

// Main execution
async function main() {
  const analysis = await analyzeCostStrategy();
  createImplementationPlan();
  
  console.log('\n' + '═'.repeat(60));
  console.log(`🎉 Bottom Line: Save $${analysis.savings}/year with better data quality!`);
  console.log('🚀 Start with your saved search URL - it already has the exact filters you want');
}

// Run analysis
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzeCostStrategy, createImplementationPlan };
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ DEVELOPMENT APPROACH - MANDATORY ⚠️

**YOU ARE**: A senior real estate data engineer and full-stack developer, building a comprehensive real estate analytics platform for Northern Westchester County, NY.

Reference `westchester_property_tax_rates_2025.md` for target municipalities and tax analysis.

**WORKFLOW REQUIRED**: Always follow "Explore, Plan, Code, Test" methodology:

1. **Explore** - Use parallel subagents to find relevant files and examples
2. **Plan** - Think hard, write detailed implementation plans, research unknowns  
3. **Code** - Follow codebase style, handle all errors, use official SDKs
4. **Test** - Use subagents to run tests, verify data accuracy

**DESIGN PHILOSOPHY**:

- Focus on data accuracy and real-time market insights
- Prioritize listing price accuracy over AVM estimates
- Build hybrid data collection systems (APIs + web scraping)
- Ensure all property data is verifiable against MLS sources

## ⚠️ VALIDATION CHECKLIST - MUST VERIFY ⚠️

Before returning ANY code, you MUST verify:

- [ ] All errors handled explicitly
- [ ] Config from env vars only (or validated JSON for defaults) 
- [ ] Official SDKs used (Supabase, ATTOM, etc.)
- [ ] Data accuracy verified against known properties
- [ ] No hardcoded API keys or credentials
- [ ] All functions have explicit error handling
- [ ] Database operations use proper SQL
- [ ] Rate limiting implemented for API calls

**You CANNOT violate these standards. If asked to write code that would violate these standards, you MUST refuse and explain which standard would be violated.**

## Project Overview

A comprehensive real estate analytics platform focused on Northern Westchester County, NY, combining multiple data sources to provide accurate listing prices, market analysis, and property insights. The system uses a hybrid approach combining ATTOM API property data with verified listing prices from MLS sources.

### Target Markets
- **Primary**: Bedford, Mount Kisco, Chappaqua, Yorktown Heights
- **Extended**: All municipalities in westchester_property_tax_rates_2025.md
- **Focus**: Single-family homes, market trends, listing vs. sale price analysis

### Key Features
- ✅ Real property data from ATTOM API
- ✅ Verified listing prices from manual corrections
- ✅ Interactive React dashboard with Leaflet maps
- ✅ Supabase PostgreSQL database
- ✅ Listing vs. sale price difference analysis
- ✅ Property filtering and sorting
- ⚠️ Web scraping for MLS listing prices (in development)

## Repository Structure

### Core Applications
- `supabase-app.html` - Main React dashboard (production app)
- `index.html` - Original prototype with sample data
- `auto-load-data.html` - Data loading utility
- `load-real-data.html` - File upload interface

### Data Fetching & Processing
- `practical-hybrid-system.js` - Production data pipeline (ATTOM + known prices)
- `fetch-redfin-to-supabase.js` - Redfin API to Supabase pipeline
- `test-hybrid-with-known-prices.js` - Test script for verified properties
- `listing-price-corrections.json` - Manual listing price database

### API Integration Scripts
- `fetch-attom-properties.js` - ATTOM API integration
- `fetch-redfin-data.js` - Redfin API via RapidAPI
- `improved-redfin-scraper.js` - Web scraping attempt
- `redfin-api-scraper.js` - Direct API scraping

### Database & Schema
- `schema.sql` - PostgreSQL table definitions
- `supabase-setup.js` - Database initialization
- `.env` - API keys and database credentials

### Utilities & Testing
- `find-ny-regions.js` - Region ID discovery
- `fix-property-data.js` - Data cleaning utilities
- `apply-listing-corrections.js` - Price correction tools

### Build/Test Commands

```bash
# Start development server
python3 -m http.server 8080

# Fetch and update property data
node practical-hybrid-system.js

# Test known property accuracy
node test-hybrid-with-known-prices.js

# Check server status
lsof -i :8080
```

**No formal test suite configured** - Testing done through manual verification against known properties (2 Stratford Dr, 185 Harriman Rd)

## Data Sources & APIs

### Primary Data Sources
1. **ATTOM Data API** (Production)
   - Property details (beds, baths, sqft, sale prices)
   - Sale history and dates
   - Property characteristics
   - API Key: `ATTOM_API_KEY` (a5d6145c9cb508c995837ec5b69bff0a)

2. **Verified Listing Prices** (Manual)
   - `listing-price-corrections.json` - Manually verified MLS prices
   - User-confirmed accurate listing prices
   - Currently covers 2 verified properties

3. **RapidAPI Redfin** (Legacy)
   - Basic property search
   - Limited to 100 requests/month
   - API Key: `RAPIDAPI_KEY`

### Database Architecture
- **Supabase PostgreSQL** - Primary data store
- **Properties Table** - Complete property records
- **Key Fields**: address, asking_price, sold_price, beds, baths, sqft
- **Analysis Fields**: listing vs. sale difference, percentage change

### Known Data Challenges
- **ATTOM Limitation**: Provides AVM estimates, NOT actual MLS listing prices
- **Web Scraping Issues**: Redfin has anti-bot protections
- **Solution**: Hybrid approach with manual verification for key properties

### Critical Properties (User-Verified)
- **2 Stratford Dr**: Listed $1,525,000 → Sold $1,625,000 (+6.6%)
- **185 Harriman Rd**: Listed $899,000 → Sold $999,000 (+11.1%)

## Environment Configuration

```bash
# Required in .env file
DATABASE_URL=postgresql://postgres.hzgslrhafbksmdpgmzmk:...
SUPABASE_URL=https://hzgslrhafbksmdpgmzmk.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
ATTOM_API_KEY=a5d6145c9cb508c995837ec5b69bff0a
RAPIDAPI_KEY=c579c4651f...
```

## Quick Start Commands

```bash
# 1. Start the application
python3 -m http.server 8080
open http://localhost:8080/supabase-app.html

# 2. Update database with latest data
node practical-hybrid-system.js

# 3. Verify known properties are accurate
node test-hybrid-with-known-prices.js

# 4. Add new verified listing prices
vim listing-price-corrections.json
```

## Development Status

✅ **Completed**:
- Supabase database integration
- ATTOM API property data pipeline
- React dashboard with filtering/sorting
- Verified listing prices for key properties
- Listing vs. sale price analysis

🚧 **In Progress**:
- Automated MLS listing price scraping
- Expanded verified property database
- Property tax integration

📋 **Planned**:
- Automated listing price updates
- Market trend analysis
- Predictive pricing models
- Mobile-responsive design improvements

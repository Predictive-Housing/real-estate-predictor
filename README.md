# Real Estate Predictor

## Northern Westchester Real Estate Analytics

A comprehensive real estate analytics dashboard for Bedford, Mt. Kisco, Chappaqua & Yorktown Heights.

## Features

### Core Functionality
- 📊 Market statistics dashboard with key metrics
- 🗺️ Interactive Leaflet map view
- 📋 Property listings with detailed information
- 🔮 Predictive pricing for active/pending listings
- 🏘️ Similar property comparisons

### Filtering Options
- **Property Features**: Beds, baths, square footage, lot size
- **School Districts**: Bedford Central, Chappaqua Central, Yorktown Central
- **Status**: Active, Pending, Sold
- **Time-based Filters**:
  - Properties sold within last X days
  - Properties listed within last X days
- **Exclusions**: Main road properties, properties near power lines

### Sorting Options
- **Sort By**: Listing Date, Sale Date, Price
- **Order**: Newest/Highest First or Oldest/Lowest First

## Local Development

### Quick Start
```bash
# Start the development server (already running on port 8080)
python3 -m http.server 8080

# View the application
open http://localhost:8080
```

### Current Server
Server is currently running with PID: 13109

To stop: `kill 13109`

### Alternative Server Options
```bash
# Using Node.js (if npm/npx is available)
npx http-server -p 8080

# Using Python (different port)
python3 -m http.server 3000

# Using PHP
php -S localhost:8080
```

## Tech Stack
- **React 18** - UI framework (via CDN)
- **Tailwind CSS** - Styling (via CDN)
- **Leaflet** - Interactive maps
- **Babel** - JSX transformation (via CDN)

## File Structure
```
/
├── index.html      # Main application (single-file React app)
├── README.md       # This file
└── .gitignore      # Git ignore configuration
```

## Data Sources

### Using Real Redfin Data (NEW!)
The app now supports loading real property data from Redfin via RapidAPI:

1. **Get API Access**
   - Sign up for free at [RapidAPI Redfin API](https://rapidapi.com/ntd119/api/redfin-com-data)
   - Get your API key from the dashboard

2. **Fetch Real Data**
   ```bash
   # Set your API key and run the fetch script
   RAPIDAPI_KEY=your_key_here node fetch-redfin-data.js
   ```
   This creates `redfin-data.json` with real properties from:
   - Bedford, NY
   - Mount Kisco, NY
   - Chappaqua, NY
   - Yorktown Heights, NY

3. **Load Data into App**
   - Visit http://localhost:8080/load-real-data.html
   - Upload the `redfin-data.json` file
   - Or paste JSON data directly
   - Data is stored in browser localStorage

4. **View Real Data**
   - Return to main app at http://localhost:8080
   - App will show "🔴 Live Redfin Data" indicator
   - All filtering and sorting works with real data

### Sample Data (Default)
If no real data is loaded, the app uses generated sample data:
- 120 sold properties
- 30 pending properties  
- 50 active listings

Properties include realistic pricing based on:
- School district premiums
- Property features (beds, baths, sqft, acres)
- Market conditions (over/under asking trends)
- Days on market patterns
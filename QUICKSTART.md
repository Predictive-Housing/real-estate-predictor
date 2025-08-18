# Real Estate Predictor - Quick Start Guide

## 🚀 Start the Application

### 1. Start the Web Server
```bash
python3 -m http.server 8080
```

### 2. Open the App
Open your browser to: **http://localhost:8080/supabase-app.html**

## 📊 Fetch New Data from Redfin API

```bash
# Fetch new properties and save to Supabase
node fetch-redfin-to-supabase.js
```

## 🔧 Troubleshooting

### Check if Server is Running
```bash
lsof -i :8080
```

### Restart the Server
```bash
# Find the process ID
lsof -i :8080

# Kill the current server (replace PID with actual number)
kill [PID]

# Start new server
python3 -m http.server 8080
```

### Alternative Server Options
```bash
# Using Node.js
npx http-server -p 8080

# Using Python on different port
python3 -m http.server 3000

# Using PHP
php -S localhost:8080
```

## 📁 Important Files

- **`supabase-app.html`** - Main application with Supabase integration
- **`fetch-redfin-to-supabase.js`** - Fetches data from Redfin API and saves to Supabase
- **`.env`** - Database credentials (DO NOT COMMIT)
- **`schema.sql`** - Database schema

## 🔑 Database Info

- **Supabase URL**: https://hzgslrhafbksmdpgmzmk.supabase.co
- **Database**: PostgreSQL on Supabase
- **Properties Table**: 29 properties from Northern Westchester

## 🏠 Locations Covered

- Bedford, NY
- Mount Kisco, NY  
- Chappaqua, NY
- Yorktown Heights, NY

## 📝 API Limits

- **Free Tier**: 100 requests/month
- **Current Usage**: ~40 requests per full fetch
- Be conservative with fetches to stay within limits

## 💡 Tips

1. The app shows "🟢 Live Supabase Data" when connected
2. Use the Refresh button to reload data from database
3. Filters and sorting work in real-time
4. Click property addresses to view on Redfin (where available)
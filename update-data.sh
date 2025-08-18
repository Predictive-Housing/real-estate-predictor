#!/bin/bash

# Real Estate Data Update Script
# Run this daily/weekly to keep data fresh

echo "🏠 Real Estate Data Update Script"
echo "================================="

# Check if required files exist
if [ ! -f ".env" ]; then
    echo "❌ .env file not found! Please create with API keys."
    exit 1
fi

if [ ! -f "data-collector.js" ]; then
    echo "❌ data-collector.js not found!"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found! Please install Node.js."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Starting data collection..."

# Run the data collector
if node data-collector.js; then
    echo "✅ Data collection completed successfully!"
    
    # Check if we have the output files
    if [ -f "real-estate-data.json" ] && [ -f "data-for-index.json" ]; then
        echo "📊 Generated files:"
        echo "   - real-estate-data.json (full data)"
        echo "   - data-for-index.json (web app format)"
        
        # Show file sizes
        echo "📏 File sizes:"
        ls -lh real-estate-data.json data-for-index.json | awk '{print "   -", $9, ":", $5}'
        
        # Show property count
        PROPERTY_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('real-estate-data.json')).properties.length)")
        echo "🏘️ Properties collected: $PROPERTY_COUNT"
        
        echo ""
        echo "🌐 To view the data:"
        echo "   1. Start web server: python3 -m http.server 8080"
        echo "   2. Open: http://localhost:8080"
        echo "   3. The app will automatically load real data!"
        
    else
        echo "⚠️ Expected output files not found"
        exit 1
    fi
else
    echo "❌ Data collection failed!"
    exit 1
fi

echo ""
echo "🎉 Update complete! Data is fresh and ready to use."
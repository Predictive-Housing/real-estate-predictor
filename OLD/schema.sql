-- Create properties table for real estate data
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    property_id TEXT UNIQUE,
    address TEXT,
    beds INTEGER,
    baths NUMERIC,
    sqft INTEGER,
    acres NUMERIC,
    district TEXT,
    asking_price NUMERIC,
    sold_price NUMERIC,
    listing_date TIMESTAMP,
    sale_date TIMESTAMP,
    dom INTEGER,
    property_type TEXT,
    year_built INTEGER,
    status TEXT,
    lat NUMERIC,
    lng NUMERIC,
    mls_id TEXT,
    redfin_url TEXT,
    photos JSONB,
    description TEXT,
    on_main_road BOOLEAN DEFAULT false,
    near_power_lines BOOLEAN DEFAULT false,
    location TEXT,
    fetched_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_district ON properties(district);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(location);
CREATE INDEX IF NOT EXISTS idx_properties_listing_date ON properties(listing_date);
CREATE INDEX IF NOT EXISTS idx_properties_sale_date ON properties(sale_date);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON properties
    FOR SELECT USING (true);

-- Create policy to allow authenticated users to insert/update
CREATE POLICY "Allow authenticated insert" ON properties
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON properties
    FOR UPDATE USING (true);
#!/usr/bin/env node

const https = require('https');

const options = {
  method: 'GET',
  hostname: 'redfin-com-data.p.rapidapi.com',
  port: null,
  path: '/redfin/search?location=Westchester',
  headers: {
    'x-rapidapi-key': '592ebbcc91msh344c9900be12e2dp1e8a90jsnbcc465c68da8',
    'x-rapidapi-host': 'redfin-com-data.p.rapidapi.com'
  }
};

console.log('Testing Redfin API with New York, NY...');
console.log('Request path:', options.path);

const req = https.request(options, function (res) {
  const chunks = [];

  res.on('data', function (chunk) {
    chunks.push(chunk);
  });

  res.on('end', function () {
    const body = Buffer.concat(chunks);
    const response = body.toString();
    
    try {
      const data = JSON.parse(response);
      console.log('Response received:');
      console.log('Status:', res.statusCode);
      
      if (data.homes) {
        console.log('Number of homes found:', data.homes.length);
        if (data.homes.length > 0) {
          console.log('\nFirst property:');
          console.log(JSON.stringify(data.homes[0], null, 2));
        }
      } else if (data.error) {
        console.log('API Error:', data.error);
      } else {
        console.log('Response structure:', Object.keys(data));
        console.log('Full response:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.log('Raw response:', response);
      console.error('Error parsing response:', error);
    }
  });
});

req.on('error', function (error) {
  console.error('Request error:', error);
});

req.end();
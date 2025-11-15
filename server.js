const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// CORS headers for API endpoints
app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Helper function to get Plex credentials from query or cookies
function getPlexCredentials(req) {
  const plexIp = req.query.plexIp || req.cookies.plexIp || req.headers['x-plex-ip'];
  const plexToken = req.query.plexToken || req.cookies.plexToken || req.headers['x-plex-token'];
  return { plexIp, plexToken };
}

// Validate Plex credentials
app.post('/api/validate', async (req, res) => {
  try {
    const { plexIp, plexToken } = req.body;
    
    if (!plexIp || !plexToken) {
      return res.status(400).json({ error: 'Plex IP and token are required' });
    }

    // Test connection by fetching server info
    const testUrl = `http://${plexIp}:32400/?X-Plex-Token=${plexToken}`;
    const response = await axios.get(testUrl, { timeout: 5000 });
    
    if (response.status === 200) {
      res.json({ valid: true, message: 'Credentials validated successfully' });
    } else {
      res.status(401).json({ valid: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      res.status(503).json({ valid: false, error: 'Cannot connect to Plex server' });
    } else if (error.response?.status === 401) {
      res.status(401).json({ valid: false, error: 'Invalid Plex token' });
    } else {
      res.status(500).json({ valid: false, error: 'Error validating credentials' });
    }
  }
});

// Get library sections with counts
app.get('/api/sections', async (req, res) => {
  try {
    const { plexIp, plexToken } = getPlexCredentials(req);
    
    if (!plexIp || !plexToken) {
      return res.status(400).json({ error: 'Plex credentials required' });
    }

    const sections = [1, 2, 5]; // Hardcoded sections: TV, Downloads, Vault
    const results = {};

    // Fetch each section
    for (const sectionId of sections) {
      try {
        const url = `http://${plexIp}:32400/library/sections/${sectionId}/all?X-Plex-Token=${plexToken}`;
        const response = await axios.get(url, { timeout: 10000 });
        const xmlData = response.data;
        
        // Parse XML to count items
        const videoCount = (xmlData.match(/<Video/g) || []).length;
        const directoryCount = (xmlData.match(/<Directory/g) || []).length;
        const totalCount = videoCount + directoryCount;
        
        results[sectionId] = {
          count: totalCount,
          videoCount,
          directoryCount
        };
      } catch (error) {
        results[sectionId] = {
          count: 0,
          error: error.message
        };
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching sections', details: error.message });
  }
});

// Get random movie from selected sections
app.get('/api/random', async (req, res) => {
  try {
    const { plexIp, plexToken } = getPlexCredentials(req);
    const selectedSections = req.query.sections ? req.query.sections.split(',').map(s => parseInt(s.trim())) : [1, 2, 5];
    
    if (!plexIp || !plexToken) {
      return res.status(400).json({ error: 'Plex credentials required' });
    }

    if (selectedSections.length === 0) {
      return res.status(400).json({ error: 'At least one section must be selected' });
    }

    const allItems = [];

    // Fetch items from each selected section
    for (const sectionId of selectedSections) {
      try {
        const url = `http://${plexIp}:32400/library/sections/${sectionId}/all?X-Plex-Token=${plexToken}`;
        const response = await axios.get(url, { timeout: 10000 });
        const xmlData = response.data;
        
        // Parse XML to extract items
        const videoMatches = xmlData.match(/<Video[^>]*>[\s\S]*?<\/Video>/g) || [];
        const directoryMatches = xmlData.match(/<Directory[^>]*>[\s\S]*?<\/Directory>/g) || [];
        
        // Parse each item
        const parseItem = (xmlString) => {
          const item = {};
          // Extract attributes
          const attrMatches = xmlString.match(/(\w+)="([^"]*)"/g) || [];
          attrMatches.forEach(attr => {
            const [, key, value] = attr.match(/(\w+)="([^"]*)"/);
            item[key] = value;
          });
          
          // Extract child elements
          item.directors = [];
          item.roles = [];
          item.genres = [];
          
          const directorMatches = xmlString.match(/<Director[^>]*tag="([^"]*)"/g) || [];
          directorMatches.forEach(dir => {
            const match = dir.match(/tag="([^"]*)"/);
            if (match) item.directors.push(match[1]);
          });
          
          const roleMatches = xmlString.match(/<Role[^>]*tag="([^"]*)"/g) || [];
          roleMatches.forEach(role => {
            const match = role.match(/tag="([^"]*)"/);
            if (match) item.roles.push(match[1]);
          });
          
          const genreMatches = xmlString.match(/<Genre[^>]*tag="([^"]*)"/g) || [];
          genreMatches.forEach(genre => {
            const match = genre.match(/tag="([^"]*)"/);
            if (match) item.genres.push(match[1]);
          });
          
          return item;
        };
        
        videoMatches.forEach(video => {
          allItems.push(parseItem(video));
        });
        
        directoryMatches.forEach(dir => {
          allItems.push(parseItem(dir));
        });
      } catch (error) {
        console.error(`Error fetching section ${sectionId}:`, error.message);
      }
    }

    if (allItems.length === 0) {
      return res.status(404).json({ error: 'No items found in selected sections' });
    }

    // Select random item
    const randomIndex = Math.floor(Math.random() * allItems.length);
    const randomItem = allItems[randomIndex];
    
    // Get server info for web app URL
    let serverId = null;
    try {
      const serverUrl = `http://${plexIp}:32400/?X-Plex-Token=${plexToken}`;
      const serverResponse = await axios.get(serverUrl, { timeout: 5000 });
      const serverMatch = serverResponse.data.match(/machineIdentifier="([^"]*)"/);
      if (serverMatch) {
        serverId = serverMatch[1];
      }
    } catch (error) {
      console.error('Error fetching server info:', error.message);
    }

    // Generate URLs
    const directPlayUrl = `http://${plexIp}:32400/library/metadata/${randomItem.key}`;
    const webAppUrl = serverId 
      ? `http://${plexIp}:32400/web/index.html#!/server/${serverId}/details?key=${randomItem.key}`
      : `http://${plexIp}:32400/web/index.html#!/server/details?key=${randomItem.key}`;

    // Get poster URL
    const posterUrl = randomItem.thumb 
      ? `http://${plexIp}:32400/photo/:/transcode?width=648&height=972&url=${encodeURIComponent(randomItem.thumb)}&X-Plex-Token=${plexToken}`
      : null;

    res.json({
      item: randomItem,
      directPlayUrl,
      webAppUrl,
      posterUrl,
      plexIp,
      serverId
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching random item', details: error.message });
  }
});

// Get all items for slot machine animation
app.get('/api/items', async (req, res) => {
  try {
    const { plexIp, plexToken } = getPlexCredentials(req);
    const selectedSections = req.query.sections ? req.query.sections.split(',').map(s => parseInt(s.trim())) : [1, 2, 5];
    
    if (!plexIp || !plexToken) {
      return res.status(400).json({ error: 'Plex credentials required' });
    }

    const allItems = [];

    // Fetch items from each selected section
    for (const sectionId of selectedSections) {
      try {
        const url = `http://${plexIp}:32400/library/sections/${sectionId}/all?X-Plex-Token=${plexToken}`;
        const response = await axios.get(url, { timeout: 10000 });
        const xmlData = response.data;
        
        // Parse XML to extract items
        const videoMatches = xmlData.match(/<Video[^>]*>[\s\S]*?<\/Video>/g) || [];
        const directoryMatches = xmlData.match(/<Directory[^>]*>[\s\S]*?<\/Directory>/g) || [];
        
        // Parse each item (simplified for slot machine)
        const parseItem = (xmlString) => {
          const item = {};
          const attrMatches = xmlString.match(/(\w+)="([^"]*)"/g) || [];
          attrMatches.forEach(attr => {
            const [, key, value] = attr.match(/(\w+)="([^"]*)"/);
            item[key] = value;
          });
          
          // Get poster URL
          if (item.thumb) {
            item.posterUrl = `http://${plexIp}:32400/photo/:/transcode?width=300&height=450&url=${encodeURIComponent(item.thumb)}&X-Plex-Token=${plexToken}`;
          }
          
          return item;
        };
        
        videoMatches.forEach(video => {
          allItems.push(parseItem(video));
        });
        
        directoryMatches.forEach(dir => {
          allItems.push(parseItem(dir));
        });
      } catch (error) {
        console.error(`Error fetching section ${sectionId}:`, error.message);
      }
    }

    res.json({ items: allItems });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching items', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// XML Parser configuration
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseAttributeValue: true,
  parseTrueNumberOnly: false,
  arrayMode: false,
  ignoreNameSpace: true,
  removeNSPrefix: true
};
const xmlParser = new XMLParser(parserOptions);

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

    const sections = [1, 2]; // Hardcoded sections: Movies (1), TV Shows (2)
    const results = {};

    // Fetch each section
    for (const sectionId of sections) {
      try {
        const url = `http://${plexIp}:32400/library/sections/${sectionId}/all?X-Plex-Token=${plexToken}`;
        const response = await axios.get(url, { 
          timeout: 10000,
          responseType: 'text'
        });
        const responseData = typeof response.data === 'string' ? response.data : String(response.data);
        
        // Plex API returns JSON, not XML (when accessed via HTTP)
        let mediaContainer = {};
        try {
          // Try parsing as JSON first
          if (responseData.trim().startsWith('{')) {
            const parsed = JSON.parse(responseData);
            mediaContainer = parsed.MediaContainer || {};
          } else {
            // Fallback to XML parsing if it's actually XML
            const parsed = xmlParser.parse(responseData);
            mediaContainer = parsed.MediaContainer || {};
          }
        } catch (parseError) {
          console.error(`Section ${sectionId} - Parse error:`, parseError.message);
          throw parseError;
        }
        
        // Plex JSON uses Metadata array instead of Video/Directory
        let metadata = [];
        if (mediaContainer.Metadata) {
          metadata = Array.isArray(mediaContainer.Metadata) ? mediaContainer.Metadata : [mediaContainer.Metadata];
        }
        
        // Count items
        const totalCount = metadata.length;
        const size = mediaContainer.size || totalCount;
        
        console.log(`Section ${sectionId} - Found ${totalCount} items (size: ${size})`);
        
        results[sectionId] = {
          count: totalCount,
          size: size
        };
      } catch (error) {
        // Handle 404 gracefully (section doesn't exist)
        if (error.response?.status === 404) {
          results[sectionId] = {
            count: 0,
            exists: false
          };
        } else {
          console.error(`Error fetching section ${sectionId}:`, error.message);
          results[sectionId] = {
            count: 0,
            error: error.message
          };
        }
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
    let selectedSections = req.query.sections ? req.query.sections.split(',').map(s => parseInt(s.trim())) : [1, 2];
    
    // Filter out invalid sections (only allow 1 and 2)
    selectedSections = selectedSections.filter(s => s === 1 || s === 2);
    
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
        const response = await axios.get(url, { 
          timeout: 10000,
          responseType: 'text'
        });
        const responseData = typeof response.data === 'string' ? response.data : String(response.data);
        
        // Plex API returns JSON, not XML
        let mediaContainer = {};
        if (responseData.trim().startsWith('{')) {
          const parsed = JSON.parse(responseData);
          mediaContainer = parsed.MediaContainer || {};
        } else {
          // Fallback to XML parsing if it's actually XML
          const parsed = xmlParser.parse(responseData);
          mediaContainer = parsed.MediaContainer || {};
        }
        
        // Plex JSON uses Metadata array instead of Video/Directory
        let metadata = [];
        if (mediaContainer.Metadata) {
          metadata = Array.isArray(mediaContainer.Metadata) ? mediaContainer.Metadata : [mediaContainer.Metadata];
        }
        
        // Convert parsed items to our format
        const parseItem = (item) => {
          const parsedItem = { ...item };
          
          // Extract child elements (JSON format)
          parsedItem.directors = [];
          parsedItem.roles = [];
          parsedItem.genres = [];
          
          if (item.Director) {
            const directors = Array.isArray(item.Director) ? item.Director : [item.Director];
            parsedItem.directors = directors.map(d => {
              if (typeof d === 'string') return d;
              return d.tag || d;
            }).filter(Boolean);
          }
          
          if (item.Role) {
            const roles = Array.isArray(item.Role) ? item.Role : [item.Role];
            parsedItem.roles = roles.map(r => {
              if (typeof r === 'string') return r;
              return r.tag || r;
            }).filter(Boolean);
          }
          
          if (item.Genre) {
            const genres = Array.isArray(item.Genre) ? item.Genre : [item.Genre];
            parsedItem.genres = genres.map(g => {
              if (typeof g === 'string') return g;
              return g.tag || g;
            }).filter(Boolean);
          }
          
          return parsedItem;
        };
        
        metadata.forEach(item => {
          allItems.push(parseItem(item));
        });
        
        console.log(`Section ${sectionId}: Found ${metadata.length} items`);
      } catch (error) {
        // Handle 404 gracefully (section doesn't exist)
        if (error.response?.status === 404) {
          console.log(`Section ${sectionId} not found (404) - skipping`);
        } else {
          console.error(`Error fetching section ${sectionId}:`, error.message);
        }
      }
    }

    console.log(`Total items collected: ${allItems.length}`);
    
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
      const serverResponse = await axios.get(serverUrl, { 
        timeout: 5000,
        responseType: 'text'
      });
      const serverData = typeof serverResponse.data === 'string' ? serverResponse.data : String(serverResponse.data);
      let mediaContainer = {};
      if (serverData.trim().startsWith('{')) {
        const parsed = JSON.parse(serverData);
        mediaContainer = parsed.MediaContainer || {};
      } else {
        const parsed = xmlParser.parse(serverData);
        mediaContainer = parsed.MediaContainer || {};
      }
      serverId = mediaContainer.machineIdentifier || null;
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
    const selectedSections = req.query.sections ? req.query.sections.split(',').map(s => parseInt(s.trim())) : [1, 2];
    
    if (!plexIp || !plexToken) {
      return res.status(400).json({ error: 'Plex credentials required' });
    }

    const allItems = [];

    // Fetch items from each selected section
    for (const sectionId of selectedSections) {
      try {
        const url = `http://${plexIp}:32400/library/sections/${sectionId}/all?X-Plex-Token=${plexToken}`;
        const response = await axios.get(url, { 
          timeout: 10000,
          responseType: 'text'
        });
        const responseData = typeof response.data === 'string' ? response.data : String(response.data);
        
        // Plex API returns JSON, not XML
        let mediaContainer = {};
        if (responseData.trim().startsWith('{')) {
          const parsed = JSON.parse(responseData);
          mediaContainer = parsed.MediaContainer || {};
        } else {
          // Fallback to XML parsing if it's actually XML
          const parsed = xmlParser.parse(responseData);
          mediaContainer = parsed.MediaContainer || {};
        }
        
        // Plex JSON uses Metadata array instead of Video/Directory
        let metadata = [];
        if (mediaContainer.Metadata) {
          metadata = Array.isArray(mediaContainer.Metadata) ? mediaContainer.Metadata : [mediaContainer.Metadata];
        }
        
        // Convert parsed items to our format (simplified for slot machine)
        const parseItem = (item) => {
          const parsedItem = { ...item };
          
          // Get poster URL - try thumb, art, or grandparentThumb
          const thumbSource = item.thumb || item.art || item.grandparentThumb;
          if (thumbSource) {
            parsedItem.posterUrl = `http://${plexIp}:32400/photo/:/transcode?width=300&height=450&url=${encodeURIComponent(thumbSource)}&X-Plex-Token=${plexToken}`;
          } else {
            parsedItem.posterUrl = null;
          }
          
          return parsedItem;
        };
        
        metadata.forEach(item => {
          allItems.push(parseItem(item));
        });
      } catch (error) {
        // Handle 404 gracefully (section doesn't exist)
        if (error.response?.status === 404) {
          console.log(`Section ${sectionId} not found (404) - skipping`);
        } else {
          console.error(`Error fetching section ${sectionId}:`, error.message);
        }
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


const express = require('express');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://rda_user:rda_secure_password_2026@localhost:5432/rda_intelligence'
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', async (req, res) => {
  try {
    const stats = await getStats();
    res.render('dashboard', { stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// API endpoints
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/discoveries', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level;
    
    let query = 'SELECT * FROM discoveries';
    let params = [];
    
    if (level) {
      query += ' WHERE intelligence_level = $1';
      params.push(level.toUpperCase());
    }
    
    query += ' ORDER BY discovered_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/responses', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, d.title, d.url, d.threat_score, d.source
       FROM response_actions r
       LEFT JOIN discoveries d ON r.discovery_id = d.id
       ORDER BY r.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/timeline', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const result = await pool.query(
      `SELECT 
         DATE_TRUNC('hour', discovered_at) as hour,
         COUNT(*) as count,
         source
       FROM discoveries
       WHERE discovered_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY hour, source
       ORDER BY hour DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sources-breakdown', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         source,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE intelligence_level = 'CRITICAL') as critical,
         COUNT(*) FILTER (WHERE intelligence_level = 'HIGH') as high,
         AVG(threat_score) as avg_threat_score
       FROM discoveries
       WHERE discovered_at > NOW() - INTERVAL '7 days'
       GROUP BY source
       ORDER BY total DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');
  
  const interval = setInterval(async () => {
    try {
      const stats = await getStats();
      socket.emit('stats-update', stats);
    } catch (error) {
      console.error('Error sending update:', error);
    }
  }, 5000);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

// Helper function to get stats
async function getStats() {
  const [
    totalDiscoveries,
    discoveries24h,
    discoveries7d,
    criticalThreats,
    highPriority,
    autonomousResponses,
    responses24h,
    recentDiscoveries,
    topThreats,
    sourceBreakdown,
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM discoveries'),
    pool.query(`SELECT COUNT(*) as count FROM discoveries WHERE discovered_at > NOW() - INTERVAL '24 hours'`),
    pool.query(`SELECT COUNT(*) as count FROM discoveries WHERE discovered_at > NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*) as count FROM discoveries WHERE intelligence_level = 'CRITICAL'`),
    pool.query(`SELECT COUNT(*) as count FROM discoveries WHERE intelligence_level = 'HIGH'`),
    pool.query('SELECT COUNT(*) as count FROM response_actions'),
    pool.query(`SELECT COUNT(*) as count FROM response_actions WHERE created_at > NOW() - INTERVAL '24 hours'`),
    pool.query(`SELECT * FROM discoveries ORDER BY discovered_at DESC LIMIT 15`),
    pool.query(`SELECT * FROM discoveries WHERE intelligence_level IN ('CRITICAL', 'HIGH') ORDER BY threat_score DESC, discovered_at DESC LIMIT 10`),
    pool.query(`
      SELECT source, COUNT(*) as count 
      FROM discoveries 
      WHERE discovered_at > NOW() - INTERVAL '24 hours'
      GROUP BY source
    `),
  ]);

  // Check service status
  const { execSync } = require('child_process');
  let rdaStatus = 'unknown';
  
  try {
    rdaStatus = execSync('systemctl is-active rda.service').toString().trim();
  } catch (e) {
    rdaStatus = 'inactive';
  }

  // Get latest scans
  const latestScans = await pool.query(`
    SELECT source, MAX(discovered_at) as last_scan
    FROM discoveries
    GROUP BY source
  `);

  return {
    totalDiscoveries: parseInt(totalDiscoveries.rows[0].count),
    discoveries24h: parseInt(discoveries24h.rows[0].count),
    discoveries7d: parseInt(discoveries7d.rows[0].count),
    criticalThreats: parseInt(criticalThreats.rows[0].count),
    highPriority: parseInt(highPriority.rows[0].count),
    autonomousResponses: parseInt(autonomousResponses.rows[0].count),
    responses24h: parseInt(responses24h.rows[0].count),
    recentDiscoveries: recentDiscoveries.rows,
    topThreats: topThreats.rows,
    sourceBreakdown: sourceBreakdown.rows,
    latestScans: latestScans.rows,
    rdaActive: rdaStatus === 'active',
    timestamp: new Date(),
  };
}

const PORT = process.env.RDA_DASHBOARD_PORT || 3004;
server.listen(PORT, () => {
  console.log(`\n🎨 RDA INTELLIGENCE COMMAND CENTER`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: Running\n`);
});

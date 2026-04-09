import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.EXPLORER_PORT || 4000;

// Serve static assets (schema-3d.html, graph-clustering.js, introspection-schema.json)
app.use(express.static(__dirname));

// Frontend config endpoint — builds the basic-auth header from .env
app.get('/api/config', (req, res) => {
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;

  if (!email || !apiToken) {
    return res.status(500).json({
      error: 'Missing ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN in .env'
    });
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  res.json({
    endpoint: 'https://api.atlassian.com/graphql',
    auth,
    accountId: process.env.ATLASSIAN_ACCOUNT_ID || ''
  });
});

// Serve the cached introspection schema
app.get('/api/schema', async (req, res) => {
  try {
    const schemaPath = join(__dirname, 'introspection-schema.json');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    res.json(JSON.parse(schema));
  } catch {
    res.status(404).json({
      error: 'introspection-schema.json not found. Run: node fetch-introspection.js'
    });
  }
});

// Root serves the schema graph visualizer
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'schema-graph.html'));
});

app.listen(PORT, () => {
  console.log(`Schema Graph: http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop');
});

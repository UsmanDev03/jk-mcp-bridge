import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

dotenv.config();

// ============================================
// CONFIG
// ============================================
const JK_API_KEY = process.env.JK_API_KEY;
const JK_BASE_URL = process.env.JK_BASE_URL;
const PORT = process.env.PORT || 3000;

if (!JK_API_KEY || !JK_BASE_URL) {
  console.error('❌ Missing JK_API_KEY or JK_BASE_URL in .env');
  process.exit(1);
}

// ============================================
// AXIOS INSTANCE — JK Foods API ke liye
// ============================================
const jkApi = axios.create({
  baseURL: JK_BASE_URL,
  headers: {
    'X-API-KEY': JK_API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000,
});

// ============================================
// LOGGER — har call ka record
// ============================================
function logCall(toolName, target, extra = '') {
  const time = new Date().toISOString();
  console.log(`[${time}] TOOL=${toolName} TARGET=${target} ${extra}`);
  // ❌ API key kabhi log nahi hogi
}

// ============================================
// HELPER — error handling
// ============================================
async function callJkApi(method, path, data = null) {
  try {
    const config = { method, url: path };
    if (data) config.data = data;
    const response = await jkApi.request(config);
    return { success: true, data: response.data };
  } catch (error) {
    if (error.response) {
      return {
        success: false,
        status: error.response.status,
        data: error.response.data,
      };
    }
    return {
      success: false,
      status: 500,
      data: { message: error.message },
    };
  }
}

// ============================================
// MCP SERVER — Tools define karo
// ============================================
const server = new McpServer({
  name: 'jk-foods-bridge',
  version: '1.0.0',
});

// ---------- TOOL 1: list_categories ----------
server.tool(
  'list_categories',
  'List all categories, with optional filters (missing, per_page, page)',
  {
    missing: z.string().optional().describe('Filter: e.g. internal_link, page_description'),
    per_page: z.number().optional().describe('Items per page (1-500)'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ missing, per_page, page }) => {
    logCall('list_categories', 'all', `missing=${missing || '-'}`);
    const params = new URLSearchParams();
    if (missing) params.append('missing', missing);
    if (per_page) params.append('per_page', per_page);
    if (page) params.append('page', page);
    const qs = params.toString();
    const path = `/api/categories${qs ? '?' + qs : ''}`;
    const result = await callJkApi('GET', path);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 2: get_category ----------
server.tool(
  'get_category',
  'Get one category by ID',
  { id: z.number().describe('Category ID') },
  async ({ id }) => {
    logCall('get_category', id);
    const result = await callJkApi('GET', `/api/categories/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 3: update_category ----------
server.tool(
  'update_category',
  'Submit a category change for admin approval. Returns pending_id and old/new values.',
  {
    id: z.number().describe('Category ID'),
    page_title: z.string().optional(),
    page_description: z.string().optional(),
    keyword: z.string().optional(),
    content: z.string().optional(),
    internal_link: z.string().optional(),
    canonical_url: z.string().optional(),
  },
  async ({ id, ...fields }) => {
    logCall('update_category', id, `fields=${Object.keys(fields).join(',')}`);
    const body = Object.fromEntries(
      Object.entries(fields).filter(([_, v]) => v !== undefined && v !== '')
    );
    const result = await callJkApi('PUT', `/api/categories/${id}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 4: get_category_related ----------
server.tool(
  'get_category_related',
  'Get products linked to a category (for internal linking)',
  { id: z.number().describe('Category ID') },
  async ({ id }) => {
    logCall('get_category_related', id);
    const result = await callJkApi('GET', `/api/categories/${id}/related`);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 5: list_products ----------
server.tool(
  'list_products',
  'List all products, with optional filters',
  {
    missing: z.string().optional(),
    per_page: z.number().optional(),
    page: z.number().optional(),
  },
  async ({ missing, per_page, page }) => {
    logCall('list_products', 'all', `missing=${missing || '-'}`);
    const params = new URLSearchParams();
    if (missing) params.append('missing', missing);
    if (per_page) params.append('per_page', per_page);
    if (page) params.append('page', page);
    const qs = params.toString();
    const result = await callJkApi('GET', `/api/products${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 6: get_product ----------
server.tool(
  'get_product',
  'Get one product by ID',
  { id: z.number() },
  async ({ id }) => {
    logCall('get_product', id);
    const result = await callJkApi('GET', `/api/products/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 7: update_product ----------
server.tool(
  'update_product',
  'Submit a product change for admin approval',
  {
    id: z.number(),
    page_title: z.string().optional(),
    page_description: z.string().optional(),
    keyword: z.string().optional(),
    canonical_url: z.string().optional(),
    category: z.string().optional(),
    image: z.string().optional(),
    image_alt_text: z.string().optional(),
    h1: z.string().optional(),
    body_text: z.string().optional(),
  },
  async ({ id, ...fields }) => {
    logCall('update_product', id, `fields=${Object.keys(fields).join(',')}`);
    const body = Object.fromEntries(
      Object.entries(fields).filter(([_, v]) => v !== undefined && v !== '')
    );
    const result = await callJkApi('PUT', `/api/products/${id}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 8: list_blogs ----------
server.tool(
  'list_blogs',
  'List all blogs, with optional filters',
  {
    missing: z.string().optional(),
    per_page: z.number().optional(),
    page: z.number().optional(),
  },
  async ({ missing, per_page, page }) => {
    logCall('list_blogs', 'all', `missing=${missing || '-'}`);
    const params = new URLSearchParams();
    if (missing) params.append('missing', missing);
    if (per_page) params.append('per_page', per_page);
    if (page) params.append('page', page);
    const qs = params.toString();
    const result = await callJkApi('GET', `/api/blogs${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 9: get_blog ----------
server.tool(
  'get_blog',
  'Get one blog by ID',
  { id: z.number() },
  async ({ id }) => {
    logCall('get_blog', id);
    const result = await callJkApi('GET', `/api/blogs/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 10: create_blog ----------
server.tool(
  'create_blog',
  'Submit a new blog post for admin approval',
  {
    title: z.string(),
    description: z.string(),
    image: z.string().optional(),
    page_title: z.string().optional(),
    page_description: z.string().optional(),
    keywords: z.string().optional(),
    canonical_url: z.string().optional(),
    image_alt_text: z.string().optional(),
  },
  async (fields) => {
    logCall('create_blog', 'new', `title=${fields.title}`);
    const result = await callJkApi('POST', `/api/blogs`, fields);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ---------- TOOL 11: update_blog ----------
server.tool(
  'update_blog',
  'Submit a blog change for admin approval',
  {
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    page_title: z.string().optional(),
    page_description: z.string().optional(),
    keyword: z.string().optional(),
    canonical_url: z.string().optional(),
    image_alt_text: z.string().optional(),
  },
  async ({ id, ...fields }) => {
    logCall('update_blog', id, `fields=${Object.keys(fields).join(',')}`);
    const body = Object.fromEntries(
      Object.entries(fields).filter(([_, v]) => v !== undefined && v !== '')
    );
    const result = await callJkApi('PUT', `/api/blogs/${id}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
  }
);

// ⚠️ NOTE: /api/pending, /api/history, /api/rollback
// ka koi tool NAHI banaya — kyunki ye admin-only hain.
// Claude inhe kabhi call nahi kar sakega.

// ============================================
// EXPRESS SERVER — MCP over HTTP
// ============================================
const app = express();
app.use(express.json());

// ES Modules mein __dirname nikalne ka tareeqa
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Public folder ko serve karo (Google verification file ke liye)
app.use(express.static(path.join(__dirname, '../public_html')));

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'JK Foods MCP Bridge',
    tools: 11,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`✅ JK Foods MCP Bridge running on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`🔒 API key: ***${JK_API_KEY.slice(-8)}`);
});
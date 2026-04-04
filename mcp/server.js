#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import {
  searchCode,
  findSymbol,
  getFile,
  getContext,
  getStats,
  listFiles,
  getImports,
  getDependents,
  addProject,
  listProjects,
  removeProject,
  initializeDatabase,
} from './tools.js';
import {
  getDatabaseStats,
  getLanguageBreakdown,
  listIndexedFiles,
  searchCodeAPI,
  getConfigAPI,
  updateConfigAPI,
  getHealthStatus,
  getIndexActivity,
  getProjectFolders,
  triggerIndexing,
} from '../api/dashboard.js';
import Indexer from '../indexer/indexer.js';
import FileWatcher from '../watcher/watcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(path.dirname(__dirname), 'web');

// Initialize database
initializeDatabase();

/**
 * Auto-index registered projects when MCP server starts
 * Can be disabled with SKIP_AUTO_INDEX=true environment variable
 */
async function autoIndexProject() {
  const skipAutoIndex = process.env.SKIP_AUTO_INDEX === 'true';
  if (skipAutoIndex) {
    console.log('⏭️  Auto-indexing skipped (SKIP_AUTO_INDEX=true)\n');
    return;
  }

  try {
    const db = initializeDatabase();
    const projects = db.prepare("SELECT id, name, folder_path FROM projects").all();

    if (projects.length === 0) {
      console.log('📋 No projects registered. Use add_project tool to add a project folder.\n');
      return;
    }

    console.log(`🔄 Auto-indexing ${projects.length} project(s)...`);
    for (const proj of projects) {
      try {
        console.log(`  📂 ${proj.name} (${proj.folder_path})`);
        const indexer = new Indexer(proj.folder_path, proj.id);
        await indexer.indexProject(false);
        indexer.close();
      } catch (error) {
        console.error(`  ✗ Failed to index ${proj.name}:`, error.message);
      }
    }
    console.log('✓ Auto-indexing completed\n');
  } catch (error) {
    console.error('✗ Auto-indexing failed:', error.message);
  }
}

// Define MCP tools
const TOOLS = [
  {
    name: 'add_project',
    description: 'Register a project folder and index all its code files. Stores project-wise so you can search per project.',
    inputSchema: {
      type: 'object',
      properties: {
        folder_path: {
          type: 'string',
          description: 'Absolute path to the project folder (e.g., "/Users/user/Developer/my-app")',
        },
        name: {
          type: 'string',
          description: 'Project name (defaults to folder name)',
        },
      },
      required: ['folder_path'],
    },
  },
  {
    name: 'list_projects',
    description: 'List all registered projects with their index status, file count, and symbol count',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'remove_project',
    description: 'Remove a project and all its indexed data from the database',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name, folder path, or ID to remove',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for code content across indexed files using full-text search. Filter by project to search within a specific project only.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (supports words, phrases, and patterns)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name or folder path (optional — searches all projects if omitted)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20)',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_symbol',
    description: 'Find symbol definitions (functions, classes, variables) by name. Filter by project to search within a specific project only.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Symbol name to search for (supports partial matching)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name or folder path (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50)',
          default: 50,
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_file',
    description: 'Retrieve the full content of a specific file with line numbers',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file (e.g., "src/main.js")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_context',
    description: 'Get comprehensive context combining file content and symbol matches for a query. Filter by project.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant code context',
        },
        project: {
          type: 'string',
          description: 'Filter by project name or folder path (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 30)',
          default: 30,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get database statistics including file count, symbols, and database size',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_files',
    description: 'List all indexed files with optional language and project filter',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Filter by language (e.g., "javascript", "python", "typescript")',
        },
        project: {
          type: 'string',
          description: 'Filter by project name or folder path (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of files to return (default: 100)',
          default: 100,
        },
      },
    },
  },
  {
    name: 'get_imports',
    description: 'Get all imports/dependencies from a specific file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_dependents',
    description: 'Find files that import or depend on a specific file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path to find dependents for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of dependent files to return (default: 50)',
          default: 50,
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Create MCP Server using stdio transport
 */
function createMCPServer() {
  const server = new Server({
    name: 'code-index-mcp',
    version: '1.0.0',
  });

  // Register tool capabilities
  server.registerCapabilities({
    tools: {
      listChanged: false,
    },
  });

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case 'add_project':
          result = await addProject(args.folder_path, args.name);
          break;

        case 'list_projects':
          result = listProjects();
          break;

        case 'remove_project':
          result = removeProject(args.project);
          break;

        case 'search_code':
          result = searchCode(args.query, args.limit || 20, args.project);
          break;

        case 'find_symbol':
          result = findSymbol(args.name, args.limit || 50, args.project);
          break;

        case 'get_file':
          result = getFile(args.path);
          break;

        case 'get_context':
          result = getContext(args.query, args.limit || 30, args.project);
          break;

        case 'get_stats':
          result = getStats();
          break;

        case 'list_files':
          result = listFiles(args.language || null, args.limit || 100, args.project);
          break;

        case 'get_imports':
          result = getImports(args.path);
          break;

        case 'get_dependents':
          result = getDependents(args.path, args.limit || 50);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
            isError: true,
          },
        ],
      };
    }
  });

  return server;
}

/**
 * Create Express HTTP server (alternative to stdio)
 */
function createExpressServer(port = 3000) {
  const app = express();
  app.use(express.json());

  // Serve static dashboard files
  app.use(express.static(WEB_ROOT));

  // Health check
  app.get('/health', (req, res) => {
    try {
      const health = getHealthStatus();
      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        service: 'code-index-mcp',
        error: error.message,
      });
    }
  });

  // Dashboard API routes
  app.get('/api/stats', (req, res) => {
    try {
      const stats = getDatabaseStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/languages', (req, res) => {
    try {
      const languages = getLanguageBreakdown();
      res.json(languages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/files', (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100', 10);
      const language = req.query.language || null;
      const files = listIndexedFiles(limit, language);
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/search', (req, res) => {
    try {
      const { query, limit = 20 } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      const results = searchCodeAPI(query, limit);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/config', (req, res) => {
    try {
      const config = getConfigAPI();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/config', (req, res) => {
    try {
      const result = updateConfigAPI(req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, errors: [error.message] });
    }
  });

  app.get('/api/activity', (req, res) => {
    try {
      const activity = getIndexActivity();
      res.json(activity);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/folders', (req, res) => {
    try {
      const folders = getProjectFolders();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/index', (req, res) => {
    try {
      const { folderPath } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: 'folderPath is required' });
      }
      const result = triggerIndexing(folderPath);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Project management API routes
  app.get('/api/projects', (req, res) => {
    try {
      res.json(listProjects());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const { folder_path, name } = req.body;
      if (!folder_path) {
        return res.status(400).json({ error: 'folder_path is required' });
      }
      const result = await addProject(folder_path, name);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/projects/:project', (req, res) => {
    try {
      const result = removeProject(req.params.project);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Dashboard page
  const dashboardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });
  app.get('/dashboard', dashboardLimiter, (req, res) => {
    res.sendFile(path.join(WEB_ROOT, 'index.html'));
  });

  // MCP endpoint
  app.post('/mcp', async (req, res) => {
    const { jsonrpc, id, method, params } = req.body;

    if (method === 'tools/list') {
      res.json({
        jsonrpc,
        id,
        result: { tools: TOOLS },
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params || {};

      try {
        let result;

        switch (name) {
          case 'add_project':
            result = await addProject(args.folder_path, args.name);
            break;

          case 'list_projects':
            result = listProjects();
            break;

          case 'remove_project':
            result = removeProject(args.project);
            break;

          case 'search_code':
            result = searchCode(args.query, args.limit || 20, args.project);
            break;

          case 'find_symbol':
            result = findSymbol(args.name, args.limit || 50, args.project);
            break;

          case 'get_file':
            result = getFile(args.path);
            break;

          case 'get_context':
            result = getContext(args.query, args.limit || 30, args.project);
            break;

          case 'get_stats':
            result = getStats();
            break;

          case 'list_files':
            result = listFiles(args.language || null, args.limit || 100, args.project);
            break;

          case 'get_imports':
            result = getImports(args.path);
            break;

          case 'get_dependents':
            result = getDependents(args.path, args.limit || 50);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        res.json({
          jsonrpc,
          id,
          result,
        });
      } catch (error) {
        res.status(400).json({
          jsonrpc,
          id,
          error: {
            code: -32603,
            message: error.message,
          },
        });
      }
    } else {
      res.status(400).json({
        jsonrpc,
        id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      });
    }
  });

  return app;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'stdio';
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();

  console.log('\n🚀 Code Index MCP Server\n');

  // Start auto-indexing
  await autoIndexProject();

  // Start file watcher (unless disabled)
  const skipWatcher = process.env.SKIP_WATCHER === 'true';
  if (!skipWatcher) {
    const watcher = new FileWatcher(projectRoot);
    watcher.start();
  } else {
    console.log('⏭️  File watcher skipped (SKIP_WATCHER=true)\n');
  }

  if (mode === 'http') {
    // HTTP mode
    const port = parseInt(args[1], 10) || 34244;
    const app = createExpressServer(port);

    app.listen(port, () => {
      console.log(`📡 HTTP Server running on http://localhost:${port}`);
      console.log(`   🎨 Dashboard: http://localhost:${port}/dashboard`);
      console.log(`   📊 API: http://localhost:${port}/api`);
      console.log(`   POST /mcp - MCP JSON-RPC endpoint`);
      console.log(`   GET /health - Health check\n`);
    });
  } else {
    // Stdio mode (default for MCP)
    const server = createMCPServer();
    const transport = new StdioServerTransport();

    console.log('📡 MCP Server (stdio mode)');
    console.log('Ready to accept connections\n');

    await server.connect(transport);
  }
}

main().catch(error => {
  console.error('✗ Server error:', error.message);
  process.exit(1);
});

export { createMCPServer, createExpressServer };

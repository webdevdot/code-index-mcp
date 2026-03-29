#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import {
  searchCode,
  findSymbol,
  getFile,
  getContext,
  getStats,
  listFiles,
  getImports,
  getDependents,
  initializeDatabase,
} from './tools.js';

// Initialize database
initializeDatabase();

// Define MCP tools
const TOOLS = [
  {
    name: 'search_code',
    description: 'Search for code content across all indexed files using full-text search',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (supports words, phrases, and patterns)',
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
    description: 'Find symbol definitions (functions, classes, variables) by name',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Symbol name to search for (supports partial matching)',
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
    description: 'Get comprehensive context combining file content and symbol matches for a query',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant code context',
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
    description: 'List all indexed files with optional language filter',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Filter by language (e.g., "javascript", "python", "typescript")',
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
        case 'search_code':
          result = searchCode(args.query, args.limit || 20);
          break;

        case 'find_symbol':
          result = findSymbol(args.name, args.limit || 50);
          break;

        case 'get_file':
          result = getFile(args.path);
          break;

        case 'get_context':
          result = getContext(args.query, args.limit || 30);
          break;

        case 'get_stats':
          result = getStats();
          break;

        case 'list_files':
          result = listFiles(args.language || null, args.limit || 100);
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

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'code-index-mcp' });
  });

  // MCP endpoint
  app.post('/mcp', (req, res) => {
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
          case 'search_code':
            result = searchCode(args.query, args.limit || 20);
            break;

          case 'find_symbol':
            result = findSymbol(args.name, args.limit || 50);
            break;

          case 'get_file':
            result = getFile(args.path);
            break;

          case 'get_context':
            result = getContext(args.query, args.limit || 30);
            break;

          case 'get_stats':
            result = getStats();
            break;

          case 'list_files':
            result = listFiles(args.language || null, args.limit || 100);
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

  console.log('\n🚀 Code Index MCP Server\n');

  if (mode === 'http') {
    // HTTP mode
    const port = parseInt(args[1], 10) || 3000;
    const app = createExpressServer(port);

    app.listen(port, () => {
      console.log(`📡 HTTP Server running on http://localhost:${port}`);
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

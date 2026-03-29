#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

// Set working directory to project root
process.chdir(projectRoot);

// Import and run the server
const args = process.argv.slice(2);
const port = args[0] || '34244';

// Override process.argv for the server script
process.argv = ['node', 'server.js', 'http', port];

import('../mcp/server.js').then(() => {
  // Server runs via main() function
}).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

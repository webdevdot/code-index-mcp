#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

// Set working directory to project root so config and database are found correctly
process.chdir(projectRoot);

// Import and run the CLI dashboard
import('../cli/dashboard.js').catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

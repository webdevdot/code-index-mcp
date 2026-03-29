#!/usr/bin/env node

import {
  getDatabaseStats,
  getLanguageBreakdown,
  listIndexedFiles,
  searchCodeAPI,
  getConfigAPI,
  updateConfigAPI,
  getHealthStatus,
  getSymbolsByType,
  getIndexActivity,
} from '../api/dashboard.js';
import { getConfig } from '../config/loader.js';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Format table output
 */
function printTable(data, columns = null) {
  if (!Array.isArray(data) || data.length === 0) {
    console.log('  (no data)');
    return;
  }

  const cols = columns || Object.keys(data[0]);
  const colWidths = {};

  // Calculate column widths
  cols.forEach(col => {
    colWidths[col] = Math.max(col.length, ...data.map(row => String(row[col] || '').length));
  });

  // Print header
  const header = cols.map(col => col.padEnd(colWidths[col])).join('  ');
  console.log(`  ${colors.bold}${header}${colors.reset}`);
  console.log(`  ${'-'.repeat(header.length)}`);

  // Print rows
  data.forEach(row => {
    const cells = cols.map(col => String(row[col] || '').padEnd(colWidths[col]));
    console.log(`  ${cells.join('  ')}`);
  });
}

/**
 * Stats command
 */
function statsCommand() {
  try {
    console.log(`\n${colors.cyan}📊 Code Index Statistics${colors.reset}`);

    const stats = getDatabaseStats();
    console.log(`\n${colors.bold}Overview${colors.reset}`);
    printTable([stats]);

    const symbols = getSymbolsByType();
    console.log(`\n${colors.bold}Symbols by Type${colors.reset}`);
    const symbolData = Object.entries(symbols).map(([type, count]) => ({
      Type: type,
      Count: count,
    }));
    printTable(symbolData);

    const breakdown = getLanguageBreakdown();
    console.log(`\n${colors.bold}Language Breakdown${colors.reset}`);
    printTable(breakdown);

    const activity = getIndexActivity();
    console.log(`\n${colors.bold}Index Activity${colors.reset}`);
    if (activity.lastIndexed) {
      console.log(`  Last Indexed: ${activity.lastIndexed}`);
    }
    if (activity.recentFiles.length > 0) {
      console.log(`\n${colors.bold}Recent Files${colors.reset}`);
      const recentData = activity.recentFiles.map(f => ({
        Path: f.path.length > 40 ? f.path.substring(0, 37) + '...' : f.path,
        Language: f.language,
      }));
      printTable(recentData);
    }

    console.log('');
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Config command
 */
function configCommand() {
  try {
    if (subcommand === 'show') {
      console.log(`\n${colors.cyan}⚙️  Configuration${colors.reset}\n`);

      const config = getConfigAPI();
      const configData = [
        { Key: 'Database Path', Value: config.dbPath },
        { Key: 'MCP Folder', Value: config.mcpFolder },
        { Key: 'Dashboard Port', Value: config.dashboardPort },
        { Key: 'Auto Index', Value: config.autoIndex ? '✓ Enabled' : '✗ Disabled' },
        { Key: 'Batch Size', Value: config.batchSize },
        { Key: 'Debounce Delay (ms)', Value: config.debounceDelay },
        { Key: 'Exclude Patterns', Value: config.excludePatterns.join(', ') },
        { Key: 'Languages', Value: config.supportedLanguages.join(', ') },
      ];

      printTable(configData, ['Key', 'Value']);
      console.log('');
    } else if (subcommand === 'set') {
      const keyIndex = args.indexOf('--path') >= 0 ? args.indexOf('--path') : -1;
      const portIndex = args.indexOf('--port') >= 0 ? args.indexOf('--port') : -1;
      const dbIndex = args.indexOf('--db') >= 0 ? args.indexOf('--db') : -1;

      if (keyIndex < 0 && portIndex < 0 && dbIndex < 0) {
        console.error(`${colors.yellow}⚠️  Usage: npm run dashboard:cli config set --path=/path --port=PORT --db=/path${colors.reset}`);
        process.exit(1);
      }

      const updates = {};
      if (keyIndex >= 0) updates.MCP_FOLDER = args[keyIndex + 1];
      if (portIndex >= 0) updates.DASHBOARD_PORT = parseInt(args[portIndex + 1], 10);
      if (dbIndex >= 0) updates.DB_PATH = args[dbIndex + 1];

      console.log(`\n${colors.cyan}⚙️  Updating Configuration${colors.reset}\n`);
      const result = updateConfigAPI(updates);

      if (result.success) {
        console.log(`${colors.green}✓ Configuration updated successfully${colors.reset}\n`);
        configCommand(); // Show updated config
      } else {
        console.error(`${colors.yellow}❌ Configuration update failed${colors.reset}`);
        result.errors.forEach(err => console.error(`  - ${err}`));
        process.exit(1);
      }
    } else {
      console.error(`${colors.yellow}⚠️  Usage: npm run dashboard:cli config [show|set]${colors.reset}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.yellow}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Search command
 */
function searchCommand() {
  if (!subcommand) {
    console.error(`${colors.yellow}⚠️  Usage: npm run dashboard:cli search "query"${colors.reset}`);
    process.exit(1);
  }

  try {
    const query = args.slice(1).join(' ');
    console.log(`\n${colors.cyan}🔍 Search Results for "${query}"${colors.reset}\n`);

    const results = searchCodeAPI(query, 20);

    if (results.length === 0) {
      console.log('  (no results)\n');
    } else {
      printTable(results);
      console.log(`\n  Found ${results.length} result(s)\n`);
    }
  } catch (error) {
    console.error(`${colors.yellow}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Files command
 */
function filesCommand() {
  try {
    const limit = subcommand && !isNaN(subcommand) ? parseInt(subcommand, 10) : 20;
    console.log(`\n${colors.cyan}📁 Indexed Files (latest ${limit})${colors.reset}\n`);

    const files = listIndexedFiles(limit);

    if (files.length === 0) {
      console.log('  (no files indexed)\n');
    } else {
      printTable(files);
      console.log(`\n  Total: ${files.length} file(s)\n`);
    }
  } catch (error) {
    console.error(`${colors.yellow}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Health command
 */
function healthCommand() {
  try {
    console.log(`\n${colors.cyan}❤️  Server Health${colors.reset}\n`);

    const health = getHealthStatus();

    console.log(`  Status: ${health.status === 'healthy' ? colors.green + '✓ Healthy' : colors.yellow + '⚠ Unhealthy'}${colors.reset}`);
    console.log(`  Service: ${health.service}`);
    console.log(`  Database: ${health.database.exists ? colors.green + '✓ Exists' : colors.yellow + '✗ Not found'}${colors.reset}`);
    console.log(`  Connected: ${health.database.connected ? colors.green + '✓ Yes' : colors.yellow + '✗ No'}${colors.reset}`);
    console.log(`  Timestamp: ${health.timestamp}\n`);
  } catch (error) {
    console.error(`${colors.yellow}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Monitor command (live updates)
 */
function monitorCommand() {
  console.log(`\n${colors.cyan}📊 Live Statistics Monitor (Press Ctrl+C to exit)${colors.reset}\n`);

  const showStats = () => {
    try {
      // Clear previous output
      console.clear();
      console.log(`${colors.cyan}📊 Code Index Live Monitor${colors.reset}`);
      console.log(`Updated: ${new Date().toLocaleTimeString()}\n`);

      const stats = getDatabaseStats();
      console.log(`${colors.bold}Statistics${colors.reset}`);
      console.log(`  Files: ${stats.files}`);
      console.log(`  Symbols: ${stats.symbols}`);
      console.log(`  Imports: ${stats.imports}`);
      console.log(`  DB Size: ${stats.dbSize}`);
      console.log(`  Last Indexed: ${stats.lastIndexed}\n`);

      const breakdown = getLanguageBreakdown();
      console.log(`${colors.bold}Languages${colors.reset}`);
      breakdown.slice(0, 5).forEach(lang => {
        console.log(`  ${lang.language}: ${lang.fileCount} files, ${lang.symbolCount} symbols`);
      });

      console.log(`\n(Updating every 5 seconds...)`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  // Show immediately
  showStats();

  // Update every 5 seconds
  setInterval(showStats, 5000);
}

/**
 * Help command
 */
function helpCommand() {
  console.log(`
${colors.cyan}📊 Code Index Dashboard CLI${colors.reset}

Usage: npm run dashboard:cli [command] [options]

Commands:
  ${colors.bold}stats${colors.reset}                    Show codebase statistics
  ${colors.bold}config show${colors.reset}             Show current configuration
  ${colors.bold}config set${colors.reset}             Update configuration
    --path=/path                Set MCP folder path
    --port=PORT                 Set dashboard port
    --db=/path                  Set database path
  ${colors.bold}search "query"${colors.reset}          Search for code
  ${colors.bold}files [limit]${colors.reset}           List indexed files (default: 20)
  ${colors.bold}health${colors.reset}                  Check server health
  ${colors.bold}monitor${colors.reset}                 Live statistics monitor
  ${colors.bold}help${colors.reset}                    Show this help message

Examples:
  npm run dashboard:cli stats
  npm run dashboard:cli config show
  npm run dashboard:cli config set --path=/Users/hardik/Developer/code_index
  npm run dashboard:cli search "function"
  npm run dashboard:cli files 50
  npm run dashboard:cli health
  npm run dashboard:cli monitor
`);
}

/**
 * Main entry point
 */
function main() {
  switch (command) {
    case 'stats':
      statsCommand();
      break;
    case 'config':
      configCommand();
      break;
    case 'search':
      searchCommand();
      break;
    case 'files':
      filesCommand();
      break;
    case 'health':
      healthCommand();
      break;
    case 'monitor':
      monitorCommand();
      break;
    case 'help':
    case '--help':
    case '-h':
      helpCommand();
      break;
    default:
      if (!command) {
        helpCommand();
      } else {
        console.error(`${colors.yellow}Unknown command: ${command}${colors.reset}`);
        console.log(`Run: npm run dashboard:cli help`);
        process.exit(1);
      }
  }
}

main();

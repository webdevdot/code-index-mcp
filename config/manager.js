import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, validateConfig } from './loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

/**
 * Get current configuration
 */
export function getConfig() {
  return loadConfig();
}

/**
 * Update configuration values
 */
export function updateConfig(updates) {
  const currentConfig = loadConfig();
  const newConfig = { ...currentConfig, ...updates };

  // Validate new configuration
  const validation = validateConfig(newConfig);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  // Build .env content
  const envLines = [
    `# Code Index MCP Configuration`,
    `# Generated on ${new Date().toISOString()}`,
    ``,
    `# Database path (absolute or relative)`,
    `DB_PATH=${newConfig.DB_PATH}`,
    ``,
    `# MCP folder path (where the MCP server is installed)`,
    `MCP_FOLDER=${newConfig.MCP_FOLDER}`,
    ``,
    `# Dashboard port`,
    `DASHBOARD_PORT=${newConfig.DASHBOARD_PORT}`,
    ``,
    `# Enable automatic indexing on file changes`,
    `AUTO_INDEX=${newConfig.AUTO_INDEX ? 'true' : 'false'}`,
    ``,
    `# Batch size for indexing`,
    `BATCH_SIZE=${newConfig.BATCH_SIZE}`,
    ``,
    `# Debounce delay for file watcher (ms)`,
    `DEBOUNCE_DELAY=${newConfig.DEBOUNCE_DELAY}`,
    ``,
    `# Exclude patterns (comma-separated)`,
    `EXCLUDE_PATTERNS=${newConfig.EXCLUDE_PATTERNS.join(',')}`,
    ``,
    `# Supported languages (comma-separated)`,
    `SUPPORTED_LANGUAGES=${newConfig.SUPPORTED_LANGUAGES.join(',')}`,
  ];

  try {
    fs.writeFileSync(ENV_FILE, envLines.join('\n') + '\n', 'utf-8');
    return {
      success: true,
      config: newConfig,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error.message],
    };
  }
}

/**
 * Set a single configuration value
 */
export function setConfigValue(key, value) {
  const config = loadConfig();

  // Parse value based on key type
  let parsedValue = value;
  switch (key) {
    case 'DASHBOARD_PORT':
    case 'BATCH_SIZE':
    case 'DEBOUNCE_DELAY':
      parsedValue = parseInt(value, 10);
      break;
    case 'AUTO_INDEX':
      parsedValue = value === 'true' || value === '1';
      break;
    case 'EXCLUDE_PATTERNS':
    case 'SUPPORTED_LANGUAGES':
      parsedValue = Array.isArray(value) ? value : value.split(',').map(v => v.trim());
      break;
  }

  const updates = { [key]: parsedValue };
  return updateConfig(updates);
}

/**
 * Reset configuration to defaults
 */
export function resetConfig() {
  const defaults = {
    DB_PATH: path.join(PROJECT_ROOT, 'code-index.db'),
    MCP_FOLDER: PROJECT_ROOT,
    DASHBOARD_PORT: 34244,
    AUTO_INDEX: false,
    BATCH_SIZE: 100,
    DEBOUNCE_DELAY: 1000,
    EXCLUDE_PATTERNS: ['node_modules', 'dist', 'build', '.git', 'coverage'],
    SUPPORTED_LANGUAGES: ['javascript', 'typescript', 'jsx', 'tsx', 'python', 'php'],
  };

  return updateConfig(defaults);
}

/**
 * Get configuration as display object
 */
export function getConfigDisplay() {
  const config = loadConfig();
  return {
    'Database Path': config.DB_PATH,
    'MCP Folder': config.MCP_FOLDER,
    'Dashboard Port': config.DASHBOARD_PORT,
    'Auto Index': config.AUTO_INDEX ? 'Enabled' : 'Disabled',
    'Batch Size': config.BATCH_SIZE,
    'Debounce Delay (ms)': config.DEBOUNCE_DELAY,
    'Exclude Patterns': config.EXCLUDE_PATTERNS.join(', '),
    'Supported Languages': config.SUPPORTED_LANGUAGES.join(', '),
  };
}

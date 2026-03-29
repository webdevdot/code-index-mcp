import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

/**
 * Load configuration from .env file and environment variables
 */
export function loadConfig() {
  const config = {
    // Database configuration
    DB_PATH: process.env.DB_PATH || path.join(PROJECT_ROOT, 'code-index.db'),

    // MCP configuration
    MCP_FOLDER: process.env.MCP_FOLDER || PROJECT_ROOT,

    // Server configuration
    DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || '34244', 10),

    // Indexing configuration
    AUTO_INDEX: process.env.AUTO_INDEX === 'true',
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '100', 10),
    DEBOUNCE_DELAY: parseInt(process.env.DEBOUNCE_DELAY || '1000', 10),

    // File exclusions
    EXCLUDE_PATTERNS: (process.env.EXCLUDE_PATTERNS || 'node_modules,dist,build,.git,coverage').split(',').map(p => p.trim()),

    // Supported languages
    SUPPORTED_LANGUAGES: (process.env.SUPPORTED_LANGUAGES || 'javascript,typescript,jsx,tsx,python,php').split(',').map(l => l.trim()),
  };

  // Load from .env file if it exists
  if (fs.existsSync(ENV_FILE)) {
    try {
      const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
      const envLines = envContent.split('\n');

      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').trim();

          if (key && value) {
            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');
            process.env[key] = cleanValue;

            // Update config based on loaded values
            switch (key) {
              case 'DB_PATH':
                config.DB_PATH = cleanValue;
                break;
              case 'MCP_FOLDER':
                config.MCP_FOLDER = cleanValue;
                break;
              case 'DASHBOARD_PORT':
                config.DASHBOARD_PORT = parseInt(cleanValue, 10);
                break;
              case 'AUTO_INDEX':
                config.AUTO_INDEX = cleanValue === 'true';
                break;
              case 'BATCH_SIZE':
                config.BATCH_SIZE = parseInt(cleanValue, 10);
                break;
              case 'DEBOUNCE_DELAY':
                config.DEBOUNCE_DELAY = parseInt(cleanValue, 10);
                break;
              case 'EXCLUDE_PATTERNS':
                config.EXCLUDE_PATTERNS = cleanValue.split(',').map(p => p.trim());
                break;
              case 'SUPPORTED_LANGUAGES':
                config.SUPPORTED_LANGUAGES = cleanValue.split(',').map(l => l.trim());
                break;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Warning: Could not load .env file: ${error.message}`);
    }
  }

  return config;
}

/**
 * Validate configuration paths
 */
export function validateConfig(config) {
  const errors = [];

  // Validate MCP_FOLDER exists
  if (!fs.existsSync(config.MCP_FOLDER)) {
    errors.push(`MCP_FOLDER does not exist: ${config.MCP_FOLDER}`);
  } else if (!fs.statSync(config.MCP_FOLDER).isDirectory()) {
    errors.push(`MCP_FOLDER is not a directory: ${config.MCP_FOLDER}`);
  }

  // Validate DB_PATH directory exists
  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    errors.push(`Database directory does not exist: ${dbDir}`);
  } else if (!fs.statSync(dbDir).isDirectory()) {
    errors.push(`Database path parent is not a directory: ${dbDir}`);
  }

  // Validate port number
  if (config.DASHBOARD_PORT < 1 || config.DASHBOARD_PORT > 65535) {
    errors.push(`Invalid dashboard port: ${config.DASHBOARD_PORT} (must be 1-65535)`);
  }

  // Validate batch size
  if (config.BATCH_SIZE < 1) {
    errors.push(`Invalid batch size: ${config.BATCH_SIZE} (must be >= 1)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration with validation
 */
export function getConfig() {
  const config = loadConfig();
  const validation = validateConfig(config);

  if (!validation.valid) {
    console.error('❌ Configuration validation errors:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    return null;
  }

  return config;
}

/**
 * Get all available configuration
 */
export function getAllConfig() {
  return loadConfig();
}

/**
 * Get configuration as object for display
 */
export function getConfigForDisplay() {
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

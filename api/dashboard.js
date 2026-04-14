import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { getConfig } from '../config/loader.js';
import { updateConfig } from '../config/manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const SAFE_FOLDER_NAME_RE = /^[A-Za-z0-9._ -]+$/;

/**
 * Get database connection
 */
function getDatabase() {
  const config = getConfig();
  if (!config) {
    throw new Error('Invalid configuration');
  }
  return new Database(config.DB_PATH);
}

/**
 * Get database statistics
 */
export function getDatabaseStats() {
  try {
    const db = getDatabase();

    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
    const symbolCount = db.prepare('SELECT COUNT(*) as count FROM symbols').get().count;
    const importCount = db.prepare('SELECT COUNT(*) as count FROM imports').get().count;

    const dbPath = getConfig().DB_PATH;
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    const lastIndexed = db
      .prepare("SELECT value FROM metadata WHERE key = 'last_indexed'")
      .get();

    db.close();

    return {
      files: fileCount,
      symbols: symbolCount,
      imports: importCount,
      dbSize: (dbSize / 1024 / 1024).toFixed(2) + ' MB',
      lastIndexed: lastIndexed ? lastIndexed.value : 'Never',
    };
  } catch (error) {
    throw new Error(`Failed to get statistics: ${error.message}`);
  }
}

/**
 * Get language breakdown
 */
export function getLanguageBreakdown() {
  try {
    const db = getDatabase();

    const languages = db
      .prepare(
        `
        SELECT
          language,
          COUNT(*) as fileCount,
          (SELECT COUNT(*) FROM symbols WHERE file_id IN
            (SELECT id FROM files WHERE language = f.language)) as symbolCount
        FROM files f
        GROUP BY language
        ORDER BY fileCount DESC
      `
      )
      .all();

    db.close();

    return languages.map(lang => ({
      language: lang.language,
      fileCount: lang.fileCount,
      symbolCount: lang.symbolCount,
    }));
  } catch (error) {
    throw new Error(`Failed to get language breakdown: ${error.message}`);
  }
}

/**
 * List indexed files
 */
export function listIndexedFiles(limit = 100, language = null) {
  try {
    const db = getDatabase();

    let query = `
      SELECT
        id, path, language, file_size,
        datetime(last_modified/1000, 'unixepoch') as modified_at
      FROM files
    `;
    const params = [];

    if (language) {
      query += ' WHERE language = ?';
      params.push(language);
    }

    query += ' ORDER BY last_modified DESC LIMIT ?';
    params.push(limit);

    const files = db.prepare(query).all(...params);
    db.close();

    return files.map(f => ({
      path: f.path,
      language: f.language,
      size: (f.file_size / 1024).toFixed(2) + ' KB',
      modifiedAt: f.modified_at,
    }));
  } catch (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

/**
 * Search code (wrapper around search_code tool)
 */
export function searchCodeAPI(query, limit = 20) {
  try {
    const db = getDatabase();

    const results = db
      .prepare(
        `
        SELECT DISTINCT f.path, f.language, f.file_size
        FROM file_index fi
        JOIN files f ON fi.file_id = f.id
        WHERE file_index MATCH ?
        LIMIT ?
      `
      )
      .all(query, limit);

    db.close();

    return results.map(r => ({
      path: r.path,
      language: r.language,
      size: (r.file_size / 1024).toFixed(2) + ' KB',
    }));
  } catch (error) {
    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Get current configuration
 */
export function getConfigAPI() {
  try {
    const config = getConfig();
    if (!config) {
      throw new Error('Invalid configuration');
    }

    return {
      dbPath: config.DB_PATH,
      mcpFolder: config.MCP_FOLDER,
      dashboardPort: config.DASHBOARD_PORT,
      autoIndex: config.AUTO_INDEX,
      batchSize: config.BATCH_SIZE,
      debounceDelay: config.DEBOUNCE_DELAY,
      excludePatterns: config.EXCLUDE_PATTERNS,
      supportedLanguages: config.SUPPORTED_LANGUAGES,
    };
  } catch (error) {
    throw new Error(`Failed to get configuration: ${error.message}`);
  }
}

/**
 * Update configuration
 */
export function updateConfigAPI(updates) {
  try {
    return updateConfig(updates);
  } catch (error) {
    throw new Error(`Failed to update configuration: ${error.message}`);
  }
}

/**
 * Get server health
 */
export function getHealthStatus() {
  try {
    const config = getConfig();
    const dbPath = config.DB_PATH;
    const dbExists = fs.existsSync(dbPath);

    let dbConnected = false;
    if (dbExists) {
      try {
        const db = getDatabase();
        db.prepare('SELECT 1').get();
        db.close();
        dbConnected = true;
      } catch (e) {
        dbConnected = false;
      }
    }

    return {
      status: 'healthy',
      service: 'code-index-mcp-dashboard',
      database: {
        path: dbPath,
        exists: dbExists,
        connected: dbConnected,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      service: 'code-index-mcp-dashboard',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get symbol information by type
 */
export function getSymbolsByType() {
  try {
    const db = getDatabase();

    const symbols = db
      .prepare(
        `
        SELECT
          type,
          COUNT(*) as count
        FROM symbols
        GROUP BY type
        ORDER BY count DESC
      `
      )
      .all();

    db.close();

    return symbols.reduce((acc, s) => {
      acc[s.type] = s.count;
      return acc;
    }, {});
  } catch (error) {
    throw new Error(`Failed to get symbol types: ${error.message}`);
  }
}

/**
 * Get recent indexing activity
 */
export function getIndexActivity() {
  try {
    const db = getDatabase();

    const lastIndexed = db
      .prepare("SELECT value FROM metadata WHERE key = 'last_indexed'")
      .get();

    const recentFiles = db
      .prepare(
        `
        SELECT path, language, last_modified
        FROM files
        ORDER BY last_modified DESC
        LIMIT 10
      `
      )
      .all();

    db.close();

    return {
      lastIndexed: lastIndexed ? lastIndexed.value : null,
      recentFiles: recentFiles.map(f => ({
        path: f.path,
        language: f.language,
        modifiedAt: new Date(f.last_modified).toISOString(),
      })),
    };
  } catch (error) {
    throw new Error(`Failed to get activity: ${error.message}`);
  }
}

/**
 * Get configured project folders
 */
export function getProjectFolders() {
  try {
    const config = getConfig();
    return {
      folders: config.PROJECT_FOLDERS,
      enableIndexing: config.ENABLE_INDEXING_BUTTON,
    };
  } catch (error) {
    throw new Error(`Failed to get project folders: ${error.message}`);
  }
}

/**
 * Trigger indexing for specified folder
 */
export function triggerIndexing(folderPath) {
  try {
    const config = getConfig();

    if (typeof folderPath !== 'string' || !folderPath.trim()) {
      throw new Error('Invalid folder path');
    }

    // Build canonical allowlist roots first
    const allowedRoots = Array.isArray(config.PROJECT_FOLDERS) ? config.PROJECT_FOLDERS : [];
    const canonicalAllowedRoots = allowedRoots
      .filter(root => typeof root === 'string' && root.trim())
      .map(root => path.resolve(root))
      .filter(root => fs.existsSync(root))
      .map(root => fs.realpathSync(root))
      .filter(root => fs.statSync(root).isDirectory());

    if (canonicalAllowedRoots.length === 0) {
      throw new Error('No valid configured project folders available');
    }

    // Accept only a simple safe folder name (no separators, traversal, or special chars)
    const requestedFolderName = folderPath.trim();
    if (
      requestedFolderName === '.' ||
      requestedFolderName === '..' ||
      requestedFolderName.includes('/') ||
      requestedFolderName.includes('\\') ||
      requestedFolderName.includes('\0') ||
      !SAFE_FOLDER_NAME_RE.test(requestedFolderName)
    ) {
      throw new Error('Invalid folder path');
    }

    // Resolve from trusted roots only
    let canonicalRequestedPath = null;
    for (const root of canonicalAllowedRoots) {
      const candidatePath = path.join(root, requestedFolderName);
      if (!fs.existsSync(candidatePath)) {
        continue;
      }
      const candidateCanonicalPath = fs.realpathSync(candidatePath);
      const isWithinRoot =
        candidateCanonicalPath === root || candidateCanonicalPath.startsWith(root + path.sep);
      if (!isWithinRoot) {
        continue;
      }
      if (!fs.statSync(candidateCanonicalPath).isDirectory()) {
        continue;
      }
      canonicalRequestedPath = candidateCanonicalPath;
      break;
    }

    if (!canonicalRequestedPath) {
      throw new Error(`Folder does not exist in configured project folders: ${folderPath}`);
    }

    // Import the Indexer class
    const { Indexer } = require('../indexer/indexer.js');

    // Create and run indexer for the folder
    const indexer = new Indexer(canonicalRequestedPath);

    // Run indexing (asynchronous)
    indexer.index()
      .then(() => {
        console.log(`✓ Indexing completed for ${canonicalRequestedPath}`);
      })
      .catch(err => {
        console.error(`✗ Indexing failed for ${canonicalRequestedPath}: ${err.message}`);
      });

    return {
      success: true,
      message: `Indexing started for ${canonicalRequestedPath}`,
      folder: canonicalRequestedPath,
      startedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to trigger indexing: ${error.message}`);
  }
}

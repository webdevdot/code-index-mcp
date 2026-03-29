import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getSnippet } from '../utils/file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'code-index.db');

let db = null;

/**
 * Initialize database connection
 */
export function initializeDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

/**
 * search_code - Full-text search across all files
 */
export function searchCode(query, limit = 20) {
  const db = initializeDatabase();

  try {
    const results = db.prepare(`
      SELECT DISTINCT
        f.path,
        fi.content,
        f.language
      FROM file_index fi
      JOIN files f ON fi.file_id = f.id
      WHERE fi.content MATCH ?
      LIMIT ?
    `).all(query, limit);

    return results.map(result => {
      const snippet = getSnippet(result.content, 1, 3);
      return {
        path: result.path,
        language: result.language,
        snippet: snippet.substring(0, 500) + (snippet.length > 500 ? '...' : ''),
        content_length: result.content.length,
      };
    });
  } catch (error) {
    console.error('Search error:', error.message);
    return [];
  }
}

/**
 * find_symbol - Find symbol definitions by name
 */
export function findSymbol(name, limit = 50) {
  const db = initializeDatabase();

  try {
    const results = db.prepare(`
      SELECT
        s.id,
        s.name,
        s.type,
        s.line,
        s.column,
        s.scope,
        f.path,
        f.language
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name LIKE ? OR s.name LIKE ?
      ORDER BY s.type ASC, f.path ASC
      LIMIT ?
    `).all(`%${name}%`, `${name}%`, limit);

    return results.map(result => ({
      name: result.name,
      type: result.type,
      path: result.path,
      language: result.language,
      line: result.line,
      column: result.column,
      scope: result.scope,
    }));
  } catch (error) {
    console.error('Find symbol error:', error.message);
    return [];
  }
}

/**
 * get_file - Retrieve full file content with line numbers
 */
export function getFile(path_) {
  const db = initializeDatabase();

  try {
    const file = db.prepare(`
      SELECT id, path, language, file_size
      FROM files
      WHERE path = ?
    `).get(path_);

    if (!file) {
      return {
        error: `File not found: ${path_}`,
        path: path_,
      };
    }

    try {
      // Construct safe absolute path using database record
      const fullPath = path.join(process.cwd(), file.path);
      const realPath = path.resolve(fullPath);
      const realCwd = path.resolve(process.cwd());

      // Prevent path traversal attacks
      if (!realPath.startsWith(realCwd)) {
        return {
          error: `Access denied: path outside project directory`,
          path: path_,
        };
      }

      if (!fs.existsSync(realPath)) {
        // File was in DB but doesn't exist on disk
        return {
          error: `File no longer exists on disk: ${path_}`,
          path: path_,
        };
      }

      const content = fs.readFileSync(realPath, 'utf-8');
      const lines = content.split('\n');

      return {
        path: file.path,
        language: file.language,
        size: file.file_size,
        lines: lines.length,
        content: lines.map((line, index) => ({
          line_number: index + 1,
          content: line,
        })),
      };
    } catch (readError) {
      return {
        error: `Failed to read file: ${readError.message}`,
        path: path_,
      };
    }
  } catch (error) {
    console.error('Get file error:', error.message);
    return { error: error.message };
  }
}

/**
 * get_context - Get relevant context combining FTS and symbol search
 */
export function getContext(query, limit = 30) {
  const db = initializeDatabase();

  try {
    // Search FTS for matching files
    const fileMatches = db.prepare(`
      SELECT DISTINCT
        f.id,
        f.path,
        f.language,
        fi.content,
        'file' as match_type
      FROM file_index fi
      JOIN files f ON fi.file_id = f.id
      WHERE file_index MATCH ?
      LIMIT ?
    `).all(query, Math.floor(limit / 2));

    // Search symbols for matching names
    const symbolMatches = db.prepare(`
      SELECT
        f.id,
        f.path,
        f.language,
        s.name,
        s.type,
        s.line,
        s.scope,
        'symbol' as match_type
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name LIKE ? OR s.name LIKE ?
      ORDER BY s.type ASC
      LIMIT ?
    `).all(`%${query}%`, `${query}%`, Math.floor(limit / 2));

    // Combine and deduplicate results
    const results = [];
    const seenFiles = new Set();

    // Add file matches
    for (const match of fileMatches) {
      if (!seenFiles.has(match.path)) {
        seenFiles.add(match.path);
        const snippet = getSnippet(match.content, 1, 2);
        results.push({
          type: 'file_match',
          path: match.path,
          language: match.language,
          snippet: snippet.substring(0, 300) + (snippet.length > 300 ? '...' : ''),
        });
      }
    }

    // Add symbol matches
    for (const match of symbolMatches) {
      const key = `${match.path}:${match.name}`;
      if (!seenFiles.has(key)) {
        seenFiles.add(key);
        results.push({
          type: 'symbol_match',
          name: match.name,
          symbol_type: match.type,
          path: match.path,
          language: match.language,
          line: match.line,
          scope: match.scope,
        });
      }
    }

    return {
      query,
      result_count: results.length,
      results,
    };
  } catch (error) {
    console.error('Get context error:', error.message);
    return {
      query,
      error: error.message,
      results: [],
    };
  }
}

/**
 * get_stats - Get database statistics
 */
export function getStats() {
  const db = initializeDatabase();

  try {
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
    const symbolCount = db.prepare('SELECT COUNT(*) as count FROM symbols').get().count;
    const importCount = db.prepare('SELECT COUNT(*) as count FROM imports').get().count;
    const dbSize = fs.statSync(DB_PATH).size;

    return {
      indexed_files: fileCount,
      total_symbols: symbolCount,
      total_imports: importCount,
      database_size_mb: (dbSize / 1024 / 1024).toFixed(2),
    };
  } catch (error) {
    console.error('Get stats error:', error.message);
    return { error: error.message };
  }
}

/**
 * list_files - List all indexed files with optional filter
 */
export function listFiles(language = null, limit = 100) {
  const db = initializeDatabase();

  try {
    let query = 'SELECT path, language, file_size FROM files';
    let params = [];

    if (language) {
      query += ' WHERE language = ?';
      params.push(language);
    }

    query += ' ORDER BY path ASC LIMIT ?';
    params.push(limit);

    const results = db.prepare(query).all(...params);

    return {
      count: results.length,
      files: results,
    };
  } catch (error) {
    console.error('List files error:', error.message);
    return { error: error.message, files: [] };
  }
}

/**
 * get_imports - Get all imports from a specific file
 */
export function getImports(filePath) {
  const db = initializeDatabase();

  try {
    const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath);

    if (!file) {
      return {
        error: `File not found: ${filePath}`,
        imports: [],
      };
    }

    const imports = db.prepare(`
      SELECT import_path, import_name, import_type
      FROM imports
      WHERE file_id = ?
      ORDER BY import_path ASC
    `).all(file.id);

    return {
      path: filePath,
      import_count: imports.length,
      imports,
    };
  } catch (error) {
    console.error('Get imports error:', error.message);
    return { error: error.message, imports: [] };
  }
}

/**
 * get_dependents - Find files that import a specific file
 */
export function getDependents(filePath, limit = 50) {
  const db = initializeDatabase();

  try {
    const results = db.prepare(`
      SELECT DISTINCT
        f.path,
        f.language,
        i.import_name
      FROM imports i
      JOIN files f ON i.file_id = f.id
      WHERE i.import_path LIKE ?
      LIMIT ?
    `).all(`%${filePath}%`, limit);

    return {
      target_path: filePath,
      dependent_count: results.length,
      dependents: results,
    };
  } catch (error) {
    console.error('Get dependents error:', error.message);
    return { error: error.message, dependents: [] };
  }
}

export default {
  initializeDatabase,
  searchCode,
  findSymbol,
  getFile,
  getContext,
  getStats,
  listFiles,
  getImports,
  getDependents,
};

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getSnippet } from '../utils/file.js';
import Indexer from '../indexer/indexer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'code-index.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');
const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_ROOT || process.cwd());

let db = null;

/**
 * Initialize database connection (runs migration if needed)
 */
export function initializeDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    // Load schema (all CREATE IF NOT EXISTS — safe to run always)
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    // Check if files table needs migration (old schema without project_id)
    const columns = db.prepare("PRAGMA table_info(files)").all();
    const hasProjectId = columns.some(c => c.name === 'project_id');

    if (!hasProjectId) {
      console.log('🔄 Schema upgrade: adding projects support...');
      db.exec(`
        DROP TABLE IF EXISTS file_index;
        DROP TABLE IF EXISTS imports;
        DROP TABLE IF EXISTS symbols;
        DROP TABLE IF EXISTS files;
      `);
      db.exec(schema);
      console.log('✓ Schema upgraded');
    }
  }
  return db;
}

/**
 * Resolve project filter — returns project_id or null
 */
function resolveProjectId(project) {
  if (!project) return null;
  const db = initializeDatabase();
  // Try by name first, then by folder path
  const row = db.prepare(
    'SELECT id FROM projects WHERE name = ? OR folder_path = ?'
  ).get(project, project);
  return row ? row.id : null;
}

/**
 * add_project - Register a folder and index it
 */
export async function addProject(folderPath, name) {
  const db = initializeDatabase();

  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    return { error: 'folder_path must be a non-empty string' };
  }

  const safeRoot = fs.realpathSync(PROJECTS_ROOT);
  const resolvedPath = path.resolve(safeRoot, folderPath.trim());

  let absPath;
  try {
    absPath = fs.realpathSync(resolvedPath);
  } catch {
    return { error: `Folder not found: ${resolvedPath}` };
  }

  const rootWithSep = safeRoot.endsWith(path.sep) ? safeRoot : `${safeRoot}${path.sep}`;
  if (absPath !== safeRoot && !absPath.startsWith(rootWithSep)) {
    return { error: `Folder must be within allowed root: ${safeRoot}` };
  }

  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    return { error: `Not a directory: ${absPath}` };
  }

  // Use folder name as project name if not given
  const projectName = name || path.basename(absPath);

  // Check if already registered
  const existing = db.prepare('SELECT id, name, status FROM projects WHERE folder_path = ?').get(absPath);
  if (existing) {
    return {
      message: `Project "${existing.name}" already registered`,
      project_id: existing.id,
      status: existing.status,
      folder: absPath,
    };
  }

  // Insert project
  const result = db.prepare(
    'INSERT INTO projects (name, folder_path, status) VALUES (?, ?, ?)'
  ).run(projectName, absPath, 'indexing');
  const projectId = result.lastInsertRowid;

  // Start indexing
  try {
    const indexer = new Indexer(absPath, projectId);
    await indexer.indexProject(false);
    indexer.close();
  } catch (error) {
    db.prepare("UPDATE projects SET status = 'error' WHERE id = ?").run(projectId);
    return { error: `Indexing failed: ${error.message}`, project_id: projectId };
  }

  // Get final stats
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

  return {
    message: `Project "${projectName}" added and indexed`,
    project_id: projectId,
    name: projectName,
    folder: absPath,
    files: project.file_count,
    symbols: project.symbol_count,
    status: project.status,
  };
}

/**
 * list_projects - List all registered projects
 */
export function listProjects() {
  const db = initializeDatabase();
  const projects = db.prepare(`
    SELECT id, name, folder_path, status, file_count, symbol_count, last_indexed, created_at
    FROM projects ORDER BY name ASC
  `).all();

  return {
    count: projects.length,
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      folder: p.folder_path,
      status: p.status,
      files: p.file_count,
      symbols: p.symbol_count,
      last_indexed: p.last_indexed ? new Date(p.last_indexed * 1000).toISOString() : null,
    })),
  };
}

/**
 * remove_project - Remove a project and its indexed data
 */
export function removeProject(project) {
  const db = initializeDatabase();
  const row = db.prepare(
    'SELECT id, name, folder_path FROM projects WHERE name = ? OR folder_path = ? OR id = ?'
  ).get(project, project, parseInt(project) || 0);

  if (!row) {
    return { error: `Project not found: ${project}` };
  }

  // Delete all related data in a transaction
  db.transaction(() => {
    const fileIds = db.prepare('SELECT id FROM files WHERE project_id = ?').all(row.id).map(f => f.id);
    for (const fid of fileIds) {
      db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fid);
      db.prepare('DELETE FROM imports WHERE file_id = ?').run(fid);
      db.prepare('DELETE FROM file_index WHERE file_id = ?').run(fid);
    }
    db.prepare('DELETE FROM files WHERE project_id = ?').run(row.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(row.id);
  })();

  return {
    message: `Project "${row.name}" removed`,
    name: row.name,
    folder: row.folder_path,
  };
}

/**
 * search_code - Full-text search across files (optionally filtered by project)
 */
export function searchCode(query, limit = 20, project = null) {
  const db = initializeDatabase();
  const projectId = resolveProjectId(project);

  try {
    let sql = `
      SELECT DISTINCT
        f.path,
        fi.content,
        f.language,
        p.name as project_name
      FROM file_index fi
      JOIN files f ON fi.file_id = f.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE fi.content MATCH ?
    `;
    const params = [query];

    if (project) {
      if (!projectId) return { error: `Project not found: ${project}`, results: [] };
      sql += ' AND f.project_id = ?';
      params.push(projectId);
    }

    sql += ' LIMIT ?';
    params.push(limit);

    const results = db.prepare(sql).all(...params);

    return results.map(result => {
      const snippet = getSnippet(result.content, 1, 3);
      return {
        path: result.path,
        language: result.language,
        project: result.project_name || null,
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
 * find_symbol - Find symbol definitions by name (optionally filtered by project)
 */
export function findSymbol(name, limit = 50, project = null) {
  const db = initializeDatabase();
  const projectId = resolveProjectId(project);

  try {
    let sql = `
      SELECT
        s.id,
        s.name,
        s.type,
        s.line,
        s.column,
        s.scope,
        f.path,
        f.language,
        p.name as project_name
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE (s.name LIKE ? OR s.name LIKE ?)
    `;
    const params = [`%${name}%`, `${name}%`];

    if (project) {
      if (!projectId) return { error: `Project not found: ${project}`, results: [] };
      sql += ' AND f.project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY s.type ASC, f.path ASC LIMIT ?';
    params.push(limit);

    const results = db.prepare(sql).all(...params);

    return results.map(result => ({
      name: result.name,
      type: result.type,
      path: result.path,
      language: result.language,
      project: result.project_name || null,
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
 * get_context - Get relevant context combining FTS and symbol search (optionally filtered by project)
 */
export function getContext(query, limit = 30, project = null) {
  const db = initializeDatabase();
  const projectId = resolveProjectId(project);

  try {
    const projectFilter = project
      ? (projectId ? ' AND f.project_id = ?' : ' AND 1=0')
      : '';
    const projectParams = projectId ? [projectId] : [];

    // Search FTS for matching files
    const fileMatches = db.prepare(`
      SELECT DISTINCT
        f.id,
        f.path,
        f.language,
        fi.content,
        p.name as project_name
      FROM file_index fi
      JOIN files f ON fi.file_id = f.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE file_index MATCH ?${projectFilter}
      LIMIT ?
    `).all(query, ...projectParams, Math.floor(limit / 2));

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
        p.name as project_name
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE (s.name LIKE ? OR s.name LIKE ?)${projectFilter}
      ORDER BY s.type ASC
      LIMIT ?
    `).all(`%${query}%`, `${query}%`, ...projectParams, Math.floor(limit / 2));

    // Combine and deduplicate results
    const results = [];
    const seenFiles = new Set();

    for (const match of fileMatches) {
      if (!seenFiles.has(match.path)) {
        seenFiles.add(match.path);
        const snippet = getSnippet(match.content, 1, 2);
        results.push({
          type: 'file_match',
          path: match.path,
          language: match.language,
          project: match.project_name || null,
          snippet: snippet.substring(0, 300) + (snippet.length > 300 ? '...' : ''),
        });
      }
    }

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
          project: match.project_name || null,
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
 * list_files - List all indexed files with optional filter (language and/or project)
 */
export function listFiles(language = null, limit = 100, project = null) {
  const db = initializeDatabase();
  const projectId = resolveProjectId(project);

  try {
    let sql = 'SELECT f.path, f.language, f.file_size, p.name as project_name FROM files f LEFT JOIN projects p ON f.project_id = p.id';
    const conditions = [];
    const params = [];

    if (language) {
      conditions.push('f.language = ?');
      params.push(language);
    }
    if (project) {
      if (!projectId) return { error: `Project not found: ${project}`, files: [] };
      conditions.push('f.project_id = ?');
      params.push(projectId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY f.path ASC LIMIT ?';
    params.push(limit);

    const results = db.prepare(sql).all(...params);

    return {
      count: results.length,
      files: results.map(f => ({
        path: f.path,
        language: f.language,
        file_size: f.file_size,
        project: f.project_name || null,
      })),
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
  addProject,
  listProjects,
  removeProject,
  searchCode,
  findSymbol,
  getFile,
  getContext,
  getStats,
  listFiles,
  getImports,
  getDependents,
};

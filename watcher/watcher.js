#!/usr/bin/env node
import chokidar from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { detectLanguage, shouldIndexFile, getFileStats, getRelativePath } from '../utils/file.js';
import { parseFile } from '../indexer/parser.js';
import { readFileContent } from '../utils/file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'code-index.db');

class FileWatcher {
  constructor(projectRoot = process.cwd(), debounceMs = 1000) {
    this.projectRoot = projectRoot;
    this.debounceMs = debounceMs;
    this.db = null;
    this.pendingUpdates = new Map();
    this.debounceTimer = null;
    this.initializeDatabase();
  }

  /**
   * Initialize database connection
   */
  initializeDatabase() {
    try {
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      console.log('✓ Connected to database at', DB_PATH);
    } catch (error) {
      console.error('✗ Failed to connect to database:', error.message);
      process.exit(1);
    }
  }

  /**
   * Index a single file
   */
  indexFile(filePath) {
    try {
      const language = detectLanguage(filePath);
      if (!shouldIndexFile(filePath)) {
        return false;
      }

      const stats = getFileStats(filePath);
      const content = readFileContent(filePath);
      const relativePath = getRelativePath(filePath, this.projectRoot);

      // Parse file to extract symbols and imports
      const { symbols, imports } = parseFile(content, filePath, language);

      // Begin transaction
      const transaction = this.db.transaction(() => {
        // Get existing file
        const existingFile = this.db.prepare('SELECT id FROM files WHERE path = ?').get(relativePath);
        let fileId;

        if (existingFile) {
          // Update existing file
          this.db.prepare(`
            UPDATE files
            SET last_modified = ?, file_size = ?, updated_at = ?
            WHERE id = ?
          `).run(stats.mtime, stats.size, Math.floor(Date.now() / 1000), existingFile.id);
          fileId = existingFile.id;

          // Delete old symbols and imports
          this.db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileId);
          this.db.prepare('DELETE FROM imports WHERE file_id = ?').run(fileId);
          // Delete from FTS index (by path)
          this.db.prepare('DELETE FROM file_index WHERE path = ?').run(relativePath);
        } else {
          // Insert new file
          const result = this.db.prepare(`
            INSERT INTO files (path, language, last_modified, file_size)
            VALUES (?, ?, ?, ?)
          `).run(relativePath, language, stats.mtime, stats.size);
          fileId = result.lastInsertRowid;
        }

        // Insert symbols
        const insertSymbol = this.db.prepare(`
          INSERT INTO symbols (file_id, name, type, line, column, scope)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const symbol of symbols) {
          insertSymbol.run(
            fileId,
            symbol.name,
            symbol.type,
            symbol.line,
            symbol.column,
            symbol.scope || null
          );
        }

        // Insert imports
        const insertImport = this.db.prepare(`
          INSERT INTO imports (file_id, import_path, import_name, import_type)
          VALUES (?, ?, ?, ?)
        `);
        for (const imp of imports) {
          insertImport.run(
            fileId,
            imp.import_path,
            imp.import_name || null,
            imp.import_type || null
          );
        }

        // Insert into FTS index
        this.db.prepare(`
          INSERT INTO file_index (content, path, file_id)
          VALUES (?, ?, ?)
        `).run(content, relativePath, fileId);
      });

      transaction();
      return true;
    } catch (error) {
      console.error(`✗ Failed to index ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Delete file from index
   */
  deleteFile(filePath) {
    try {
      const relativePath = getRelativePath(filePath, this.projectRoot);
      this.db.prepare('DELETE FROM files WHERE path = ?').run(relativePath);
      console.log(`  🗑️  Removed ${relativePath}`);
    } catch (error) {
      console.error(`✗ Failed to delete ${filePath}:`, error.message);
    }
  }

  /**
   * Schedule file update with debouncing
   */
  scheduleUpdate(filePath, action) {
    this.pendingUpdates.set(filePath, action);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingUpdates();
    }, this.debounceMs);
  }

  /**
   * Process all pending updates
   */
  processPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;

    console.log(`\n⏳ Processing ${this.pendingUpdates.size} pending update(s)...`);

    for (const [filePath, action] of this.pendingUpdates) {
      if (action === 'add' || action === 'change') {
        const indexed = this.indexFile(filePath);
        const relativePath = getRelativePath(filePath, this.projectRoot);
        if (indexed) {
          console.log(`  ✓ ${action === 'add' ? '📄' : '✏️'} ${relativePath}`);
        }
      } else if (action === 'unlink') {
        this.deleteFile(filePath);
      }
    }

    this.pendingUpdates.clear();
    console.log('✓ Updates complete\n');
  }

  /**
   * Start watching files
   */
  start() {
    const ignorePatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.venv/**',
      '**/__pycache__/**',
      '**/.pytest_cache/**',
      '**/vendor/**',
      '**/.bundle/**',
      '**/.*/**',
      '**/*.log',
    ];

    const watcher = chokidar.watch(this.projectRoot, {
      ignored: ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    watcher.on('add', filePath => {
      if (shouldIndexFile(filePath)) {
        this.scheduleUpdate(filePath, 'add');
      }
    });

    watcher.on('change', filePath => {
      if (shouldIndexFile(filePath)) {
        this.scheduleUpdate(filePath, 'change');
      }
    });

    watcher.on('unlink', filePath => {
      if (shouldIndexFile(filePath)) {
        this.scheduleUpdate(filePath, 'unlink');
      }
    });

    watcher.on('ready', () => {
      console.log('\n👀 File watcher started\n');
      console.log(`📂 Watching: ${this.projectRoot}`);
      console.log('Press Ctrl+C to stop\n');
    });

    watcher.on('error', error => {
      console.error('✗ Watcher error:', error.message);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n👋 Shutting down...');
      this.processPendingUpdates();
      watcher.close();
      this.db.close();
      process.exit(0);
    });
  }
}

// CLI entry point
function main() {
  const projectRoot = process.argv[2] || process.cwd();

  console.log(`\n🚀 Code Index - File Watcher\n`);
  console.log(`📂 Project Root: ${projectRoot}`);
  console.log(`💾 Database: ${DB_PATH}\n`);

  const watcher = new FileWatcher(projectRoot);
  watcher.start();
}

main();

export default FileWatcher;

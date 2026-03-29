#!/usr/bin/env node
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import glob from 'fast-glob';
import { detectLanguage, shouldIndexFile, shouldExcludeDirectory, readFileContent, getFileStats, getRelativePath, normalizePath } from '../utils/file.js';
import { parseFile } from './parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'code-index.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

class Indexer {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.db = null;
    this.initializeDatabase();
  }

  /**
   * Initialize database connection and schema
   */
  initializeDatabase() {
    try {
      // Create database if it doesn't exist
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 30000000000');

      // Load and execute schema
      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
      this.db.exec(schema);

      console.log('✓ Database initialized at', DB_PATH);
    } catch (error) {
      console.error('✗ Failed to initialize database:', error.message);
      process.exit(1);
    }
  }

  /**
   * Get all files to index from project root
   */
  async getFilesToIndex() {
    const patterns = [
      '**/*.js',
      '**/*.jsx',
      '**/*.ts',
      '**/*.tsx',
      '**/*.py',
      '**/*.php',
    ];

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
    ];

    try {
      const files = await glob(patterns, {
        cwd: this.projectRoot,
        ignore: ignorePatterns,
        absolute: true,
      });
      return files.filter(file => shouldIndexFile(file));
    } catch (error) {
      console.error('✗ Failed to glob files:', error.message);
      return [];
    }
  }

  /**
   * Index a single file
   */
  indexFile(filePath) {
    try {
      const language = detectLanguage(filePath);
      if (!shouldIndexFile(filePath)) {
        return null;
      }

      const stats = getFileStats(filePath);
      const content = readFileContent(filePath);
      const relativePath = getRelativePath(filePath, this.projectRoot);

      // Check if file already indexed and hasn't changed
      const existingFile = this.db.prepare('SELECT id, last_modified FROM files WHERE path = ?').get(relativePath);
      if (existingFile && existingFile.last_modified === stats.mtime) {
        return { skipped: true, path: relativePath };
      }

      // Parse file to extract symbols and imports
      const { symbols, imports } = parseFile(content, filePath, language);

      // Begin transaction
      const transaction = this.db.transaction(() => {
        // Insert or update file record
        let fileId;
        if (existingFile) {
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

      return {
        indexed: true,
        path: relativePath,
        language,
        symbols: symbols.length,
        imports: imports.length,
      };
    } catch (error) {
      console.error(`✗ Failed to index ${filePath}:`, error.message);
      return { error: error.message, path: filePath };
    }
  }

  /**
   * Index all files in project
   */
  async indexProject(verbose = false) {
    console.log('🔍 Scanning project for files...');
    const files = await this.getFilesToIndex();
    console.log(`📁 Found ${files.length} files to index`);

    const batchSize = 100;
    const results = {
      indexed: 0,
      skipped: 0,
      failed: 0,
      totalSymbols: 0,
      totalImports: 0,
    };

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      console.log(`⏳ Indexing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}`);

      for (const filePath of batch) {
        const result = this.indexFile(filePath);
        if (!result) continue;

        if (result.error) {
          results.failed++;
        } else if (result.skipped) {
          results.skipped++;
        } else {
          results.indexed++;
          results.totalSymbols += result.symbols || 0;
          results.totalImports += result.imports || 0;
          if (verbose) {
            console.log(`  ✓ ${result.path} (${result.language})`);
          }
        }
      }
    }

    // Update metadata
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      UPDATE metadata SET value = ?, updated_at = ?
      WHERE key = 'last_index_time'
    `).run(now.toString(), now);

    this.db.prepare(`
      UPDATE metadata SET value = ?, updated_at = ?
      WHERE key = 'indexed_file_count'
    `).run(results.indexed.toString(), now);

    console.log('\n📊 Indexing Summary:');
    console.log(`   Indexed: ${results.indexed}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Total Symbols: ${results.totalSymbols}`);
    console.log(`   Total Imports: ${results.totalImports}`);
    console.log(`   Database: ${DB_PATH}`);

    return results;
  }

  /**
   * Clear the entire index
   */
  clearIndex() {
    try {
      this.db.exec(`
        DELETE FROM file_index;
        DELETE FROM imports;
        DELETE FROM symbols;
        DELETE FROM files;
      `);
      console.log('✓ Index cleared');
    } catch (error) {
      console.error('✗ Failed to clear index:', error.message);
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    const fileCount = this.db.prepare('SELECT COUNT(*) as count FROM files').get().count;
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM symbols').get().count;
    const importCount = this.db.prepare('SELECT COUNT(*) as count FROM imports').get().count;

    return {
      files: fileCount,
      symbols: symbolCount,
      imports: importCount,
      databaseSize: fs.statSync(DB_PATH).size,
    };
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const projectRoot = args[0] || process.cwd();

  console.log(`\n🚀 Code Index - SQLite Indexer\n`);
  console.log(`📂 Project Root: ${projectRoot}`);
  console.log(`💾 Database: ${DB_PATH}\n`);

  const indexer = new Indexer(projectRoot);

  try {
    const command = args[1] || 'index';

    if (command === 'clear') {
      indexer.clearIndex();
    } else if (command === 'stats') {
      const stats = indexer.getStats();
      console.log('📈 Database Statistics:');
      console.log(`   Files: ${stats.files}`);
      console.log(`   Symbols: ${stats.symbols}`);
      console.log(`   Imports: ${stats.importCount}`);
      console.log(`   Size: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB`);
    } else {
      // Default: full index
      const verbose = args.includes('-v') || args.includes('--verbose');
      await indexer.indexProject(verbose);
    }
  } finally {
    indexer.close();
  }
}

main().catch(error => {
  console.error('✗ Fatal error:', error.message);
  process.exit(1);
});

export default Indexer;

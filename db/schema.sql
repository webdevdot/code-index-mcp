-- Code Index Database Schema
-- SQLite with FTS5 for full-text search

-- Files table: stores metadata about indexed files
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  language TEXT NOT NULL,
  last_modified INTEGER NOT NULL,
  file_size INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- FTS5 virtual table for full-text search of file content
CREATE VIRTUAL TABLE IF NOT EXISTS file_index USING fts5(
  content,
  path,
  file_id UNINDEXED
);

-- Symbols table: stores function, class, variable definitions
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  scope TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Imports table: stores import/require statements
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  import_path TEXT NOT NULL,
  import_name TEXT,
  import_type TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);
CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
CREATE INDEX IF NOT EXISTS idx_imports_file_id ON imports(file_id);
CREATE INDEX IF NOT EXISTS idx_imports_import_path ON imports(import_path);

-- Metadata table for tracking index state
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Initialize metadata
INSERT OR IGNORE INTO metadata (key, value) VALUES ('last_index_time', '0');
INSERT OR IGNORE INTO metadata (key, value) VALUES ('indexed_file_count', '0');
INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1');

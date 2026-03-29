import fs from 'fs';
import path from 'path';

/**
 * Detects file language based on extension
 */
export function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const extMap = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.php': 'php',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.rb': 'ruby',
    '.sh': 'bash',
    '.sql': 'sql',
    '.json': 'json',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
  };
  return extMap[ext] || 'unknown';
}

/**
 * Determines if a file should be indexed
 */
export function shouldIndexFile(filePath, supportedLanguages = ['javascript', 'typescript', 'python', 'php']) {
  const language = detectLanguage(filePath);
  return supportedLanguages.includes(language);
}

/**
 * Determines if a directory should be excluded from indexing
 */
export function shouldExcludeDirectory(dirPath) {
  const excluded = ['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__', '.pytest_cache', 'vendor', '.bundle'];
  const parts = dirPath.split(path.sep);
  return parts.some(part => excluded.includes(part)) || parts.some(part => part.startsWith('.'));
}

/**
 * Reads file content safely with encoding detection
 */
export function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Gets file stats (modification time, size)
 */
export function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return {
      mtime: Math.floor(stats.mtimeMs / 1000),
      size: stats.size,
    };
  } catch (error) {
    throw new Error(`Failed to get stats for ${filePath}: ${error.message}`);
  }
}

/**
 * Normalizes file paths for consistency
 */
export function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/');
}

/**
 * Gets relative path from project root
 */
export function getRelativePath(filePath, projectRoot) {
  const relative = path.relative(projectRoot, filePath);
  return normalizePath(relative);
}

/**
 * Extracts line and column from character position
 */
export function getLineColumn(content, position) {
  const lines = content.substring(0, position).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

/**
 * Extracts code snippet around a position
 */
export function getSnippet(content, line, contextLines = 2) {
  const lines = content.split('\n');
  const startLine = Math.max(0, line - contextLines - 1);
  const endLine = Math.min(lines.length, line + contextLines + 1);
  return lines.slice(startLine, endLine).join('\n');
}

export default {
  detectLanguage,
  shouldIndexFile,
  shouldExcludeDirectory,
  readFileContent,
  getFileStats,
  normalizePath,
  getRelativePath,
  getLineColumn,
  getSnippet,
};

/**
 * File Tools - Deterministic file operations
 * 
 * Ported from LuciferAI's file_tools.py
 * NO LLM required for any operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { minimatch } from 'minimatch';

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface FileMatch {
  path: string;
  relative: string;
  size: number;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  match: string;
}

/**
 * Expand ~ and environment variables in path
 */
function expandPath(filepath: string): string {
  if (filepath.startsWith('~')) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  
  // Replace environment variables
  return filepath.replace(/\$\{?(\w+)\}?/g, (_, varName) => {
    return process.env[varName] || '';
  });
}

/**
 * Read file contents with optional line range
 * 
 * @param filepath - Path to file
 * @param lineRange - Optional [start, end] line numbers (1-indexed)
 */
export async function readFile(
  filepath: string,
  lineRange?: [number, number]
): Promise<ToolResult> {
  try {
    const expandedPath = expandPath(filepath);
    const content = await fs.readFile(expandedPath, 'utf-8');
    const lines = content.split('\n');
    
    const selectedLines = lineRange
      ? lines.slice(lineRange[0] - 1, lineRange[1])
      : lines;
    
    return {
      success: true,
      output: selectedLines.join('\n'),
      metadata: {
        path: expandedPath,
        lineCount: selectedLines.length,
        totalLines: lines.length,
        size: Buffer.byteLength(content)
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { path: filepath }
    };
  }
}

/**
 * Write content to file, creating directories if needed
 * 
 * @param filepath - Path to file
 * @param content - Content to write
 * @param createDirs - Create parent directories if missing (default: true)
 */
export async function writeFile(
  filepath: string,
  content: string,
  createDirs: boolean = true
): Promise<ToolResult> {
  try {
    const expandedPath = expandPath(filepath);
    
    if (createDirs) {
      const dir = path.dirname(expandedPath);
      await fs.mkdir(dir, { recursive: true });
    }
    
    await fs.writeFile(expandedPath, content, 'utf-8');
    
    return {
      success: true,
      output: `Wrote ${Buffer.byteLength(content)} bytes to ${filepath}`,
      metadata: {
        path: expandedPath,
        size: Buffer.byteLength(content),
        lines: content.split('\n').length
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { path: filepath }
    };
  }
}

/**
 * Search and replace in file
 * 
 * @param filepath - Path to file
 * @param search - Text to search for (supports regex)
 * @param replace - Replacement text
 */
export async function editFile(
  filepath: string,
  search: string,
  replace: string
): Promise<ToolResult> {
  const readResult = await readFile(filepath);
  if (!readResult.success) return readResult;
  
  const content = readResult.output!;
  
  // Check if search text exists
  const searchRegex = new RegExp(search, 'g');
  const matches = content.match(searchRegex);
  
  if (!matches) {
    return {
      success: false,
      error: `Search text not found in ${filepath}`,
      metadata: { path: filepath, search }
    };
  }
  
  const newContent = content.replace(searchRegex, replace);
  const occurrences = matches.length;
  
  await fs.writeFile(expandPath(filepath), newContent, 'utf-8');
  
  return {
    success: true,
    output: `Replaced ${occurrences} occurrence(s) in ${filepath}`,
    metadata: {
      path: expandPath(filepath),
      occurrences,
      search,
      replace,
      bytesChanged: Buffer.byteLength(newContent) - Buffer.byteLength(content)
    }
  };
}

/**
 * Find files matching glob pattern
 * 
 * @param pattern - Glob pattern (e.g. "*.ts", "src/**\/*.js")
 * @param searchDir - Directory to search in (default: current directory)
 * @param maxDepth - Maximum depth to recurse (default: 10)
 */
export async function findFiles(
  pattern: string,
  searchDir: string = '.',
  maxDepth: number = 10
): Promise<ToolResult> {
  const matches: FileMatch[] = [];
  const expandedDir = expandPath(searchDir);
  
  async function walk(dir: string, depth: number = 0) {
    if (depth > maxDepth) return;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' ||
            entry.name === '__pycache__') {
          continue;
        }
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (minimatch(entry.name, pattern)) {
          const stats = await fs.stat(fullPath);
          matches.push({
            path: fullPath,
            relative: path.relative(expandedDir, fullPath),
            size: stats.size
          });
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  try {
    await walk(expandedDir);
    
    return {
      success: true,
      output: matches.map(m => m.relative).join('\n'),
      metadata: {
        pattern,
        searchDir: expandedDir,
        count: matches.length,
        matches: matches.slice(0, 100) // Limit metadata to first 100
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { pattern, searchDir }
    };
  }
}

/**
 * Search for text within files (grep-like)
 * 
 * @param query - Text to search for (supports regex)
 * @param searchPath - File or directory to search in
 * @param filePattern - Glob pattern to filter files (default: "*")
 */
export async function grepSearch(
  query: string,
  searchPath: string,
  filePattern: string = '*'
): Promise<ToolResult> {
  const matches: GrepMatch[] = [];
  const searchRegex = new RegExp(query, 'gi');
  const expandedPath = expandPath(searchPath);
  
  async function searchFile(filepath: string) {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const match = line.match(searchRegex);
        if (match) {
          matches.push({
            file: path.relative(process.cwd(), filepath),
            line: index + 1,
            content: line.trim(),
            match: match[0]
          });
        }
      });
    } catch (error) {
      // Skip files we can't read
    }
  }
  
  try {
    const stats = await fs.stat(expandedPath);
    
    if (stats.isFile()) {
      await searchFile(expandedPath);
    } else if (stats.isDirectory()) {
      // Find all files matching pattern, then search them
      const findResult = await findFiles(filePattern, expandedPath, 10);
      
      if (findResult.success && findResult.metadata?.matches) {
        for (const fileMatch of findResult.metadata.matches) {
          await searchFile(fileMatch.path);
        }
      }
    }
    
    const output = matches.map(m => 
      `${m.file}:${m.line}: ${m.content}`
    ).join('\n');
    
    return {
      success: true,
      output: output || 'No matches found',
      metadata: {
        query,
        searchPath,
        filePattern,
        count: matches.length,
        matches: matches.slice(0, 100) // Limit to first 100
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { query, searchPath }
    };
  }
}

/**
 * List directory contents
 * 
 * @param dirPath - Directory to list
 * @param showHidden - Show hidden files (default: false)
 */
export async function listDirectory(
  dirPath: string = '.',
  showHidden: boolean = false
): Promise<ToolResult> {
  try {
    const expandedPath = expandPath(dirPath);
    const entries = await fs.readdir(expandedPath, { withFileTypes: true });
    
    const filtered = showHidden 
      ? entries
      : entries.filter(e => !e.name.startsWith('.'));
    
    const items = await Promise.all(
      filtered.map(async (entry) => {
        const fullPath = path.join(expandedPath, entry.name);
        const stats = await fs.stat(fullPath);
        
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          size: stats.size,
          modified: stats.mtime
        };
      })
    );
    
    // Format output like ls
    const output = items
      .map(item => {
        const type = item.type === 'dir' ? '📁' : '📄';
        const size = item.type === 'dir' ? '-' : formatBytes(item.size);
        return `${type} ${item.name.padEnd(40)} ${size}`;
      })
      .join('\n');
    
    return {
      success: true,
      output,
      metadata: {
        path: expandedPath,
        count: items.length,
        items
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { path: dirPath }
    };
  }
}

/**
 * Move or rename file
 * 
 * @param source - Source path
 * @param destination - Destination path
 * @param overwrite - Overwrite if destination exists (default: false)
 */
export async function moveFile(
  source: string,
  destination: string,
  overwrite: boolean = false
): Promise<ToolResult> {
  try {
    const expandedSrc = expandPath(source);
    const expandedDest = expandPath(destination);
    
    // Check if destination exists
    try {
      await fs.access(expandedDest);
      if (!overwrite) {
        return {
          success: false,
          error: `Destination already exists: ${destination}`,
          metadata: { source, destination }
        };
      }
    } catch {
      // Destination doesn't exist, proceed
    }
    
    await fs.rename(expandedSrc, expandedDest);
    
    return {
      success: true,
      output: `Moved ${source} → ${destination}`,
      metadata: {
        source: expandedSrc,
        destination: expandedDest
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { source, destination }
    };
  }
}

/**
 * Copy file
 * 
 * @param source - Source path
 * @param destination - Destination path
 */
export async function copyFile(
  source: string,
  destination: string
): Promise<ToolResult> {
  try {
    const expandedSrc = expandPath(source);
    const expandedDest = expandPath(destination);
    
    await fs.copyFile(expandedSrc, expandedDest);
    
    const stats = await fs.stat(expandedDest);
    
    return {
      success: true,
      output: `Copied ${source} → ${destination} (${formatBytes(stats.size)})`,
      metadata: {
        source: expandedSrc,
        destination: expandedDest,
        size: stats.size
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { source, destination }
    };
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

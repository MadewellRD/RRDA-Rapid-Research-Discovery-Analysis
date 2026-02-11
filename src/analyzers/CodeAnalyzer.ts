import * as fs from 'fs';
import * as path from 'path';

export interface CodeAnalysis {
  languages: Record<string, number>;  // language -> lines of code
  totalLOC: number;
  fileCount: number;
  topFiles: { path: string; lines: number }[];
}

// File extension to language mapping
const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
  '.py': 'Python',
  '.java': 'Java',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++',
  '.c': 'C', '.h': 'C',
  '.swift': 'Swift',
  '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.scala': 'Scala',
  '.r': 'R', '.R': 'R',
  '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell',
  '.html': 'HTML', '.htm': 'HTML',
  '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
  '.json': 'JSON',
  '.yaml': 'YAML', '.yml': 'YAML',
  '.md': 'Markdown',
  '.xml': 'XML',
  '.proto': 'Protocol Buffers',
  '.sol': 'Solidity',
  '.zig': 'Zig',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.ex': 'Elixir', '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.ml': 'OCaml',
  '.tf': 'Terraform',
  '.cob': 'COBOL', '.cbl': 'COBOL',
  '.f90': 'Fortran', '.f': 'Fortran',
};

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', 'vendor', 'dist', 'build', 'out',
  '__pycache__', '.next', '.nuxt', 'target', 'bin', 'obj',
  'coverage', '.idea', '.vscode', 'venv', '.env', 'env',
  '.tox', 'bower_components', '.cache',
]);

export class CodeAnalyzer {
  /**
   * Analyze code in a directory - count languages and LOC
   */
  analyze(repoPath: string): CodeAnalysis {
    const languages: Record<string, number> = {};
    const files: { path: string; lines: number; lang: string }[] = [];
    let totalLOC = 0;
    let fileCount = 0;

    this.walkDir(repoPath, repoPath, (filePath, ext) => {
      const lang = EXTENSION_MAP[ext];
      if (!lang) return;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0).length;

        languages[lang] = (languages[lang] || 0) + lines;
        totalLOC += lines;
        fileCount++;

        files.push({
          path: path.relative(repoPath, filePath),
          lines,
          lang,
        });
      } catch {
        // Skip unreadable files
      }
    });

    // Sort files by line count
    files.sort((a, b) => b.lines - a.lines);

    return {
      languages,
      totalLOC,
      fileCount,
      topFiles: files.slice(0, 20).map(f => ({ path: f.path, lines: f.lines })),
    };
  }

  private walkDir(
    basePath: string,
    currentPath: string,
    callback: (filePath: string, ext: string) => void
  ): void {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          this.walkDir(basePath, fullPath, callback);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) callback(fullPath, ext);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
}

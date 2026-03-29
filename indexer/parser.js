import { parse as babelParse } from '@babel/parser';
import { getLineColumn } from '../utils/file.js';

/**
 * Parses JavaScript/TypeScript files using Babel
 */
export function parseJavaScript(content, filePath) {
  const symbols = [];
  const imports = [];

  try {
    const ast = babelParse(content, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        'typescript',
        'jsx',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'logicalAssignment',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });

    // Walk through AST
    walkAst(ast.program.body, content, symbols, imports);
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error.message);
  }

  return { symbols, imports };
}

/**
 * Recursively walks AST nodes to extract symbols
 */
function walkAst(nodes, content, symbols, imports, scope = '') {
  for (const node of nodes) {
    if (!node) continue;

    switch (node.type) {
      // Import statements
      case 'ImportDeclaration':
        imports.push({
          import_path: node.source.value,
          import_name: node.specifiers.map(s => s.local.name).join(', '),
          import_type: 'import',
        });
        break;

      // Require statements (CommonJS)
      case 'VariableDeclaration':
        node.declarations.forEach(decl => {
          if (decl.init && decl.init.type === 'CallExpression' && decl.init.callee.name === 'require' &&
              decl.init.arguments && decl.init.arguments.length > 0 && decl.init.arguments[0].value) {
            imports.push({
              import_path: decl.init.arguments[0].value,
              import_name: decl.id.name,
              import_type: 'require',
            });
          }
          if (decl.id && decl.id.name) {
            symbols.push({
              name: decl.id.name,
              type: 'variable',
              line: decl.loc?.start.line || 0,
              column: decl.loc?.start.column || 0,
              scope,
            });
          }
        });
        break;

      // Function declarations
      case 'FunctionDeclaration':
        if (node.id) {
          symbols.push({
            name: node.id.name,
            type: 'function',
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            scope,
          });
          // Walk function body for nested symbols
          if (node.body && node.body.body) {
            walkAst(node.body.body, content, symbols, imports, node.id.name);
          }
        }
        break;

      // Class declarations
      case 'ClassDeclaration':
        if (node.id) {
          symbols.push({
            name: node.id.name,
            type: 'class',
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            scope,
          });
          // Walk class methods
          if (node.body && node.body.body) {
            node.body.body.forEach(method => {
              if (method.key && method.key.name) {
                symbols.push({
                  name: method.key.name,
                  type: method.kind === 'constructor' ? 'constructor' : 'method',
                  line: method.loc?.start.line || 0,
                  column: method.loc?.start.column || 0,
                  scope: node.id.name,
                });
              }
            });
          }
        }
        break;

      // Export default (function or class)
      case 'ExportDefaultDeclaration':
        if (node.declaration) {
          if (node.declaration.id) {
            symbols.push({
              name: node.declaration.id.name,
              type: node.declaration.type === 'ClassDeclaration' ? 'class' : 'function',
              line: node.declaration.loc?.start.line || 0,
              column: node.declaration.loc?.start.column || 0,
              scope: 'export',
            });
          }
          // Walk nested content
          if (node.declaration.body && node.declaration.body.body) {
            walkAst(node.declaration.body.body, content, symbols, imports, 'export');
          }
        }
        break;

      // Named exports
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          walkAst([node.declaration], content, symbols, imports, 'export');
        }
        break;

      // Expression statements (might contain functions)
      case 'ExpressionStatement':
        if (node.expression && node.expression.type === 'AssignmentExpression') {
          const { left, right } = node.expression;
          if (left.type === 'Identifier' && (right.type === 'FunctionExpression' || right.type === 'ArrowFunctionExpression')) {
            symbols.push({
              name: left.name,
              type: 'function',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              scope,
            });
          }
        }
        break;
    }
  }
}

/**
 * Parses Python files using regex (simple pattern matching)
 */
export function parsePython(content, filePath) {
  const symbols = [];
  const imports = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) return;

    // Import statements
    const importMatch = trimmed.match(/^(?:from\s+([\w.]+)\s+)?import\s+([\w\s,*]+)/);
    if (importMatch) {
      imports.push({
        import_path: importMatch[1] || '',
        import_name: importMatch[2].trim(),
        import_type: importMatch[1] ? 'from_import' : 'import',
      });
    }

    // Function definitions
    const funcMatch = trimmed.match(/^def\s+(\w+)\s*\(/);
    if (funcMatch) {
      const col = line.indexOf('def');
      symbols.push({
        name: funcMatch[1],
        type: 'function',
        line: lineNum,
        column: col >= 0 ? col + 1 : 1,
        scope: '',
      });
    }

    // Class definitions
    const classMatch = trimmed.match(/^class\s+(\w+)\s*[\(:]/);
    if (classMatch) {
      const col = line.indexOf('class');
      symbols.push({
        name: classMatch[1],
        type: 'class',
        line: lineNum,
        column: col >= 0 ? col + 1 : 1,
        scope: '',
      });
    }

    // Variable assignments (top-level only)
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      const varMatch = trimmed.match(/^(\w+)\s*=/);
      if (varMatch && !varMatch[1].match(/^(if|for|while|with|try|except|finally)$/)) {
        const col = line.indexOf(varMatch[1]);
        symbols.push({
          name: varMatch[1],
          type: 'variable',
          line: lineNum,
          column: col >= 0 ? col + 1 : 1,
          scope: '',
        });
      }
    }
  });

  return { symbols, imports };
}

/**
 * Parses PHP files using regex
 */
export function parsePHP(content, filePath) {
  const symbols = [];
  const imports = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;

    // Include/require statements
    const requireMatch = trimmed.match(/^(?:require|include|require_once|include_once)\s+['\"]([^'"]+)['\"]/);
    if (requireMatch) {
      imports.push({
        import_path: requireMatch[1],
        import_name: '',
        import_type: 'require',
      });
    }

    // Use statements
    const useMatch = trimmed.match(/^use\s+([\w\\]+)/);
    if (useMatch) {
      imports.push({
        import_path: useMatch[1],
        import_name: useMatch[1].split('\\').pop(),
        import_type: 'use',
      });
    }

    // Function definitions
    const funcMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?function\s+(\w+)\s*\(/);
    if (funcMatch) {
      const col = line.indexOf('function');
      symbols.push({
        name: funcMatch[1],
        type: 'function',
        line: lineNum,
        column: col >= 0 ? col + 1 : 1,
        scope: '',
      });
    }

    // Class definitions
    const classMatch = trimmed.match(/^(?:abstract\s+)?class\s+(\w+)\s*(?:extends|implements|{)/);
    if (classMatch) {
      const col = line.indexOf('class');
      symbols.push({
        name: classMatch[1],
        type: 'class',
        line: lineNum,
        column: col >= 0 ? col + 1 : 1,
        scope: '',
      });
    }

    // Constant definitions
    const constMatch = trimmed.match(/^(?:const|public\s+const)\s+(\w+)\s*=/);
    if (constMatch) {
      const col = line.indexOf(constMatch[1]);
      symbols.push({
        name: constMatch[1],
        type: 'constant',
        line: lineNum,
        column: col >= 0 ? col + 1 : 1,
        scope: '',
      });
    }
  });

  return { symbols, imports };
}

/**
 * Main parser dispatcher based on file language
 */
export function parseFile(content, filePath, language) {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return parseJavaScript(content, filePath);
    case 'python':
      return parsePython(content, filePath);
    case 'php':
      return parsePHP(content, filePath);
    default:
      return { symbols: [], imports: [] };
  }
}

export default {
  parseFile,
  parseJavaScript,
  parsePython,
  parsePHP,
};

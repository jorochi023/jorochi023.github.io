#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LIKHA_ROOT = path.resolve(__dirname, '..');

/**
 * Lexical TypeScript type-stripper designed for modern erasable TypeScript:
 * Preserves object literals `{ a: 1 }` and ternaries `cond ? a : b` intact by only
 * stripping `: Type` in variable declarations, parameter lists, return types, and class fields.
 */
export function stripTypeScript(source) {
  let code = source.replace(/\r\n/g, '\n');

  // 1. Remove `import type ...` statements
  code = code.replace(/^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // 2. Remove inline `type X` specifiers inside `import { a, type B } from '...'`
  code = code.replace(/import\s*\{([^}]*)\}\s*from\s*(['"][^'"]+['"])/g, (_m, inner, mod) => {
    const kept = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !/^type\s+\w/.test(s));
    if (kept.length === 0) return '';
    return `import { ${kept.join(', ')} } from ${mod}`;
  });

  // 3. Tokenize strings/comments vs code segments so regexes/parsers never touch string/comment contents
  const tokens = tokenizeJsTs(code).map((t) =>
    t.kind === 'string' && t.text.startsWith('`') && t.text.includes('${')
      ? { kind: 'string', text: stripTemplateInterpolations(t.text) }
      : t
  );

  // 4. Strip `export interface ... { ... }` and `export type ... = ...;` on token stream
  let out = stripTypeDeclarations(tokens);

  // Re-tokenize for expression/signature level stripping
  const tok2 = tokenizeJsTs(out);
  out = stripAnnotationsAndCasts(tok2);

  return out;
}

function stripTemplateInterpolations(tpl) {
  let out = '`';
  let i = 1;
  const end = tpl.length - 1; // index of closing backtick

  while (i < end) {
    if (tpl[i] === '\\') {
      out += tpl.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (tpl[i] === '$' && tpl[i + 1] === '{') {
      const exprSlice = tpl.slice(i + 2, end);
      const innerTokens = tokenizeJsTs(exprSlice);
      let depth = 1;
      let consumed = 0;
      let foundClose = false;

      for (const tok of innerTokens) {
        if (tok.kind !== 'code') {
          consumed += tok.text.length;
          continue;
        }
        for (let k = 0; k < tok.text.length; k++) {
          const ch = tok.text[k];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              consumed += k;
              foundClose = true;
              break;
            }
          }
        }
        if (foundClose) break;
        consumed += tok.text.length;
      }

      if (foundClose) {
        const rawExpr = exprSlice.slice(0, consumed);
        out += '${' + stripTypeScript(rawExpr) + '}';
        i = i + 2 + consumed + 1;
        continue;
      }
    }
    out += tpl[i];
    i++;
  }

  out += '`';
  return out;
}

function tokenizeJsTs(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  let prevNonSpaceChar = '';

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // Line comment
    if (ch === '/' && next === '/') {
      let end = src.indexOf('\n', i + 2);
      if (end === -1) end = n;
      out.push({ kind: 'comment', text: src.slice(i, end) });
      i = end;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      let end = src.indexOf('*/', i + 2);
      end = end === -1 ? n : end + 2;
      out.push({ kind: 'comment', text: src.slice(i, end) });
      i = end;
      continue;
    }

    // Regex literal check (heuristic based on previous non-space char)
    if (
      ch === '/' &&
      next !== '/' &&
      next !== '*' &&
      '(,=:[!&|?{};\n'.includes(prevNonSpaceChar || '\n')
    ) {
      let j = i + 1;
      let inClass = false;
      let valid = true;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) {
          j++;
          while (j < n && /[a-z]/i.test(src[j])) j++;
          break;
        } else if (src[j] === '\n') {
          valid = false;
          break;
        }
        j++;
      }
      if (valid && j <= n && j > i + 1) {
        out.push({ kind: 'string', text: src.slice(i, j) });
        prevNonSpaceChar = '/';
        i = j;
        continue;
      }
    }

    // Single / Double / Template strings
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let braceDepth = 0;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (quote === '`' && src[j] === '$' && src[j + 1] === '{') {
          braceDepth++;
          j += 2;
          continue;
        }
        if (quote === '`' && braceDepth > 0) {
          if (src[j] === '{') braceDepth++;
          else if (src[j] === '}') braceDepth--;
          j++;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      out.push({ kind: 'string', text: src.slice(i, j) });
      prevNonSpaceChar = quote;
      i = j;
      continue;
    }

    // Code chunk up to next comment/string/quote/slash
    let j = i;
    while (j < n) {
      const c = src[j];
      if (c === "'" || c === '"' || c === '`' || c === '/') break;
      if (!/\s/.test(c)) prevNonSpaceChar = c;
      j++;
    }
    if (j === i) {
      // Single '/' division operator
      out.push({ kind: 'code', text: '/' });
      prevNonSpaceChar = '/';
      i++;
    } else {
      out.push({ kind: 'code', text: src.slice(i, j) });
      i = j;
    }
  }
  return out;
}

function flattenTokens(tokens) {
  return tokens.map((t) => t.text).join('');
}

function stripTypeDeclarations(tokens) {
  const full = flattenTokens(tokens);
  // Build mask of non-code regions (strings & comments) so brace scanning ignores them
  const isLit = new Uint8Array(full.length);
  let pos = 0;
  for (const t of tokens) {
    if (t.kind !== 'code') {
      isLit.fill(1, pos, pos + t.text.length);
    }
    pos += t.text.length;
  }

  let res = '';
  let i = 0;
  const n = full.length;

  while (i < n) {
    if (isLit[i]) {
      let j = i;
      while (j < n && isLit[j]) j++;
      res += full.slice(i, j);
      i = j;
      continue;
    }

    // Match line-start `[export] interface Name ... { ... }`
    const slice = full.slice(i);
    const ifaceMatch = /^(?:export\s+)?interface\s+[A-Za-z_$][\w$]*\b/.exec(slice);
    if (ifaceMatch && (i === 0 || full[i - 1] === '\n' || /\s/.test(full[i - 1]))) {
      let j = i + ifaceMatch[0].length;
      // Advance to opening `{` outside angle brackets `<...>`
      let angle = 0;
      while (j < n) {
        if (!isLit[j]) {
          if (full[j] === '<') angle++;
          else if (full[j] === '>' && angle > 0) angle--;
          else if (full[j] === '{' && angle === 0) break;
        }
        j++;
      }
      if (j < n && full[j] === '{') {
        let depth = 0;
        while (j < n) {
          if (!isLit[j]) {
            if (full[j] === '{') depth++;
            else if (full[j] === '}') {
              depth--;
              if (depth === 0) {
                j++;
                break;
              }
            }
          }
          j++;
        }
        if (full[j] === ';') j++;
        i = j;
        continue;
      }
    }

    // Match `[export] type Name ... = ...;`
    const typeMatch = /^(?:export\s+)?type\s+[A-Za-z_$][\w$]*\s*(?:<|=)/.exec(slice);
    if (typeMatch && (i === 0 || full[i - 1] === '\n' || /\s/.test(full[i - 1]))) {
      let j = i + typeMatch[0].length - 1; // Point at `<` or `=`
      let angle = 0;
      let brace = 0;
      let paren = 0;
      let bracket = 0;
      let seenEq = false;
      while (j < n) {
        if (!isLit[j]) {
          const c = full[j];
          if (!seenEq) {
            if (c === '<') angle++;
            else if (c === '>' && angle > 0) angle--;
            else if (c === '=' && angle === 0) seenEq = true;
          } else {
            if (c === '{') brace++;
            else if (c === '}' && brace > 0) brace--;
            else if (c === '(') paren++;
            else if (c === ')' && paren > 0) paren--;
            else if (c === '[') bracket++;
            else if (c === ']' && bracket > 0) bracket--;
            else if (c === '<') angle++;
            else if (c === '>' && angle > 0 && full[j - 1] !== '=') angle--;
            else if (c === ';' && brace === 0 && paren === 0 && bracket === 0) {
              j++;
              break;
            }
          }
        }
        j++;
      }
      i = j;
      continue;
    }

    res += full[i];
    i++;
  }

  return res;
}

function stripAnnotationsAndCasts(tokens) {
  const full = flattenTokens(tokens);
  const isLit = new Uint8Array(full.length);
  let pos = 0;
  for (const t of tokens) {
    if (t.kind !== 'code') isLit.fill(1, pos, pos + t.text.length);
    pos += t.text.length;
  }

  // Helper: skip a Type expression starting at index `start` (right after `:`)
  function skipTypeAnnotation(start, context) {
    let j = start;
    const n = full.length;
    let brace = 0;
    let paren = 0;
    let bracket = 0;
    let angle = 0;
    let lastTopChar = '';

    while (j < n) {
      if (isLit[j]) {
        if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) lastTopChar = '"';
        j++;
        continue;
      }
      const c = full[j];
      const next = full[j + 1];

      // Arrow type `(...) => RetType` inside a type expression: `=>` continues the type UNLESS
      // `context === 'return'` and we are at depth 0 (where `=>` is the runtime arrow body!)
      if (c === '=' && next === '>' && brace === 0 && paren === 0 && bracket === 0 && angle === 0) {
        if (context === 'return') return j;
        lastTopChar = '>';
        j += 2;
        continue;
      }

      if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) {
        if (context === 'var' && (c === '=' || c === ';' || c === ',')) return j;
        if (context === 'field' && (c === '=' || c === ';' || c === '\n')) return j;
        if (context === 'param' && (c === ',' || c === ')' || c === '=')) return j;
        if (
          context === 'return' &&
          c === '{' &&
          lastTopChar !== '' &&
          lastTopChar !== '|' &&
          lastTopChar !== '&'
        ) {
          return j;
        }
      }

      if (c === '{') brace++;
      else if (c === '}') {
        if (brace === 0) return j;
        brace--;
        if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) lastTopChar = '}';
      } else if (c === '(') paren++;
      else if (c === ')') {
        if (paren === 0) return j;
        paren--;
        if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) lastTopChar = ')';
      } else if (c === '[') bracket++;
      else if (c === ']') {
        if (bracket === 0) return j;
        bracket--;
        if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) lastTopChar = ']';
      } else if (c === '<') angle++;
      else if (c === '>' && angle > 0 && full[j - 1] !== '=') {
        angle--;
        if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) lastTopChar = '>';
      } else if (brace === 0 && paren === 0 && bracket === 0 && angle === 0 && !/\s/.test(c)) {
        lastTopChar = c;
      }

      j++;
    }
    return j;
  }

  // Helper: check if `(` at `openIdx` is a parameter list of a function/method/arrow/catch
  function findMatchingParen(openIdx) {
    let depth = 0;
    for (let k = openIdx; k < full.length; k++) {
      if (isLit[k]) continue;
      if (full[k] === '(') depth++;
      else if (full[k] === ')') {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  }

  function isFunctionParamParen(openIdx, prevWord, inClassBodyAtDepth) {
    if (['if', 'for', 'while', 'switch', 'return', 'throw', 'typeof', 'delete', 'await'].includes(prevWord)) {
      return false;
    }
    if (prevWord === 'function' || prevWord === 'constructor' || prevWord === 'catch') return true;
    const closeIdx = findMatchingParen(openIdx);
    if (closeIdx === -1) return false;

    // Look right after `)` for `=>` or `: RetType =>` or `: RetType {` or method `{`
    let k = closeIdx + 1;
    while (k < full.length && /\s/.test(full[k])) k++;
    if (full[k] === '=' && full[k + 1] === '>') return true;

    // Check what precedes `(` — if preceded by `.methodName(`, it is a call expression, never a declaration!
    let b = openIdx - 1;
    while (b >= 0 && /\s/.test(full[b])) b--;
    if (full[b] === '>') {
      let ang = 0;
      while (b >= 0) {
        if (!isLit[b]) {
          if (full[b] === '>') ang++;
          else if (full[b] === '<') {
            ang--;
            if (ang === 0) {
              b--;
              break;
            }
          }
        }
        b--;
      }
      while (b >= 0 && /\s/.test(full[b])) b--;
    }
    const idEnd = b + 1;
    while (b >= 0 && /[\w$]/.test(full[b])) b--;
    let beforeIdPos = b;
    while (beforeIdPos >= 0 && /\s/.test(full[beforeIdPos])) beforeIdPos--;
    if (beforeIdPos >= 0 && full[beforeIdPos] === '.') return false;

    const kwEnd = beforeIdPos + 1;
    while (beforeIdPos >= 0 && /[\w$]/.test(full[beforeIdPos])) beforeIdPos--;
    const beforeId = full.slice(beforeIdPos + 1, kwEnd);

    if (full[k] === ':') {
      const afterRet = skipTypeAnnotation(k + 1, 'return');
      let m = afterRet;
      while (m < full.length && /\s/.test(full[m])) m++;
      if (full[m] === '=' && full[m + 1] === '>') return true;
      if (full[m] === '{' && (beforeId === 'function' || inClassBodyAtDepth)) return true;
      return false;
    }
    if (full[k] === '{' && inClassBodyAtDepth && idEnd > kwEnd) return true;
    if (beforeId === 'function') return true;
    return false;
  }

  // Pass A: Track scopes (class body braces, param parens, var declarations) and strip `: Type`, generics `<T>`, modifiers, `!`, `as Type`
  let out = '';
  let i = 0;
  const n = full.length;
  const braceStack = []; // 'class' | 'block'
  const parenStack = []; // 'param' | 'expr'
  let pendingClassBrace = false;
  let inVarDeclHeader = false;
  let prevWord = '';

  while (i < n) {
    if (isLit[i]) {
      let j = i;
      while (j < n && isLit[j]) j++;
      out += full.slice(i, j);
      i = j;
      continue;
    }

    const ch = full[i];

    // Word scan
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && !isLit[j] && /[\w$]/.test(full[j])) j++;
      const word = full.slice(i, j);

      // Strip class member visibility/readonly modifiers inside class body
      const inClassTop = braceStack.length > 0 && braceStack[braceStack.length - 1] === 'class' && parenStack.length === 0;
      const inParam = parenStack.length > 0 && parenStack[parenStack.length - 1] === 'param';
      if ((inClassTop || inParam) && ['private', 'protected', 'public', 'readonly'].includes(word)) {
        let k = j;
        while (k < n && (full[k] === ' ' || full[k] === '\t')) k++;
        if (k > j && /[A-Za-z_$[]/.test(full[k])) {
          i = k;
          continue;
        }
      }

      // `as Type` or `satisfies Type` cast (when preceded by value token, not `import * as foo`)
      if ((word === 'as' || word === 'satisfies') && prevWord !== '*' && prevWord !== 'export' && prevWord !== 'import') {
        // Check previous non-space char in `out`
        let p = out.length - 1;
        while (p >= 0 && /\s/.test(out[p])) p--;
        const prevCh = p >= 0 ? out[p] : '';
        if (/[\w$)\]'"`}]/.test(prevCh) && !['return', 'throw', 'case', 'const', 'let', 'var'].includes(prevWord)) {
          let k = j;
          while (k < n && /\s/.test(full[k])) k++;
          // Skip cast target type until delimiter at depth 0
          let brace = 0, paren = 0, bracket = 0, angle = 0;
          while (k < n) {
            if (!isLit[k]) {
              const c = full[k];
              if (brace === 0 && paren === 0 && bracket === 0 && angle === 0) {
                if (',;)]}?:+-*/%&|^<>=\n'.includes(c)) {
                  // Allow `Type[]` or `Type<A>` or `A | B`
                  if (c === '[') { /* handled below */ }
                  else if (c === '<') { /* generic arg of type */ }
                  else if (c === '|') { k++; while (k < n && /\s/.test(full[k])) k++; continue; }
                  else break;
                }
              }
              if (c === '{') brace++;
              else if (c === '}') { if (brace === 0) break; brace--; }
              else if (c === '(') paren++;
              else if (c === ')') { if (paren === 0) break; paren--; }
              else if (c === '[') bracket++;
              else if (c === ']') { if (bracket === 0) break; bracket--; }
              else if (c === '<') angle++;
              else if (c === '>' && angle > 0) angle--;
            }
            k++;
          }
          i = k;
          continue;
        }
      }

      if (word === 'class') {
        pendingClassBrace = true;
      } else if (word === 'const' || word === 'let' || word === 'var') {
        if (parenStack.length === 0 || parenStack[parenStack.length - 1] !== 'param') {
          inVarDeclHeader = true;
        }
      }

      // Check for generic type parameters `<...>` immediately after identifier/class/function before `(` or `{` or `extends`
      let k = j;
      while (k < n && (full[k] === ' ' || full[k] === '\t')) k++;
      if (!isLit[k] && full[k] === '<') {
        let ang = 0;
        let m = k;
        let validGeneric = true;
        while (m < n) {
          if (!isLit[m]) {
            const c = full[m];
            if (c === '<') ang++;
            else if (c === '>' && full[m - 1] !== '=') {
              ang--;
              if (ang === 0) {
                m++;
                break;
              }
            } else if (c === ';' || c === '\n' && ang === 0) {
              validGeneric = false;
              break;
            }
          }
          m++;
        }
        if (validGeneric && ang === 0) {
          let after = m;
          while (after < n && /\s/.test(full[after])) after++;
          if (
            full[after] === '(' ||
            (pendingClassBrace && (full[after] === '{' || full.slice(after, after + 7) === 'extends' || full.slice(after, after + 10) === 'implements'))
          ) {
            out += word;
            prevWord = word;
            i = m;
            continue;
          }
        }
      }

      // Strip `implements Foo, Bar` in class header
      if (pendingClassBrace && word === 'implements') {
        let m = j;
        let ang = 0;
        while (m < n) {
          if (!isLit[m]) {
            if (full[m] === '<') ang++;
            else if (full[m] === '>' && ang > 0) ang--;
            else if (full[m] === '{' && ang === 0) break;
          }
          m++;
        }
        i = m;
        continue;
      }

      out += word;
      prevWord = word;
      i = j;
      continue;
    }

    // Arrow generic `<T>(x: T) => ...`
    if (ch === '<' && ['=', '(', ',', ':', 'return'].includes(prevWord || '=')) {
      let ang = 0, m = i;
      while (m < n) {
        if (!isLit[m]) {
          if (full[m] === '<') ang++;
          else if (full[m] === '>') {
            ang--;
            if (ang === 0) { m++; break; }
          } else if (full[m] === ';' || full[m] === '{') { ang = -1; break; }
        }
        m++;
      }
      if (ang === 0) {
        let after = m;
        while (after < n && /\s/.test(full[after])) after++;
        if (full[after] === '(' && isFunctionParamParen(after, '', false)) {
          i = m;
          continue;
        }
      }
    }

    // Track `{` and `}`
    if (ch === '{') {
      inVarDeclHeader = false;
      if (pendingClassBrace) {
        braceStack.push('class');
        pendingClassBrace = false;
      } else {
        braceStack.push('block');
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === '}') {
      braceStack.pop();
      out += ch;
      i++;
      continue;
    }

    // Track `(` and `)`
    if (ch === '(') {
      const inClassTop = braceStack.length > 0 && braceStack[braceStack.length - 1] === 'class' && parenStack.length === 0;
      if (isFunctionParamParen(i, prevWord, inClassTop)) {
        parenStack.push('param');
      } else {
        parenStack.push('expr');
      }
      inVarDeclHeader = false;
      out += ch;
      i++;
      continue;
    }
    if (ch === ')') {
      const popped = parenStack.pop();
      out += ch;
      i++;
      // Check for return type annotation `): ReturnType {` or `): ReturnType =>`!
      if (popped === 'param') {
        let k = i;
        while (k < n && /\s/.test(full[k])) k++;
        if (!isLit[k] && full[k] === ':') {
          const afterType = skipTypeAnnotation(k + 1, 'return');
          i = afterType;
        }
      }
      continue;
    }

    // Optional parameter or optional class property `name?: Type`
    const inParamTop = parenStack.length > 0 && parenStack[parenStack.length - 1] === 'param';
    const inClassTop = braceStack.length > 0 && braceStack[braceStack.length - 1] === 'class' && parenStack.length === 0;
    if (ch === '?' && full[i + 1] === ':' && (inParamTop || inClassTop || inVarDeclHeader)) {
      const ctx = inParamTop ? 'param' : inClassTop ? 'field' : 'var';
      i = skipTypeAnnotation(i + 2, ctx);
      continue;
    }

    // Colon `: Type` inside param list, var decl header, or class field
    if (ch === ':' && (inParamTop || inClassTop || inVarDeclHeader)) {
      const ctx = inParamTop ? 'param' : inClassTop ? 'field' : 'var';
      i = skipTypeAnnotation(i + 1, ctx);
      continue;
    }

    if ((ch === '=' && full[i + 1] !== '>') || ch === ';' || (ch === '?' && full[i + 1] !== ':')) {
      inVarDeclHeader = false;
    }

    // Non-null assertion `foo!.bar` / `foo! : bar` / `foo!)` / `foo!;`
    if (
      ch === '!' &&
      full[i + 1] !== '=' &&
      !['return', 'throw', 'case', 'typeof', 'void', 'delete', 'yield', 'await', 'new', 'of', 'in'].includes(prevWord)
    ) {
      let p = out.length - 1;
      while (p >= 0 && (out[p] === ' ' || out[p] === '\t')) p--;
      if (p >= 0 && /[\w$)\]]/.test(out[p])) {
        i++;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Bundles a TypeScript entry file and all its relative `.ts` imports into one self-contained IIFE JS bundle.
 */
export function bundleEntry(entryPath, outPath) {
  const visited = new Set();
  const orderedModules = []; // { id, absPath, code }

  function visit(absFile) {
    const norm = path.normalize(absFile);
    if (visited.has(norm)) return;
    visited.add(norm);

    const raw = fs.readFileSync(norm, 'utf-8');
    let stripped = stripTypeScript(raw);

    // Find relative imports `import ... from './foo.ts'`
    const importRe = /^\s*import\s+([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]\s*;?/gm;
    let match;
    const deps = [];
    while ((match = importRe.exec(stripped)) !== null) {
      const spec = match[2];
      let depPath = path.resolve(path.dirname(norm), spec);
      if (!fs.existsSync(depPath) && fs.existsSync(depPath + '.ts')) depPath += '.ts';
      deps.push({ fullMatch: match[0], clause: match[1].trim(), depPath: path.normalize(depPath) });
    }

    for (const d of deps) {
      visit(d.depPath);
    }

    orderedModules.push({ absPath: norm, stripped, deps });
  }

  visit(path.resolve(entryPath));

  const modIndex = new Map();
  orderedModules.forEach((m, idx) => modIndex.set(m.absPath, `__mod_${idx}`));

  const chunks = [
    '// Auto-generated by likha/scripts/build.mjs — Do not edit directly.',
    '(function () {',
    '  "use strict";',
  ];

  for (const mod of orderedModules) {
    const modVar = modIndex.get(mod.absPath);
    const relLabel = path.relative(LIKHA_ROOT, mod.absPath).replace(/\\/g, '/');
    let body = mod.stripped;

    // Rewrite imports to destructure from `__mod_N`
    for (const d of mod.deps) {
      const targetVar = modIndex.get(d.depPath);
      const clause = d.clause;
      let replacement = '';
      if (clause.startsWith('{')) {
        const destructured = clause.replace(/\s+as\s+/g, ': ');
        replacement = `const ${destructured} = ${targetVar};`;
      } else if (clause.startsWith('* as ')) {
        const ns = clause.slice(5).trim();
        replacement = `const ${ns} = ${targetVar};`;
      } else {
        replacement = `const ${clause} = ${targetVar}.default ?? ${targetVar};`;
      }
      body = body.replace(d.fullMatch, replacement);
    }

    // Collect exports
    const exportedNames = [];
    body = body.replace(/^\s*export\s+default\s+/gm, () => {
      exportedNames.push('default: __default_export');
      return 'const __default_export = ';
    });
    body = body.replace(/^\s*export\s+(const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm, (_m, kw, name) => {
      exportedNames.push(name);
      return `${kw} ${name}`;
    });
    body = body.replace(/^\s*export\s*\{([^}]*)\}\s*;?/gm, (_m, list) => {
      for (const part of list.split(',')) {
        const p = part.trim();
        if (!p) continue;
        const asM = /^(\w+)\s+as\s+(\w+)$/.exec(p);
        if (asM) exportedNames.push(`${asM[2]}: ${asM[1]}`);
        else exportedNames.push(p);
      }
      return '';
    });

    chunks.push(`  // --- Module: ${relLabel} ---`);
    chunks.push(`  const ${modVar} = (() => {`);
    chunks.push(body);
    chunks.push(`    return { ${exportedNames.join(', ')} };`);
    chunks.push(`  })();`);
  }

  chunks.push('})();');
  const finalJs = chunks.join('\n') + '\n';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, finalJs, 'utf-8');
  return finalJs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gameEntry = path.join(LIKHA_ROOT, 'src', 'main.ts');
  const wikiEntry = path.join(LIKHA_ROOT, 'src', 'wikiMain.ts');
  if (fs.existsSync(gameEntry)) {
    bundleEntry(gameEntry, path.join(LIKHA_ROOT, 'dist', 'likha-game.js'));
    console.log('Built dist/likha-game.js');
  }
  if (fs.existsSync(wikiEntry)) {
    bundleEntry(wikiEntry, path.join(LIKHA_ROOT, 'dist', 'likha-wiki.js'));
    console.log('Built dist/likha-wiki.js');
  }
}

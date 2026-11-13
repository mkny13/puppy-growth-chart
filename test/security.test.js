import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Helper to get tracked files using git ls-files
function getTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// Extracts hostname from an http(s) URL string
function extractHost(urlStr) {
  const match = urlStr.match(/^https?:\/\/([^/:\s'"`]+)/);
  return match ? match[1] : null;
}

describe('security and surface area audit (issue #70)', () => {
  const trackedFiles = getTrackedFiles();

  it('(a) no tracked path matches (^|/)\\.env', () => {
    const envPaths = trackedFiles.filter((path) => /(^|\/)\.env/.test(path));
    expect(envPaths, `Found tracked .env files: ${envPaths.join(', ')}`).toEqual([]);
  });

  it('(b) no tracked file outside package-lock.json and data/ contains ghp_, github_pat_ or GITHUB_TOKEN=', () => {
    // Break up pattern strings so this test file itself does not match
    const tokenPatterns = ['gh' + 'p_', 'github_' + 'pat_', 'GITHUB_' + 'TOKEN='];
    // Exclude package-lock.json, data/ directory, and files documenting/testing these patterns
    const filesToCheck = trackedFiles.filter(
      (path) =>
        path !== 'package-lock.json' &&
        !path.startsWith('data/') &&
        path !== 'SECURITY.md' &&
        path !== 'test/security.test.js'
    );

    const matches = [];
    for (const file of filesToCheck) {
      const fullPath = resolve(repoRoot, file);
      const content = readFileSync(fullPath, 'utf8');
      for (const pattern of tokenPatterns) {
        if (content.includes(pattern)) {
          matches.push({ file, pattern });
        }
      }
    }
    expect(matches, `Found credential patterns in tracked files: ${JSON.stringify(matches)}`).toEqual([]);
  });

  it('(c) no file under src/ or worker/src/ contains child_process, execSync, spawn( or exec(', () => {
    const runtimeFiles = trackedFiles.filter(
      (path) => path.startsWith('src/') || path.startsWith('worker/src/')
    );
    const forbiddenPatterns = ['child_process', 'execSync', 'spawn(', 'exec('];
    const matches = [];

    for (const file of runtimeFiles) {
      const fullPath = resolve(repoRoot, file);
      const content = readFileSync(fullPath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          matches.push({ file, pattern });
        }
      }
    }
    expect(matches, `Found forbidden subprocess patterns in runtime code: ${JSON.stringify(matches)}`).toEqual([]);
  });

  it('(d) no file under src/ contains dangerouslySetInnerHTML, innerHTML, eval( or new Function', () => {
    const srcFiles = trackedFiles.filter((path) => path.startsWith('src/'));
    const xssSinks = ['dangerouslySetInnerHTML', 'innerHTML', 'eval(', 'new Function'];
    const matches = [];

    for (const file of srcFiles) {
      const fullPath = resolve(repoRoot, file);
      const content = readFileSync(fullPath, 'utf8');
      for (const sink of xssSinks) {
        if (content.includes(sink)) {
          matches.push({ file, sink });
        }
      }
    }
    expect(matches, `Found XSS sinks in src/: ${JSON.stringify(matches)}`).toEqual([]);
  });

  it('(e) every http(s):// host literal in src/, worker/src/, index.html and scripts/ is in the allow-list', () => {
    const targetFiles = trackedFiles.filter(
      (path) =>
        path.startsWith('src/') ||
        path.startsWith('worker/src/') ||
        path === 'index.html' ||
        path.startsWith('scripts/')
    );

    const allowedHosts = new Set([
      'puppy-growth-sync.mkastellec.workers.dev',
      'api.github.com',
      'mkny13.github.io',
      'localhost',
      '127.0.0.1',
    ]);

    const urlRegex = /https?:\/\/[A-Za-z0-9_.:-]+/g;
    const unallowed = [];

    for (const file of targetFiles) {
      const fullPath = resolve(repoRoot, file);
      const content = readFileSync(fullPath, 'utf8');
      const urlMatches = content.match(urlRegex) || [];
      for (const urlStr of urlMatches) {
        const host = extractHost(urlStr);
        if (host && !allowedHosts.has(host)) {
          unallowed.push({ file, url: urlStr, host });
        }
      }
    }

    expect(unallowed, `Found unallowed host literals: ${JSON.stringify(unallowed)}`).toEqual([]);
  });

  it('(f) .github/workflows/ci.yml contains a run step matching npm audit --audit-level=high', () => {
    const ciPath = resolve(repoRoot, '.github/workflows/ci.yml');
    const content = readFileSync(ciPath, 'utf8');
    const runAuditRegex = /(?:^|\n)\s*-\s*run:\s*npm audit --audit-level=high\b/;
    expect(content).toMatch(runAuditRegex);
  });

  it('(g) every subprocess.run( call in .claude/hooks/*.py has no shell=True', () => {
    const hooksDir = resolve(repoRoot, '.claude/hooks');
    const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith('.py'));
    expect(hookFiles.length).toBeGreaterThan(0);

    const shellTrueCalls = [];

    for (const hookFile of hookFiles) {
      const fullPath = resolve(hooksDir, hookFile);
      const content = readFileSync(fullPath, 'utf8');

      const runCalls = [...content.matchAll(/subprocess\.run\s*\(([\s\S]*?)\)/g)];
      expect(runCalls.length, `Expected subprocess.run calls in ${hookFile}`).toBeGreaterThan(0);

      for (const match of runCalls) {
        const argsStr = match[1];
        if (/\bshell\s*=\s*True\b/.test(argsStr)) {
          shellTrueCalls.push({ hookFile, call: match[0] });
        }
      }
    }

    expect(shellTrueCalls, `Found shell=True in subprocess.run: ${JSON.stringify(shellTrueCalls)}`).toEqual([]);
  });

  describe('negative and abuse tests for security boundaries', () => {
    it('detects forbidden .env paths', () => {
      const samplePaths = ['.env', 'src/.env', '.env.local', 'safe/path.js', 'nested/dir/.env.prod'];
      const matched = samplePaths.filter((path) => /(^|\/)\.env/.test(path));
      expect(matched).toEqual(['.env', 'src/.env', '.env.local', 'nested/dir/.env.prod']);
    });

    it('detects forbidden credential patterns in arbitrary content', () => {
      const tokenPatterns = ['gh' + 'p_', 'github_' + 'pat_', 'GITHUB_' + 'TOKEN='];
      const samples = [
        'export const key = "gh' + 'p_abcdef123456";',
        'export const pat = "github_' + 'pat_987654321";',
        'GITHUB_' + 'TOKEN=123456',
        'const safe = "regular_identifier";',
      ];
      const detected = samples.filter((s) => tokenPatterns.some((pattern) => s.includes(pattern)));
      expect(detected).toHaveLength(3);
    });

    it('detects forbidden subprocess invocations in code', () => {
      const forbiddenPatterns = ['child_process', 'execSync', 'spawn(', 'exec('];
      const snippets = [
        'import { execSync } from "node:child_process";',
        'const { spawn } = require("child_process");',
        'spawn("sh", ["-c", "cmd"])',
        'exec("rm -rf /")',
        'const clean = { name: "test" };',
      ];
      const detected = snippets.filter((s) => forbiddenPatterns.some((pattern) => s.includes(pattern)));
      expect(detected).toHaveLength(4);
    });

    it('detects forbidden XSS sinks in code', () => {
      const xssSinks = ['dangerouslySetInnerHTML', 'innerHTML', 'eval(', 'new Function'];
      const snippets = [
        '<div dangerouslySetInnerHTML={{ __html: raw }} />',
        'elem.innerHTML = userInput;',
        'const res = eval("2 + 2");',
        'const fn = new Function("a", "return a;");',
        'const clean = <div>{escaped}</div>;',
      ];
      const detected = snippets.filter((s) => xssSinks.some((sink) => s.includes(sink)));
      expect(detected).toHaveLength(4);
    });

    it('detects unallowed host literals in URL strings', () => {
      const allowedHosts = new Set([
        'puppy-growth-sync.mkastellec.workers.dev',
        'api.github.com',
        'mkny13.github.io',
        'localhost',
        '127.0.0.1',
      ]);
      const urls = [
        'https://puppy-growth-sync.mkastellec.workers.dev/api/data',
        'https://api.github.com/repos/mkny13/puppy-growth-chart',
        'https://malicious.example.com/steal',
        'http://untrusted-host.org',
      ];
      const unallowed = urls.filter((u) => {
        const host = extractHost(u);
        return !host || !allowedHosts.has(host);
      });
      expect(unallowed).toEqual([
        'https://malicious.example.com/steal',
        'http://untrusted-host.org',
      ]);
    });

    it('detects shell=True in subprocess.run argument strings', () => {
      const callArgs = [
        'cmd, capture_output=True, text=True, cwd=cwd, timeout=5',
        '["sh", "-c", cmd], shell=True',
        'cmd, shell = True, timeout=10',
      ];
      const unsafe = callArgs.filter((args) => /\bshell\s*=\s*True\b/.test(args));
      expect(unsafe).toEqual([
        '["sh", "-c", cmd], shell=True',
        'cmd, shell = True, timeout=10',
      ]);
    });
  });
});

/* global console, fetch */
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';

export const PUBLIC_CONTENTS_URL =
  'https://api.github.com/repos/mkny13/puppy-growth-chart/contents/data/weights.json?ref=main';

/**
 * Validates actual GitHub Contents API response against fixture shape.
 * Returns an array of keys that are missing or have a different JSON type,
 * or where encoding / content fails validation.
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} fixture
 * @returns {string[]} list of mismatched key names
 */
export function checkShape(actual, fixture) {
  const mismatches = [];

  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
    return Object.keys(fixture);
  }

  for (const key of Object.keys(fixture)) {
    if (!(key in actual)) {
      mismatches.push(key);
      continue;
    }

    const actualVal = actual[key];
    const fixtureVal = fixture[key];

    if (fixtureVal === null) {
      if (actualVal !== null) mismatches.push(key);
    } else if (Array.isArray(fixtureVal)) {
      if (!Array.isArray(actualVal)) mismatches.push(key);
    } else if (typeof actualVal !== typeof fixtureVal || actualVal === null) {
      mismatches.push(key);
    }
  }

  if (!mismatches.includes('encoding') && actual.encoding !== 'base64') {
    mismatches.push('encoding');
  }

  if (!mismatches.includes('content')) {
    if (typeof actual.content !== 'string') {
      mismatches.push('content');
    } else {
      try {
        const decoded = Buffer.from(actual.content.replace(/\s/g, ''), 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
          mismatches.push('content');
        }
      } catch {
        mismatches.push('content');
      }
    }
  }

  return mismatches;
}

export async function run() {
  const fixtureUrl = new URL('../test/fixtures/github-contents-get.json', import.meta.url);
  const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));

  console.log(`Checking upstream contract at ${PUBLIC_CONTENTS_URL}...`);
  const res = await fetch(PUBLIC_CONTENTS_URL, {
    headers: {
      'User-Agent': 'puppy-growth-chart-contract-check',
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    console.error(`Upstream request failed: HTTP ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }

  const actual = await res.json();
  const mismatches = checkShape(actual, fixture);

  if (mismatches.length > 0) {
    console.error(`Upstream contract check failed! Mismatched keys: ${mismatches.join(', ')}`);
    process.exit(1);
  }

  console.log('Upstream contract shape check passed successfully.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error('Fatal error during upstream contract check:', err);
    process.exit(1);
  });
}

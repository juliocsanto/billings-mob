// Prints the Supabase session JSON for a [TEST] user, in the exact shape the
// supabase-js client persists under the localStorage key
// `sb-gcwxwrjzbbqkuzcweyut-auth-token`. Used by the UI-audit Playwright scripts
// to inject an authenticated session via addInitScript.
//
// Usage:
//   node scripts/get-test-session.mjs aluna
//   node scripts/get-test-session.mjs instrutora
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local and the
// password from scripts/.test-credentials.env (gitignored).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = parseEnv(join(root, '.env.local'));
const creds = parseEnv(join(root, 'scripts', '.test-credentials.env'));

const who = process.argv[2];
const email =
  who === 'aluna' ? creds.TEST_ALUNA_EMAIL :
  who === 'instrutora' ? creds.TEST_INSTRUTORA_EMAIL : null;
if (!email) {
  console.error('Usage: node scripts/get-test-session.mjs <aluna|instrutora>');
  process.exit(1);
}

const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password: creds.TEST_USER_PASSWORD }),
});

if (!res.ok) {
  console.error(`Sign-in failed (${res.status}):`, await res.text());
  process.exit(1);
}

// supabase-js stores the full session object (access_token, refresh_token,
// expires_at, user, ...) — the token endpoint response already matches it.
const session = await res.json();
session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
process.stdout.write(JSON.stringify(session));

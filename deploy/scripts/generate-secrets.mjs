#!/usr/bin/env node
// Generate deploy/.env.prod from env.prod.example on first run.
//
//   node deploy/scripts/generate-secrets.mjs          # create .env.prod
//   node deploy/scripts/generate-secrets.mjs --force  # regenerate (destroys edits)
//
// The generated file is chmod 600. Keep it out of git; deploy/.gitignore does.
// Secrets are local random values, not derived from the domain or a password.
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deployDir = join(here, "..");
const templatePath = join(deployDir, "env.prod.example");
const envPath = join(deployDir, ".env.prod");

const force = process.argv.includes("--force");
if (existsSync(envPath) && !force) {
  console.error(`${envPath} already exists. Use --force only if you intend to replace it.`);
  process.exit(1);
}
if (!existsSync(templatePath)) {
  console.error(`Missing ${templatePath}.`);
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
// Ten years: long enough that rotating the signing key is a deliberate act.
const expires = now + 10 * 365 * 24 * 60 * 60;

const hex = (bytes) => randomBytes(bytes).toString("hex");
const password = () => randomBytes(32).toString("base64url");

const jwtSecret = hex(32);

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

// PostgREST and the backend read the JWT's role claim. The service key uses
// service_role, which has BYPASSRLS in the Supabase Postgres image. The
// container's postgres superuser runs schema.sql/migrations.
const anonKey = signJwt({ role: "anon", iss: "supabase", iat: now, exp: expires });
const serviceKey = signJwt({
  role: "service_role",
  iss: "supabase",
  iat: now,
  exp: expires,
});

const replacements = {
  __JWT_SECRET__: jwtSecret,
  __ANON_KEY__: anonKey,
  __SERVICE_KEY__: serviceKey,
  __POSTGRES_PASSWORD__: password(),
  __AUTH_ADMIN_PASSWORD__: password(),
  __AUTHENTICATOR_PASSWORD__: password(),
  __REDIS_PASSWORD__: password(),
  __DOWNLOAD_SECRET__: hex(32),
  __USER_KEYS_SECRET__: hex(32),
};

let env = readFileSync(templatePath, "utf8");
for (const [placeholder, value] of Object.entries(replacements)) {
  env = env.split(placeholder).join(value);
}

const remaining = env.match(/__[A-Z0-9_]+__/g);
if (remaining) {
  console.error(`Template still contains placeholders: ${[...new Set(remaining)].join(", ")}`);
  process.exit(1);
}

writeFileSync(envPath, env, { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log(`Wrote ${envPath} (mode 600).`);
console.log("Next: fill in OSS_*, SMTP_*, DEEPSEEK_API_KEY, then run deploy/scripts/compose.sh config -q.");

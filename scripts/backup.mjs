/**
 * Backup script — downloads all data from Upstash Redis KV and saves locally.
 * Usage: node scripts/backup.mjs
 * 
 * Requires env vars: KV_REST_API_URL, KV_REST_API_TOKEN
 * (reads from .env.local automatically via dotenv)
 */

import { resolve, dirname } from "path";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manual .env.local parser (no dotenv dependency needed)
try {
  const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env.local not found, rely on existing env */ }

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  console.error("❌ Missing KV_REST_API_URL or KV_REST_API_TOKEN in .env.local");
  process.exit(1);
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? [];
}

async function main() {
  console.log("📦 Downloading all data from Upstash Redis...\n");

  const keys = ["prospects", "deals", "persons", "orgs", "activities", "notes"];
  const backup = { timestamp: new Date().toISOString(), counts: {}, data: {} };

  for (const key of keys) {
    const data = await kvGet(key);
    const arr = Array.isArray(data) ? data : (typeof data === "string" ? JSON.parse(data) : []);
    backup.data[key] = arr;
    backup.counts[key] = arr.length;
    console.log(`  ✅ ${key}: ${arr.length} items`);
  }

  // Save to backups/ folder
  const backupDir = resolve(__dirname, "../backups");
  mkdirSync(backupDir, { recursive: true });
  
  const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${date}.json`;
  const filepath = resolve(backupDir, filename);

  writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf-8");
  console.log(`\n💾 Backup saved to: ${filepath}`);
  console.log(`\n📊 Summary:`);
  for (const [k, v] of Object.entries(backup.counts)) {
    console.log(`   ${k}: ${v}`);
  }
}

main().catch((err) => {
  console.error("❌ Backup failed:", err);
  process.exit(1);
});

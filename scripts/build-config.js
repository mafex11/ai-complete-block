#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function parseCsv(envValue) {
  return (envValue || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  keywords: parseCsv(process.env.AI_BLOCK_KEYWORDS),
  domains: parseCsv(process.env.AI_BLOCK_DOMAINS),
  whitelist: parseCsv(process.env.AI_BLOCK_WHITELIST)
};

const outDir = path.resolve(__dirname, '..', 'extension', 'config');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
// Merge optional static rules
const rulesPath = path.resolve(__dirname, '..', 'extension', 'config', 'rules.json');
let rules = {};
if (fs.existsSync(rulesPath)) {
  try {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  } catch (_) {}
}

fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify({ ...config, rules }, null, 2));
console.log('[AI Blocker] Wrote config/config.json');



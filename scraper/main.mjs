// JobRadar scraper orchestrator — Node 18+ (native fetch), no deps.
// Run: node scraper/main.mjs   → writes public/jobs.json
import { fetchWorkday } from './adapters/workday.mjs';
import * as sites from './adapters/custom-sites.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync(new URL('./companies.json', import.meta.url), 'utf8'));
const MAX_AGE = 14 * 864e5;

const results = await Promise.allSettled([
  ...registry.workday.map(c => fetchWorkday(c)),
  sites.microsoft(), sites.amazon(), sites.netflix(),
  sites.tesla(), sites.uber(), sites.google(), sites.apple()
]);

const jobs = [];
const seen = new Set();
for (const r of results) {
  if (r.status === 'rejected') { console.error('adapter failed:', r.reason?.message); continue; }
  for (const j of r.value) {
    const posted = typeof j.posted === 'number' ? j.posted : Date.parse(j.posted);
    if (!j.title || !j.url || Date.now() - posted > MAX_AGE) continue;
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    jobs.push({ ...j, posted });
  }
}
jobs.sort((a, b) => b.posted - a.posted);

mkdirSync('public', { recursive: true });
writeFileSync('public/jobs.json', JSON.stringify({ generatedAt: Date.now(), jobs }, null, 1));
console.log(`wrote ${jobs.length} jobs from ${results.filter(r => r.status === 'fulfilled').length} adapters`);

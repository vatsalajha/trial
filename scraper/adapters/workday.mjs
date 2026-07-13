// Workday adapter — WORKING as of mid-2026. Public unauthenticated JSON endpoint
// used by every Workday career site ("cxs" API). Server-side only (no CORS).
const UA = 'Mozilla/5.0 (compatible; JobRadar/1.0)';

export async function fetchWorkday({ tenant, host, site, company }) {
  const base = `https://${tenant}.${host}.myworkdayjobs.com`;
  const jobs = [];
  for (let offset = 0; offset < 100; offset += 20) { // newest 100 is plenty
    const r = await fetch(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: 'software engineer' })
    });
    if (!r.ok) throw new Error(`Workday ${company}: HTTP ${r.status}`);
    const data = await r.json();
    const batch = data.jobPostings || [];
    for (const p of batch) {
      if (!p.title) continue;
      jobs.push({
        id: `workday:${tenant}:${p.bulletFields?.[0] || p.externalPath}`,
        title: p.title,
        company,
        location: p.locationsText || '',
        // externalPath is like "/job/US-CA-Santa-Clara/Title_JR123"
        url: `${base}/en-US/${site}${p.externalPath || ''}`,
        posted: parsePostedOn(p.postedOn),
        description: '', // optional: GET `${base}/wday/cxs/${tenant}/${site}${p.externalPath}` → jobPostingInfo.jobDescription (HTML)
        remote: /remote/i.test(p.locationsText || '')
      });
    }
    if (batch.length < 20) break;
  }
  return jobs;
}

// Workday only gives fuzzy recency text — good enough for a freshness feed.
function parsePostedOn(s = '') {
  const now = Date.now(), day = 864e5;
  if (/today/i.test(s)) return now;
  if (/yesterday/i.test(s)) return now - day;
  const m = s.match(/(\d+)\+?\s*days?/i);
  if (m) return now - Number(m[1]) * day;
  return now - 30 * day; // "30+ days ago" → will be filtered out
}

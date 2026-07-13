// Proprietary career-site adapters. Endpoints marked VERIFY were correct at last
// check but drift — smoke-test each, fix shapes, don't rewrite the approach.
// All are public, keyless endpoints the career pages themselves call via XHR.
const UA = 'Mozilla/5.0 (compatible; JobRadar/1.0)';
const get = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { 'user-agent': UA, accept: 'application/json', ...opts.headers } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

// VERIFY — Microsoft Global Career Site search API (JSON, public)
export async function microsoft() {
  const d = await get('https://gcsservices.careers.microsoft.com/search/api/v1/search?q=software%20engineer&lc=United%20States&pg=1&pgSz=50&o=Recent&flt=true');
  return (d.operationResult?.result?.jobs || []).map(j => ({
    id: `msft:${j.jobId}`, title: j.title, company: 'Microsoft',
    location: (j.properties?.locations || []).join(' / '),
    url: `https://jobs.careers.microsoft.com/global/en/job/${j.jobId}`,
    posted: j.postingDate || j.properties?.postingDate, description: j.properties?.description || ''
  }));
}

// VERIFY — Amazon.jobs public search JSON
export async function amazon() {
  const d = await get('https://www.amazon.jobs/en/search.json?base_query=software%20engineer&country=USA&sort=recent&result_limit=50&offset=0');
  return (d.jobs || []).map(j => ({
    id: `amzn:${j.id_icims}`, title: j.title, company: 'Amazon',
    location: j.location || j.normalized_location,
    url: `https://www.amazon.jobs${j.job_path}`,
    posted: j.posted_date, description: j.description_short || ''
  }));
}

// VERIFY — Netflix runs on Eightfold; public positions API
export async function netflix() {
  const d = await get('https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com&start=0&num=50&sort_by=timestamp');
  return (d.positions || []).map(j => ({
    id: `nflx:${j.id}`, title: j.name, company: 'Netflix',
    location: j.location || (j.locations || []).join(' / '),
    url: j.canonicalPositionUrl || `https://explore.jobs.netflix.net/careers?pid=${j.id}`,
    posted: (j.t_create || 0) * 1000, description: (j.job_description || '').slice(0, 1000)
  }));
}

// VERIFY — Tesla ships its whole board as one JSON state blob
export async function tesla() {
  const d = await get('https://www.tesla.com/cua-api/apps/careers/state');
  const lookup = d.geo || {}; // location id → name map lives alongside listings
  return (d.listings || []).filter(j => /software|engineer|ai /i.test(j.t)).slice(0, 200).map(j => ({
    id: `tsla:${j.id}`, title: j.t, company: 'Tesla',
    location: String(j.l ?? ''), // resolve via lookup tables in the blob
    url: `https://www.tesla.com/careers/search/job/${j.id}`,
    posted: Date.now(), description: '' // Tesla omits post dates — treat as fresh, dedupe by id across runs
  }));
}

// VERIFY — Uber careers internal API (needs dummy csrf header)
export async function uber() {
  const d = await get('https://www.uber.com/api/loadSearchJobsResults?localeCode=en', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'x' },
    body: JSON.stringify({ params: { department: ['Engineering'], location: [{ country: 'USA' }] }, limit: 50, page: 0 })
  });
  return (d.data?.results || []).map(j => ({
    id: `uber:${j.id}`, title: j.title, company: 'Uber',
    location: (j.allLocations || []).map(l => `${l.city}, ${l.region}`).join(' / '),
    url: `https://www.uber.com/global/en/careers/list/${j.id}/`,
    posted: j.creationDate, description: (j.description || '').slice(0, 1000)
  }));
}

// VERIFY — Google careers search API; if blocked, fall back to Playwright XHR intercept
export async function google() {
  const d = await get('https://careers.google.com/api/v3/search/?q=software%20engineer&location=United%20States&sort_by=date&page_size=50');
  return (d.jobs || []).map(j => ({
    id: `goog:${j.id}`, title: j.title, company: 'Google',
    location: (j.locations || []).map(l => l.display).join(' / '),
    url: j.apply_url || `https://careers.google.com/jobs/results/${String(j.id).replace(/\D/g, '')}`,
    posted: j.publish_date, description: (j.description || '').slice(0, 1000)
  }));
}

// VERIFY — Apple jobs search API (POST)
export async function apple() {
  const d = await get('https://jobs.apple.com/api/role/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'software engineer', filters: { postLocation: ['postLocation-USA'] }, page: 1, locale: 'en-us', sort: 'newest' })
  });
  return (d.searchResults || []).map(j => ({
    id: `aapl:${j.positionId}`, title: j.postingTitle, company: 'Apple',
    location: (j.locations || []).map(l => l.name).join(' / '),
    url: `https://jobs.apple.com/en-us/details/${j.positionId}`,
    posted: j.postingDate, description: (j.jobSummary || '').slice(0, 1000)
  }));
}

// Meta + iCIMS tenants: no stable public JSON. Use Playwright — load the careers
// search page headless, intercept the XHR/GraphQL response the page itself makes,
// and map it to the schema above. Keep these two isolated so a breakage there
// never blocks the plain-fetch adapters.

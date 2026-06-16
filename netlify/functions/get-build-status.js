'use strict';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function out(code, data) { return { statusCode: code, headers: CORS, body: JSON.stringify(data) }; }
function parse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
function id(v) { return String(v || '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 100); }
function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  return { url, key };
}
function headers(key) { return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }; }

exports.handler = async function(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return out(405, { success: false, error: 'Method not allowed' });

    const q = event.queryStringParameters || {};
    const b = event.httpMethod === 'POST' ? parse(event.body) : {};
    const jobId = id(q.jobId || q.buildId || q.siteId || q.id || b.jobId || b.buildId || b.siteId || b.id);
    if (!jobId) return out(400, { success: false, error: 'Missing jobId' });

    const cfg = env();
    const r = await fetch(cfg.url + '/rest/v1/sites?id=eq.' + encodeURIComponent(jobId) + '&select=*', { headers: headers(cfg.key) });
    if (!r.ok) throw new Error('Status read failed HTTP ' + r.status + ': ' + (await r.text()).slice(0, 240));

    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return out(404, { success: false, jobId, buildId: jobId, status: 'missing', stage: 'missing', progress: 0, message: 'Build job was not found.' });

    const d = row.site_data || {};
    const status = d.status || (row.site_status === 'build_complete' ? 'completed' : row.site_status === 'build_failed' ? 'failed' : row.site_status === 'build_running' ? 'running' : 'queued');
    const html = row.built_html || d.html || '';
    return out(200, {
      success: true,
      jobId,
      buildId: jobId,
      siteId: jobId,
      status,
      stage: d.stage || status,
      progress: d.progress || (status === 'completed' ? 100 : status === 'running' ? 40 : 5),
      message: d.message || row.site_status || 'Build status loaded.',
      html,
      builtHtml: html,
      websiteHtml: html,
      templates: html ? [html] : [],
      brief: d.brief || null,
      quality: d.quality || null,
      siteData: d.siteData || d,
      meta: d.meta || null,
      source: d.source || row.source || 'ai4-supabase-async-build'
    });
  } catch (e) {
    console.error('get-build-status failed:', e && e.stack ? e.stack : e);
    return out(500, { success: false, status: 'error', stage: 'status-error', progress: 0, error: 'Unable to read build status', detail: String(e && e.message ? e.message : e).slice(0, 700) });
  }
};

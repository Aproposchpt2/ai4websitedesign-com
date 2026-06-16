'use strict';

process.env.AI4_AI_TIMEOUT_MS = process.env.AI4_BACKGROUND_AI_TIMEOUT_MS || process.env.AI4_AI_TIMEOUT_MS || '90000';
process.env.AI4_PLATINUM_MAX_TOKENS = process.env.AI4_BACKGROUND_MAX_TOKENS || process.env.AI4_PLATINUM_MAX_TOKENS || '7600';

const generator = require('./generate-website');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
function headers(key, prefer) { return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: prefer || 'return=minimal' }; }
async function readJob(jobId) {
  const cfg = env();
  const r = await fetch(cfg.url + '/rest/v1/sites?id=eq.' + encodeURIComponent(jobId) + '&select=*', { headers: headers(cfg.key) });
  if (!r.ok) throw new Error('Job read failed HTTP ' + r.status + ': ' + (await r.text()).slice(0, 240));
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}
async function patchJob(jobId, patch) {
  const cfg = env();
  const current = await readJob(jobId).catch(function(){ return null; });
  const existingData = current && current.site_data && typeof current.site_data === 'object' ? current.site_data : {};
  const nextData = Object.assign({}, existingData, patch.site_data || {}, { updatedAt: new Date().toISOString(), jobId, buildId: jobId });
  const body = Object.assign({}, patch, { site_data: nextData, updated_at: new Date().toISOString() });
  const r = await fetch(cfg.url + '/rest/v1/sites?id=eq.' + encodeURIComponent(jobId), { method: 'PATCH', headers: headers(cfg.key), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Job update failed HTTP ' + r.status + ': ' + (await r.text()).slice(0, 240));
}
async function runGenerator(payload) {
  const result = await generator.handler({ httpMethod: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) });
  let body = {};
  try { body = JSON.parse(result.body || '{}'); } catch { body = { success: false, error: 'Generator returned invalid JSON' }; }
  if (result.statusCode >= 400 || body.success === false) throw new Error(body.error || body.detail || ('Generator failed HTTP ' + result.statusCode));
  return body;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { success: false, error: 'Method not allowed' });

  const body = parse(event.body);
  const jobId = id(body.jobId || body.buildId || body.siteId);
  if (!jobId) return out(400, { success: false, error: 'Missing jobId' });

  try {
    const row = await readJob(jobId);
    const data = (row && row.site_data) || {};
    const payload = body.payload || (data.payload || {});
    if (!payload.requestId) payload.requestId = jobId;

    await patchJob(jobId, { site_status: 'build_running', site_data: { status: 'running', stage: 'creative-brief', progress: 18, message: 'Building the Platinum Creative Brief.', payload } });
    await patchJob(jobId, { site_status: 'build_running', site_data: { status: 'running', stage: 'platinum-agent-call', progress: 36, message: 'Calling the Platinum AI Agent in the background.', payload } });

    const generated = await runGenerator(payload);
    const html = generated.html || generated.builtHtml || generated.websiteHtml || '';
    const quality = generated.quality || { score: 0, status: 'Unknown', flags: ['No quality data returned'] };

    await patchJob(jobId, { site_status: 'build_running', site_data: { status: 'running', stage: 'quality-gate', progress: 86, message: 'Running the Platinum Quality Gate.', quality, payload } });
    await patchJob(jobId, {
      site_status: 'build_complete',
      built_html: html,
      site_data: {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message: quality.status === 'Platinum Ready' ? 'Your Platinum website is ready.' : 'Your website preview is ready for review.',
        quality,
        brief: generated.brief || null,
        siteData: generated.siteData || null,
        meta: generated.meta || null,
        source: generated.source || 'ai4-supabase-background',
        payload
      }
    });

    return out(202, { success: true, jobId, buildId: jobId, status: 'completed' });
  } catch (e) {
    console.error('generate-website-background failed:', e && e.stack ? e.stack : e);
    await patchJob(jobId, { site_status: 'build_failed', site_data: { status: 'failed', stage: 'failed', progress: 100, message: 'The background Platinum build failed.', error: String(e && e.message ? e.message : e).slice(0, 500), quality: { score: 0, status: 'Generation Failed', flags: [String(e && e.message ? e.message : e).slice(0, 200)] } } }).catch(function(){});
    return out(202, { success: false, jobId, buildId: jobId, status: 'failed' });
  }
};

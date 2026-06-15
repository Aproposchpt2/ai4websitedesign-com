'use strict';

const { getStore } = require('@netlify/blobs');

// Background functions are allowed to run longer than browser-facing requests.
// Set these before requiring generate-website so its constants are initialized for background use.
process.env.AI4_AI_TIMEOUT_MS = process.env.AI4_BACKGROUND_AI_TIMEOUT_MS || process.env.AI4_AI_TIMEOUT_MS || '90000';
process.env.AI4_PLATINUM_MAX_TOKENS = process.env.AI4_BACKGROUND_MAX_TOKENS || process.env.AI4_PLATINUM_MAX_TOKENS || '7600';

const generator = require('./generate-website');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function json(statusCode, payload) {
  return { statusCode, headers: CORS, body: JSON.stringify(payload) };
}
function safeJson(body) { try { return JSON.parse(body || '{}'); } catch { return {}; } }
function cleanJobId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 100);
}
function storeRef() { return getStore('ai4-platinum-build-jobs'); }

async function getJob(jobId) {
  return await storeRef().get(jobId, { type: 'json' });
}
async function setJob(jobId, patch) {
  const store = storeRef();
  const existing = await store.get(jobId, { type: 'json' }).catch(function(){ return null; }) || {};
  const record = Object.assign({}, existing, patch, { jobId, buildId: jobId, updatedAt: new Date().toISOString() });
  await store.setJSON(jobId, record, { metadata: { status: record.status || 'unknown' } });
  return record;
}
async function runGenerator(payload) {
  const result = await generator.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {})
  });

  let body = {};
  try { body = JSON.parse(result.body || '{}'); }
  catch { body = { success: false, error: 'Generator returned invalid JSON' }; }

  if (result.statusCode >= 400 || body.success === false) {
    throw new Error(body.error || body.detail || ('Generator failed with HTTP ' + result.statusCode));
  }

  return body;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  const body = safeJson(event.body);
  const jobId = cleanJobId(body.jobId || body.buildId);
  const payload = body.payload || body;

  if (!jobId) return json(400, { success: false, error: 'Missing jobId' });

  const existing = await getJob(jobId).catch(function(){ return null; });
  if (!existing) {
    await setJob(jobId, {
      success: true,
      jobId,
      buildId: jobId,
      status: 'queued',
      stage: 'queued',
      progress: 5,
      message: 'Build job recovered and queued.',
      createdAt: new Date().toISOString(),
      payload
    });
  }

  await setJob(jobId, {
    status: 'running',
    stage: 'creative-brief',
    progress: 18,
    message: 'Building the Platinum Creative Brief.'
  });

  try {
    await setJob(jobId, {
      status: 'running',
      stage: 'platinum-agent-call',
      progress: 36,
      message: 'Calling the Platinum AI Agent in the background.'
    });

    const generated = await runGenerator(payload);
    const html = generated.html || generated.builtHtml || generated.websiteHtml || '';
    const quality = generated.quality || { score: 0, status: 'Unknown', flags: ['No quality data returned'] };

    await setJob(jobId, {
      status: 'running',
      stage: 'quality-gate',
      progress: 86,
      message: 'Running the Platinum Quality Gate.',
      quality
    });

    await setJob(jobId, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      message: quality.status === 'Platinum Ready' ? 'Your Platinum website is ready.' : 'Your website preview is ready for review.',
      html,
      builtHtml: html,
      websiteHtml: html,
      templates: generated.templates || (html ? [html] : []),
      brief: generated.brief || null,
      quality,
      siteData: generated.siteData || null,
      meta: generated.meta || null,
      source: generated.source || 'ai4-platinum-background'
    });

    return json(202, { success: true, jobId, buildId: jobId, status: 'completed' });
  } catch (err) {
    console.error('generate-website-background failed:', err && err.stack ? err.stack : err);
    await setJob(jobId, {
      status: 'failed',
      stage: 'failed',
      progress: 100,
      message: 'The background Platinum build failed.',
      error: String(err && err.message ? err.message : err).slice(0, 500),
      quality: { score: 0, status: 'Generation Failed', flags: [String(err && err.message ? err.message : err).slice(0, 200)] }
    });
    return json(202, { success: false, jobId, buildId: jobId, status: 'failed' });
  }
};

'use strict';

const { getStore } = require('@netlify/blobs');
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

function safeJson(body) {
  try { return JSON.parse(body || '{}'); }
  catch { return {}; }
}

function cleanJobId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

async function getJob(jobId) {
  const store = getStore('ai4-platinum-build-jobs');
  return await store.get(jobId, { type: 'json' });
}

async function setJob(jobId, patch) {
  const store = getStore('ai4-platinum-build-jobs');
  const existing = await store.get(jobId, { type: 'json' }).catch(function(){ return null; }) || {};
  const record = Object.assign({}, existing, patch, { updatedAt: new Date().toISOString() });
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
  const jobId = cleanJobId(body.jobId);
  const payload = body.payload || {};

  if (!jobId) return json(400, { success: false, error: 'Missing jobId' });

  const existing = await getJob(jobId).catch(function(){ return null; });
  if (!existing) {
    await setJob(jobId, {
      success: true,
      jobId,
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
    progress: 20,
    message: 'Building the Platinum Creative Brief.'
  });

  try {
    await setJob(jobId, {
      status: 'running',
      stage: 'platinum-agent-call',
      progress: 38,
      message: 'Calling the Platinum AI Agent for the full website.'
    });

    const generated = await runGenerator(payload);

    await setJob(jobId, {
      status: 'running',
      stage: 'quality-gate',
      progress: 86,
      message: 'Running the Platinum Quality Gate.',
      quality: generated.quality || null
    });

    const html = generated.html || generated.builtHtml || generated.websiteHtml || '';
    const quality = generated.quality || { score: 0, status: 'Unknown', flags: ['No quality data returned'] };

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

    return json(202, { success: true, jobId, status: 'completed' });
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
    return json(202, { success: false, jobId, status: 'failed' });
  }
};

'use strict';

const { randomUUID } = require('crypto');
const { getStore } = require('@netlify/blobs');

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
function safe(value, fallback) {
  if (value === null || value === undefined) return fallback || '';
  const out = String(value).trim();
  return out || fallback || '';
}
function storeRef() {
  return getStore({ name: 'ai4-platinum-build-jobs', consistency: 'strong' });
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

    const body = safeJson(event.body);
    const jobId = 'ai4-' + randomUUID();
    const now = new Date().toISOString();
    const mode = safe(body.mode, 'full');
    const payload = {
      answers: body.answers || {},
      mode,
      existingContent: body.existingContent || null,
      variationSeed: body.variationSeed || Date.now().toString(36),
      styleSystem: body.styleSystem || null,
      requestId: jobId
    };

    await storeRef().setJSON(jobId, {
      success: true,
      jobId,
      buildId: jobId,
      status: 'queued',
      stage: 'queued',
      progress: 5,
      message: mode === 'design' ? 'New creative direction queued.' : 'Platinum website build queued.',
      payload,
      createdAt: now,
      updatedAt: now
    });

    return json(202, {
      success: true,
      jobId,
      buildId: jobId,
      status: 'queued',
      message: 'Background Platinum build queued.',
      pollUrl: '/.netlify/functions/get-build-status?jobId=' + encodeURIComponent(jobId)
    });
  } catch (err) {
    console.error('start-website-build failed:', err && err.stack ? err.stack : err);
    return json(500, {
      success: false,
      error: 'Unable to create background build job',
      detail: String(err && err.message ? err.message : err).slice(0, 500),
      hint: 'Check Netlify Blobs availability and function environment.'
    });
  }
};

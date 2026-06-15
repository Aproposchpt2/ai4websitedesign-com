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
function getStoreRef() { return getStore('ai4-platinum-build-jobs'); }
function originFromEvent(event) {
  const host = event.headers.host || event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] || 'https';
  return host ? proto + '://' + host : '';
}

exports.handler = async function(event) {
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

  const store = getStoreRef();
  await store.setJSON(jobId, {
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

  const origin = originFromEvent(event);
  if (!origin) {
    await store.setJSON(jobId, {
      success: false,
      jobId,
      buildId: jobId,
      status: 'failed',
      stage: 'dispatch-failed',
      progress: 100,
      message: 'Unable to determine site origin for background dispatch.',
      createdAt: now,
      updatedAt: new Date().toISOString()
    });
    return json(500, { success: false, error: 'Unable to create background build job', jobId, buildId: jobId });
  }

  try {
    const dispatch = await fetch(origin + '/.netlify/functions/generate-website-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, payload })
    });

    if (!dispatch.ok && dispatch.status !== 202) {
      const text = await dispatch.text().catch(function(){ return ''; });
      await store.setJSON(jobId, {
        success: false,
        jobId,
        buildId: jobId,
        status: 'failed',
        stage: 'dispatch-failed',
        progress: 100,
        message: 'Unable to create background build job.',
        error: text || ('HTTP ' + dispatch.status),
        payload,
        createdAt: now,
        updatedAt: new Date().toISOString()
      });
      return json(500, { success: false, error: 'Unable to create background build job', jobId, buildId: jobId });
    }
  } catch (err) {
    await store.setJSON(jobId, {
      success: false,
      jobId,
      buildId: jobId,
      status: 'failed',
      stage: 'dispatch-failed',
      progress: 100,
      message: 'Unable to create background build job.',
      error: safe(err && err.message ? err.message : err),
      payload,
      createdAt: now,
      updatedAt: new Date().toISOString()
    });
    return json(500, { success: false, error: 'Unable to create background build job', jobId, buildId: jobId });
  }

  return json(202, {
    success: true,
    jobId,
    buildId: jobId,
    status: 'queued',
    message: 'Background Platinum build started.',
    pollUrl: '/.netlify/functions/get-build-status?jobId=' + encodeURIComponent(jobId)
  });
};

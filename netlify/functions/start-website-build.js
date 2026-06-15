'use strict';

const { randomUUID } = require('crypto');
const { getStore } = require('@netlify/blobs');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(statusCode, payload) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(payload) };
}
function parse(body) { try { return JSON.parse(body || '{}'); } catch { return {}; } }
function safe(v, f = '') { if (v === null || v === undefined) return f; const s = String(v).trim(); return s || f; }
function jobStore() { return getStore({ name: 'ai4-website-builds', consistency: 'strong' }); }
function originFromEvent(event) {
  const host = event.headers.host || event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  const body = parse(event.body);
  const buildId = 'ai4_' + randomUUID();
  const now = new Date().toISOString();
  const payload = {
    buildId,
    answers: body.answers || {},
    mode: safe(body.mode, 'full'),
    existingContent: body.existingContent || null,
    variationSeed: body.variationSeed || Date.now().toString(36),
    createdAt: now,
    updatedAt: now
  };

  const store = jobStore();
  await store.setJSON(buildId, {
    buildId,
    status: 'queued',
    progress: 5,
    message: 'Build queued',
    payload,
    createdAt: now,
    updatedAt: now
  });

  const origin = originFromEvent(event);
  if (!origin) {
    await store.setJSON(buildId, {
      buildId,
      status: 'error',
      progress: 100,
      message: 'Unable to determine site origin for background dispatch',
      createdAt: now,
      updatedAt: new Date().toISOString()
    });
    return json(500, { success: false, error: 'Unable to create background build job', buildId });
  }

  try {
    const dispatch = await fetch(origin + '/.netlify/functions/generate-website-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!dispatch.ok && dispatch.status !== 202) {
      const text = await dispatch.text().catch(() => '');
      await store.setJSON(buildId, {
        buildId,
        status: 'error',
        progress: 100,
        message: 'Unable to create background build job',
        error: text || ('HTTP ' + dispatch.status),
        createdAt: now,
        updatedAt: new Date().toISOString()
      });
      return json(500, { success: false, error: 'Unable to create background build job', buildId });
    }
  } catch (e) {
    await store.setJSON(buildId, {
      buildId,
      status: 'error',
      progress: 100,
      message: 'Unable to create background build job',
      error: safe(e.message || e),
      createdAt: now,
      updatedAt: new Date().toISOString()
    });
    return json(500, { success: false, error: 'Unable to create background build job', buildId });
  }

  await store.setJSON(buildId, {
    buildId,
    status: 'running',
    progress: 12,
    message: 'Platinum Agent started',
    payload,
    createdAt: now,
    updatedAt: new Date().toISOString()
  });

  return json(202, { success: true, buildId, status: 'running', pollUrl: '/.netlify/functions/get-build-status?buildId=' + encodeURIComponent(buildId) });
};

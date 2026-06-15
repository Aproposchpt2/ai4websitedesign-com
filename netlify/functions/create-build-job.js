'use strict';

const crypto = require('crypto');
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

function safeJson(body) {
  try { return JSON.parse(body || '{}'); }
  catch { return {}; }
}

function getOrigin(event) {
  const proto = event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'] || 'https';
  const host = event.headers.host || event.headers.Host || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!host) return '';
  if (String(host).startsWith('http')) return String(host).replace(/\/$/, '');
  return proto + '://' + host;
}

async function setJob(jobId, record) {
  const store = getStore('ai4-platinum-build-jobs');
  await store.setJSON(jobId, record, { metadata: { status: record.status || 'queued' } });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  const payload = safeJson(event.body);
  const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  const initial = {
    success: true,
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    message: 'Platinum build job accepted.',
    createdAt: now,
    updatedAt: now,
    payload
  };

  await setJob(jobId, initial);

  const origin = getOrigin(event);
  const backgroundUrl = origin ? origin + '/.netlify/functions/generate-website-background' : '/.netlify/functions/generate-website-background';

  fetch(backgroundUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, payload })
  }).catch(function(err) {
    console.error('create-build-job background dispatch failed:', err && err.message ? err.message : err);
  });

  return json(202, {
    success: true,
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    message: 'Your Platinum website build has started.'
  });
};

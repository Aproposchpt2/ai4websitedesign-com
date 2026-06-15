'use strict';

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { success: false, error: 'Method not allowed' });

  const queryJobId = event.queryStringParameters && event.queryStringParameters.jobId;
  const body = event.httpMethod === 'POST' ? safeJson(event.body) : {};
  const jobId = cleanJobId(queryJobId || body.jobId);

  if (!jobId) return json(400, { success: false, error: 'Missing jobId' });

  const store = getStore('ai4-platinum-build-jobs');
  const record = await store.get(jobId, { type: 'json' }).catch(function(){ return null; });

  if (!record) {
    return json(404, {
      success: false,
      jobId,
      status: 'missing',
      stage: 'missing',
      progress: 0,
      message: 'Build job was not found.'
    });
  }

  return json(200, Object.assign({ success: true, jobId }, record));
};

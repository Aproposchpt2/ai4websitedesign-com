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
function safeJson(body) { try { return JSON.parse(body || '{}'); } catch { return {}; } }
function cleanJobId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 100);
}
function storeRef() {
  return getStore({ name: 'ai4-platinum-build-jobs', consistency: 'strong' });
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { success: false, error: 'Method not allowed' });

    const qs = event.queryStringParameters || {};
    const body = event.httpMethod === 'POST' ? safeJson(event.body) : {};
    const jobId = cleanJobId(qs.jobId || qs.buildId || qs.id || body.jobId || body.buildId || body.id);

    if (!jobId) return json(400, { success: false, error: 'Missing jobId or buildId' });

    const record = await storeRef().get(jobId, { type: 'json' }).catch(function(){ return null; });

    if (!record) {
      return json(404, {
        success: false,
        jobId,
        buildId: jobId,
        status: 'missing',
        stage: 'missing',
        progress: 0,
        message: 'Build job was not found.'
      });
    }

    const response = Object.assign({ success: true, jobId, buildId: jobId }, record);
    delete response.payload;
    return json(200, response);
  } catch (err) {
    console.error('get-build-status failed:', err && err.stack ? err.stack : err);
    return json(500, {
      success: false,
      status: 'error',
      stage: 'status-error',
      progress: 0,
      error: 'Unable to read build status',
      detail: String(err && err.message ? err.message : err).slice(0, 500)
    });
  }
};

'use strict';
// verify-otp.js -- uses direct REST fetch (no Supabase JS client, no WebSocket dependency)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function sbHeaders() {
  return { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Sign in is not configured.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request.' }) }; }

  const email = (body.email || '').trim().toLowerCase();
  const code  = (body.code  || '').trim().replace(/\D/g, '').slice(0, 6);

  if (!email || !code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and code are required.' }) };
  if (code.length !== 6) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter the 6-digit access code.' }) };

  const res = await fetch(
    SUPABASE_URL + '/rest/v1/users?email=ilike.' + encodeURIComponent(email) + '&select=email,full_name,otp_code,otp_expires&limit=1',
    { headers: sbHeaders() }
  );
  const rows = await res.json();
  const user = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (!user) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Account not found. Please check your email.' }) };
  if (!user.otp_code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No active code found. Please request a new one.' }) };
  if (user.otp_expires && new Date() > new Date(user.otp_expires)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Code has expired. Please request a new one.' }) };
  if (String(user.otp_code).trim() !== code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Incorrect code. Please try again.' }) };

  await fetch(
    SUPABASE_URL + '/rest/v1/users?email=ilike.' + encodeURIComponent(email),
    {
      method: 'PATCH',
      headers: Object.assign({}, sbHeaders(), { Prefer: 'return=minimal' }),
      body: JSON.stringify({ otp_code: null, otp_expires: null, updated_at: new Date().toISOString() })
    }
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, user: { email: user.email, name: user.full_name || '' } })
  };
};
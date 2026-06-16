'use strict';

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
function safeEmail(value) {
  const v = safe(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : 'preview@ai4websitedesign.com';
}
function slug(value) {
  return safe(value, 'Website Build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'website-build';
}
function sbHeaders(prefer) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: prefer || 'return=representation'
  };
}
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is not configured');
  return { url, key };
}
function pickBusinessName(answers) {
  return safe(answers.businessName || answers.business_name || answers.brandName || answers.companyName || answers.name, 'Website Build');
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

    const body = safeJson(event.body);
    const answers = body.answers || {};
    const mode = safe(body.mode, 'full');
    const now = new Date().toISOString();
    const sb = getSupabase();
    const businessName = pickBusinessName(answers);
    const email = safeEmail(answers.email || answers.contactEmail || body.email);
    const fullName = safe(answers.fullName || answers.name || body.fullName || body.name);
    const phone = safe(answers.phone || answers.phoneNumber || body.phone);

    const payload = {
      answers,
      mode,
      existingContent: body.existingContent || null,
      variationSeed: body.variationSeed || Date.now().toString(36),
      styleSystem: body.styleSystem || null
    };

    const record = {
      email,
      full_name: fullName || null,
      phone: phone || null,
      business_name: businessName,
      site_name: businessName,
      site_status: 'build_queued',
      template_selected: mode === 'design' ? 'AI4-NEW-DESIGN' : 'AI4-PLATINUM',
      color_choice: 'AUTO',
      built_html: '',
      site_data: {
        source: 'ai4-async-build',
        status: 'queued',
        stage: 'queued',
        progress: 5,
        message: mode === 'design' ? 'New creative direction queued.' : 'Platinum website build queued.',
        payload,
        quality: null
      },
      source: 'ai4-async-build',
      created_at: now,
      updated_at: now
    };

    const res = await fetch(sb.url + '/rest/v1/sites', {
      method: 'POST',
      headers: sbHeaders('return=representation'),
      body: JSON.stringify(record)
    });

    if (!res.ok) {
      const text = await res.text().catch(function(){ return ''; });
      throw new Error('Supabase queued insert failed: HTTP ' + res.status + ' ' + text.slice(0, 260));
    }

    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row || !row.id) throw new Error('Supabase queued insert returned no id');

    const jobId = String(row.id);
    payload.requestId = jobId;

    await fetch(sb.url + '/rest/v1/sites?id=eq.' + encodeURIComponent(jobId), {
      method: 'PATCH',
      headers: sbHeaders('return=minimal'),
      body: JSON.stringify({
        site_data: Object.assign({}, record.site_data, { buildId: jobId, jobId, payload }),
        updated_at: new Date().toISOString()
      })
    }).catch(function(){});

    return json(202, {
      success: true,
      jobId,
      buildId: jobId,
      siteId: jobId,
      slug: slug(businessName),
      status: 'queued',
      message: 'Background Platinum build queued in Supabase.',
      pollUrl: '/.netlify/functions/get-build-status?jobId=' + encodeURIComponent(jobId)
    });
  } catch (err) {
    console.error('start-website-build failed:', err && err.stack ? err.stack : err);
    return json(500, {
      success: false,
      error: 'Unable to create background build job',
      detail: String(err && err.message ? err.message : err).slice(0, 700),
      hint: 'The async build queue now uses the Supabase sites table. Check Supabase env vars and sites table columns.'
    });
  }
};

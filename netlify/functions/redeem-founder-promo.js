/**
 * AI4 Website Design — Founder Promo Redemption
 * File: netlify/functions/redeem-founder-promo.js
 *
 * Purpose:
 * - Redeems approved Founder promo code
 * - Sends selected generated website HTML to the customer as index.html
 * - Sends internal fulfillment notification
 * - Optionally logs redemption to Supabase via REST API
 *
 * Important:
 * - This function intentionally DOES NOT import @supabase/supabase-js.
 * - It uses plain HTTPS REST calls so it will not trigger the Node 18 WebSocket / Realtime error.
 */

'use strict';

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const DEFAULT_PROMO_TABLE = 'founder_promo_redemptions';

function json(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeCode(value) {
  return safeString(value).toUpperCase().replace(/\s+/g, '');
}

function isValidEmail(value) {
  const email = safeString(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value) {
  return safeString(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function requestJson({ hostname, path, method = 'GET', headers = {}, body = null, timeoutMs = 9000 }) {
  return new Promise((resolve) => {
    const payload = body === null ? null : (typeof body === 'string' ? body : JSON.stringify(body));

    const req = https.request({
      hostname,
      path,
      method,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) { parsed = data; }

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: data
        });
      });
    });

    req.on('error', (error) => {
      resolve({ ok: false, statusCode: 0, data: null, raw: error.message, error });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, data: null, raw: 'Request timeout' });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function supabaseRest(path, { method = 'GET', body = null, prefer = '' } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { skipped: true, reason: 'Missing Supabase credentials' };
  }

  const url = new URL(supabaseUrl);
  return requestJson({
    hostname: url.hostname,
    path: `/rest/v1/${path}`,
    method,
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
      ...(prefer ? { 'Prefer': prefer } : {})
    },
    body
  });
}

async function getExistingRedemptionCount(code) {
  const table = process.env.FOUNDER_PROMO_TABLE || DEFAULT_PROMO_TABLE;
  const encodedCode = encodeURIComponent(code);

  const result = await supabaseRest(
    `${table}?select=id&promo_code=eq.${encodedCode}`,
    { method: 'GET', prefer: 'count=exact' }
  );

  if (result.skipped || !result.ok) {
    console.warn('Promo count skipped:', result.reason || result.raw || result.statusCode);
    return null;
  }

  const range = result.headers && result.headers['content-range'];
  if (!range) return Array.isArray(result.data) ? result.data.length : null;

  const match = String(range).match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function logRedemption(record) {
  const table = process.env.FOUNDER_PROMO_TABLE || DEFAULT_PROMO_TABLE;

  const result = await supabaseRest(table, {
    method: 'POST',
    prefer: 'return=minimal',
    body: record
  });

  if (result.skipped || !result.ok) {
    console.warn('Promo redemption log skipped/failed:', result.reason || result.raw || result.statusCode);
    return false;
  }

  return true;
}

async function sendResendEmail({ to, subject, html, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'AI4 Website Design <jmitchell@ai4websitedesign.com>';

  if (!apiKey) {
    return { ok: false, raw: 'Missing RESEND_API_KEY' };
  }

  const payload = {
    from,
    to,
    subject,
    html,
    attachments
  };

  return requestJson({
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: payload,
    timeoutMs: 12000
  });
}

function buildCustomerEmail({ businessName }) {
  const business = escapeHtml(businessName || 'your website');
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#050912;color:#eaf6ff;padding:28px;border-radius:16px;max-width:680px;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5BD3FF;font-weight:700;margin-bottom:12px;">
        AI4 Website Design Studio
      </div>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;color:#ffffff;">Your Founder’s Offer website file is ready.</h1>
      <p style="font-size:15px;line-height:1.7;color:#b8c7da;margin:0 0 18px;">
        Attached is the selected starter website design file for <strong style="color:#ffffff;">${business}</strong>.
        Save the attachment as <strong>index.html</strong>.
      </p>
      <p style="font-size:14px;line-height:1.7;color:#b8c7da;margin:0;">
        This free promo covers the starter website design file. Launch support, domain setup, hosting, updates, and business add-ons remain available as paid upgrades.
      </p>
    </div>
  `;
}

function buildInternalEmail(record) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#071225;color:#eaf6ff;padding:28px;border-radius:16px;max-width:760px;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5BD3FF;font-weight:700;margin-bottom:12px;">
        AI4 Website Design — Founder Promo Redeemed
      </div>
      <h2 style="margin:0 0 16px;color:#ffffff;">${escapeHtml(record.business_name || 'Website Build')}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#89a2bf;">Email</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(record.email)}</td></tr>
        <tr><td style="padding:8px 0;color:#89a2bf;">Name</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(record.full_name || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#89a2bf;">Phone</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(record.phone || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#89a2bf;">Promo</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(record.promo_code)}</td></tr>
        <tr><td style="padding:8px 0;color:#89a2bf;">Template</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(record.template || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#89a2bf;">Palette</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(record.palette || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#89a2bf;">Variation</td><td style="padding:8px 0;color:#ffffff;">${escapeHtml(String(record.variation ?? '—'))}</td></tr>
      </table>
    </div>
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');

    const submittedCode = normalizeCode(body.promo_code || body.code);
    const configuredCode = normalizeCode(process.env.FOUNDER_PROMO_CODE || 'LAUNCHFREE');

    if (!configuredCode) {
      return json(500, { success: false, error: 'Promo code is not configured.' });
    }

    if (!submittedCode || submittedCode !== configuredCode) {
      return json(400, { success: false, error: 'Invalid promo code.' });
    }

    const email = safeString(body.email).toLowerCase();
    if (!isValidEmail(email)) {
      return json(400, { success: false, error: 'A valid customer email is required before redeeming the promo code.' });
    }

    const builtHtml = safeString(body.built_html || body.html);
    if (!builtHtml || !builtHtml.includes('<html')) {
      return json(400, { success: false, error: 'Selected website HTML was not found. Please return to the preview and choose the website again.' });
    }

    const promoLimit = Number(process.env.FOUNDER_PROMO_LIMIT || 0);
    if (promoLimit > 0) {
      const currentCount = await getExistingRedemptionCount(configuredCode);
      if (typeof currentCount === 'number' && currentCount >= promoLimit) {
        return json(403, { success: false, error: 'This promo code has reached its redemption limit.' });
      }
    }

    const record = {
      promo_code: configuredCode,
      email,
      full_name: safeString(body.full_name || body.name),
      phone: safeString(body.phone),
      business_name: safeString(body.business_name || body.businessName || 'Website Build'),
      site_data: body.site_data || body.siteData || {},
      template: safeString(body.template),
      palette: safeString(body.palette),
      variation: body.variation ?? null,
      source: 'ai4-design-studio-preview',
      created_at: new Date().toISOString()
    };

    await logRedemption(record);

    // Mark promo code as used so it cannot be redeemed again
    await supabaseRest(
      `promo_leads?promo_code=eq.\`,
      { method: 'PATCH', body: { used: true }, prefer: 'return=minimal' }
    );

    const attachment = {
      filename: 'index.html',
      content: Buffer.from(builtHtml, 'utf8').toString('base64')
    };

    const customerEmail = await sendResendEmail({
      to: email,
      subject: 'Your AI4 Website Design Studio file is ready',
      html: buildCustomerEmail({ businessName: record.business_name }),
      attachments: [attachment]
    });

    if (!customerEmail.ok) {
      console.error('Customer promo email failed:', customerEmail.raw || customerEmail.statusCode);
      return json(502, { success: false, error: 'Promo was verified, but the delivery email could not be sent. Please contact support.' });
    }

    const ownerTo = process.env.RESEND_TO_EMAIL || 'jmitchell@ai4websitedesign.com';
    await sendResendEmail({
      to: ownerTo,
      subject: `Founder Promo Redeemed — ${record.business_name}`,
      html: buildInternalEmail(record),
      attachments: [attachment]
    });

    return json(200, {
      success: true,
      message: 'Promo redeemed! Check your email for your website file.'
    });
  } catch (error) {
    console.error('Promo redemption failed:', error);
    return json(500, {
      success: false,
      error: 'Promo service is unavailable right now. Please try again after redeploy.'
    });
  }
};

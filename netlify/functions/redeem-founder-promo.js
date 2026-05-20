/**
 * ai4websitedesign — Founder’s Offer Promo Redemption
 * netlify/functions/redeem-founder-promo.js
 *
 * Redeems approved Founder’s Offer promo codes without using Stripe.
 * Writes only to users / promo_redemptions / sites.
 * Does not create orders or subscriptions and does not call Stripe webhooks.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const MAX_HTML_LENGTH = 750000;
const MAX_JSON_LENGTH = 250000;
const PROMO_TYPE = 'founders_offer';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const INTERNAL_EMAIL =
  process.env.AI4_INTERNAL_NOTIFICATION_EMAIL ||
  process.env.RESEND_TO_EMAIL ||
  'jmitchell@ai4websitedesign.com';

const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  'AI4 Website Design <jmitchell@ai4websitedesign.com>';

function json(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeEmail(value) {
  return safeString(value).toLowerCase();
}

function normalizePromoCode(value) {
  return safeString(value).toUpperCase().replace(/\s+/g, '');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_JSON_LENGTH) return fallback;
  return value;
}

function getAllowedPromoCodes() {
  const raw = [
    process.env.FOUNDER_PROMO_CODES,
    process.env.FOUNDER_PROMO_CODE,
    process.env.AI4_FOUNDER_PROMO_CODES,
    process.env.AI4_FOUNDER_PROMO_CODE,
  ].filter(Boolean).join(',');

  return raw
    .split(',')
    .map((code) => normalizePromoCode(code))
    .filter(Boolean);
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hasHtmlDocumentShape(value = '') {
  const html = safeString(value);
  return /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html);
}

async function sendResendEmail({ to, subject, html, text, attachments = [] }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!to) {
    throw new Error('Email recipient is required');
  }

  const body = {
    from: RESEND_FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };

  if (attachments.length) {
    body.attachments = attachments;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`Resend error: ${responseText}`);
  }

  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    return { raw: responseText };
  }
}

async function findUser(supabase, { userId, email }) {
  if (userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(`User lookup failed: ${error.message}`);
    if (data) return data;
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`User lookup failed: ${error.message}`);
  return data || null;
}

async function findSelectedSite(supabase, { siteId, buildId, email }) {
  const requestedId = safeString(siteId || buildId);

  if (requestedId) {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .eq('id', requestedId)
      .maybeSingle();

    if (error) throw new Error(`Build lookup failed: ${error.message}`);
    if (data) return data;
  }

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Build lookup failed: ${error.message}`);
  return data || null;
}

async function duplicateRedemptionExists(supabase, { email, userId }) {
  let query = supabase
    .from('promo_redemptions')
    .select('id,status,created_at')
    .eq('promo_type', PROMO_TYPE)
    .in('status', ['pending_email', 'redeemed'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('email', email);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(`Promo lookup failed: ${error.message}`);
  return data || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, error: 'Invalid JSON body' });
  }

  const allowedCodes = getAllowedPromoCodes();
  if (!allowedCodes.length) {
    return json(500, { success: false, error: 'Founder promo code is not configured' });
  }

  const promoCode = normalizePromoCode(body.promo_code);
  const email = normalizeEmail(body.email);
  const userIdFromClient = safeString(body.user_id);
  const siteIdFromClient = safeString(body.site_id);
  const buildIdFromClient = safeString(body.build_id);
  const fullNameFromClient = safeString(body.full_name || body.name);
  const phoneFromClient = safeString(body.phone);
  const siteDataFromClient = safeJson(body.site_data, {});
  const businessNameFromClient = safeString(
    body.business_name ||
    siteDataFromClient.businessName ||
    siteDataFromClient.business_name ||
    'Website Build'
  );

  if (!promoCode) {
    return json(400, { success: false, error: 'Promo code is required' });
  }

  if (!allowedCodes.includes(promoCode)) {
    return json(400, { success: false, error: 'Invalid promo code' });
  }

  if (!isValidEmail(email)) {
    return json(400, { success: false, error: 'Valid signup email is required' });
  }

  let builtHtmlFromClient = safeString(body.built_html);
  if (builtHtmlFromClient.length > MAX_HTML_LENGTH) {
    return json(413, { success: false, error: 'Built HTML is too large' });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (error) {
    console.error('Promo configuration error:', error.message);
    return json(500, { success: false, error: 'Promo redemption is not configured' });
  }

  let user;
  let site;
  let redemptionId = null;
  const now = new Date().toISOString();

  try {
    user = await findUser(supabase, { userId: userIdFromClient, email });

    if (!user || !user.id) {
      return json(404, { success: false, error: 'Signup record was not found for this email' });
    }

    if (user.founders_offer_promo_used) {
      return json(409, { success: false, error: 'Founder’s Offer promo has already been redeemed for this account' });
    }

    const duplicate = await duplicateRedemptionExists(supabase, { email, userId: user.id });
    if (duplicate) {
      return json(409, { success: false, error: 'Founder’s Offer promo has already been redeemed for this account' });
    }

    site = await findSelectedSite(supabase, {
      siteId: siteIdFromClient,
      buildId: buildIdFromClient,
      email,
    });

    const siteBuiltHtml = site && site.built_html ? safeString(site.built_html) : '';
    const builtHtml = siteBuiltHtml || builtHtmlFromClient;

    if (!builtHtml) {
      return json(400, { success: false, error: 'Selected website HTML was not found' });
    }

    if (builtHtml.length > MAX_HTML_LENGTH) {
      return json(413, { success: false, error: 'Selected website HTML is too large' });
    }

    if (!hasHtmlDocumentShape(builtHtml)) {
      return json(400, { success: false, error: 'Selected website file is not a complete HTML document' });
    }

    const businessName = safeString(
      (site && (site.business_name || site.site_name)) ||
      businessNameFromClient ||
      'Website Build'
    );

    const fullName = safeString(
      (user && (user.full_name || user.name)) ||
      fullNameFromClient ||
      email
    );

    const phone = safeString(
      (user && user.phone) ||
      phoneFromClient
    );

    const siteData =
      site && site.site_data && typeof site.site_data === 'object'
        ? site.site_data
        : siteDataFromClient;

    const { data: redemption, error: insertError } = await supabase
      .from('promo_redemptions')
      .insert({
        user_id: user.id,
        email,
        full_name: fullName,
        phone: phone || null,
        promo_code: promoCode,
        promo_type: PROMO_TYPE,
        status: 'pending_email',
        site_id: site && site.id ? site.id : null,
        build_id: site && site.id ? site.id : null,
        business_name: businessName,
        html_delivery_status: 'pending',
        created_at: now,
        redeemed_at: now,
        metadata: {
          source: 'offer.html',
          delivery_file: 'index.html',
          client_site_id: siteIdFromClient || null,
          client_build_id: buildIdFromClient || null,
          build_persisted: Boolean(site && site.id),
          site_data: siteData,
        },
      })
      .select('id')
      .single();

    if (insertError) {
      const message = String(insertError.message || '').toLowerCase();
      if (message.includes('duplicate') || message.includes('unique')) {
        return json(409, { success: false, error: 'Founder’s Offer promo has already been redeemed for this account' });
      }
      throw new Error(`Promo insert failed: ${insertError.message}`);
    }

    redemptionId = redemption.id;

    if (site && site.id && !siteBuiltHtml && builtHtmlFromClient) {
      const { error: siteUpdateError } = await supabase
        .from('sites')
        .update({
          built_html: builtHtmlFromClient,
          site_data: siteData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', site.id);

      if (siteUpdateError) {
        console.error('Unable to backfill built_html on site:', siteUpdateError.message);
      }
    }

    const attachmentContent = Buffer.from(builtHtml, 'utf8').toString('base64');
    const safeFullName = escapeHtml(fullName);
    const safeBusinessName = escapeHtml(businessName);

    const customerHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#080c10;color:#f0f6fc;font-family:Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
          <div style="border:1px solid #1c2430;background:#0f1419;border-radius:18px;padding:28px;">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f0a500;font-weight:700;">AI4 Website Design</div>
            <h1 style="font-size:24px;line-height:1.25;margin:14px 0 12px;color:#f0f6fc;">Your Founder’s Offer website file is ready</h1>
            <p style="font-size:15px;line-height:1.7;color:#c9d1d9;margin:0 0 14px;">Hi ${safeFullName},</p>
            <p style="font-size:15px;line-height:1.7;color:#c9d1d9;margin:0 0 14px;">Your custom website file for <strong style="color:#ffffff;">${safeBusinessName}</strong> is attached to this email as <strong style="color:#ffffff;">index.html</strong>.</p>
            <p style="font-size:15px;line-height:1.7;color:#c9d1d9;margin:0 0 14px;">Save the attached file to your computer. This is the HTML file generated from your selected AI4 Website Design build.</p>
            <p style="font-size:14px;line-height:1.7;color:#8b949e;margin:22px 0 0;">Questions? Reply to this email or contact jmitchell@ai4websitedesign.com.</p>
          </div>
          <p style="font-size:12px;line-height:1.6;color:#8b949e;margin:18px 0 0;text-align:center;">Powered by Apropos Group LLC</p>
        </div>
      </body>
      </html>
    `;

    const customerText = [
      'Your Founder’s Offer website file is ready.',
      '',
      `Hi ${fullName},`,
      `Your custom website file for ${businessName} is attached as index.html.`,
      '',
      'Questions? Reply to this email or contact jmitchell@ai4websitedesign.com.',
    ].join('\n');

    await sendResendEmail({
      to: email,
      subject: 'Your AI4 Website Design file is ready',
      html: customerHtml,
      text: customerText,
      attachments: [
        {
          filename: 'index.html',
          content: attachmentContent,
        },
      ],
    });

    let internalEmailSentAt = null;
    let internalWarning = null;

    try {
      const internalHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family:Arial,sans-serif;background:#080c10;color:#f0f6fc;margin:0;padding:0;">
          <div style="max-width:660px;margin:0 auto;padding:32px 24px;">
            <div style="border:1px solid #1c2430;background:#0f1419;border-radius:18px;padding:24px;">
              <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f0a500;font-weight:700;">Founder’s Offer Promo Redeemed</div>
              <h1 style="font-size:22px;margin:12px 0;color:#f0f6fc;">Promo fulfillment completed</h1>
              <p style="font-size:15px;line-height:1.7;color:#c9d1d9;">A Founder’s Offer promo code was redeemed and the customer was emailed their website file as <strong>index.html</strong>.</p>
              <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px;color:#c9d1d9;">
                <tr><td style="padding:8px;border-bottom:1px solid #1c2430;color:#8b949e;">Customer</td><td style="padding:8px;border-bottom:1px solid #1c2430;">${safeFullName}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #1c2430;color:#8b949e;">Email</td><td style="padding:8px;border-bottom:1px solid #1c2430;">${escapeHtml(email)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #1c2430;color:#8b949e;">Business</td><td style="padding:8px;border-bottom:1px solid #1c2430;">${safeBusinessName}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #1c2430;color:#8b949e;">Promo Code</td><td style="padding:8px;border-bottom:1px solid #1c2430;">${escapeHtml(promoCode)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #1c2430;color:#8b949e;">Redemption ID</td><td style="padding:8px;border-bottom:1px solid #1c2430;">${escapeHtml(redemptionId)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #1c2430;color:#8b949e;">Site ID</td><td style="padding:8px;border-bottom:1px solid #1c2430;">${escapeHtml(site && site.id ? site.id : 'Not persisted')}</td></tr>
              </table>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendResendEmail({
        to: INTERNAL_EMAIL,
        subject: 'AI4 Founder’s Offer Promo Redeemed',
        html: internalHtml,
        text: `Founder’s Offer promo redeemed for ${fullName} <${email}>. Redemption ID: ${redemptionId}`,
      });

      internalEmailSentAt = new Date().toISOString();
    } catch (internalErr) {
      internalWarning = internalErr.message;
      console.error('Internal promo notification failed:', internalErr.message);
    }

    const customerEmailSentAt = new Date().toISOString();

    const redemptionUpdate = {
      status: 'redeemed',
      html_delivery_status: 'sent',
      customer_email_sent_at: customerEmailSentAt,
      internal_email_sent_at: internalEmailSentAt,
      metadata: {
        source: 'offer.html',
        delivery_file: 'index.html',
        client_site_id: siteIdFromClient || null,
        client_build_id: buildIdFromClient || null,
        build_persisted: Boolean(site && site.id),
        site_data: siteData,
        internal_notification_warning: internalWarning,
      },
    };

    const { error: redemptionUpdateError } = await supabase
      .from('promo_redemptions')
      .update(redemptionUpdate)
      .eq('id', redemptionId);

    if (redemptionUpdateError) {
      throw new Error(`Promo update failed: ${redemptionUpdateError.message}`);
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        founders_offer_promo_used: true,
        founders_offer_promo_used_at: customerEmailSentAt,
        founders_offer_promo_code: promoCode,
        founders_offer_promo_redemption_id: redemptionId,
        updated_at: customerEmailSentAt,
      })
      .eq('id', user.id);

    if (userUpdateError) {
      throw new Error(`User promo flag update failed: ${userUpdateError.message}`);
    }

    return json(200, {
      success: true,
      redeemed: true,
      redemption_id: redemptionId,
      user_id: user.id,
      site_id: site && site.id ? site.id : null,
      build_id: site && site.id ? site.id : null,
      customer_email_sent: true,
      internal_email_sent: Boolean(internalEmailSentAt),
      warning: internalWarning || null,
    });
  } catch (error) {
    console.error('Founder promo redemption error:', error.message);

    if (redemptionId) {
      try {
        await supabase
          .from('promo_redemptions')
          .update({
            status: 'failed_email',
            html_delivery_status: 'failed',
            metadata: {
              failure_message: error.message,
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', redemptionId);
      } catch (updateError) {
        console.error('Unable to record failed promo redemption:', updateError.message);
      }
    }

    return json(500, {
      success: false,
      error: 'Unable to complete Founder’s Offer promo redemption right now',
    });
  }
};

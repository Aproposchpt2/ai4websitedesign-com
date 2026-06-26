// Stripe is configured to POST to:
//   /.netlify/functions/stripe_subscription_webhook_secret
//
// This file aliases the full implementation in stripe-subscription-webhook.js.
// All logic, signature verification, Supabase upserts, and email are handled there.
// Do not duplicate logic here — maintain it in stripe-subscription-webhook.js.
//
// Env vars required (same as stripe-subscription-webhook.js):
//   STRIPE_SECRET_KEY, STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
module.exports = require('./stripe-subscription-webhook');

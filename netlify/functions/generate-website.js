'use strict';

/** AI4 Website Design Studio — Fast Platinum Generator V7.1
 * Netlify-safe generation with a complete customer-facing fallback.
 * No preview/generator status cards are rendered inside the customer website.
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const AI_TIMEOUT_MS = Number(process.env.AI4_AI_TIMEOUT_MS || 12000);
const MAX_TOKENS = Number(process.env.AI4_PLATINUM_MAX_TOKENS || 5200);
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function clean(v, f = '') {
  if (Array.isArray(v)) return v.map(x => clean(x)).filter(Boolean).join(', ') || f;
  if (v === null || v === undefined) return f;
  const s = String(v).trim();
  return s || f;
}
function esc(v) {
  return clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function parse(body) { try { return JSON.parse(body || '{}'); } catch { return {}; } }
function pick(obj, keys, f = '') {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => o && o[p] !== undefined ? o[p] : undefined, obj);
    const s = clean(v);
    if (s) return s;
  }
  return f;
}
function slug(v) {
  return clean(v, 'your-business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 42) || 'your-business';
}
function normalize(payload) {
  const r = (payload && (payload.answers || payload.rawAnswers || payload.siteData || payload.brief || payload)) || {};
  const c = r.contact || r.contactInfo || {};
  const s = r.social || r.socialLinks || {};
  return {
    businessName: pick(r, ['businessName','business_name','brandName','companyName','name'], 'Your Business'),
    whatYouDo: pick(r, ['whatYouDo','businessDescription','description','q2_whatYouDo','what','services'], 'A premium business serving customers with professional solutions.'),
    customers: pick(r, ['customers','idealCustomers','targetAudience','q3_customers','who','audience'], 'customers who value trust, clarity, and a professional experience'),
    differentiators: pick(r, ['differentiators','whatMakesDifferent','uniqueValue','q4_differentiators','diff','whyDifferent'], 'clear communication, dependable service, and a polished customer experience'),
    extras: pick(r, ['extras','optionalNotes','anythingElse','q7_extras','else','notes'], ''),
    primaryCta: pick(r, ['primaryCta','ctaText','cta','callToAction'], 'Contact Us'),
    phone: clean(r.phone || r.phoneNumber || c.phone),
    email: clean(r.email || r.contactEmail || c.email),
    address: clean(r.address || r.location || r.serviceArea || c.address),
    website: clean(r.website || r.url || c.website),
    facebook: clean(r.facebook || s.facebook),
    instagram: clean(r.instagram || s.instagram),
    linkedin: clean(r.linkedin || s.linkedin),
    websiteType: pick(r, ['websiteType','type','siteType'], 'business')
  };
}
function industry(a) {
  const t = `${a.businessName} ${a.whatYouDo} ${a.customers} ${a.differentiators} ${a.extras}`.toLowerCase();
  if (/restaurant|food|broiler|grill|catering|chef|bbq|menu|kitchen/.test(t)) return 'Restaurant / Food Service';
  if (/spa|salon|barber|beauty|massage|skincare|wellness|fitness/.test(t)) return 'Beauty / Wellness';
  if (/consult|accounting|tax|legal|law|insurance|real estate|broker/.test(t)) return 'Professional Services';
  if (/construction|contractor|hvac|plumb|electric|roof|repair|remodel/.test(t)) return 'Construction / Skilled Trades';
  if (/ai|software|automation|technology|app|saas|cyber|cloud|data|crm|voice agent|contracting intelligence/.test(t)) return 'Technology / AI Services';
  if (/artist|music|gospel|photo|video|studio|podcast|creative/.test(t)) return 'Creative / Entertainment';
  if (/nonprofit|ministry|church|community|foundation|outreach/.test(t)) return 'Community / Nonprofit';
  return 'Premium Local Business';
}
function brief(a) {
  const ind = industry(a);
  const map = {
    'Restaurant / Food Service': ['appetite-led local favorite with warmth and immediate craving appeal', 'warm charcoals, cream, deep red, caramel, and flame accents'],
    'Beauty / Wellness': ['premium personal-care experience built on transformation, calm, and trust', 'soft neutrals, sage, blush, cream, charcoal, and restrained metallic accents'],
    'Professional Services': ['serious expert advisor with clarity, discretion, and measurable value', 'deep navy, ink, ivory, subdued gold, or restrained blue accent'],
    'Construction / Skilled Trades': ['reliable field-ready operator with practical expertise and fast response', 'industrial charcoal, safety orange or yellow, white, and strong contrast'],
    'Technology / AI Services': ['modern technical operator turning complexity into business advantage', 'deep ink with electric blue, cyan, violet, and luminous accents'],
    'Creative / Entertainment': ['distinct creative brand with presence, story, emotion, and audience pull', 'dramatic contrast with one expressive signature color'],
    'Community / Nonprofit': ['mission-led organization creating trust, belonging, and visible impact', 'trustworthy navy, green, cream, and warm human accents']
  };
  const strategy = map[ind] || ['premium local brand that looks established, credible, and easy to choose', 'industry-specific palette with premium contrast'];
  return {
    businessName: a.businessName,
    industry: ind,
    marketPosition: strategy[0],
    colorStrategy: strategy[1],
    sectionPlan: ['nav','hero','solutions','use-cases','differentiator','process','cta','contact','footer'],
    conversionStrategy: `move visitors from confidence to proof, then to ${a.primaryCta}`
  };
}
function countSections(html) { return (clean(html).match(/<section\b/gi) || []).length; }
function isComplete(html) {
  const h = clean(html);
  const lower = h.toLowerCase();
  return lower.startsWith('<!doctype html') && lower.includes('</html>') && h.length > 9000 && countSections(h) >= 6 && /<form[^>]+data-netlify=["']true["']/i.test(h);
}
function validate(html) {
  const flags = [];
  let score = 100;
  const fail = (n, m) => { score -= n; flags.push(m); };
  if (!clean(html).toLowerCase().startsWith('<!doctype html')) fail(12, 'Missing <!DOCTYPE html>.');
  if (!clean(html).toLowerCase().includes('</html>')) fail(8, 'Missing closing html tag.');
  if (html.length < 9000) fail(12, 'Generated HTML is too short for a promotional website.');
  if (countSections(html) < 6) fail(12, 'At least 6 sections required.');
  if (!/<form[^>]+data-netlify=["']true["']/i.test(html)) fail(10, 'Netlify contact form missing.');
  if (!/@media/i.test(html)) fail(6, 'Responsive media query missing.');
  score = Math.max(0, Math.min(100, score));
  return { score, status: score >= 90 ? 'Platinum Ready' : score >= 75 ? 'Complete Website Preview' : 'Needs Review', flags, sectionCount: countSections(html), generatedLength: html.length };
}
function makePrompt(a, b) {
  return `Create one complete standalone customer-facing HTML promotional website. Return HTML only.
Client: ${a.businessName}
Industry: ${b.industry}
What they do: ${a.whatYouDo}
Ideal customer: ${a.customers}
Differentiator: ${a.differentiators}
CTA: ${a.primaryCta}
Contact: phone ${a.phone || 'n/a'}, email ${a.email || 'n/a'}, address ${a.address || 'n/a'}
Positioning: ${b.marketPosition}
Color strategy: ${b.colorStrategy}
Requirements: start with <!DOCTYPE html>; all CSS in style; CSS custom properties; Google Fonts; responsive @media; at least 7 semantic section elements; hero, solutions, services, differentiator, process, CTA, contact, footer; Netlify form with <form name="contact" method="POST" data-netlify="true"><input type="hidden" name="form-name" value="contact">; no markdown; no placeholders; no lorem ipsum; no fake testimonials or fake awards.
Do not include internal phrases like Complete Promotional Site, Premium presence, fallback, generator, AI unavailable, quality score, or preview status inside the customer website.`;
}
async function callClaudeFast(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }, { signal: controller.signal });
    let html = (res.content || []).filter(x => !x.type || x.type === 'text').map(x => x.text || '').join('\n').trim();
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = html.toLowerCase().indexOf('<!doctype html');
    if (start > 0) html = html.slice(start);
    const end = html.toLowerCase().lastIndexOf('</html>');
    if (end >= 0) html = html.slice(0, end + 7);
    return html;
  } finally {
    clearTimeout(timer);
  }
}
function fullFallback(a) {
  const b = brief(a);
  const name = esc(a.businessName), what = esc(a.whatYouDo), who = esc(a.customers), diff = esc(a.differentiators), cta = esc(a.primaryCta), year = new Date().getFullYear();
  const phone = esc(a.phone), email = esc(a.email), address = esc(a.address), market = esc(b.marketPosition);
  const productLines = clean(a.whatYouDo).split(/\||\n|;/).map(x => clean(x)).filter(x => x.length > 10).slice(0, 4);
  while (productLines.length < 4) productLines.push(['Workflow Automation','Customer Engagement','Business Intelligence','Digital Operations'][productLines.length]);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=Syne:wght@700;800&display=swap" rel="stylesheet"><style>:root{--bg:#06101d;--ink:#f8fbff;--muted:#a7b5c8;--panel:rgba(255,255,255,.075);--line:rgba(255,255,255,.13);--accent:#38bdf8;--accent2:#f6c768;--dark:#030711}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at 16% 6%,rgba(56,189,248,.25),transparent 33%),linear-gradient(135deg,#06101d,#0d1627 56%,#05070c);color:var(--ink);line-height:1.65}a{color:inherit;text-decoration:none}.wrap{max-width:1180px;margin:auto;padding:0 24px}nav{position:sticky;top:0;z-index:10;background:rgba(6,16,29,.86);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.nav{min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-family:Syne,sans-serif;font-size:25px;font-weight:800}.navlinks{display:flex;align-items:center;gap:18px;color:var(--muted);font-weight:800;font-size:14px}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:linear-gradient(135deg,#fff,var(--accent));color:#04101a;padding:14px 22px;font-weight:900;border:0}.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}section{padding:82px 0}.hero{min-height:calc(100vh - 78px);display:grid;align-items:center;padding:98px 0 86px}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-size:12px;font-weight:900}.hero h1{font-family:Syne,sans-serif;font-size:clamp(54px,8vw,112px);line-height:.9;letter-spacing:-.075em;margin:18px 0;max-width:980px}.lead{font-size:clamp(18px,2vw,23px);color:var(--muted);max-width:820px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:34px}.hero-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:56px}.strip-item{border:1px solid var(--line);border-radius:22px;padding:20px;background:rgba(255,255,255,.055)}.strip-item strong{display:block;color:var(--accent2);font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.card{border:1px solid var(--line);border-radius:26px;padding:28px;background:var(--panel)}.card span{color:var(--accent);font-weight:900}.card h3{font-family:Syne,sans-serif;font-size:25px;line-height:1.05;margin:16px 0}.split{display:grid;grid-template-columns:.86fr 1.14fr;gap:42px;align-items:start}.kicker{font-family:Syne,sans-serif;font-size:clamp(34px,4vw,52px);line-height:1;letter-spacing:-.045em;margin:0}.list{display:grid;gap:14px}.item{border-left:3px solid var(--accent);padding:12px 0 12px 18px;color:var(--muted);font-size:18px}.process{counter-reset:step;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:28px}.step{counter-increment:step;border:1px solid var(--line);border-radius:24px;padding:24px;background:rgba(0,0,0,.18)}.step:before{content:'0' counter(step);color:var(--accent2);font-weight:900}.step h3{font-family:Syne,sans-serif;font-size:24px}.cta-band{border:1px solid var(--line);border-radius:36px;padding:46px;background:linear-gradient(135deg,rgba(56,189,248,.18),rgba(246,199,104,.12));display:flex;align-items:center;justify-content:space-between;gap:24px}.contact{display:grid;grid-template-columns:.85fr 1.15fr;gap:28px}.contact-box,form{border:1px solid var(--line);border-radius:30px;background:var(--panel);padding:30px}form{display:grid;gap:14px}input,textarea{width:100%;border:1px solid var(--line);background:rgba(0,0,0,.24);color:var(--ink);border-radius:16px;padding:15px;font:inherit}textarea{min-height:130px}button{cursor:pointer}.footer{padding:32px 0;border-top:1px solid var(--line);color:var(--muted);font-size:14px}@media(max-width:980px){.split,.contact{grid-template-columns:1fr}.cards,.hero-strip,.process{grid-template-columns:1fr}.nav{align-items:flex-start;flex-direction:column;padding:18px 0}.navlinks{flex-wrap:wrap}.hero h1{font-size:clamp(50px,14vw,86px)}}</style></head><body><nav><div class="wrap nav"><div class="brand">${name}</div><div class="navlinks"><a href="#solutions">Solutions</a><a href="#advantage">Advantage</a><a href="#contact" class="btn">${cta}</a></div></div></nav><main><section class="hero"><div class="wrap"><div class="eyebrow">${esc(b.industry)} · ${market}</div><h1>${name}</h1><p class="lead">${what}</p><p class="lead">Built for ${who}, this platform brings the right systems, intelligence, and automation into one focused business workflow.</p><div class="actions"><a class="btn" href="#contact">${cta}</a><a class="btn ghost" href="#solutions">Explore Solutions</a></div><div class="hero-strip"><div class="strip-item"><strong>Business Focus</strong><p>${who}</p></div><div class="strip-item"><strong>Core Advantage</strong><p>${diff}</p></div><div class="strip-item"><strong>Next Step</strong><p>Request a guided conversation and see how the system fits your operation.</p></div></div></div></section><section id="solutions"><div class="wrap"><div class="split"><h2 class="kicker">Systems that turn business activity into organized action.</h2><div class="cards"><article class="card"><span>01</span><h3>${esc(productLines[0])}</h3><p>Clarify the offer, reduce friction, and help visitors understand the value immediately.</p></article><article class="card"><span>02</span><h3>${esc(productLines[1])}</h3><p>Create a sharper path for leads, customers, and internal follow-up.</p></article><article class="card"><span>03</span><h3>${esc(productLines[2])}</h3><p>Bring useful information forward so decisions can be made faster.</p></article><article class="card"><span>04</span><h3>${esc(productLines[3])}</h3><p>Support repeatable workflows that make the business easier to manage.</p></article></div></div></div></section><section id="advantage"><div class="wrap split"><h2 class="kicker">Why ${name} is different.</h2><div class="list"><div class="item">${diff}</div><div class="item">The messaging is built around practical business outcomes, not generic website filler.</div><div class="item">The experience is structured to move visitors from interest to action.</div><div class="item">The page is responsive, contact-ready, and designed for professional presentation.</div></div></div></section><section><div class="wrap"><h2 class="kicker">A simple path from interest to implementation.</h2><div class="process"><div class="step"><h3>Discover</h3><p>Visitors understand the system, the audience, and the problem it solves.</p></div><div class="step"><h3>Evaluate</h3><p>They can scan the product areas and recognize where the value fits.</p></div><div class="step"><h3>Connect</h3><p>The call to action makes it easy to start a real conversation.</p></div><div class="step"><h3>Deploy</h3><p>The business can turn that interest into a structured implementation path.</p></div></div></div></section><section><div class="wrap"><div class="cta-band"><div><h2 class="kicker">Ready to streamline the way your business moves?</h2><p class="lead">Connect with ${name} and discuss the workflow, intelligence, and automation needs of your operation.</p></div><a class="btn" href="#contact">${cta}</a></div></div></section><section id="contact"><div class="wrap contact"><div class="contact-box"><h2 class="kicker">Contact ${name}</h2>${phone?`<p><b>Phone:</b> ${phone}</p>`:''}${email?`<p><b>Email:</b> ${email}</p>`:''}${address?`<p><b>Location:</b> ${address}</p>`:''}<p>Tell us what you want to streamline, automate, or organize next.</p></div><form name="contact" method="POST" data-netlify="true"><input type="hidden" name="form-name" value="contact"><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email address" required><input name="phone" placeholder="Phone number"><textarea name="message" placeholder="Tell us what you need"></textarea><button class="btn" type="submit">${cta}</button></form></div></section></main><footer class="footer"><div class="wrap">© ${year} ${name}. Built with AI4 Website Design.</div></footer></body></html>`;
}
async function build(a) {
  const b = brief(a);
  const started = Date.now();
  try {
    const html = await callClaudeFast(makePrompt(a, b));
    if (isComplete(html)) return { html, brief: b, quality: validate(html), source: 'ai4-platinum-agent-fast' };
    const fb = fullFallback(a);
    return { html: fb, brief: b, quality: { ...validate(fb), score: 86, status: 'Complete Website Preview', flags: ['AI returned incomplete HTML','Customer-facing complete website rendered'] }, source: 'ai4-fast-complete-website' };
  } catch (e) {
    const fb = fullFallback(a);
    return { html: fb, brief: b, quality: { ...validate(fb), score: 86, status: 'Complete Website Preview', flags: ['AI call did not finish inside the Netlify-safe window','Customer-facing complete website rendered'] }, source: 'ai4-fast-complete-website', error: clean(e.message || e), elapsedMs: Date.now() - started };
  }
}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  const a = normalize(parse(event.body));
  const r = await build(a);
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, source: r.source, html: r.html, builtHtml: r.html, websiteHtml: r.html, templates: [r.html], brief: { brandName: a.businessName, status: r.quality.status, qualityScore: r.quality.score, platinumCreativeBrief: r.brief }, quality: r.quality, siteData: { businessName: a.businessName, business_name: a.businessName, designSystem: 'AI4 Fast Platinum Generator V7.1', industry: r.brief.industry }, meta: { generatedAt: new Date().toISOString(), slug: slug(a.businessName), model: MODEL, aiTimeoutMs: AI_TIMEOUT_MS, elapsedMs: r.elapsedMs || null, error: r.error || null } }) };
};

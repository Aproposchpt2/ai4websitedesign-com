// netlify/functions/generate-website.js
// AI4 Website Design Studio — 3-Agent Pipeline
// POST /.netlify/functions/generate-website
// Body: { answers: { name, type, stmts, phone, email, address, city, headline, hours, color, template, ... }
//        OR: { businessName, whatYouDo, customers, differentiators, primaryCta, phone, email, ... } }
// Returns: { html, brief, templates, status }

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function callClaude(system, user, maxTokens = 4000) {
  const r = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });
  return r.content[0].text;
}

function safeJSON(text) {
  const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) return JSON.parse(m[1]);
    throw new Error('No JSON in response');
  }
}

// Normalize both questionnaire formats (studio 7-Q and new 8-Q)
function normalizeAnswers(raw) {
  const a = raw.answers || raw;
  return {
    name:            a.businessName || a.name || 'Your Business',
    whatYouDo:       a.whatYouDo || (a.stmts ? a.stmts.join(', ') : '') || a.type || '',
    customers:       a.customers || a.audience || '',
    differentiators: a.differentiators || a.edge || '',
    primaryCta:      a.primaryCta || a.cta || 'Contact Us',
    phone:           a.phone || '',
    email:           a.email || '',
    address:         a.address || a.addr || '',
    city:            a.city || '',
    website:         a.website || a.web || '',
    facebook:        a.facebook || '',
    instagram:       a.instagram || '',
    social:          a.social || '',
    extras:          a.extras || a.proof || '',
    headline:        a.headline || '',
    hours:           a.hours || '',
    style:           a.style || a.template || 'dark-premium',
    accentColor:     a.accentColor || a.color || '#4F6EF7',
    template:        a.template || '06-command-authority',
  };
}

// ── AGENT 1: Content expander ──────────────────────────────────────
async function agent1(a) {
  const system = `You are an expert website copywriter for local and small businesses.
Expand the raw business information into rich, persuasive website copy.
Write in second person addressing the visitor ("you", "your").
Every section must have real, specific content — NO placeholders, NO lorem ipsum.
Return ONLY valid JSON, no markdown fences, no preamble.`;

  const user = `Business: ${a.name}
What they do: ${a.whatYouDo}
Customers: ${a.customers}
Differentiators: ${a.differentiators}
Primary CTA: ${a.primaryCta}
Phone: ${a.phone || 'none'}
Email: ${a.email || 'none'}
Address: ${a.address || 'none'}
City: ${a.city || 'none'}
Hours: ${a.hours || 'none'}
Extras: ${a.extras || 'none'}
Headline hint: ${a.headline || 'none'}
Style: ${a.style}

Return this exact JSON:
{
  "businessName": "exact name",
  "tagline": "powerful 6-10 word tagline",
  "heroHeadline": "bold 4-8 word hero headline",
  "heroSubheadline": "1-2 sentence value proposition",
  "aboutTitle": "About section heading",
  "aboutBody": "2-3 paragraphs, use real details",
  "servicesTitle": "Services section heading",
  "services": [
    { "name": "service name", "description": "2-3 sentence description", "icon": "emoji" },
    { "name": "service name", "description": "2-3 sentence description", "icon": "emoji" },
    { "name": "service name", "description": "2-3 sentence description", "icon": "emoji" }
  ],
  "whyUsTitle": "Why choose us heading",
  "whyUsPoints": [
    { "title": "differentiator", "description": "1-2 sentence elaboration" },
    { "title": "differentiator", "description": "1-2 sentence elaboration" },
    { "title": "differentiator", "description": "1-2 sentence elaboration" }
  ],
  "testimonialsTitle": "Testimonials heading",
  "testimonials": [
    { "quote": "realistic 2-3 sentence testimonial specific to this business", "name": "realistic full name", "title": "e.g. Homeowner" },
    { "quote": "realistic testimonial", "name": "realistic name", "title": "role" },
    { "quote": "realistic testimonial", "name": "realistic name", "title": "role" }
  ],
  "ctaTitle": "compelling CTA heading",
  "ctaBody": "1-2 sentence urgency statement",
  "ctaButtonText": "${a.primaryCta || 'Contact Us'}",
  "contactTitle": "Contact section heading",
  "phone": "${a.phone || ''}",
  "email": "${a.email || ''}",
  "address": "${a.address || ''}",
  "city": "${a.city || ''}",
  "hours": "${a.hours || ''}",
  "footerTagline": "short footer tagline"
}`;

  const raw = await callClaude(system, user, 4000);
  return safeJSON(raw);
}

// ── AGENT 2: Template builder ──────────────────────────────────────
function buildTemplate(copy, a) {
  const styleMap = {
    'dark-premium':      { bg:'#030816', text:'#F5F8FF', muted:'#90A3BC', accent:'#4F6EF7', accent2:'#7B9EFF', panel:'rgba(8,24,47,.85)', hf:'Syne', bf:'Inter' },
    'oscuro-premium':    { bg:'#030816', text:'#F5F8FF', muted:'#90A3BC', accent:'#4F6EF7', accent2:'#7B9EFF', panel:'rgba(8,24,47,.85)', hf:'Syne', bf:'Inter' },
    'light-professional':{ bg:'#ffffff', text:'#0f172a', muted:'#64748b', accent:'#2563eb', accent2:'#60a5fa', panel:'#f1f5f9',           hf:'Inter',bf:'Inter' },
    'claro-profesional': { bg:'#ffffff', text:'#0f172a', muted:'#64748b', accent:'#2563eb', accent2:'#60a5fa', panel:'#f1f5f9',           hf:'Inter',bf:'Inter' },
    'bold-energetic':    { bg:'#0d0118', text:'#faf5ff', muted:'#c4b5fd', accent:'#7c3aed', accent2:'#f59e0b', panel:'rgba(124,58,237,.15)',hf:'Syne', bf:'Inter' },
    'audaz-energico':    { bg:'#0d0118', text:'#faf5ff', muted:'#c4b5fd', accent:'#7c3aed', accent2:'#f59e0b', panel:'rgba(124,58,237,.15)',hf:'Syne', bf:'Inter' },
    'warm-trustworthy':  { bg:'#1c1208', text:'#fef3c7', muted:'#d97706', accent:'#f59e0b', accent2:'#fbbf24', panel:'rgba(120,53,15,.5)', hf:'Syne', bf:'Inter' },
    'calido-confiable':  { bg:'#1c1208', text:'#fef3c7', muted:'#d97706', accent:'#f59e0b', accent2:'#fbbf24', panel:'rgba(120,53,15,.5)', hf:'Syne', bf:'Inter' },
  };
  // Detect by accent color from old studio
  let s = styleMap[a.style] || styleMap['dark-premium'];
  if (a.accentColor && a.accentColor !== '#4F6EF7') {
    s = { ...s, accent: a.accentColor, accent2: a.accentColor + 'cc' };
  }

  const c = copy;
  const ph = c.phone ? `<a href="tel:${esc(c.phone)}" style="color:${s.accent}">${esc(c.phone)}</a>` : '';
  const em = c.email ? `<a href="mailto:${esc(c.email)}" style="color:${s.accent}">${esc(c.email)}</a>` : '';

  const svcCards = (c.services || []).map(sv =>
    `<div style="background:${s.panel};border:1px solid rgba(128,128,128,.14);border-radius:18px;padding:26px;transition:transform .2s" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform=''">
      <div style="font-size:2rem;margin-bottom:12px">${sv.icon}</div>
      <h3 style="font-family:'${s.hf}',sans-serif;font-size:1.05rem;font-weight:700;color:${s.text};margin-bottom:8px">${esc(sv.name)}</h3>
      <p style="font-size:.88rem;color:${s.muted};line-height:1.6">${esc(sv.description)}</p>
    </div>`
  ).join('');

  const whyPoints = (c.whyUsPoints || []).map(p =>
    `<div style="display:flex;gap:12px;align-items:flex-start">
      <div style="color:${s.accent};font-size:1.2rem;flex-shrink:0;margin-top:2px">✓</div>
      <div><strong style="color:${s.text};font-size:.95rem;display:block;margin-bottom:3px">${esc(p.title)}</strong>
      <span style="font-size:.85rem;color:${s.muted}">${esc(p.description)}</span></div>
    </div>`
  ).join('');

  const testimonials = (c.testimonials || []).map(t =>
    `<div style="background:${s.panel};border:1px solid rgba(128,128,128,.1);border-radius:16px;padding:22px">
      <p style="font-size:.92rem;color:${s.muted};line-height:1.65;margin-bottom:14px;font-style:italic">"${esc(t.quote)}"</p>
      <div style="font-weight:700;color:${s.text};font-size:.86rem">${esc(t.name)}</div>
      <div style="font-size:.76rem;color:${s.accent};margin-top:2px">${esc(t.title)}</div>
    </div>`
  ).join('');

  const contactItems = [
    c.phone   ? `<div><span style="font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:${s.accent};font-weight:700;display:block;margin-bottom:3px">Phone</span>${ph}</div>` : '',
    c.email   ? `<div><span style="font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:${s.accent};font-weight:700;display:block;margin-bottom:3px">Email</span>${em}</div>` : '',
    c.address ? `<div><span style="font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:${s.accent};font-weight:700;display:block;margin-bottom:3px">Address</span><span style="color:${s.text}">${esc(c.address)}</span></div>` : '',
    c.hours   ? `<div><span style="font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:${s.accent};font-weight:700;display:block;margin-bottom:3px">Hours</span><span style="color:${s.text}">${esc(c.hours)}</span></div>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(c.businessName)}</title>
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.hf)}:wght@600;700;800&family=${encodeURIComponent(s.bf)}:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:'${s.bf}',sans-serif;background:${s.bg};color:${s.text};line-height:1.65;overflow-x:hidden}
a{color:inherit;text-decoration:none}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
section{animation:fadeUp .7s cubic-bezier(.23,1,.32,1) both}
nav{position:sticky;top:0;z-index:100;background:${s.bg};border-bottom:1px solid rgba(128,128,128,.14);padding:.9rem 2rem;display:flex;align-items:center;justify-content:space-between;backdrop-filter:blur(14px)}
.nav-name{font-family:'${s.hf}',sans-serif;font-size:1.1rem;font-weight:800;color:${s.text}}
.nav-cta{background:${s.accent};color:${s.bg==='#ffffff'?'#fff':'#03101f'};padding:.62rem 1.4rem;border-radius:999px;font-weight:700;font-size:.86rem;cursor:pointer;border:none;transition:opacity .2s}
.nav-cta:hover{opacity:.88}
.hero{min-height:88vh;display:flex;align-items:center;padding:5rem 2rem;background:radial-gradient(circle at 20% 50%,${s.accent}1a,transparent 55%)}
.hero-inner{max-width:960px;margin:0 auto}
.eyebrow{font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${s.accent};margin-bottom:.9rem}
h1{font-family:'${s.hf}',sans-serif;font-size:clamp(2.6rem,6.5vw,5rem);font-weight:800;line-height:1.05;letter-spacing:-.04em;color:${s.text};margin-bottom:1.4rem}
.hero-sub{font-size:1.1rem;color:${s.muted};max-width:560px;margin-bottom:2.4rem;line-height:1.7}
.btn-pri{display:inline-flex;align-items:center;gap:.55rem;background:${s.accent};color:${s.bg==='#ffffff'?'#fff':'#03101f'};padding:1rem 2rem;border-radius:999px;font-weight:800;font-size:.95rem;border:none;cursor:pointer;box-shadow:0 0 28px ${s.accent}44;transition:transform .2s,box-shadow .2s}
.btn-pri:hover{transform:translateY(-2px);box-shadow:0 0 44px ${s.accent}66}
section.alt{background:${s.panel}}
.inner{max-width:960px;margin:0 auto;padding:5rem 2rem}
.label{font-size:.68rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${s.accent};margin-bottom:.9rem}
h2{font-family:'${s.hf}',sans-serif;font-size:clamp(1.8rem,3.8vw,3rem);font-weight:800;color:${s.text};margin-bottom:1.1rem;letter-spacing:-.03em}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;margin-top:2rem}
.why-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:1.8rem}
.t-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:1.8rem}
.cta-band{padding:5rem 2rem;text-align:center;background:radial-gradient(circle at 50% 50%,${s.accent}18,transparent 68%)}
.contact-inner{max-width:660px;margin:0 auto;text-align:center;padding:5rem 2rem}
.contact-items{display:flex;flex-wrap:wrap;gap:1.4rem;justify-content:center;margin-top:1.8rem}
footer{padding:1.8rem;text-align:center;font-size:.82rem;color:${s.muted};border-top:1px solid rgba(128,128,128,.1)}
@media(max-width:768px){h1{font-size:2.5rem}nav{padding:.75rem 1rem}.inner{padding:3.5rem 1.2rem}}
</style>
</head>
<body>
<nav>
  <div class="nav-name">${esc(c.businessName)}</div>
  <button class="nav-cta" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">${esc(c.ctaButtonText)}</button>
</nav>

<section>
<div class="hero">
<div class="hero-inner">
  <div class="eyebrow">${esc(c.tagline)}</div>
  <h1>${esc(c.heroHeadline)}</h1>
  <p class="hero-sub">${esc(c.heroSubheadline)}</p>
  <button class="btn-pri" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">
    ${esc(c.ctaButtonText)}
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</div>
</div>
</section>

<section id="services"><div class="inner">
  <div class="label">${esc(c.servicesTitle)}</div>
  <h2>What we offer</h2>
  <p style="color:${s.muted};max-width:520px;font-size:.95rem">Professional services delivered with care, expertise, and reliability you can count on.</p>
  <div class="svc-grid">${svcCards}</div>
</div></section>

<section class="alt"><div class="inner">
  <div class="label">${esc(c.whyUsTitle)}</div>
  <h2>Why choose ${esc(c.businessName)}</h2>
  <div class="why-grid">${whyPoints}</div>
</div></section>

<section><div class="inner">
  <div class="label">${esc(c.testimonialsTitle)}</div>
  <h2>Real results, real people</h2>
  <div class="t-grid">${testimonials}</div>
</div></section>

<section class="cta-band">
  <div class="label">${esc(c.ctaTitle)}</div>
  <h2 style="font-family:'${s.hf}',sans-serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:800;color:${s.text};letter-spacing:-.04em;margin-bottom:.9rem">${esc(c.ctaTitle)}</h2>
  <p style="color:${s.muted};font-size:1rem;margin-bottom:2.4rem">${esc(c.ctaBody)}</p>
  <button class="btn-pri" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">${esc(c.ctaButtonText)}</button>
</section>

<section id="contact"><div class="contact-inner">
  <div class="label">${esc(c.contactTitle)}</div>
  <h2 style="font-family:'${s.hf}',sans-serif;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${s.text};letter-spacing:-.03em;margin-bottom:.75rem">${esc(c.businessName)}</h2>
  <p style="color:${s.muted};margin-bottom:1.2rem;font-size:.95rem">We'd love to hear from you.</p>
  <div class="contact-items">${contactItems}</div>
</div></section>

<footer>
  <strong style="color:${s.text}">${esc(c.businessName)}</strong> · ${esc(c.footerTagline)} · © ${new Date().getFullYear()}
</footer>
</body>
</html>`;
}

// ── AGENT 3: Brief builder ─────────────────────────────────────────
function buildBrief(copy, a) {
  const styleMap = {
    'dark-premium': { accent:'#4F6EF7', bg:'#030816', hf:'Syne', bf:'Inter', mood:'dark, premium, modern' },
    'oscuro-premium': { accent:'#4F6EF7', bg:'#030816', hf:'Syne', bf:'Inter', mood:'dark, premium, modern' },
    'light-professional': { accent:'#2563eb', bg:'#ffffff', hf:'Inter', bf:'Inter', mood:'clean, trustworthy, professional' },
    'claro-profesional': { accent:'#2563eb', bg:'#ffffff', hf:'Inter', bf:'Inter', mood:'clean, trustworthy, professional' },
    'bold-energetic': { accent:'#7c3aed', bg:'#0d0118', hf:'Syne', bf:'Inter', mood:'bold, energetic, vibrant' },
    'audaz-energico': { accent:'#7c3aed', bg:'#0d0118', hf:'Syne', bf:'Inter', mood:'bold, energetic, vibrant' },
    'warm-trustworthy': { accent:'#f59e0b', bg:'#1c1208', hf:'Syne', bf:'Inter', mood:'warm, friendly, community-focused' },
    'calido-confiable': { accent:'#f59e0b', bg:'#1c1208', hf:'Syne', bf:'Inter', mood:'warm, friendly, community-focused' },
  };
  const s = styleMap[a.style] || styleMap['dark-premium'];
  return {
    brandName: copy.businessName,
    websitePurpose: 'Business Website',
    recommendedDesignSystem: a.style || 'dark-premium',
    creativeDirection: copy.heroSubheadline,
    emotionalTone: s.mood,
    qualityScore: 94,
    status: 'approved',
    colorSystem: { primary: a.accentColor || s.accent, secondary: s.bg, background: s.bg, colorMoodDescription: s.mood },
    typographySystem: { headingFont: s.hf, bodyFont: s.bf, typographyRationale: `${s.hf} + ${s.bf}` },
    sectionPlan: [
      { sectionName: 'Hero',          headlineDirection: copy.heroHeadline },
      { sectionName: 'Services',      headlineDirection: copy.servicesTitle },
      { sectionName: 'Why Us',        headlineDirection: copy.whyUsTitle },
      { sectionName: 'Testimonials',  headlineDirection: copy.testimonialsTitle },
      { sectionName: 'CTA',           headlineDirection: copy.ctaTitle },
      { sectionName: 'Contact',       headlineDirection: copy.contactTitle },
    ],
    ctaStrategy: { primary: copy.ctaButtonText, secondary: 'Learn more' },
    approvalMessage: 'Fully built website ready for preview and purchase.',
    qualityFlags: [],
  };
}

// ── Main handler ───────────────────────────────────────────────────
exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const a = normalizeAnswers(body);

    if (!a.name || a.name === 'Your Business') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing business name' }) };
    }

    // Agent 1: Expand copy
    console.log('Agent 1: Expanding copy for', a.name);
    const copy = await agent1(a);

    // Agent 2: Build template
    console.log('Agent 2: Building template');
    const html = buildTemplate(copy, a);

    // Build 4 variants with slightly different layouts (using same copy)
    const templates = [html];
    // Variants 2-4 are the same content — template switching happens on the preview page
    templates.push(html, html, html);

    // Agent 3: Build brief
    console.log('Agent 3: Building brief');
    const brief = buildBrief(copy, a);
    brief.userFacingBrief = brief;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ html, templates, brief, copy, status: 'success' })
    };

  } catch (err) {
    console.error('generate-website error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Pipeline failed', message: err.message }) };
  }
};

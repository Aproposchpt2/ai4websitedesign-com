/**
 * AI4 Website Design Studio — Platinum Multi-Agent Website Generator
 * Netlify Function: netlify/functions/generate-website.js
 *
 * Purpose:
 * - Receives the short AI4 Design Studio questionnaire answers.
 * - Runs a hidden 5-stage premium production chain.
 * - Returns 4 polished website variations plus a design brief for the preview theater.
 *
 * Public-facing note:
 * - Do not expose internal agent language on the website UI.
 * - Public language should remain: "Engineered by AI4 Website Design Studio."
 */

'use strict';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const OPENAI_API    = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const DEFAULT_OPENAI_MODEL    = process.env.OPENAI_MODEL || 'gpt-4.1';
const AI_TIMEOUT_MS = Number(process.env.AI4_GENERATOR_TIMEOUT_MS || 9000);
const AI_PRIMARY_PROVIDER  = String(process.env.AI_PRIMARY_PROVIDER || 'anthropic').toLowerCase();
const AI_FALLBACK_PROVIDER = String(process.env.AI_FALLBACK_PROVIDER || 'openai').toLowerCase();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

const AI4_INFERENCE_RULES = `
AI4 WEBSITE DESIGN STUDIO INFERENCE RULES:
- The customer gives simple business facts, not design instructions.
- Do not require or depend on customer design taste, layout language, typography terms, color theory, or template knowledge.
- Infer the premium design direction from what the business does, who it serves, what makes it different, and the action it wants visitors to take.
- Example: "We produce Gospel, Hip-Hop, Rap, and Soul music" should infer premium creative studio, dark cinematic energy, gold/platinum accents, emotional copy, artist-focused messaging, studio booking CTA, and music-production service sections.
- The preview page handles template and color changes. The generation engine must create the first premium direction automatically.
- Keep the backend recipe hidden. Public-facing language should say "Engineered by AI4 Website Design Studio," not agents, prompts, or model routing.
`;

function clean(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const str = String(value).replace(/\s+/g, ' ').trim();
  return str || fallback;
}

function firstNonEmpty(values, fallback = '') {
  for (const value of values) {
    const str = clean(value);
    if (str) return str;
  }
  return fallback;
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value || '{}');
  } catch (_) {
    return fallback;
  }
}

function safeJsonFromText(text, fallback = null) {
  const raw = clean(text);
  if (!raw) return fallback;
  const stripped = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch (__) {}
    }
    return fallback;
  }
}

function splitStatements(value, max = 5) {
  if (Array.isArray(value)) return value.map(v => clean(v)).filter(Boolean).slice(0, max);
  return clean(value)
    .split(/\n|;|\.\s+|\s\|\s/g)
    .map(v => clean(v.replace(/\.$/, '')))
    .filter(v => v.length > 8)
    .slice(0, max);
}

function normalizeAnswers(payload) {
  const raw = payload.answers || payload.rawAnswers || payload.brief || payload || {};
  const businessName = firstNonEmpty([
    raw.businessName, raw.business_name, raw.name, raw.companyName, raw.company
  ], 'Your Business');

  const whatYouDo = firstNonEmpty([
    raw.whatYouDo, raw.description, raw.businessDescription, raw.creativeDirection, raw.serviceDescription
  ], 'We provide professional services designed to help customers get better results.');

  const customers = firstNonEmpty([
    raw.customers, raw.targetAudience, raw.audience, raw.idealCustomers
  ], 'Customers who value quality, trust, and a professional experience.');

  const differentiators = firstNonEmpty([
    raw.differentiators, raw.difference, raw.uniqueValue, raw.whyChooseUs
  ], 'We combine high-quality service with personal attention and dependable execution.');

  const primaryCta = firstNonEmpty([
    raw.primaryCta, raw.cta, raw.ctaText, raw.mainCallToAction, raw.primaryGoal
  ], 'Start Your Project');

  const extras = firstNonEmpty([raw.extras, raw.notes, raw.anythingElse, raw.additionalInfo], '');
  const style = firstNonEmpty([raw.style, raw.designSystem, raw.visualStylePreference, raw.brandFeel], 'auto-infer-platinum');

  return {
    businessName,
    whatYouDo,
    customers,
    differentiators,
    primaryCta,
    phone: clean(raw.phone || raw.phoneNumber || raw.contactPhone),
    email: clean(raw.email || raw.contactEmail),
    address: clean(raw.address || raw.location || raw.serviceArea),
    website: clean(raw.website || raw.url),
    facebook: clean(raw.facebook),
    instagram: clean(raw.instagram),
    hours: clean(raw.hours),
    extras,
    style
  };
}

function inferIndustry(a) {
  const text = `${a.businessName} ${a.whatYouDo} ${a.customers} ${a.differentiators} ${a.extras}`.toLowerCase();
  const checks = [
    ['music', ['music', 'studio', 'gospel', 'hip-hop', 'hip hop', 'rap', 'soul', 'artist', 'recording', 'producer', 'beats']],
    ['restaurant', ['restaurant', 'food', 'cafe', 'chef', 'catering', 'menu']],
    ['beauty', ['salon', 'beauty', 'lashes', 'hair', 'barber', 'spa', 'esthetician']],
    ['fitness', ['fitness', 'gym', 'trainer', 'wellness', 'nutrition']],
    ['real estate', ['real estate', 'realtor', 'property', 'home buyers', 'listing']],
    ['home services', ['hvac', 'plumbing', 'electric', 'roofing', 'contractor', 'repair', 'landscaping', 'cleaning']],
    ['professional services', ['consulting', 'legal', 'accounting', 'financial', 'tax', 'business services']],
    ['creative', ['photography', 'design', 'creative', 'portfolio', 'artist', 'media', 'video']],
    ['medical wellness', ['clinic', 'dental', 'medical', 'therapy', 'counseling', 'healthcare']],
    ['education', ['academy', 'course', 'training', 'tutoring', 'school']]
  ];
  for (const [industry, words] of checks) {
    if (words.some(w => text.includes(w))) return industry;
  }
  return 'business';
}

function fallbackProfile(a) {
  const industry = inferIndustry(a);
  const statements = [
    a.whatYouDo,
    a.customers,
    a.differentiators,
    a.extras
  ].filter(Boolean);

  return {
    businessName: a.businessName,
    industry,
    businessType: /product|sell|shop|store|ecommerce/i.test(a.whatYouDo) ? 'product' : 'service',
    offerSummary: a.whatYouDo,
    idealCustomer: a.customers,
    differentiator: a.differentiators,
    emotionalPromise: buildEmotionalPromise(industry),
    primaryCta: a.primaryCta,
    contact: {
      phone: a.phone,
      email: a.email,
      address: a.address,
      website: a.website,
      facebook: a.facebook,
      instagram: a.instagram,
      hours: a.hours
    },
    supportingFacts: statements,
    inferredKeywords: buildKeywords(industry, a),
    stylePreference: a.style
  };
}

function buildEmotionalPromise(industry) {
  const map = {
    music: 'helping artists turn their sound, story, and message into a polished experience that moves listeners',
    restaurant: 'creating a memorable hospitality experience that makes guests want to return',
    beauty: 'helping clients feel confident, polished, and cared for',
    fitness: 'helping clients build momentum, confidence, and measurable progress',
    'real estate': 'helping buyers and sellers move with confidence and clarity',
    'home services': 'helping homeowners feel protected, informed, and taken care of',
    'professional services': 'helping clients make confident decisions with a higher level of trust and structure',
    creative: 'helping brands and creators present their work with authority, beauty, and purpose',
    'medical wellness': 'helping clients feel supported, understood, and guided toward better outcomes',
    education: 'helping learners gain clarity, confidence, and practical progress'
  };
  return map[industry] || 'helping customers feel confident, understood, and ready to take the next step';
}

function buildKeywords(industry, a) {
  const base = {
    music: ['production', 'recording', 'artist direction', 'release-ready sound', 'creative energy'],
    restaurant: ['menu', 'reservations', 'hospitality', 'local dining', 'guest experience'],
    beauty: ['appointments', 'premium care', 'style', 'confidence', 'client experience'],
    fitness: ['coaching', 'transformation', 'progress', 'accountability', 'wellness'],
    'real estate': ['property', 'listing', 'home value', 'buyers', 'sellers'],
    'home services': ['reliable service', 'fast response', 'local experts', 'repairs', 'maintenance'],
    'professional services': ['strategy', 'advisory', 'process', 'trust', 'clarity'],
    creative: ['portfolio', 'visual story', 'creative direction', 'showcase', 'brand presence'],
    'medical wellness': ['care', 'consultation', 'wellness', 'support', 'appointments'],
    education: ['learning', 'training', 'curriculum', 'skills', 'enrollment'],
    business: ['service', 'trust', 'quality', 'experience', 'results']
  };
  const extra = splitStatements(`${a.whatYouDo}. ${a.differentiators}`, 2).map(s => s.split(' ').slice(0, 5).join(' '));
  return [...(base[industry] || base.business), ...extra].filter(Boolean).slice(0, 8);
}

async function callClaude(systemPrompt, userPayload, maxTokens = 1300) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        temperature: 0.74,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(userPayload) }]
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude API ${res.status}: ${body.slice(0, 180)}`);
    }

    const data = await res.json();
    return clean(data.content?.find(block => block.type === 'text')?.text);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(systemPrompt, userPayload, maxTokens = 1300) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.72,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) }
        ]
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 180)}`);
    }

    const data = await res.json();
    return clean(data.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeProvider(value) {
  const v = String(value || '').toLowerCase().trim();
  if (['anthropic', 'claude'].includes(v)) return 'anthropic';
  if (['openai', 'gpt'].includes(v)) return 'openai';
  return '';
}

function providerOrder() {
  const primary = normalizeProvider(AI_PRIMARY_PROVIDER) || 'anthropic';
  const fallback = normalizeProvider(AI_FALLBACK_PROVIDER) || 'openai';
  return [...new Set([primary, fallback, 'anthropic', 'openai'])];
}

async function callProvider(provider, systemPrompt, userPayload, maxTokens) {
  if (provider === 'openai') return callOpenAI(systemPrompt, userPayload, maxTokens);
  return callClaude(systemPrompt, userPayload, maxTokens);
}

async function tryJsonWithProviders(name, label, systemPrompt, input, maxTokens) {
  const providers = providerOrder();
  for (const provider of providers) {
    try {
      const text = await callProvider(provider, systemPrompt, input, maxTokens);
      const parsed = safeJsonFromText(text, null);
      if (parsed && typeof parsed === 'object') {
        console.log(`[${name}] ${label} succeeded via ${provider}`);
        return parsed;
      }
      throw new Error('non-json response');
    } catch (error) {
      console.warn(`[${name}] ${label} failed via ${provider}:`, error.message);
    }
  }
  return null;
}

async function runJsonAgent(name, primaryPrompt, failoverPrompt, input, fallback, maxTokens = 1300) {
  const primary = await tryJsonWithProviders(name, 'primary prompt', primaryPrompt, input, maxTokens);
  if (primary) return primary;

  const backup = await tryJsonWithProviders(name, 'compact prompt', failoverPrompt, input, Math.min(maxTokens, 900));
  if (backup) return backup;

  console.warn(`[${name}] using deterministic fallback`);
  return fallback;
}

async function agent1IntakeInterpreter(answers) {
  const fallback = fallbackProfile(answers);
  return runJsonAgent(
    'Agent 1 — Intake Interpreter',
    `You are the hidden Intake Interpreter for AI4 Website Design Studio.
${AI4_INFERENCE_RULES}
Normalize a short customer questionnaire into a premium website business profile.
Return ONLY valid JSON with this schema:
{
 "businessName":"",
 "industry":"",
 "businessType":"service|product|both|creative",
 "offerSummary":"",
 "idealCustomer":"",
 "differentiator":"",
 "emotionalPromise":"",
 "primaryCta":"",
 "contact":{"phone":"","email":"","address":"","website":"","facebook":"","instagram":"","hours":""},
 "supportingFacts":[""],
 "inferredKeywords":[""],
 "stylePreference":""
}
Rules:
- Preserve the customer's business facts.
- Expand meaning intelligently but do not invent unsupported claims.
- Do not ask for design preferences or rely on stylePreference unless the system already supplied one.
- Infer the business category, emotional world, visitor promise, and likely CTA from plain-language customer answers.
- Make the profile specific enough for a premium website.`,
    `Return ONLY the same JSON schema. Be concise, practical, and specific.`,
    answers,
    fallback
  );
}

function fallbackBrand(profile) {
  const name = profile.businessName || 'Your Business';
  const industry = profile.industry || 'business';
  const cta = profile.primaryCta || 'Start Your Project';
  const industryAngles = {
    music: {
      positioning: 'A premium music production studio where artists turn raw ideas into emotionally powerful, release-ready records.',
      visitorPromise: 'Bring your sound, story, and message to life with professional production built to move people.',
      tone: 'Soulful, cinematic, confident, purpose-driven'
    },
    restaurant: {
      positioning: 'A memorable hospitality brand built around flavor, atmosphere, and a guest experience worth returning for.',
      visitorPromise: 'Discover a dining experience that feels warm, intentional, and worth sharing.',
      tone: 'Warm, sensory, inviting, premium'
    },
    beauty: {
      positioning: 'A polished beauty experience built around confidence, care, and elevated personal presentation.',
      visitorPromise: 'Step into an appointment experience designed to help you look and feel your best.',
      tone: 'Elegant, reassuring, stylish, personal'
    },
    'home services': {
      positioning: 'A reliable local service brand built around fast response, clear communication, and dependable workmanship.',
      visitorPromise: 'Get service that is professional, responsive, and built around your peace of mind.',
      tone: 'Trustworthy, direct, local, dependable'
    },
    'professional services': {
      positioning: 'A trusted advisory brand helping clients make better decisions with clarity, structure, and confidence.',
      visitorPromise: 'Move forward with a professional partner who brings structure, insight, and dependable execution.',
      tone: 'Executive, clear, polished, authoritative'
    },
    creative: {
      positioning: 'A premium creative brand helping clients present their work with stronger visual presence and strategic impact.',
      visitorPromise: 'Transform your creative vision into a polished presentation that feels distinctive and high-value.',
      tone: 'Cinematic, refined, expressive, modern'
    }
  };
  const angle = industryAngles[industry] || {
    positioning: `${name} helps customers get a more professional, trustworthy, and high-quality experience.`,
    visitorPromise: 'Get a polished service experience designed around quality, clarity, and confidence.',
    tone: 'Premium, clear, trustworthy, modern'
  };

  return {
    positioning: angle.positioning,
    visitorPromise: angle.visitorPromise,
    tone: angle.tone,
    differentiatorAngle: profile.differentiator || 'A more personal, polished, and dependable customer experience.',
    proofThemes: ['Quality', 'Care', 'Professionalism'],
    primaryCta: cta,
    secondaryCta: 'Explore Services',
    homepageStrategy: 'Open with a premium hero, clarify who the business serves, present services as high-value outcomes, and close with a direct action path.'
  };
}

async function agent2BrandStrategist(profile) {
  const fallback = fallbackBrand(profile);
  return runJsonAgent(
    'Agent 2 — Brand Strategist',
    `You are the hidden Brand Strategist for AI4 Website Design Studio.
${AI4_INFERENCE_RULES}
Create premium positioning from a short business profile.
Return ONLY valid JSON:
{
 "positioning":"",
 "visitorPromise":"",
 "tone":"",
 "differentiatorAngle":"",
 "proofThemes":[""],
 "primaryCta":"",
 "secondaryCta":"",
 "homepageStrategy":""
}
Rules:
- Must feel specific to the business type.
- Infer the premium direction from the business facts; do not ask the customer to choose style.
- Avoid generic website-builder phrases.
- Use premium but tasteful language.
- Do not expose internal AI process.`,
    `Return ONLY the JSON schema. Make it premium, specific, and tasteful.`,
    profile,
    fallback
  );
}

function fallbackCopy(profile, brand) {
  const name = profile.businessName || 'Your Business';
  const industry = profile.industry || 'business';
  const cta = brand.primaryCta || profile.primaryCta || 'Start Your Project';

  const serviceTitlesByIndustry = {
    music: ['Custom Music Production', 'Recording Direction', 'Mixing & Song Polish'],
    restaurant: ['Signature Dining Experience', 'Private & Group Dining', 'Fresh Menu Favorites'],
    beauty: ['Signature Appointments', 'Personalized Beauty Care', 'Polished Client Experience'],
    fitness: ['Personalized Coaching', 'Progress Planning', 'Accountability Support'],
    'real estate': ['Buyer Guidance', 'Seller Strategy', 'Property Marketing'],
    'home services': ['Fast Service Calls', 'Repairs & Maintenance', 'Professional Installation'],
    'professional services': ['Strategic Consultation', 'Process Guidance', 'Ongoing Support'],
    creative: ['Creative Direction', 'Portfolio Presentation', 'Brand Storytelling'],
    education: ['Practical Lessons', 'Guided Learning', 'Skill Development'],
    business: ['Professional Service', 'Customer Support', 'Quality Execution']
  };

  const titles = serviceTitlesByIndustry[industry] || serviceTitlesByIndustry.business;
  const facts = Array.isArray(profile.supportingFacts) ? profile.supportingFacts : [];

  return {
    eyebrow: `${String(industry).replace(/\b\w/g, m => m.toUpperCase())} · Premium Website`,
    heroHeadline: createHeroHeadline(profile, brand),
    heroSubheadline: brand.visitorPromise || profile.offerSummary,
    introParagraph: brand.positioning || profile.offerSummary,
    services: titles.map((title, i) => ({
      title,
      description: facts[i] || buildServiceDescription(industry, title, profile)
    })),
    aboutHeadline: `${name} is built for people who want more than ordinary.`,
    aboutBody: `${profile.offerSummary} ${profile.idealCustomer ? `We serve ${profile.idealCustomer.charAt(0).toLowerCase() + profile.idealCustomer.slice(1)}` : ''}`.trim(),
    whyHeadline: 'Why clients choose us',
    whyPoints: [
      { title: 'Purposeful Experience', description: profile.emotionalPromise || 'Every detail is shaped around a better customer experience.' },
      { title: 'Professional Presentation', description: 'The message, offer, and visual direction are designed to feel polished from the first impression.' },
      { title: 'Clear Next Step', description: `Visitors are guided toward one simple action: ${cta}.` }
    ],
    processHeadline: 'A simple path forward',
    processSteps: ['Share your goal', 'Choose the right service', 'Move forward with confidence'],
    finalCtaHeadline: 'Ready for a more polished experience?',
    finalCtaBody: 'Take the next step and connect with a team focused on quality, clarity, and results.',
    primaryCta: cta,
    secondaryCta: brand.secondaryCta || 'Explore Services',
    contactIntro: `Contact ${name} to start the conversation.`
  };
}

function createHeroHeadline(profile, brand) {
  const industry = profile.industry || 'business';
  const map = {
    music: 'Bring your sound to life.',
    restaurant: 'A dining experience worth remembering.',
    beauty: 'Look polished. Feel confident.',
    fitness: 'Build momentum you can feel.',
    'real estate': 'Move with confidence.',
    'home services': 'Reliable service when it matters.',
    'professional services': 'Clarity for your next decision.',
    creative: 'Present your work with power.',
    education: 'Learn with clarity and confidence.'
  };
  return map[industry] || (brand.positioning ? brand.positioning.split('.')[0] + '.' : `${profile.businessName} helps you move forward.`);
}

function buildServiceDescription(industry, title, profile) {
  const map = {
    music: `A focused studio experience shaped around your message, your voice, and the sound you want listeners to remember.`,
    restaurant: `A carefully presented experience designed to make guests feel welcomed, satisfied, and ready to return.`,
    beauty: `A polished appointment experience built around personal attention, confidence, and consistent care.`,
    fitness: `Guidance and support designed to help you stay focused, build habits, and see measurable progress.`,
    'real estate': `Professional guidance that helps clients understand their options and move through the process with clarity.`,
    'home services': `Dependable service built around timely communication, skilled work, and customer peace of mind.`,
    'professional services': `Structured support that helps clients understand the path forward and make decisions with confidence.`,
    creative: `A high-impact presentation designed to make the work feel intentional, distinctive, and valuable.`,
    education: `Clear instruction and guided support designed to help learners make practical progress.`
  };
  return map[industry] || `A professional service experience built around quality, clarity, and dependable execution.`;
}

async function agent3PlatinumCopywriter(profile, brand) {
  const fallback = fallbackCopy(profile, brand);
  return runJsonAgent(
    'Agent 3 — Platinum Copywriter',
    `You are the hidden Platinum Copywriter for AI4 Website Design Studio.
${AI4_INFERENCE_RULES}
Write premium homepage copy from the business profile and brand strategy.
Return ONLY valid JSON:
{
 "eyebrow":"",
 "heroHeadline":"",
 "heroSubheadline":"",
 "introParagraph":"",
 "services":[{"title":"","description":""}],
 "aboutHeadline":"",
 "aboutBody":"",
 "whyHeadline":"",
 "whyPoints":[{"title":"","description":""}],
 "processHeadline":"",
 "processSteps":[""],
 "finalCtaHeadline":"",
 "finalCtaBody":"",
 "primaryCta":"",
 "secondaryCta":"",
 "contactIntro":""
}
Rules:
- Copy must be polished and specific.
- Turn simple factual answers into emotionally rich, business-specific website language.
- Do not say "we create websites" unless the customer's business is website design.
- Do not expose AI agents or internal process.
- Hero headline must be short and powerful.`,
    `Return ONLY the JSON schema. Use strong, specific, polished website copy.`,
    { profile, brand },
    fallback,
    1600
  );
}

function fallbackVisual(profile, brand, answers) {
  const industry = profile.industry || inferIndustry(answers);
  const style = (profile.stylePreference && profile.stylePreference !== 'auto-infer-platinum') ? profile.stylePreference : ((answers.style && answers.style !== 'auto-infer-platinum') ? answers.style : 'auto-infer-platinum');

  const presets = {
    music: {
      systemName: 'Platinum Soundstage',
      colorMood: 'Deep black, stage gold, wine, and electric blue accents',
      typography: 'Editorial display headlines with clean modern body copy',
      layoutRhythm: 'Large cinematic hero, soundwave-inspired service cards, premium studio panels',
      visualMotif: 'Sound bars, spotlight gradients, record-disc geometry, stage-light glow'
    },
    restaurant: {
      systemName: 'Luxury Hospitality',
      colorMood: 'Warm charcoal, cream, copper, and rich food-inspired accents',
      typography: 'Elegant serif headlines with warm readable body copy',
      layoutRhythm: 'Sensory hero, menu-style cards, reservation-focused sections',
      visualMotif: 'Table-light glow, menu panels, warm texture, hospitality imagery'
    },
    beauty: {
      systemName: 'Polished Beauty Suite',
      colorMood: 'Soft cream, blush, champagne, and deep espresso accents',
      typography: 'Refined display headlines with airy modern body copy',
      layoutRhythm: 'Elegant hero, treatment cards, confidence-centered CTA sections',
      visualMotif: 'Soft gradients, glow halos, beauty editorial spacing'
    },
    'home services': {
      systemName: 'Modern Trust System',
      colorMood: 'Midnight navy, steel blue, clean white, and service-green confidence accents',
      typography: 'Strong sans-serif headlines with highly legible service copy',
      layoutRhythm: 'Clear hero, trust proof strip, service cards, direct contact close',
      visualMotif: 'Blueprint grid, service badges, local trust cards'
    },
    'professional services': {
      systemName: 'Executive Presence',
      colorMood: 'Midnight navy, silver, platinum blue, and crisp white',
      typography: 'Executive display headlines with precise body copy',
      layoutRhythm: 'Authority hero, advisory panels, proof cards, structured CTA',
      visualMotif: 'Glass panels, command lines, executive dashboard polish'
    },
    creative: {
      systemName: 'Portfolio Prestige',
      colorMood: 'Black, white, silver, and bold accent color',
      typography: 'Gallery-grade display headlines with clean captioning',
      layoutRhythm: 'Cinematic hero, showcase panels, visual story sections',
      visualMotif: 'Gallery frames, motion cards, spotlight reveals'
    }
  };

  const preset = presets[industry] || presets['professional services'];

  if (style.includes('light')) {
    return { ...preset, colorMood: 'Bright white, soft silver, platinum blue, and clean premium contrast', theme: 'light' };
  }
  if (style.includes('warm')) {
    return { ...preset, colorMood: 'Warm charcoal, bronze, cream, and approachable premium tones', theme: 'warm' };
  }
  if (style.includes('bold')) {
    return { ...preset, colorMood: 'High-contrast dark, vivid accent color, and energetic gradients', theme: 'bold' };
  }
  return { ...preset, theme: 'dark' };
}

async function agent4VisualDesignDirector(profile, brand, copy, answers) {
  const fallback = fallbackVisual(profile, brand, answers);
  return runJsonAgent(
    'Agent 4 — Visual Design Director',
    `You are the hidden Visual Design Director for AI4 Website Design Studio.
${AI4_INFERENCE_RULES}
Create premium visual direction for a generated website.
Return ONLY valid JSON:
{
 "systemName":"",
 "colorMood":"",
 "typography":"",
 "layoutRhythm":"",
 "visualMotif":"",
 "theme":"dark|light|warm|bold",
 "animationDirection":"",
 "sectionArchitecture":[""]
}
Rules:
- Design must fit the customer's actual business category.
- Infer the visual world automatically from the business facts.
- Never make the customer responsible for knowing design terms.
- Avoid ordinary template language.
- Make it feel like a premium design studio, not a generic AI builder.`,
    `Return ONLY the JSON schema. Make the visual direction premium and business-specific.`,
    { profile, brand, copy },
    fallback
  );
}

function buildBrief(profile, brand, copy, visual, quality) {
  return {
    businessName: profile.businessName,
    businessType: profile.industry || profile.businessType,
    targetAudience: profile.idealCustomer,
    styleDirection: `${visual.systemName || 'Premium Design System'} — ${visual.colorMood || 'premium, polished, and purpose-matched'}. ${visual.layoutRhythm || ''}`.trim(),
    recommendedTemplate: visual.systemName || 'AI4 Platinum Website',
    accentColor: pickPalette(profile, visual, 0).accent,
    pages: ['Home', 'Services', 'About', 'Contact'],
    features: ['Mobile Responsive', 'Premium Hero Section', 'Contact CTA', 'Service Cards', 'SEO-Friendly Structure'],
    contentAssets: 'Generated from the customer intake and upgraded through the AI4 Website Design Studio production chain.',
    timeline: 'Ready for preview immediately.',
    city: profile.contact?.address || '',
    phone: profile.contact?.phone || '',
    email: profile.contact?.email || '',
    heroHeadline: copy.heroHeadline,
    hours: profile.contact?.hours || '',
    sectionPlan: [
      { sectionName: 'Hero', headlineDirection: copy.heroHeadline },
      { sectionName: 'Services', headlineDirection: 'Present services as high-value outcomes.' },
      { sectionName: 'About', headlineDirection: copy.aboutHeadline },
      { sectionName: 'Why Choose Us', headlineDirection: copy.whyHeadline },
      { sectionName: 'Contact', headlineDirection: copy.finalCtaHeadline }
    ],
    qualityScore: quality.score
  };
}

function pickPalette(profile, visual, index = 0) {
  const industry = profile.industry || 'business';
  const theme = visual.theme || 'dark';

  const sets = {
    dark: [
      { bg:'#05070d', bg2:'#0b1324', text:'#f7f8ff', muted:'#b7c1d6', accent:'#5BD3FF', accent2:'#1EA7FF', warm:'#d8b96a', panel:'rgba(255,255,255,.075)' },
      { bg:'#07070b', bg2:'#15101d', text:'#fff8ec', muted:'#cfc5ad', accent:'#d8b96a', accent2:'#fff2b8', warm:'#5e1231', panel:'rgba(255,255,255,.075)' },
      { bg:'#06070a', bg2:'#0d1720', text:'#f4fbff', muted:'#a7b5c2', accent:'#9ee6ff', accent2:'#8b5cf6', warm:'#f0a500', panel:'rgba(255,255,255,.07)' },
      { bg:'#09090b', bg2:'#131313', text:'#fbfbf7', muted:'#c2c2b6', accent:'#eab308', accent2:'#fef3c7', warm:'#78350f', panel:'rgba(255,255,255,.08)' }
    ],
    light: [
      { bg:'#f8fbff', bg2:'#eaf2ff', text:'#071225', muted:'#55657d', accent:'#2563eb', accent2:'#60a5fa', warm:'#d8b96a', panel:'rgba(255,255,255,.82)' },
      { bg:'#fffaf2', bg2:'#f3eadb', text:'#1a1208', muted:'#6f604c', accent:'#b7791f', accent2:'#f6d365', warm:'#7c2d12', panel:'rgba(255,255,255,.72)' },
      { bg:'#f7f7fb', bg2:'#e9eaf5', text:'#10121a', muted:'#5f6474', accent:'#7c3aed', accent2:'#a78bfa', warm:'#f59e0b', panel:'rgba(255,255,255,.78)' },
      { bg:'#ffffff', bg2:'#f1f5f9', text:'#0f172a', muted:'#64748b', accent:'#0ea5e9', accent2:'#22d3ee', warm:'#f59e0b', panel:'rgba(255,255,255,.82)' }
    ],
    warm: [
      { bg:'#130d07', bg2:'#261608', text:'#fff7ed', muted:'#d4b896', accent:'#f59e0b', accent2:'#fcd34d', warm:'#78350f', panel:'rgba(255,255,255,.075)' },
      { bg:'#120909', bg2:'#2a1014', text:'#fff4f4', muted:'#d8b9b9', accent:'#f97316', accent2:'#facc15', warm:'#7f1d1d', panel:'rgba(255,255,255,.075)' },
      { bg:'#11100b', bg2:'#1f1b10', text:'#fffbea', muted:'#d1c6a5', accent:'#d8b96a', accent2:'#fff2b8', warm:'#92400e', panel:'rgba(255,255,255,.075)' },
      { bg:'#0f0a06', bg2:'#201308', text:'#fff8ed', muted:'#cdb79b', accent:'#c084fc', accent2:'#fb923c', warm:'#78350f', panel:'rgba(255,255,255,.075)' }
    ],
    bold: [
      { bg:'#12051f', bg2:'#26093d', text:'#fdf7ff', muted:'#d8b4fe', accent:'#a855f7', accent2:'#f59e0b', warm:'#e11d48', panel:'rgba(255,255,255,.08)' },
      { bg:'#060916', bg2:'#111f40', text:'#f5f8ff', muted:'#aebed3', accent:'#22d3ee', accent2:'#818cf8', warm:'#f43f5e', panel:'rgba(255,255,255,.08)' },
      { bg:'#16070a', bg2:'#300b14', text:'#fff7f7', muted:'#fecdd3', accent:'#fb7185', accent2:'#fbbf24', warm:'#7f1d1d', panel:'rgba(255,255,255,.08)' },
      { bg:'#04130d', bg2:'#06281a', text:'#f0fff7', muted:'#a7f3d0', accent:'#34d399', accent2:'#facc15', warm:'#0f766e', panel:'rgba(255,255,255,.08)' }
    ]
  };

  if (industry === 'music' && index === 1) return sets.dark[1];
  return (sets[theme] || sets.dark)[index % 4];
}

function normalizeArray(value, fallback = []) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return splitStatements(value, fallback.length || 4);
  return fallback;
}

function qualityGate(profile, brand, copy, visual) {
  const flags = [];
  let score = 76;
  const combined = JSON.stringify({ profile, brand, copy, visual }).toLowerCase();

  if (profile.businessName && profile.businessName !== 'Your Business') score += 5; else flags.push('Business name needs confirmation.');
  if (clean(profile.offerSummary).length > 45) score += 5; else flags.push('Offer summary is thin.');
  if (clean(profile.idealCustomer).length > 35) score += 4; else flags.push('Ideal customer language needs more detail.');
  if (clean(profile.differentiator).length > 25) score += 4; else flags.push('Differentiator needs sharpening.');
  if (clean(copy.heroHeadline).length >= 12 && clean(copy.heroHeadline).length <= 78) score += 5; else flags.push('Hero headline should be stronger.');
  if (Array.isArray(copy.services) && copy.services.length >= 3) score += 5; else flags.push('Service section needs at least three cards.');
  if (visual.systemName && visual.visualMotif) score += 4; else flags.push('Visual system needs a stronger signature.');

  const genericPhrases = ['we deliver results', 'professional services you can trust', 'quality service', 'get started today'];
  const genericHits = genericPhrases.filter(p => combined.includes(p)).length;
  score -= genericHits * 4;
  if (genericHits) flags.push('Generic fallback language detected and reduced.');

  score = Math.max(72, Math.min(98, score));
  return {
    score,
    status: score >= 92 ? 'Platinum Ready' : score >= 86 ? 'Premium Ready' : 'Needs Upgrade',
    message: score >= 92
      ? 'AI4 Platinum Standard passed — specific copy, premium visual direction, and complete preview output are ready.'
      : 'Website generated successfully with safeguards. Review copy specificity before live delivery.',
    flags: flags.length ? flags : ['Business-specific copy produced', 'Premium design direction applied', 'Responsive website generated', 'Preview handoff ready']
  };
}

function buildWebsiteHtml({ profile, brand, copy, visual, variation = 0 }) {
  const p = pickPalette(profile, visual, variation);
  const business = escapeHtml(profile.businessName || 'Your Business');
  const industry = escapeHtml(profile.industry || 'Premium Service');
  const eyebrow = escapeHtml(copy.eyebrow || `${industry} · Premium Experience`);
  const heroHeadline = escapeHtml(copy.heroHeadline || createHeroHeadline(profile, brand));
  const heroSubheadline = escapeHtml(copy.heroSubheadline || brand.visitorPromise || profile.offerSummary);
  const introParagraph = escapeHtml(copy.introParagraph || brand.positioning || profile.offerSummary);
  const aboutHeadline = escapeHtml(copy.aboutHeadline || `${business} is built for people who expect more.`);
  const aboutBody = escapeHtml(copy.aboutBody || profile.offerSummary);
  const whyHeadline = escapeHtml(copy.whyHeadline || 'Why clients choose us');
  const processHeadline = escapeHtml(copy.processHeadline || 'A simple path forward');
  const finalCtaHeadline = escapeHtml(copy.finalCtaHeadline || 'Ready to take the next step?');
  const finalCtaBody = escapeHtml(copy.finalCtaBody || 'Connect today and move forward with confidence.');
  const cta = escapeHtml(copy.primaryCta || profile.primaryCta || 'Start Your Project');
  const secondaryCta = escapeHtml(copy.secondaryCta || 'Explore Services');
  const contactIntro = escapeHtml(copy.contactIntro || `Contact ${profile.businessName || 'us'} to start the conversation.`);
  const visualName = escapeHtml(visual.systemName || 'Platinum Design System');
  const visualMotif = escapeHtml(visual.visualMotif || 'Premium layout, clear hierarchy, and polished visual rhythm.');

  const services = normalizeArray(copy.services, []).slice(0, 4);
  while (services.length < 3) {
    services.push({ title: `Signature Service ${services.length + 1}`, description: buildServiceDescription(profile.industry, '', profile) });
  }

  const whyPoints = normalizeArray(copy.whyPoints, []).slice(0, 3);
  while (whyPoints.length < 3) {
    whyPoints.push({ title: ['Purposeful Experience', 'Professional Presentation', 'Clear Next Step'][whyPoints.length], description: 'A polished customer experience designed to create trust and action.' });
  }

  const processSteps = normalizeArray(copy.processSteps, ['Share your goal', 'Choose the right service', 'Move forward with confidence']).slice(0, 4);
  const phone = escapeHtml(profile.contact?.phone || '');
  const email = escapeHtml(profile.contact?.email || '');
  const address = escapeHtml(profile.contact?.address || '');
  const hours = escapeHtml(profile.contact?.hours || '');
  const website = escapeAttr(profile.contact?.website || '');
  const facebook = escapeAttr(profile.contact?.facebook || '');
  const instagram = escapeAttr(profile.contact?.instagram || '');

  const isLight = /^#f|^#e|^#fff/i.test(p.bg);
  const sectionGlow = variation === 1 ? p.warm : p.accent;
  const heroAlign = variation === 2 ? 'center' : 'left';
  const maxHero = heroAlign === 'center' ? '980px' : '680px';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${business}</title>
<meta name="description" content="${escapeAttr(heroSubheadline)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:${p.bg};--bg2:${p.bg2};--text:${p.text};--muted:${p.muted};--accent:${p.accent};--accent2:${p.accent2};--warm:${p.warm};--panel:${p.panel};
  --line:${isLight ? 'rgba(7,18,37,.12)' : 'rgba(255,255,255,.13)'};
  --shadow:0 32px 110px rgba(0,0,0,.36);
  --display:'Syne',system-ui,sans-serif;--serif:'Playfair Display',Georgia,serif;--sans:'Inter',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--bg);color:var(--text);overflow-x:hidden;line-height:1.65}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:
  radial-gradient(circle at 18% 10%,${p.accent}33,transparent 28%),
  radial-gradient(circle at 82% 14%,${sectionGlow}25,transparent 32%),
  linear-gradient(135deg,var(--bg),var(--bg2));}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(${isLight ? 'rgba(7,18,37,.035)' : 'rgba(255,255,255,.035)'} 1px,transparent 1px),linear-gradient(90deg,${isLight ? 'rgba(7,18,37,.03)' : 'rgba(255,255,255,.03)'} 1px,transparent 1px);background-size:58px 58px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.72),transparent 78%)}
a{text-decoration:none;color:inherit}
.page{position:relative;z-index:1}
.wrap{width:min(1180px,calc(100% - 40px));margin:0 auto}
.nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(22px);background:${isLight ? 'rgba(255,255,255,.78)' : 'rgba(3,7,14,.78)'};border-bottom:1px solid var(--line)}
.nav-inner{height:76px;display:flex;align-items:center;justify-content:space-between;gap:22px}
.brand{display:flex;align-items:center;gap:12px;font-weight:900;letter-spacing:-.03em}
.brand-mark{width:44px;height:44px;border-radius:16px;display:grid;place-items:center;color:${isLight ? '#fff' : '#06101d'};background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 36px ${p.accent}55;font-family:var(--display);font-weight:900}
.nav-links{display:flex;align-items:center;gap:24px;color:var(--muted);font-size:.92rem;font-weight:700}
.nav-links a:hover{color:var(--accent)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:999px;border:1px solid var(--line);padding:13px 21px;font-weight:900;transition:.22s ease;background:${isLight ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.06)'}}
.btn:hover{transform:translateY(-2px);border-color:var(--accent);box-shadow:0 16px 38px rgba(0,0,0,.18)}
.btn.primary{background:linear-gradient(135deg,var(--accent2),var(--accent));border-color:transparent;color:${isLight ? '#06101d' : '#04101f'};box-shadow:0 18px 50px ${p.accent}33}
.hero{min-height:calc(100vh - 76px);display:grid;align-items:center;padding:80px 0 66px}
.hero-grid{display:grid;grid-template-columns:${heroAlign === 'center' ? '1fr' : '1.04fr .96fr'};gap:46px;align-items:center;text-align:${heroAlign}}
.hero-copy{max-width:${maxHero};${heroAlign === 'center' ? 'margin:0 auto;' : ''}}
.eyebrow{display:inline-flex;align-items:center;gap:10px;color:var(--accent2);border:1px solid ${p.accent}55;background:${p.accent}12;padding:9px 13px;border-radius:999px;font-size:.72rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin-bottom:24px}
h1{font-family:${variation === 1 ? 'var(--serif)' : 'var(--display)'};font-size:clamp(3.45rem,8vw,7.9rem);line-height:.94;letter-spacing:-.065em;margin-bottom:26px}
.grad{color:transparent;background:linear-gradient(135deg,var(--text) 0%,var(--accent2) 48%,var(--accent) 100%);-webkit-background-clip:text;background-clip:text}
.hero-sub{font-size:clamp(1.08rem,1.55vw,1.34rem);line-height:1.74;color:var(--muted);max-width:720px;${heroAlign === 'center' ? 'margin:0 auto;' : ''}}
.hero-actions{display:flex;gap:13px;flex-wrap:wrap;margin-top:32px;${heroAlign === 'center' ? 'justify-content:center;' : ''}}
.trust-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:34px;max-width:760px;${heroAlign === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}}
.trust-card{border:1px solid var(--line);background:var(--panel);border-radius:22px;padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.16)}
.trust-card strong{display:block;color:var(--accent2);font-size:1.05rem;margin-bottom:6px}
.trust-card span{color:var(--muted);font-size:.9rem}
.visual{min-height:590px;border-radius:40px;border:1px solid ${p.accent}44;position:relative;overflow:hidden;background:
  radial-gradient(circle at 50% 18%,${p.accent}35,transparent 27%),
  radial-gradient(circle at 80% 80%,${p.warm}28,transparent 30%),
  linear-gradient(145deg,${isLight ? 'rgba(255,255,255,.84)' : 'rgba(255,255,255,.08)'},${isLight ? 'rgba(255,255,255,.38)' : 'rgba(255,255,255,.025)'});
box-shadow:var(--shadow)}
.visual::before{content:"";position:absolute;inset:28px;border:1px solid var(--line);border-radius:30px}
.orb{position:absolute;width:320px;height:320px;border-radius:50%;right:-70px;top:70px;background:radial-gradient(circle,var(--accent2) 0 8%,transparent 9% 18%,var(--accent) 19% 20%,transparent 21% 100%);border:1px solid ${p.accent}55;box-shadow:0 0 90px ${p.accent}33;opacity:.82}
.visual-panel{position:absolute;left:46px;top:48px;width:min(360px,calc(100% - 92px));padding:28px;border-radius:28px;border:1px solid var(--line);background:${isLight ? 'rgba(255,255,255,.65)' : 'rgba(0,0,0,.28)'};backdrop-filter:blur(18px)}
.visual-panel h2{font-family:${variation === 1 ? 'var(--serif)' : 'var(--display)'};font-size:2.25rem;line-height:1;margin-bottom:12px}
.visual-panel p{color:var(--muted)}
.bars{position:absolute;left:48px;bottom:44px;height:210px;display:flex;align-items:end;gap:9px}
.bar{width:15px;border-radius:999px;background:linear-gradient(to top,var(--accent),var(--accent2));box-shadow:0 0 28px ${p.accent}44;animation:pulse 1.5s ease-in-out infinite alternate}
.bar:nth-child(1){height:64px}.bar:nth-child(2){height:128px;animation-delay:.2s}.bar:nth-child(3){height:92px;animation-delay:.35s}.bar:nth-child(4){height:182px;animation-delay:.1s}.bar:nth-child(5){height:118px;animation-delay:.5s}.bar:nth-child(6){height:220px;animation-delay:.25s}
@keyframes pulse{from{transform:scaleY(.72);opacity:.72}to{transform:scaleY(1);opacity:1}}
.float-note{position:absolute;right:42px;bottom:46px;width:min(310px,calc(100% - 84px));padding:22px;border-radius:24px;border:1px solid var(--line);background:${isLight ? 'rgba(255,255,255,.66)' : 'rgba(255,255,255,.08)'};backdrop-filter:blur(18px)}
.float-note strong{display:block;color:var(--accent2);margin-bottom:7px}.float-note span{color:var(--muted)}
section{padding:92px 0}
.section-head{max-width:820px;margin-bottom:38px}
.kicker{font-size:.75rem;letter-spacing:.17em;text-transform:uppercase;font-weight:900;color:var(--accent2);margin-bottom:12px}
.section-title{font-family:${variation === 1 ? 'var(--serif)' : 'var(--display)'};font-size:clamp(2.45rem,5.4vw,5.1rem);line-height:.98;letter-spacing:-.045em;color:var(--text);margin-bottom:16px}
.section-lead{font-size:1.1rem;color:var(--muted);line-height:1.75}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{position:relative;overflow:hidden;border:1px solid var(--line);background:var(--panel);border-radius:28px;padding:30px;min-height:270px;box-shadow:0 22px 70px rgba(0,0,0,.16)}
.card::after{content:"";position:absolute;right:-55px;bottom:-70px;width:170px;height:170px;border-radius:50%;background:${p.accent}16}
.icon{width:56px;height:56px;border-radius:20px;display:grid;place-items:center;border:1px solid ${p.accent}44;background:${p.accent}14;color:var(--accent2);font-size:1.45rem;margin-bottom:22px}
.card h3{font-size:1.36rem;margin-bottom:12px;color:var(--text)}.card p{color:var(--muted)}
.split{display:grid;grid-template-columns:.9fr 1.1fr;gap:24px;align-items:stretch}
.panel{border:1px solid ${p.accent}33;background:linear-gradient(180deg,${p.accent}12,transparent),var(--panel);border-radius:34px;padding:34px;box-shadow:var(--shadow)}
.panel h3{font-family:${variation === 1 ? 'var(--serif)' : 'var(--display)'};font-size:clamp(2rem,4vw,3.4rem);line-height:1;letter-spacing:-.04em;margin-bottom:18px}.panel p{color:var(--muted);font-size:1.04rem;line-height:1.76}
.point-list{display:grid;gap:14px}.point{border:1px solid var(--line);background:var(--panel);border-radius:22px;padding:21px}.point strong{display:block;font-size:1.15rem;color:var(--text);margin-bottom:6px}.point span{color:var(--muted)}
.process{display:grid;grid-template-columns:repeat(${Math.min(processSteps.length,4)},1fr);gap:16px;counter-reset:step}
.step{counter-increment:step;border:1px solid var(--line);background:var(--panel);border-radius:26px;padding:28px;min-height:190px}.step::before{content:"0" counter(step);display:block;color:var(--accent2);font-weight:900;letter-spacing:.18em;margin-bottom:28px}.step h3{font-size:1.2rem;color:var(--text)}
.cta-band{text-align:center;border:1px solid ${p.accent}40;background:radial-gradient(circle at 16% 20%,${p.accent}22,transparent 36%),linear-gradient(135deg,${p.warm}22,${p.accent}14),var(--panel);border-radius:42px;padding:clamp(38px,6vw,72px);box-shadow:var(--shadow)}
.cta-band h2{font-family:${variation === 1 ? 'var(--serif)' : 'var(--display)'};font-size:clamp(2.3rem,5vw,5.1rem);line-height:1;letter-spacing:-.045em;margin-bottom:18px}.cta-band p{max-width:760px;margin:0 auto 28px;color:var(--muted);font-size:1.1rem}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}.contact-card{border:1px solid var(--line);background:var(--panel);border-radius:34px;padding:34px}.contact-card h3{font-size:1.55rem;margin-bottom:12px}.contact-card p,.contact-card li{color:var(--muted)}.contact-list{list-style:none;margin-top:22px;display:grid;gap:12px}.contact-list li{border-bottom:1px solid var(--line);padding-bottom:12px}
input,textarea,select{width:100%;border:1px solid var(--line);border-radius:18px;background:${isLight ? 'rgba(255,255,255,.72)' : 'rgba(0,0,0,.22)'};color:var(--text);padding:15px 16px;font:inherit;outline:none;margin-bottom:13px}textarea{min-height:132px;resize:vertical}input:focus,textarea:focus,select:focus{border-color:var(--accent)}
footer{border-top:1px solid var(--line);padding:32px 0;color:var(--muted);font-size:.9rem}.footer-row{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap}
@media(max-width:980px){.nav-links{display:none}.hero-grid,.split,.contact-grid{grid-template-columns:1fr}.visual{min-height:500px}.cards{grid-template-columns:1fr}.process{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.wrap{width:min(100% - 28px,1180px)}.nav-inner{height:70px}.brand span{font-size:.9rem}.hero{padding:48px 0}.hero-actions .btn{width:100%}h1{font-size:clamp(3.05rem,17vw,4.8rem)}.trust-strip,.process{grid-template-columns:1fr}.visual{min-height:480px}.visual-panel{left:22px;top:24px;width:calc(100% - 44px)}.float-note{right:22px;bottom:24px;width:calc(100% - 44px)}.bars{left:28px;bottom:148px;height:150px}.orb{width:240px;height:240px;right:-100px}.section{padding:66px 0}.cards{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="page">
  <header class="nav">
    <div class="wrap nav-inner">
      <a href="#top" class="brand" aria-label="${business} home"><span class="brand-mark">${escapeHtml((profile.businessName || 'YB').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase())}</span><span>${business}</span></a>
      <nav class="nav-links" aria-label="Main navigation"><a href="#services">Services</a><a href="#about">About</a><a href="#process">Process</a><a href="#contact">Contact</a></nav>
      <a class="btn primary" href="#contact">${cta}</a>
    </div>
  </header>

  <main id="top">
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <div class="eyebrow">${eyebrow}</div>
          <h1>${heroHeadline.replace(/\s+/g, ' ').replace(/(\S+\s+\S+)$/, '<span class="grad">$1</span>')}</h1>
          <p class="hero-sub">${heroSubheadline}</p>
          <div class="hero-actions"><a class="btn primary" href="#contact">${cta}</a><a class="btn" href="#services">${secondaryCta}</a></div>
          <div class="trust-strip">
            ${whyPoints.slice(0,3).map(point => `<div class="trust-card"><strong>${escapeHtml(point.title || 'Quality')}</strong><span>${escapeHtml(point.description || 'A polished experience built around trust.')}</span></div>`).join('')}
          </div>
        </div>
        ${heroAlign === 'center' ? '' : `<div class="visual" aria-label="${visualName} visual direction">
          <div class="orb"></div>
          <div class="visual-panel"><h2>${visualName}</h2><p>${visualMotif}</p></div>
          <div class="bars" aria-hidden="true"><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
          <div class="float-note"><strong>${escapeHtml(brand.differentiatorAngle || 'Built with purpose.')}</strong><span>${introParagraph}</span></div>
        </div>`}
      </div>
    </section>

    <section id="services">
      <div class="wrap">
        <div class="section-head"><div class="kicker">What We Do</div><h2 class="section-title">${escapeHtml(profile.businessName)} services, presented with purpose.</h2><p class="section-lead">${introParagraph}</p></div>
        <div class="cards">
          ${services.slice(0,3).map((svc, i) => `<article class="card"><div class="icon">${['✦','◆','●'][i] || '✦'}</div><h3>${escapeHtml(svc.title || `Service ${i+1}`)}</h3><p>${escapeHtml(svc.description || buildServiceDescription(profile.industry, svc.title, profile))}</p></article>`).join('')}
        </div>
      </div>
    </section>

    <section id="about">
      <div class="wrap split">
        <div class="panel"><div class="kicker">About</div><h3>${aboutHeadline}</h3><p>${aboutBody}</p></div>
        <div class="point-list">
          <div class="point"><strong>${whyHeadline}</strong><span>${escapeHtml(brand.differentiatorAngle || profile.differentiator)}</span></div>
          ${whyPoints.slice(0,2).map(point => `<div class="point"><strong>${escapeHtml(point.title || 'Premium Standard')}</strong><span>${escapeHtml(point.description || 'A better customer experience from first impression to next step.')}</span></div>`).join('')}
        </div>
      </div>
    </section>

    <section id="process">
      <div class="wrap">
        <div class="section-head"><div class="kicker">How It Works</div><h2 class="section-title">${processHeadline}</h2></div>
        <div class="process">${processSteps.map(step => `<div class="step"><h3>${escapeHtml(step)}</h3></div>`).join('')}</div>
      </div>
    </section>

    <section>
      <div class="wrap cta-band"><h2>${finalCtaHeadline}</h2><p>${finalCtaBody}</p><a class="btn primary" href="#contact">${cta}</a></div>
    </section>

    <section id="contact">
      <div class="wrap contact-grid">
        <div class="contact-card">
          <div class="kicker">Contact</div><h3>${contactIntro}</h3><p>${escapeHtml(profile.emotionalPromise || 'We are ready to help you move forward with clarity and confidence.')}</p>
          <ul class="contact-list">
            ${phone ? `<li><strong>Phone:</strong> ${phone}</li>` : ''}
            ${email ? `<li><strong>Email:</strong> ${email}</li>` : ''}
            ${address ? `<li><strong>Location:</strong> ${address}</li>` : ''}
            ${hours ? `<li><strong>Hours:</strong> ${hours}</li>` : ''}
            ${website ? `<li><strong>Website:</strong> ${website}</li>` : ''}
            ${facebook ? `<li><strong>Facebook:</strong> ${facebook}</li>` : ''}
            ${instagram ? `<li><strong>Instagram:</strong> ${instagram}</li>` : ''}
          </ul>
        </div>
        <div class="contact-card">
          <form name="website-inquiry" method="POST" data-netlify="true">
            <input type="hidden" name="form-name" value="website-inquiry">
            <input name="name" type="text" placeholder="Your name" required>
            <input name="email" type="email" placeholder="Email address" required>
            <input name="phone" type="tel" placeholder="Phone number">
            <textarea name="message" placeholder="Tell us what you need"></textarea>
            <button class="btn primary" type="submit">${cta}</button>
          </form>
        </div>
      </div>
    </section>
  </main>

  <footer><div class="wrap footer-row"><span>© <span id="year"></span> ${business}. All rights reserved.</span><span>Engineered by AI4 Website Design Studio.</span></div></footer>
</div>
<script>document.getElementById('year').textContent=new Date().getFullYear();</script>
</body>
</html>`;
}

async function generatePayload(answers, requestedVariation = 0) {
  const profile = await agent1IntakeInterpreter(answers);
  profile.contact = profile.contact || {};
  profile.businessName = clean(profile.businessName, answers.businessName);
  profile.primaryCta = clean(profile.primaryCta, answers.primaryCta);
  profile.stylePreference = clean(profile.stylePreference, answers.style);

  // Preserve exact direct contact fields from intake even if the model omits them.
  profile.contact.phone = clean(profile.contact.phone, answers.phone);
  profile.contact.email = clean(profile.contact.email, answers.email);
  profile.contact.address = clean(profile.contact.address, answers.address);
  profile.contact.website = clean(profile.contact.website, answers.website);
  profile.contact.facebook = clean(profile.contact.facebook, answers.facebook);
  profile.contact.instagram = clean(profile.contact.instagram, answers.instagram);
  profile.contact.hours = clean(profile.contact.hours, answers.hours);

  const brand = await agent2BrandStrategist(profile);
  brand.primaryCta = clean(brand.primaryCta, profile.primaryCta || answers.primaryCta || 'Start Your Project');

  const copy = await agent3PlatinumCopywriter(profile, brand);
  copy.services = normalizeArray(copy.services, fallbackCopy(profile, brand).services).slice(0, 4);
  copy.whyPoints = normalizeArray(copy.whyPoints, fallbackCopy(profile, brand).whyPoints).slice(0, 3);
  copy.processSteps = normalizeArray(copy.processSteps, fallbackCopy(profile, brand).processSteps).slice(0, 4);
  copy.primaryCta = clean(copy.primaryCta, brand.primaryCta);

  const visual = await agent4VisualDesignDirector(profile, brand, copy, answers);
  const quality = qualityGate(profile, brand, copy, visual);

  const templates = [0,1,2,3].map(i => buildWebsiteHtml({ profile, brand, copy, visual, variation: i }));
  const active = Math.max(0, Math.min(3, Number(requestedVariation) || 0));
  const brief = buildBrief(profile, brand, copy, visual, quality);

  return {
    success: true,
    html: templates[active],
    builtHtml: templates[active],
    websiteHtml: templates[active],
    templates,
    brief,
    quality,
    qualityGate: quality,
    agents: {
      intakeInterpreter: profile,
      brandStrategist: brand,
      platinumCopywriter: copy,
      visualDesignDirector: visual,
      platinumQualityGate: quality
    }
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ success:false, error:'Method not allowed' }) };
  }

  try {
    const payload = safeJsonParse(event.body, {});
    const answers = normalizeAnswers(payload);
    const variation = payload.variation || payload.activeVariation || 0;
    const result = await generatePayload(answers, variation);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('AI4 generate-website failed:', error);
    const answers = normalizeAnswers(safeJsonParse(event.body, {}));
    const profile = fallbackProfile(answers);
    const brand = fallbackBrand(profile);
    const copy = fallbackCopy(profile, brand);
    const visual = fallbackVisual(profile, brand, answers);
    const quality = qualityGate(profile, brand, copy, visual);
    const templates = [0,1,2,3].map(i => buildWebsiteHtml({ profile, brand, copy, visual, variation: i }));
    const brief = buildBrief(profile, brand, copy, visual, quality);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        fallback: true,
        error: error.message,
        html: templates[0],
        builtHtml: templates[0],
        websiteHtml: templates[0],
        templates,
        brief,
        quality,
        qualityGate: quality,
        agents: {
          intakeInterpreter: profile,
          brandStrategist: brand,
          platinumCopywriter: copy,
          visualDesignDirector: visual,
          platinumQualityGate: quality
        }
      })
    };
  }
};

// Export internals for optional local testing.
exports._private = { normalizeAnswers, fallbackProfile, fallbackBrand, fallbackCopy, fallbackVisual, buildWebsiteHtml, qualityGate };

// netlify/edge-functions/generate-agency.js
// Runs on Netlify Edge (Deno) — no timeout limit.
// Claude writes complete agency-quality HTML for the client's dossier.

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const AGENCY_STANDARDS = [
  'AGENCY STANDARDS — non-negotiable:',
  '- The headline must make this client\'s competitors uncomfortable. State their market position with total confidence.',
  '- Copy must speak directly to their ideal client — not everyone, the ONE person who needs them most.',
  '- Visual design must look like it belongs in a Behance award showcase — deliberate, considered, premium.',
  '- Typography carries authority. Pair display and body fonts with intention.',
  '- Color is strategy. Every palette choice must serve the client\'s positioning. Commit fully.',
  '- White space is presence. Premium brands breathe.',
  '- Every section earns its place by moving the visitor closer to action.',
  '- The contact section is the close — make it feel like an exclusive invitation, not a form.',
  '',
  'ABSOLUTELY FORBIDDEN:',
  '- "Welcome to [Business Name]" — banned forever',
  '- "We are dedicated to..." — amateur',
  '- "Your trusted partner" — meaningless',
  '- "We provide quality services" — unacceptable',
  '- Icon + headline + short paragraph grid — generic template',
  '- Safe blue/white/grey palette — invisible',
  '- Any phrase another business could copy by swapping the name',
  '',
  'TECHNICAL REQUIREMENTS:',
  '- Complete standalone HTML — all CSS in <style> in <head>',
  '- Load 1-2 Google Fonts via <link> in <head>',
  '- Fully mobile responsive with CSS Grid/Flexbox and media queries',
  '- CSS custom properties for the full design system',
  '- Sections: hero, proof/credentials, services, differentiator, contact form, footer',
  '- Contact form: data-netlify="true", name/email/phone/message fields',
  '- No external JavaScript libraries',
  '- Production quality — launch-ready as delivered'
].join('\n');

function buildContext(a) {
  return [
    a.name  ? 'Client: '             + a.name  : null,
    a.what  ? 'What They Do: '       + a.what  : null,
    a.who   ? 'Their Ideal Client: ' + a.who   : null,
    a.diff  ? 'Why They Win: '       + a.diff  : null,
    a.else  ? 'Additional Context: ' + a.else  : null,
    a.email ? 'Email: '              + a.email : null,
    a.site  ? 'Website: '            + a.site  : null,
    a.addr  ? 'Location: '           + a.addr  : null
  ].filter(Boolean).join('\n');
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });
  }

  const key   = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001';

  if (!key) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: CORS });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }); }

  const a               = body.answers || {};
  const mode            = body.mode || 'full';
  const existingContent = body.existingContent || null;
  const ctx             = buildContext(a);

  let prompt;

  if (mode === 'design' && existingContent) {
    prompt = 'You are the Creative Director at AI4 Businesses, a premium digital agency.\n\n'
      + 'A client account has just changed hands within the agency. Your team must produce a COMPLETELY DIFFERENT creative interpretation.\n'
      + 'Same client intelligence — entirely different strategic vision. Make the previous version feel like a different era.\n\n'
      + 'CLIENT INTELLIGENCE (preserve this content exactly):\n'
      + 'Client: ' + (existingContent.brand || a.name || 'Your Business') + '\n'
      + (existingContent.context || ctx) + '\n\n'
      + 'YOUR CREATIVE CHALLENGE:\n'
      + '- Opposite mood: if dark go luminous, if minimal go rich and layered\n'
      + '- Different structural logic: if centered try editorial split, if bold asymmetry try refined symmetry\n'
      + '- Different typographic personality: if sharp sans-serif try warm humanist or editorial serif\n'
      + '- Different emotional register: if bold and aggressive try confident and understated\n\n'
      + AGENCY_STANDARDS + '\n\n'
      + 'Return ONLY the complete HTML starting with <!DOCTYPE html>. No markdown. No explanation.';
  } else {
    prompt = 'You are the Creative Director at AI4 Businesses, a premium digital agency.\n\n'
      + 'You have just received a new client brief. Your deliverable is their DIGITAL DOSSIER —\n'
      + 'a flagship web presence that establishes this client as the definitive authority in their market.\n\n'
      + 'The dossier has three jobs:\n'
      + '1. POSITION — the hero stakes their claim before the visitor can look away\n'
      + '2. PROVE — the body builds undeniable credibility and desire\n'
      + '3. CONVERT — the close makes reaching out feel like the obvious next step\n\n'
      + 'CLIENT BRIEF:\n'
      + (ctx || 'A premium business ready to establish market authority.') + '\n\n'
      + 'YOUR CREATIVE MANDATE:\n'
      + '- Write all copy from scratch — transform the brief into authoritative language\n'
      + '- Invent a visual identity that feels made for this specific client and no other\n'
      + '- Choose an unexpected creative direction — think award-winning portfolios, not business templates\n'
      + '- Every design decision must serve their market positioning\n'
      + '- Each generation must be distinctly different — no two dossiers should look alike\n\n'
      + AGENCY_STANDARDS + '\n\n'
      + 'Return ONLY the complete HTML starting with <!DOCTYPE html>. No markdown code fences. No explanation.';
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(
        JSON.stringify({ error: 'Claude API error ' + r.status, detail: t.slice(0, 300) }),
        { status: 502, headers: CORS }
      );
    }

    const data    = await r.json();
    const rawText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const html    = rawText.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();

    return new Response(
      JSON.stringify({ html, content: { brand: a.name || 'Your Business', context: ctx } }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Generation failed', detail: String(err).slice(0, 200) }),
      { status: 500, headers: CORS }
    );
  }
};

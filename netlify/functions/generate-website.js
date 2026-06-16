'use strict';

/**
 * AI4 Website Design Studio — Industry Marketing Engine V8
 * Direction: the AI is the COPYWRITER/ART-DIRECTOR (returns a small, fast JSON
 * marketing brief), and this renderer is the BUILDER (assembles a premium,
 * industry-themed, promotional page from that brief). The AI never writes raw
 * HTML, so generation can't truncate, time out, or emit invalid markup.
 */
const Anthropic = require('@anthropic-ai/sdk');
const COPY_MODEL = process.env.AI4_COPY_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const AI_TIMEOUT_MS = Number(process.env.AI4_AI_TIMEOUT_MS || 60000);
const COPY_MAX_TOKENS = Number(process.env.AI4_COPY_MAX_TOKENS || 2200);
const HEADERS = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};

/* ---------- helpers ---------- */
function clean(v,f=''){if(Array.isArray(v))return v.map(x=>clean(x)).filter(Boolean).join(', ')||f;if(v===null||v===undefined)return f;const s=String(v).trim();return s||f}
function esc(v){return clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function parse(b){try{return JSON.parse(b||'{}')}catch{return {}}}
function pick(o,ks,f=''){for(const k of ks){const v=k.split('.').reduce((a,p)=>a&&a[p]!==undefined?a[p]:undefined,o);const s=clean(v);if(s)return s}return f}
function slug(v){return clean(v,'your-business').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,42)||'your-business'}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=Math.imul(31,h)+s.charCodeAt(i)|0;return Math.abs(h)}
function normalize(p){const r=(p&&(p.answers||p.rawAnswers||p.siteData||p.brief||p))||{},c=r.contact||r.contactInfo||{},s=r.social||r.socialLinks||{};return{businessName:pick(r,['businessName','business_name','brandName','companyName','name'],'Your Business'),whatYouDo:pick(r,['whatYouDo','businessDescription','description','q2_whatYouDo','what','services'],'A premium business serving customers with professional solutions.'),customers:pick(r,['customers','idealCustomers','targetAudience','q3_customers','who','audience'],'customers who value trust, clarity, and a professional experience'),differentiators:pick(r,['differentiators','whatMakesDifferent','uniqueValue','q4_differentiators','diff','whyDifferent'],'clear communication, dependable service, and a polished customer experience'),extras:pick(r,['extras','optionalNotes','anythingElse','q7_extras','else','notes'],''),primaryCta:pick(r,['primaryCta','ctaText','cta','callToAction'],'Contact Us'),phone:clean(r.phone||r.phoneNumber||c.phone),email:clean(r.email||r.contactEmail||c.email),address:clean(r.address||r.location||r.serviceArea||c.address),website:clean(r.website||r.url||c.website),facebook:clean(r.facebook||s.facebook),instagram:clean(r.instagram||s.instagram),linkedin:clean(r.linkedin||s.linkedin),websiteType:pick(r,['websiteType','type','siteType'],'business')}}
function industry(a){
  const t=` ${`${a.businessName} ${a.whatYouDo} ${a.customers} ${a.differentiators} ${a.extras}`.toLowerCase()} `;
  const has=re=>re.test(t);
  if(has(/\b(restaurant|food|catering|cater\w*|chef|chefs|bbq|menu|menus|kitchen|bakery|baker|cafe|coffee|grill|dining|culinary)\b/))return'Restaurant / Food Service';
  if(has(/\b(construction|contractor|contracting|hvac|plumb\w*|electric\w*|roof\w*|repair|remodel\w*|renovat\w*|landscap\w*|cleaning|painting|paint|carpentry|trades?|handyman|flooring)\b/))return'Construction / Skilled Trades';
  if(has(/\b(nonprofit|non-profit|ministry|church|community|foundation|outreach|charity|charitable|volunteer\w*)\b/))return'Community / Nonprofit';
  if(has(/\b(ai|software|automation|saas|cyber|cloud|crm|workflow|technology|tech|app|apps|data|analytics|digital|platform)\b/))return'Technology / AI Services';
  if(has(/\b(consult\w*|account\w*|accounting|tax|taxes|legal|law|attorney|insurance|real estate|realtor|broker\w*|finance|financial|advisor\w*|bookkeep\w*|agency)\b/))return'Professional Services';
  return'Premium Local Business';
}
function countSections(h){return(clean(h).match(/<section\b/gi)||[]).length}
function validate(h){const flags=[];let score=100;if(clean(h).length<6000){score-=10;flags.push('Generated HTML is short')}if(countSections(h)<5){score-=10;flags.push('Fewer than 5 sections')}if(!/<form[^>]+data-netlify=["']true["']/i.test(h)){score-=8;flags.push('Netlify form missing')}if(!/@media/i.test(h)){score-=6;flags.push('Responsive media query missing')}score=Math.max(0,Math.min(100,score));return{score,status:score>=90?'Platinum Ready':score>=75?'Complete Website Preview':'Needs Review',flags,sectionCount:countSections(h),generatedLength:clean(h).length}}

/* ---------- themes (industry-aware look & feel) ---------- */
const THEMES = [
  {id:'tech',name:'Signal',disp:"'Space Grotesk',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#05080f',bg2:'#0c1626',accent:'#5cc8ff',accent2:'#c6ff5e',light:false},
  {id:'modern',name:'Vanguard',disp:"'Syne',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap',bg:'#0a0a12',bg2:'#17142b',accent:'#8b9bff',accent2:'#58e6c9',light:false},
  {id:'editorial',name:'Broadsheet',disp:"'Fraunces',Georgia,serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap',bg:'#f6f1e7',bg2:'#ece3d2',accent:'#1d3b5a',accent2:'#b5722a',light:true},
  {id:'luxury',name:'Maison',disp:"'Cormorant',Georgia,serif",body:"'Jost',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap',bg:'#0e0a10',bg2:'#1d1320',accent:'#d9b25a',accent2:'#c98b6a',light:false},
  {id:'trades',name:'Ironclad',disp:"'Archivo',sans-serif",body:"'Manrope',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap',bg:'#11161c',bg2:'#1b2530',accent:'#ff9e3d',accent2:'#e8eef5',light:false},
  {id:'fresh',name:'Meadow',disp:"'Sora',sans-serif",body:"'IBM Plex Sans',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap',bg:'#f4f7f3',bg2:'#e4ede2',accent:'#1f6b4f',accent2:'#b9743b',light:true}
];
const INDUSTRY_THEMES = {
  'Technology / AI Services':['tech','modern'],
  'Professional Services':['editorial','modern','luxury'],
  'Restaurant / Food Service':['luxury','fresh','editorial'],
  'Construction / Skilled Trades':['trades','modern'],
  'Community / Nonprofit':['fresh','editorial'],
  'Premium Local Business':['modern','editorial','luxury','fresh']
};
function isFresh(body){const m=clean(body.mode,'full');return m==='design'||m==='new-design'||clean(body.regenerate)==='true'||!!clean(body.seed)||!!clean(body.variationSeed)}
function seedOf(a,body){const base=`${a.businessName}|${a.whatYouDo}`;return isFresh(body)?`${base}|${clean(body.seed||body.variationSeed||body.requestId,'')}|${Date.now()}|${Math.random()}`:base}
function chooseTheme(a,ind,body){const req=clean(body.styleSystem||body.theme);if(req){const f=THEMES.find(t=>t.id===req||t.name.toLowerCase()===req.toLowerCase());if(f)return f}const ids=INDUSTRY_THEMES[ind]||THEMES.map(t=>t.id);const id=ids[hash(seedOf(a,body))%ids.length];return THEMES.find(t=>t.id===id)||THEMES[0]}

/* ---------- copy: AI brief + deterministic fallback ---------- */
function listFrom(s){return clean(s).split(/[•\n;|]|,(?=\s*[A-Z])| - /).map(clean).filter(x=>x.length>3).slice(0,6)}
function deriveBrief(a,ind){
  const sv=listFrom(`${a.whatYouDo}|${a.extras}`).filter(x=>x.length>6);
  let services=(sv.length?sv:[a.whatYouDo]).slice(0,4).map(x=>({name:(x.length>52?x.slice(0,52):x),desc:`Professional ${x.toLowerCase().slice(0,60)} delivered with care and attention to detail.`}));
  while(services.length<3)services.push({name:'Dependable Service',desc:'Consistent, professional work you can count on, start to finish.'});
  const diffs=listFrom(a.differentiators);
  const whyUs=(diffs.length?diffs:['Clear, responsive communication','Dependable, on-time service','A polished customer experience']).slice(0,3);
  return {
    eyebrow:ind,
    headline:a.businessName,
    subhead:a.whatYouDo,
    valueHead:'Built to deliver',
    trust:['Trusted service','Customer-first','Quality work'],
    valueProps:[{title:'Built around you',desc:`Made for ${clean(a.customers).slice(0,80)}.`},{title:'Quality you can see',desc:clean(a.differentiators).slice(0,90)},{title:'Easy to start',desc:'Reach out and we’ll take it from there.'}],
    services,
    whyUs,
    about:`${a.businessName} serves ${clean(a.customers).slice(0,90)}. ${clean(a.whatYouDo).slice(0,140)}`,
    ctaHeadline:'Ready to get started?',
    ctaSub:'Get in touch and let’s talk about what you need.',
    metaTitle:clean(a.businessName).slice(0,60),
    metaDescription:clean(a.whatYouDo).slice(0,155)
  };
}
function coerceBrief(obj,a,ind){
  const d=deriveBrief(a,ind);obj=obj&&typeof obj==='object'?obj:{};
  const str=(v,f)=>clean(v)||f;
  const arrStr=(v,f)=>{const x=Array.isArray(v)?v.map(clean).filter(Boolean):[];return x.length?x:f};
  const arrObj=(v,f)=>{const x=Array.isArray(v)?v.map(o=>o&&typeof o==='object'?{name:str(o.name||o.title,''),desc:str(o.desc||o.description,'')}:{name:clean(o),desc:''}).filter(o=>o.name):[];return x.length?x:f};
  return {
    eyebrow:str(obj.eyebrow,d.eyebrow),
    headline:str(obj.headline,d.headline),
    subhead:str(obj.subhead,d.subhead),
    valueHead:str(obj.valueHead,d.valueHead),
    trust:arrStr(obj.trust,d.trust).slice(0,4),
    valueProps:arrObj(obj.valueProps,d.valueProps).map(o=>({title:o.name,desc:o.desc})).slice(0,3),
    services:arrObj(obj.services,d.services).slice(0,5),
    whyUs:arrStr(obj.whyUs,d.whyUs).slice(0,4),
    about:str(obj.about,d.about),
    ctaHeadline:str(obj.ctaHeadline,d.ctaHeadline),
    ctaSub:str(obj.ctaSub,d.ctaSub),
    metaTitle:str(obj.metaTitle,d.metaTitle),
    metaDescription:str(obj.metaDescription,d.metaDescription)
  };
}
async function expandBrief(a,ind){
  if(!process.env.ANTHROPIC_API_KEY)throw new Error('ANTHROPIC_API_KEY not set');
  const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY}),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
  const system='You are a senior conversion copywriter and brand strategist who writes high-converting, promotional small-business website copy. Write specific, benefit-driven copy tailored to the business, its industry, and its ideal customer. Sell the business. Never invent statistics, awards, client names, years in business, or testimonials. Output STRICT JSON only — no markdown, no commentary.';
  const user=`Write promotional website copy for this business.

INDUSTRY: ${ind}
BUSINESS NAME: ${a.businessName}
WHAT THEY DO: ${a.whatYouDo}
IDEAL CUSTOMERS: ${a.customers}
WHAT MAKES THEM DIFFERENT: ${a.differentiators}
EXTRA NOTES: ${a.extras||'(none)'}
PRIMARY CALL TO ACTION: ${a.primaryCta}

Return ONLY this JSON object:
{
  "eyebrow": "2-4 word category/industry tag",
  "headline": "punchy promotional hero headline written specifically for this business, max ~10 words, never start with 'Welcome to'",
  "subhead": "1-2 sentence hero paragraph selling the value to the ideal customer",
  "valueHead": "short section heading introducing the benefits",
  "trust": ["3 short proof/benefit phrases, 2-4 words each"],
  "valueProps": [{"title":"benefit title (2-4 words)","desc":"one persuasive sentence"}],
  "services": [{"name":"service or offering name","desc":"one persuasive sentence"}],
  "whyUs": ["3 specific reasons to choose this business, one sentence each, grounded in their real differentiator"],
  "about": "2-3 sentence credibility-building 'about' paragraph, no invented facts",
  "ctaHeadline": "short final call-to-action headline",
  "ctaSub": "one sentence nudging the visitor to act",
  "metaTitle": "SEO title, max 60 chars",
  "metaDescription": "SEO description, max 155 chars"
}
Provide 3 valueProps and 3-5 services based on what they actually do. Be concrete and industry-appropriate.`;
  try{
    const r=await client.messages.create({model:COPY_MODEL,max_tokens:COPY_MAX_TOKENS,system,messages:[{role:'user',content:user}]},{signal:controller.signal});
    const txt=(r.content||[]).filter(x=>!x.type||x.type==='text').map(x=>x.text||'').join('').trim();
    const js=txt.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/,'').trim();
    const s=js.indexOf('{'),e=js.lastIndexOf('}');
    return JSON.parse(s>=0&&e>=0?js.slice(s,e+1):js);
  }finally{clearTimeout(timer)}
}

/* ---------- renderer (the builder) ---------- */
function themeCss(t){
  const text=t.light?'#15202b':'#eef3fb',muted=t.light?'#51606f':'#9fb0c4',panel=t.light?'#ffffff':'rgba(255,255,255,.045)',line=t.light?'rgba(20,30,45,.12)':'rgba(255,255,255,.12)',navbg=t.light?'rgba(255,255,255,.82)':'rgba(5,8,15,.55)',field=t.light?'#fff':'rgba(0,0,0,.22)';
  return `<style>
:root{--bg:${t.bg};--bg2:${t.bg2};--text:${text};--muted:${muted};--panel:${panel};--line:${line};--accent:${t.accent};--accent2:${t.accent2};--disp:${t.disp};--body:${t.body}}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:var(--body);color:var(--text);background:var(--bg);line-height:1.7;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.wrap{width:min(1180px,92vw);margin:0 auto}
.btn{display:inline-flex;align-items:center;gap:.5em;border-radius:999px;padding:15px 26px;font-family:var(--body);font-weight:700;font-size:.92rem;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#0a0e14;border:0;cursor:pointer;transition:transform .2s,box-shadow .2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 14px 38px rgba(0,0,0,.25)}
.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.eyebrow{font-family:var(--body);font-size:.72rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);display:inline-block;margin-bottom:1rem}
h1,h2,h3{font-family:var(--disp);font-weight:700;line-height:1.06;letter-spacing:-.02em}
section{padding:clamp(3.4rem,7vw,6rem) 0;border-top:1px solid var(--line)}
.lead{color:var(--muted);font-size:clamp(1rem,1.4vw,1.18rem);max-width:62ch}
.nav{position:sticky;top:0;z-index:50;background:${navbg};backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;min-height:72px;gap:18px}
.brand{font-family:var(--disp);font-weight:700;font-size:1.32rem}
.navlinks{display:flex;align-items:center;gap:22px;font-size:.92rem;color:var(--muted)}
.navlinks a:hover{color:var(--text)}
.hero{padding:clamp(3.4rem,8vw,7rem) 0;border-top:none}
.hero h1{font-size:clamp(2.6rem,6vw,5rem);margin:0 0 1.1rem}
.hero .sub{margin:0 0 2rem;font-size:clamp(1.05rem,1.7vw,1.35rem);color:var(--muted);max-width:60ch}
.hero-split{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center}
.hero-actions{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:1.6rem}
.pills{display:flex;flex-wrap:wrap;gap:10px}
.pill{padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-size:.8rem;color:var(--muted)}
.hero-art{aspect-ratio:4/5;border:1px solid var(--line);border-radius:24px;background:radial-gradient(120% 90% at 28% 8%,var(--accent),transparent 55%),radial-gradient(120% 90% at 92% 96%,var(--accent2),transparent 52%),var(--bg2);box-shadow:0 30px 90px rgba(0,0,0,.32);position:relative;overflow:hidden}
.hero-art::after{content:'';position:absolute;inset:16% 16% auto 16%;height:1px;background:var(--line);box-shadow:0 38px 0 var(--line),0 76px 0 var(--line),0 114px 0 var(--line)}
.hero-center{text-align:center}.hero-center .sub{margin-left:auto;margin-right:auto}.hero-center .hero-actions,.hero-center .pills{justify-content:center}
.head{max-width:720px;margin-bottom:2.4rem}.head.center{margin:0 auto 2.6rem;text-align:center}
.head h2{font-size:clamp(2rem,3.6vw,3.1rem);margin-bottom:.7rem}
.grid{display:grid;gap:18px}.g3{grid-template-columns:repeat(3,1fr)}
.card{border:1px solid var(--line);border-radius:20px;padding:28px;background:var(--panel);transition:transform .25s,border-color .25s}
.card:hover{transform:translateY(-4px);border-color:var(--accent)}
.card .ix{font-family:var(--disp);color:var(--accent);font-size:1.05rem;font-weight:700}
.card h3{font-size:1.25rem;margin:.7rem 0 .5rem}.card p{color:var(--muted);font-size:.96rem}
.why{display:grid;grid-template-columns:.8fr 1.2fr;gap:42px;align-items:start}
.why ul{list-style:none;display:grid;gap:14px}
.why li{border-left:3px solid var(--accent);padding:10px 0 10px 18px;color:var(--muted);font-size:1.05rem}
.about{border:1px solid var(--line);border-radius:26px;padding:clamp(2rem,4vw,3.4rem);background:var(--panel);display:grid;gap:1.2rem}
.about p{color:var(--muted);font-size:clamp(1.05rem,1.7vw,1.4rem);max-width:72ch}
.cta{border:1px solid var(--line);border-radius:26px;padding:clamp(2rem,4vw,3.4rem);background:linear-gradient(135deg,var(--bg2),var(--bg));display:flex;justify-content:space-between;align-items:center;gap:28px;flex-wrap:wrap}
.cta h2{font-size:clamp(1.8rem,3vw,2.6rem);margin-bottom:.4rem}.cta p{color:var(--muted)}
.contact{display:grid;grid-template-columns:.9fr 1.1fr;gap:32px;align-items:start}
.cinfo h2{font-size:clamp(1.8rem,3vw,2.6rem);margin:.4rem 0 1rem}.cinfo p{color:var(--muted);margin-bottom:.5rem}
form{display:grid;gap:14px;border:1px solid var(--line);border-radius:24px;padding:28px;background:var(--panel)}
input,textarea{width:100%;border:1px solid var(--line);background:${field};color:var(--text);border-radius:12px;padding:14px;font:inherit}
input:focus,textarea:focus{outline:none;border-color:var(--accent)}textarea{min-height:130px;resize:vertical}
footer{border-top:1px solid var(--line);padding:2.2rem 0;color:var(--muted);font-size:.85rem}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media(max-width:900px){.hero-split,.why,.contact{grid-template-columns:1fr}.g3{grid-template-columns:1fr}.navlinks a:not(.btn){display:none}.cta{flex-direction:column;align-items:flex-start}}
</style>`;
}
function renderSite(a,t,c,variant){
  const n=esc(a.businessName),cta=esc(a.primaryCta||'Contact Us'),y=new Date().getFullYear();
  const pills=(c.trust||[]).slice(0,4).map(x=>`<span class="pill">${esc(x)}</span>`).join('');
  const heroInner=`<span class="eyebrow">${esc(c.eyebrow||t.name)}</span><h1>${esc(c.headline)}</h1><p class="sub">${esc(c.subhead)}</p><div class="hero-actions"><a class="btn" href="#contact">${cta}</a><a class="btn ghost" href="#services">Explore ${n}</a></div><div class="pills">${pills}</div>`;
  const hero=variant===1
    ?`<section class="hero"><div class="wrap hero-center">${heroInner}</div></section>`
    :variant===2
    ?`<section class="hero"><div class="wrap hero-split"><div class="hero-art"></div><div>${heroInner}</div></div></section>`
    :`<section class="hero"><div class="wrap hero-split"><div>${heroInner}</div><div class="hero-art"></div></div></section>`;
  const vp=(c.valueProps||[]).slice(0,3);
  const valueSec=vp.length?`<section id="why"><div class="wrap"><div class="head center"><span class="eyebrow">Why ${n}</span><h2>${esc(c.valueHead||'Built to deliver')}</h2></div><div class="grid g3">${vp.map((v,i)=>`<article class="card"><span class="ix">0${i+1}</span><h3>${esc(v.title)}</h3><p>${esc(v.desc)}</p></article>`).join('')}</div></div></section>`:'';
  const sv=(c.services||[]).slice(0,5);
  const firstCustomer=esc(clean(a.customers).split(',')[0]||'you');
  const servSec=sv.length?`<section id="services"><div class="wrap"><div class="head"><span class="eyebrow">What we offer</span><h2>Services built for ${firstCustomer}.</h2><p class="lead">${esc(c.subhead)}</p></div><div class="grid g3">${sv.map((s,i)=>`<article class="card"><span class="ix">0${i+1}</span><h3>${esc(s.name)}</h3><p>${esc(s.desc)}</p></article>`).join('')}</div></div></section>`:'';
  const why=(c.whyUs||[]).slice(0,4);
  const whySec=why.length?`<section><div class="wrap why"><div class="head"><span class="eyebrow">The difference</span><h2>Why choose ${n}.</h2></div><ul>${why.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>`:'';
  const aboutSec=c.about?`<section><div class="wrap about"><span class="eyebrow">About</span><p>${esc(c.about)}</p><div><a class="btn" href="#contact">${cta}</a></div></div></section>`:'';
  const ctaSec=`<section><div class="wrap cta"><div><h2>${esc(c.ctaHeadline||'Ready to get started?')}</h2><p>${esc(c.ctaSub||'')}</p></div><a class="btn" href="#contact">${cta}</a></div></section>`;
  const contactSec=`<section id="contact"><div class="wrap contact"><div class="cinfo"><span class="eyebrow">Contact</span><h2>Let’s talk.</h2>${a.phone?`<p><b>Phone:</b> ${esc(a.phone)}</p>`:''}${a.email?`<p><b>Email:</b> ${esc(a.email)}</p>`:''}${a.address?`<p><b>Location:</b> ${esc(a.address)}</p>`:''}<p class="lead">Send a message and ${n} will get right back to you.</p></div><form name="contact" method="POST" data-netlify="true"><input type="hidden" name="form-name" value="contact"><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email address" required><input name="phone" placeholder="Phone (optional)"><textarea name="message" placeholder="How can we help?"></textarea><button class="btn" type="submit">${cta}</button></form></div></section>`;
  const navlinks=`<nav class="navlinks"><a href="#services">Services</a><a href="#why">Why Us</a><a href="#contact" class="btn">${cta}</a></nav>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(c.metaTitle||a.businessName)}</title><meta name="description" content="${esc(c.metaDescription||'')}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${t.fonts}" rel="stylesheet">${themeCss(t)}</head><body><header class="nav"><div class="wrap"><a href="#top" class="brand">${n}</a>${navlinks}</div></header><main id="top">${hero}${valueSec}${servSec}${whySec}${aboutSec}${ctaSec}${contactSec}</main><footer><div class="wrap"><span>© ${y} ${n}. All rights reserved.</span><span>Crafted with AI4 Website Design</span></div></footer></body></html>`;
}

/* ---------- build ---------- */
async function build(a,body){
  const ind=industry(a),t=chooseTheme(a,ind,body),started=Date.now();
  const variant=hash(seedOf(a,body)+'|variant')%3;
  let raw,source='ai4-marketing-engine',error=null;
  try{raw=await expandBrief(a,ind)}
  catch(e){raw=null;source='ai4-marketing-engine-basic';error=clean(e.message||e)}
  const copy=coerceBrief(raw,a,ind);
  const html=renderSite(a,t,copy,variant);
  const quality=validate(html);
  return {html,brief:{businessName:a.businessName,industry:ind,creativeSystem:{id:t.id,name:t.name},variant,copySource:source},quality,source,error,elapsedMs:Date.now()-started};
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:200,headers:HEADERS,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers:HEADERS,body:JSON.stringify({error:'Method not allowed'})};
  const body=parse(event.body),a=normalize(body),r=await build(a,body);
  return{statusCode:200,headers:HEADERS,body:JSON.stringify({success:true,source:r.source,html:r.html,builtHtml:r.html,websiteHtml:r.html,templates:[r.html],brief:{brandName:a.businessName,status:r.quality.status,qualityScore:r.quality.score,platinumCreativeBrief:r.brief},quality:r.quality,siteData:{businessName:a.businessName,business_name:a.businessName,designSystem:'AI4 Industry Marketing Engine V8',industry:r.brief.industry,creativeSystem:r.brief.creativeSystem},meta:{generatedAt:new Date().toISOString(),slug:slug(a.businessName),model:COPY_MODEL,aiTimeoutMs:AI_TIMEOUT_MS,elapsedMs:r.elapsedMs||null,error:r.error||null}})}};

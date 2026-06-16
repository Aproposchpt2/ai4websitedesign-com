'use strict';

/**
 * AI4 Website Design Studio — Industry Marketing Engine V8
 * AI is the copywriter (returns a small JSON marketing brief). The shared
 * renderer (ai4-render.js, used here AND in the browser preview) builds the
 * page from that brief for any theme x layout — so the preview can re-skin
 * instantly with no extra AI calls.
 */
const Anthropic = require('@anthropic-ai/sdk');
const R = require('../../ai4-render.js');
const COPY_MODEL = process.env.AI4_COPY_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const AI_TIMEOUT_MS = Number(process.env.AI4_AI_TIMEOUT_MS || 60000);
const COPY_MAX_TOKENS = Number(process.env.AI4_COPY_MAX_TOKENS || 2200);
const HEADERS = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};

/* ---------- helpers ---------- */
function clean(v,f=''){if(Array.isArray(v))return v.map(x=>clean(x)).filter(Boolean).join(', ')||f;if(v===null||v===undefined)return f;const s=String(v).trim();return s||f}
function parse(b){try{return JSON.parse(b||'{}')}catch{return {}}}
function pick(o,ks,f=''){for(const k of ks){const v=k.split('.').reduce((a,p)=>a&&a[p]!==undefined?a[p]:undefined,o);const s=clean(v);if(s)return s}return f}
function slug(v){return clean(v,'your-business').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,42)||'your-business'}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=Math.imul(31,h)+s.charCodeAt(i)|0;return Math.abs(h)}
function normalize(p){const r=(p&&(p.answers||p.rawAnswers||p.siteData||p.brief||p))||{},c=r.contact||r.contactInfo||{},s=r.social||r.socialLinks||{};return{businessName:pick(r,['businessName','business_name','brandName','companyName','name'],'Your Business'),whatYouDo:pick(r,['whatYouDo','businessDescription','description','q2_whatYouDo','what','services'],'A premium business serving customers with professional solutions.'),customers:pick(r,['customers','idealCustomers','targetAudience','q3_customers','who','audience'],'customers who value trust, clarity, and a professional experience'),differentiators:pick(r,['differentiators','whatMakesDifferent','uniqueValue','q4_differentiators','diff','whyDifferent'],'clear communication, dependable service, and a polished customer experience'),extras:pick(r,['extras','optionalNotes','anythingElse','q7_extras','else','notes'],''),primaryCta:pick(r,['primaryCta','ctaText','cta','callToAction'],'Contact Us'),phone:clean(r.phone||r.phoneNumber||c.phone),email:clean(r.email||r.contactEmail||c.email),address:clean(r.address||r.location||r.serviceArea||c.address),website:clean(r.website||r.url||c.website),tone:pick(r,['tone','brandTone','voice'],''),testimonials:clean(r.testimonials||r.reviews||r.quotes),websiteType:pick(r,['websiteType','type','siteType'],'business')}}
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

/* ---------- theme & layout selection (industry-biased, varies on New Design) ---------- */
const INDUSTRY_THEMES={
  'Technology / AI Services':['tech','modern','mono','ocean','noir'],
  'Professional Services':['editorial','modern','mono','arctic','noir'],
  'Restaurant / Food Service':['luxury','editorial','sunset','rose','royal'],
  'Construction / Skilled Trades':['trades','mono','modern','ocean','olive'],
  'Community / Nonprofit':['fresh','editorial','arctic','rose','forest'],
  'Premium Local Business':['modern','editorial','luxury','fresh','sunset','royal','forest','ocean','rose','arctic','noir','olive']
};
const INDUSTRY_LAYOUTS={
  'Technology / AI Services':['split','bento','feature','sidebar'],
  'Professional Services':['editorial','split','stack','sidebar'],
  'Restaurant / Food Service':['showcase','editorial','stack','banner','spotlight'],
  'Construction / Skilled Trades':['split','feature','showcase','banner'],
  'Community / Nonprofit':['editorial','stack','split','spotlight'],
  'Premium Local Business':['split','editorial','bento','showcase','stack','feature','banner','spotlight','sidebar']
};
function isFresh(body){const m=clean(body.mode,'full');return m==='design'||m==='new-design'||clean(body.regenerate)==='true'||!!clean(body.seed)||!!clean(body.variationSeed)}
function seedOf(a,body){const base=`${a.businessName}|${a.whatYouDo}`;return isFresh(body)?`${base}|${clean(body.seed||body.variationSeed||body.requestId,'')}|${Date.now()}|${Math.random()}`:base}
function chooseTheme(a,ind,body){const ids=R.THEMES.map(t=>t.id);const req=clean(body.styleSystem||body.theme);if(req&&ids.includes(req))return req;const pool=(INDUSTRY_THEMES[ind]||ids).filter(id=>ids.includes(id));return pool.length?pool[hash(seedOf(a,body))%pool.length]:ids[0]}
function chooseLayout(a,ind,body){const ids=R.LAYOUTS.map(l=>l.id);const req=clean(body.layout);if(req&&ids.includes(req))return req;const pool=(INDUSTRY_LAYOUTS[ind]||ids).filter(id=>ids.includes(id));return pool.length?pool[hash(seedOf(a,body)+'|layout')%pool.length]:ids[0]}

/* ---------- copy: AI brief + deterministic fallback ---------- */
function listFrom(s){return clean(s).split(/[•\n;|]|,(?=\s*[A-Z])| - /).map(clean).filter(x=>x.length>3).slice(0,6)}
function deriveBrief(a,ind){
  const sv=listFrom(`${a.whatYouDo}|${a.extras}`).filter(x=>x.length>6);
  let services=(sv.length?sv:[a.whatYouDo]).slice(0,4).map(x=>({name:(x.length>52?x.slice(0,52):x),desc:`Professional ${x.toLowerCase().slice(0,60)} delivered with care and attention to detail.`}));
  while(services.length<3)services.push({name:'Dependable Service',desc:'Consistent, professional work you can count on, start to finish.'});
  const diffs=listFrom(a.differentiators);
  const whyUs=(diffs.length?diffs:['Clear, responsive communication','Dependable, on-time service','A polished customer experience']).slice(0,3);
  return {
    eyebrow:ind,headline:a.businessName,subhead:a.whatYouDo,valueHead:'Built to deliver',
    trust:['Trusted service','Customer-first','Quality work'],
    valueProps:[{title:'Built around you',desc:`Made for ${clean(a.customers).slice(0,80)}.`},{title:'Quality you can see',desc:clean(a.differentiators).slice(0,90)},{title:'Easy to start',desc:'Reach out and we’ll take it from there.'}],
    services,whyUs,
    process:[{step:'Reach out',desc:'Tell us what you need and we’ll listen.'},{step:'Get your plan',desc:'We map the right approach for your goals.'},{step:'See the results',desc:'We deliver and stand behind the work.'}],
    testimonials:[],
    about:`${a.businessName} serves ${clean(a.customers).slice(0,90)}. ${clean(a.whatYouDo).slice(0,140)}`,
    ctaHeadline:'Ready to get started?',ctaSub:'Get in touch and let’s talk about what you need.',
    metaTitle:clean(a.businessName).slice(0,60),metaDescription:clean(a.whatYouDo).slice(0,155)
  };
}
function coerceBrief(obj,a,ind){
  const d=deriveBrief(a,ind);obj=obj&&typeof obj==='object'?obj:{};
  const str=(v,f)=>clean(v)||f;
  const arrStr=(v,f)=>{const x=Array.isArray(v)?v.map(clean).filter(Boolean):[];return x.length?x:f};
  const arrObj=(v,f)=>{const x=Array.isArray(v)?v.map(o=>o&&typeof o==='object'?{name:str(o.name||o.title,''),desc:str(o.desc||o.description,'')}:{name:clean(o),desc:''}).filter(o=>o.name):[];return x.length?x:f};
  return {
    eyebrow:str(obj.eyebrow,d.eyebrow),headline:str(obj.headline,d.headline),subhead:str(obj.subhead,d.subhead),valueHead:str(obj.valueHead,d.valueHead),
    trust:arrStr(obj.trust,d.trust).slice(0,4),
    valueProps:arrObj(obj.valueProps,d.valueProps).map(o=>({title:o.name,desc:o.desc})).slice(0,3),
    services:arrObj(obj.services,d.services).slice(0,5),
    whyUs:arrStr(obj.whyUs,d.whyUs).slice(0,4),
    about:str(obj.about,d.about),ctaHeadline:str(obj.ctaHeadline,d.ctaHeadline),ctaSub:str(obj.ctaSub,d.ctaSub),
    process:(function(){var x=Array.isArray(obj.process)?obj.process.map(function(o){return o&&typeof o==='object'?{step:str(o.step||o.name||o.title,''),desc:str(o.desc||o.description,'')}:{step:clean(o),desc:''}}).filter(function(o){return o.step}):[];return x.length?x.slice(0,4):d.process})(),
    testimonials:(function(){var x=Array.isArray(obj.testimonials)?obj.testimonials.map(function(o){return o&&typeof o==='object'?{quote:str(o.quote||o.text,''),name:str(o.name||o.author,'')}:{quote:clean(o),name:''}}).filter(function(o){return o.quote}):[];return x.slice(0,4)})(),
    metaTitle:str(obj.metaTitle,d.metaTitle),metaDescription:str(obj.metaDescription,d.metaDescription)
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
PROOF, OFFERS & EXTRAS: ${a.extras||'(none)'}
BRAND TONE: ${a.tone||'professional and confident'}
PRIMARY CALL TO ACTION: ${a.primaryCta}
PROVIDED TESTIMONIALS (use ONLY these words, lightly cleaned; NEVER invent any): ${a.testimonials||'(none)'}

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
  "process": [{"step":"short step title","desc":"one sentence"}],
  "testimonials": [{"quote":"the client's own words","name":"client name or role"}],
  "metaTitle": "SEO title, max 60 chars",
  "metaDescription": "SEO description, max 155 chars"
}
Provide 3 valueProps and 4-5 services based on what they actually do, plus 3-4 process steps describing how a customer works with them. Write EVERYTHING in a ${a.tone||'professional and confident'} tone. For "testimonials": use ONLY the provided testimonials (lightly cleaned for grammar); if none were provided, return an empty array []. Never fabricate quotes, names, statistics, or awards. Be concrete and industry-appropriate.`;
  try{
    const r=await client.messages.create({model:COPY_MODEL,max_tokens:COPY_MAX_TOKENS,system,messages:[{role:'user',content:user}]},{signal:controller.signal});
    const txt=(r.content||[]).filter(x=>!x.type||x.type==='text').map(x=>x.text||'').join('').trim();
    const js=txt.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/,'').trim();
    const s=js.indexOf('{'),e=js.lastIndexOf('}');
    return JSON.parse(s>=0&&e>=0?js.slice(s,e+1):js);
  }finally{clearTimeout(timer)}
}

/* ---------- build ---------- */
async function build(a,body){
  const ind=industry(a),themeId=chooseTheme(a,ind,body),layoutId=chooseLayout(a,ind,body),started=Date.now();
  let raw,source='ai4-marketing-engine',error=null;
  try{raw=await expandBrief(a,ind)}
  catch(e){raw=null;source='ai4-marketing-engine-basic';error=clean(e.message||e)}
  const copy=coerceBrief(raw,a,ind);
  const site=Object.assign({},copy,{businessName:a.businessName,primaryCta:a.primaryCta,phone:a.phone,email:a.email,address:a.address,customers:a.customers});
  const html=R.render(site,themeId,layoutId);
  const quality=validate(html);
  return {html,site,themeId,layoutId,brief:{businessName:a.businessName,industry:ind,theme:themeId,layout:layoutId,copySource:source},quality,source,error,elapsedMs:Date.now()-started};
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:200,headers:HEADERS,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers:HEADERS,body:JSON.stringify({error:'Method not allowed'})};
  const body=parse(event.body),a=normalize(body),r=await build(a,body);
  return{statusCode:200,headers:HEADERS,body:JSON.stringify({
    success:true,source:r.source,html:r.html,builtHtml:r.html,websiteHtml:r.html,templates:[r.html],
    brief:{brandName:a.businessName,status:r.quality.status,qualityScore:r.quality.score,platinumCreativeBrief:r.brief},
    quality:r.quality,
    siteData:{businessName:a.businessName,business_name:a.businessName,designSystem:'AI4 Industry Marketing Engine V8',industry:r.brief.industry,theme:r.themeId,layout:r.layoutId,copy:r.site,themes:R.THEMES.map(t=>({id:t.id,name:t.name,accent:t.accent,light:t.light})),layouts:R.LAYOUTS},
    meta:{generatedAt:new Date().toISOString(),slug:slug(a.businessName),model:COPY_MODEL,aiTimeoutMs:AI_TIMEOUT_MS,elapsedMs:r.elapsedMs||null,error:r.error||null}
  })}};

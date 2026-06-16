/*!
 * AI4 Render Core — shared deterministic site renderer.
 * Runs in Node (the Netlify generator) AND in the browser (live preview ribbon).
 * Given a marketing brief + theme id + layout id, returns a complete HTML document.
 * The AI writes the brief once; switching theme/layout is a free instant re-render.
 */
(function(root,factory){var api=factory();if(typeof module!=='undefined'&&module.exports){module.exports=api}if(typeof window!=='undefined'){window.AI4Render=api}})(this,function(){
'use strict';

function clean(v,f){f=f||'';if(Array.isArray(v))return v.map(function(x){return clean(x)}).filter(Boolean).join(', ')||f;if(v===null||v===undefined)return f;var s=String(v).trim();return s||f}
function esc(v){return clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function firstCust(s){return esc(clean(s.customers).split(',')[0]||'you')}
function ey(x){return '<span class="eyebrow">'+esc(x)+'</span>'}
function ctaBtns(n,cta){return '<div class="hero-actions"><a class="btn" href="#contact">'+cta+'</a><a class="btn ghost" href="#services">Explore '+n+'</a></div>'}
function pillsHtml(s){var p=(s.trust||[]).slice(0,4);return p.length?'<div class="pills">'+p.map(function(x){return '<span class="pill">'+esc(x)+'</span>'}).join('')+'</div>':''}
function card(i,title,desc){return '<article class="card"><span class="ix">0'+(i+1)+'</span><h3>'+esc(title)+'</h3><p>'+esc(desc)+'</p></article>'}
function aboutSection(s,cta){return s.about?'<section><div class="wrap about">'+ey('About')+'<p>'+esc(s.about)+'</p><div><a class="btn" href="#contact">'+cta+'</a></div></div></section>':''}
function ctaSection(s,cta){return '<section><div class="wrap cta"><div><h2>'+esc(s.ctaHeadline||'Ready to get started?')+'</h2><p>'+esc(s.ctaSub||'')+'</p></div><a class="btn" href="#contact">'+cta+'</a></div></section>'}
function whyList(s,withId){var why=(s.whyUs||[]).slice(0,4);if(!why.length)return '';return '<section'+(withId?' id="why"':'')+'><div class="wrap why"><div class="head">'+ey('The difference')+'<h2>Why choose '+esc(s.businessName)+'.</h2></div><ul>'+why.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></div></section>'}
function processSection(s){var p=(s.process||[]).slice(0,4);if(!p.length)return '';return '<section id="process"><div class="wrap"><div class="head center">'+ey('How it works')+'<h2>'+esc(s.processHead||'What to expect')+'</h2></div><div class="grid g3">'+p.map(function(x,i){return '<article class="card"><span class="ix">0'+(i+1)+'</span><h3>'+esc(x.step||x.name||x.title)+'</h3><p>'+esc(x.desc)+'</p></article>'}).join('')+'</div></div></section>'}
function testimonialsSection(s){var q=(s.testimonials||[]).slice(0,4);if(!q.length)return '';return '<section id="reviews"><div class="wrap"><div class="head center">'+ey('What clients say')+'<h2>Trusted by the people we serve.</h2></div><div class="quotes">'+q.map(function(t){return '<figure class="quote"><p>“'+esc(t.quote)+'”</p><figcaption class="qby">— '+esc(t.name||'Satisfied client')+'</figcaption></figure>'}).join('')+'</div></div></section>'}
function contactSection(s){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us');return '<section id="contact"><div class="wrap contact"><div class="cinfo">'+ey('Contact')+'<h2>Let’s talk.</h2>'+(s.phone?'<p><b>Phone:</b> '+esc(s.phone)+'</p>':'')+(s.email?'<p><b>Email:</b> '+esc(s.email)+'</p>':'')+(s.address?'<p><b>Location:</b> '+esc(s.address)+'</p>':'')+'<p class="lead">Send a message and '+n+' will get right back to you.</p></div><form name="contact" method="POST" data-netlify="true"><input type="hidden" name="form-name" value="contact"><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email address" required><input name="phone" placeholder="Phone (optional)"><textarea name="message" placeholder="How can we help?"></textarea><button class="btn" type="submit">'+cta+'</button></form></div></section>'}

/* ---------- themes ---------- */
var THEMES=[
  {id:'tech',name:'Signal',disp:"'Space Grotesk',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#05080f',bg2:'#0c1626',accent:'#5cc8ff',accent2:'#c6ff5e',light:false},
  {id:'modern',name:'Vanguard',disp:"'Syne',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap',bg:'#0a0a12',bg2:'#17142b',accent:'#8b9bff',accent2:'#58e6c9',light:false},
  {id:'editorial',name:'Broadsheet',disp:"'Fraunces',Georgia,serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap',bg:'#f6f1e7',bg2:'#ece3d2',accent:'#1d3b5a',accent2:'#b5722a',light:true},
  {id:'luxury',name:'Maison',disp:"'Cormorant',Georgia,serif",body:"'Jost',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap',bg:'#0e0a10',bg2:'#1d1320',accent:'#d9b25a',accent2:'#c98b6a',light:false},
  {id:'trades',name:'Ironclad',disp:"'Archivo',sans-serif",body:"'Manrope',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap',bg:'#11161c',bg2:'#1b2530',accent:'#ff9e3d',accent2:'#e8eef5',light:false},
  {id:'fresh',name:'Meadow',disp:"'Sora',sans-serif",body:"'IBM Plex Sans',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap',bg:'#f4f7f3',bg2:'#e4ede2',accent:'#1f6b4f',accent2:'#b9743b',light:true},
  {id:'mono',name:'Slate',disp:"'Space Grotesk',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#0d0f12',bg2:'#191c22',accent:'#e7ecf3',accent2:'#7c8696',light:false},
  {id:'sunset',name:'Ember',disp:"'Sora',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#140a12',bg2:'#2a1020',accent:'#ff7a59',accent2:'#ffc24b',light:false},
  {id:'noir',name:'Noir',disp:"'Space Grotesk',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#000000',bg2:'#121212',accent:'#ffffff',accent2:'#9aa0a6',light:false},
  {id:'royal',name:'Regalia',disp:"'Cormorant',Georgia,serif",body:"'Jost',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap',bg:'#0b0820',bg2:'#181138',accent:'#caa53e',accent2:'#9a8cf0',light:false},
  {id:'forest',name:'Evergreen',disp:"'Fraunces',Georgia,serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap',bg:'#07140e',bg2:'#0e2418',accent:'#6fe39b',accent2:'#d9c89a',light:false},
  {id:'ocean',name:'Tidewater',disp:"'Space Grotesk',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#04141a',bg2:'#0a2630',accent:'#38d6c6',accent2:'#7fd0ff',light:false},
  {id:'arctic',name:'Glacier',disp:"'Sora',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',bg:'#eef3f8',bg2:'#dde7f1',accent:'#2563a8',accent2:'#3aa0a0',light:true},
  {id:'rose',name:'Atelier',disp:"'Fraunces',Georgia,serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap',bg:'#fbf2f1',bg2:'#f3e0df',accent:'#b03a52',accent2:'#c98b6a',light:true},
  {id:'olive',name:'Harvest',disp:"'Archivo',sans-serif",body:"'Manrope',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap',bg:'#13140d',bg2:'#23251a',accent:'#b6c24b',accent2:'#e0b15a',light:false}
];
function themeById(id){for(var i=0;i<THEMES.length;i++){if(THEMES[i].id===id)return THEMES[i]}return THEMES[0]}

var LAYOUTS=[
  {id:'split',name:'Split'},{id:'editorial',name:'Editorial'},{id:'bento',name:'Bento'},
  {id:'showcase',name:'Showcase'},{id:'stack',name:'Stack'},{id:'feature',name:'Feature'},
  {id:'banner',name:'Banner'},{id:'spotlight',name:'Spotlight'},{id:'sidebar',name:'Sidebar'}
];

/* font pairings (display + body), selectable independently of theme */
var FONTS=[
  {id:'grotesk',name:'Grotesk',disp:"'Space Grotesk',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap'},
  {id:'geometric',name:'Geometric',disp:"'Syne',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap'},
  {id:'editorial',name:'Editorial',disp:"'Fraunces',Georgia,serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap'},
  {id:'elegant',name:'Elegant',disp:"'Cormorant',Georgia,serif",body:"'Jost',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap'},
  {id:'classic',name:'Classic',disp:"'Playfair Display',Georgia,serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600&display=swap'},
  {id:'bold',name:'Bold',disp:"'Archivo',sans-serif",body:"'Manrope',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap'},
  {id:'humanist',name:'Humanist',disp:"'Sora',sans-serif",body:"'IBM Plex Sans',sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap'},
  {id:'quirky',name:'Quirky',disp:"'Bricolage Grotesque',sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap'},
  {id:'clean',name:'Clean',disp:"'Inter',system-ui,sans-serif",body:"'Inter',system-ui,sans-serif",fonts:'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'}
];
function fontById(id){for(var i=0;i<FONTS.length;i++){if(FONTS[i].id===id)return FONTS[i]}return null}
var SIZES=[{id:'s',name:'Compact'},{id:'m',name:'Default'},{id:'l',name:'Large'}];
var STYLES=[{id:'standard',name:'Standard'},{id:'upper',name:'Uppercase'},{id:'tight',name:'Tight'},{id:'airy',name:'Airy'},{id:'italic',name:'Italic'}];

function themeCss(t){
  var text=t.light?'#15202b':'#eef3fb',muted=t.light?'#51606f':'#9fb0c4',panel=t.light?'#ffffff':'rgba(255,255,255,.045)',line=t.light?'rgba(20,30,45,.12)':'rgba(255,255,255,.12)',navbg=t.light?'rgba(255,255,255,.82)':'rgba(5,8,15,.55)',field=t.light?'#fff':'rgba(0,0,0,.22)';
  return '<style>'+
':root{--bg:'+t.bg+';--bg2:'+t.bg2+';--text:'+text+';--muted:'+muted+';--panel:'+panel+';--line:'+line+';--accent:'+t.accent+';--accent2:'+t.accent2+';--disp:'+t.disp+';--body:'+t.body+'}'+
'*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}'+
'body{font-family:var(--body);color:var(--text);background:var(--bg);line-height:1.7;overflow-x:hidden}'+
'a{color:inherit;text-decoration:none}'+
'.wrap{width:min(1180px,92vw);margin:0 auto}'+
'.btn{display:inline-flex;align-items:center;gap:.5em;border-radius:999px;padding:15px 26px;font-family:var(--body);font-weight:700;font-size:.92rem;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#0a0e14;border:0;cursor:pointer;transition:transform .2s,box-shadow .2s}'+
'.btn:hover{transform:translateY(-2px);box-shadow:0 14px 38px rgba(0,0,0,.25)}'+
'.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}'+
'.eyebrow{font-family:var(--body);font-size:.72rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);display:inline-block;margin-bottom:1rem}'+
'h1,h2,h3{font-family:var(--disp);font-weight:700;line-height:1.06;letter-spacing:-.02em}'+
'section{padding:clamp(3.4rem,7vw,6rem) 0;border-top:1px solid var(--line)}'+
'.lead{color:var(--muted);font-size:clamp(1rem,1.4vw,1.18rem);max-width:62ch}'+
'.nav{position:sticky;top:0;z-index:50;background:'+navbg+';backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}'+
'.nav .wrap{display:flex;align-items:center;justify-content:space-between;min-height:72px;gap:18px}'+
'.brand{font-family:var(--disp);font-weight:700;font-size:1.32rem}'+
'.navlinks{display:flex;align-items:center;gap:22px;font-size:.92rem;color:var(--muted)}.navlinks a:hover{color:var(--text)}'+
'.hero{padding:clamp(3.4rem,8vw,7rem) 0;border-top:none}'+
'.hero h1{font-size:clamp(2.6rem,6vw,5rem);margin:0 0 1.1rem}'+
'.hero .sub{margin:0 0 2rem;font-size:clamp(1.05rem,1.7vw,1.35rem);color:var(--muted);max-width:60ch}'+
'.hero-split{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center}'+
'.hero-actions{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:1.6rem}'+
'.pills{display:flex;flex-wrap:wrap;gap:10px}.pill{padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-size:.8rem;color:var(--muted)}'+
'.hero-art{aspect-ratio:4/5;border:1px solid var(--line);border-radius:24px;background:radial-gradient(120% 90% at 28% 8%,var(--accent),transparent 55%),radial-gradient(120% 90% at 92% 96%,var(--accent2),transparent 52%),var(--bg2);box-shadow:0 30px 90px rgba(0,0,0,.32);position:relative;overflow:hidden}'+
'.hero-art::after{content:"";position:absolute;inset:16% 16% auto 16%;height:1px;background:var(--line);box-shadow:0 38px 0 var(--line),0 76px 0 var(--line),0 114px 0 var(--line)}'+
'.hero-center{text-align:center}.hero-center .sub{margin-left:auto;margin-right:auto}.hero-center .hero-actions,.hero-center .pills{justify-content:center}'+
'.head{max-width:720px;margin-bottom:2.4rem}.head.center{margin:0 auto 2.6rem;text-align:center}.head h2{font-size:clamp(2rem,3.6vw,3.1rem);margin-bottom:.7rem}'+
'.grid{display:grid;gap:18px}.g3{grid-template-columns:repeat(3,1fr)}'+
'.card{border:1px solid var(--line);border-radius:20px;padding:28px;background:var(--panel);transition:transform .25s,border-color .25s}.card:hover{transform:translateY(-4px);border-color:var(--accent)}'+
'.card .ix{font-family:var(--disp);color:var(--accent);font-size:1.05rem;font-weight:700}.card h3{font-size:1.25rem;margin:.7rem 0 .5rem}.card p{color:var(--muted);font-size:.96rem}'+
'.why{display:grid;grid-template-columns:.8fr 1.2fr;gap:42px;align-items:start}.why ul{list-style:none;display:grid;gap:14px}.why li{border-left:3px solid var(--accent);padding:10px 0 10px 18px;color:var(--muted);font-size:1.05rem}'+
'.about{border:1px solid var(--line);border-radius:26px;padding:clamp(2rem,4vw,3.4rem);background:var(--panel);display:grid;gap:1.2rem}.about p{color:var(--muted);font-size:clamp(1.05rem,1.7vw,1.4rem);max-width:72ch}'+
'.cta{border:1px solid var(--line);border-radius:26px;padding:clamp(2rem,4vw,3.4rem);background:linear-gradient(135deg,var(--bg2),var(--bg));display:flex;justify-content:space-between;align-items:center;gap:28px;flex-wrap:wrap}.cta h2{font-size:clamp(1.8rem,3vw,2.6rem);margin-bottom:.4rem}.cta p{color:var(--muted)}'+
'.contact{display:grid;grid-template-columns:.9fr 1.1fr;gap:32px;align-items:start}.cinfo h2{font-size:clamp(1.8rem,3vw,2.6rem);margin:.4rem 0 1rem}.cinfo p{color:var(--muted);margin-bottom:.5rem}'+
'form{display:grid;gap:14px;border:1px solid var(--line);border-radius:24px;padding:28px;background:var(--panel)}'+
'input,textarea{width:100%;border:1px solid var(--line);background:'+field+';color:var(--text);border-radius:12px;padding:14px;font:inherit}input:focus,textarea:focus{outline:none;border-color:var(--accent)}textarea{min-height:130px;resize:vertical}'+
'footer{border-top:1px solid var(--line);padding:2.2rem 0;color:var(--muted);font-size:.85rem}footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}'+
'.ed-hero h1{font-size:clamp(2.8rem,7vw,6rem);max-width:15ch;margin:.3rem 0 1.4rem}.ed-grid{display:grid;grid-template-columns:.7fr 1.3fr;gap:34px;border-top:1px solid var(--line);padding-top:26px}'+
'.ed-row{display:grid;grid-template-columns:88px 1fr;gap:26px;padding:24px 0;border-bottom:1px solid var(--line);align-items:start}.ed-row b{font-family:var(--disp);font-size:2.4rem;color:var(--accent2);line-height:1}.ed-row h3{font-size:1.45rem;margin-bottom:.4rem}'+
'.ed-feature{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;border-top:1px solid var(--line);padding-top:24px;margin-top:1rem}.ed-feature h3{font-size:1.2rem;margin-bottom:.4rem}.ed-feature p{color:var(--muted);font-size:.96rem}'+
'.bento{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(150px,auto);gap:14px}.bento .b-lg{grid-column:span 2;grid-row:span 2}.bento .b-wide{grid-column:span 2}'+
'.tile{border:1px solid var(--line);border-radius:18px;padding:24px;background:var(--panel);display:flex;flex-direction:column;justify-content:space-between;gap:.6rem;transition:border-color .25s}.tile:hover{border-color:var(--accent)}.tile h3{font-size:1.2rem}.tile p{color:var(--muted);font-size:.94rem}'+
'.matrix{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-top:1.2rem}.matrix div{padding:22px;border-right:1px solid var(--line)}.matrix div:last-child{border-right:0}.matrix p{color:var(--muted);font-size:.94rem;margin-top:.4rem}'+
'.stage{position:relative;min-height:60vh;display:flex;align-items:flex-end;border:1px solid var(--line);border-radius:26px;overflow:hidden;padding:clamp(1.6rem,4vw,3rem);background:radial-gradient(120% 120% at 82% 0%,var(--accent),transparent 55%),radial-gradient(120% 120% at 0% 100%,var(--accent2),transparent 55%),var(--bg2)}.stage .s-copy{position:relative;max-width:62ch}.stage h1{font-size:clamp(2.6rem,7vw,5.4rem);margin:.5rem 0 1rem}'+
'.ribbon{display:flex;gap:8px;overflow:hidden;border-block:1px solid var(--line);padding:14px 0;flex-wrap:wrap}.ribbon span{white-space:nowrap;font-family:var(--body);font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:.76rem;color:var(--accent);padding:0 10px}'+
'.panels{display:grid;gap:14px}.panel{display:grid;grid-template-columns:78px 1fr;gap:22px;border:1px solid var(--line);border-radius:18px;padding:24px;background:var(--panel);align-items:center}.panel b{font-family:var(--disp);font-size:1.9rem;color:var(--accent)}.panel h3{font-size:1.3rem;margin-bottom:.3rem}'+
'.stack-svc{display:grid;max-width:820px;margin:0 auto}.stack-svc .row{padding:26px 0;border-bottom:1px solid var(--line);text-align:center}.stack-svc h3{font-size:1.6rem;margin-bottom:.4rem}.bare{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;text-align:center}.bare h3{font-size:1.2rem;margin-bottom:.4rem}.bare p{color:var(--muted)}'+
'.feat{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center;margin-bottom:22px}.feat:nth-child(even) .feat-art{order:-1}.feat-art{aspect-ratio:16/11;border:1px solid var(--line);border-radius:20px;background:radial-gradient(100% 100% at 20% 10%,var(--accent),transparent 60%),radial-gradient(100% 100% at 90% 90%,var(--accent2),transparent 55%),var(--bg2)}.feat h3{font-size:1.6rem;margin-bottom:.5rem}'+
'.g2{grid-template-columns:repeat(2,1fr)}'+
'.band{background:var(--bg2)}'+
'.side{display:grid;grid-template-columns:.85fr 1.15fr;gap:42px;align-items:start}'+
'.side-rail{border:1px solid var(--line);border-radius:22px;padding:30px;background:var(--panel);position:sticky;top:90px}.side-rail h1{font-size:clamp(2rem,4vw,3.2rem);margin:.5rem 0 1rem}.side-rail .mini{margin-top:1.1rem;color:var(--muted);font-size:.9rem;display:grid;gap:.3rem}'+
'.side-main .lead{margin-bottom:1.4rem}.side-list{display:grid;gap:14px}.side-list .row{border:1px solid var(--line);border-radius:16px;padding:18px 20px}.side-list h3{font-size:1.15rem;margin-bottom:.3rem}.side-list p{color:var(--muted);font-size:.94rem}'+
'.quotes{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.quote{border:1px solid var(--line);border-radius:20px;padding:26px;background:var(--panel);margin:0}.quote p{font-size:1.06rem;line-height:1.6}.qby{color:var(--muted);font-size:.85rem;margin-top:.9rem;font-weight:700}'+
'.ts-s .hero h1{font-size:clamp(2.1rem,5vw,3.5rem)}.ts-s .head h2{font-size:clamp(1.6rem,3vw,2.4rem)}.ts-s .stage h1,.ts-s .ed-hero h1,.ts-s .side-rail h1{font-size:clamp(2.1rem,5.5vw,4rem)}'+
'.ts-l .hero h1{font-size:clamp(3.1rem,8vw,6.4rem)}.ts-l .head h2{font-size:clamp(2.3rem,4.4vw,3.9rem)}.ts-l .stage h1,.ts-l .ed-hero h1,.ts-l .side-rail h1{font-size:clamp(3.1rem,8.5vw,7rem)}'+
'.hs-upper h1,.hs-upper h2,.hs-upper h3{text-transform:uppercase;letter-spacing:.02em}'+
'.hs-tight h1,.hs-tight h2,.hs-tight h3{letter-spacing:-.05em}'+
'.hs-airy h1,.hs-airy h2,.hs-airy h3{font-weight:500;letter-spacing:.012em}.hs-airy .eyebrow{letter-spacing:.3em}'+
'.hs-italic h1,.hs-italic h2{font-style:italic}'+
'@media(max-width:900px){.hero-split,.why,.contact,.ed-grid,.ed-row,.ed-feature,.bare,.feat,.g2,.side,.quotes{grid-template-columns:1fr}.g3{grid-template-columns:1fr}.navlinks a:not(.btn){display:none}.cta{flex-direction:column;align-items:flex-start}.bento{grid-template-columns:1fr}.bento .b-lg,.bento .b-wide{grid-column:auto;grid-row:auto}.matrix{grid-template-columns:1fr}.matrix div{border-right:0;border-bottom:1px solid var(--line)}.panel{grid-template-columns:1fr}.stage{min-height:auto}.side-rail{position:static}}'+
'</style>';
}

/* ---------- layouts ---------- */
function L_split(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,5);
  var hero='<section class="hero"><div class="wrap hero-split"><div>'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+pillsHtml(s)+'</div><div class="hero-art"></div></div></section>';
  var value=vp.length?'<section id="why"><div class="wrap"><div class="head center">'+ey('Why '+s.businessName)+'<h2>'+esc(s.valueHead||'Built to deliver')+'</h2></div><div class="grid g3">'+vp.map(function(v,i){return card(i,v.title,v.desc)}).join('')+'</div></div></section>':'';
  var services=sv.length?'<section id="services"><div class="wrap"><div class="head">'+ey('What we offer')+'<h2>Services built for '+firstCust(s)+'.</h2><p class="lead">'+esc(s.subhead)+'</p></div><div class="grid g3">'+sv.map(function(x,i){return card(i,x.name,x.desc)}).join('')+'</div></div></section>':'';
  return hero+value+services+whyList(s,false);}
function L_editorial(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,5);
  var hero='<section class="hero ed-hero"><div class="wrap">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><div class="ed-grid"><p class="lead">'+esc(s.subhead)+'</p><div>'+ctaBtns(n,cta)+pillsHtml(s)+'</div></div></div></section>';
  var services=sv.length?'<section id="services"><div class="wrap">'+ey('What we offer')+'<h2 style="font-size:clamp(2rem,3.6vw,3.1rem);margin-bottom:1rem">Services built for '+firstCust(s)+'.</h2>'+sv.map(function(x,i){return '<div class="ed-row"><b>0'+(i+1)+'</b><div><h3>'+esc(x.name)+'</h3><p class="lead">'+esc(x.desc)+'</p></div></div>'}).join('')+'</div></section>':'';
  var value=vp.length?'<section id="why"><div class="wrap">'+ey(s.valueHead||'Why '+s.businessName)+'<div class="ed-feature">'+vp.map(function(v){return '<div><h3>'+esc(v.title)+'</h3><p>'+esc(v.desc)+'</p></div>'}).join('')+'</div></div></section>':'';
  return hero+services+value+whyList(s,false);}
function L_bento(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,4),why=(s.whyUs||[]).slice(0,4);
  var hero='<section class="hero"><div class="wrap hero-center">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+pillsHtml(s)+'</div></section>';
  var tiles=['<article class="tile b-lg">'+ey('Why '+s.businessName)+'<h3 style="font-size:1.6rem">'+esc(s.valueHead||'Built to deliver')+'</h3><p>'+esc(vp[0]?vp[0].desc:s.subhead)+'</p></article>'];
  sv.forEach(function(x,i){tiles.push('<article class="tile'+(i===0?' b-wide':'')+'"><span class="ix">0'+(i+1)+'</span><h3>'+esc(x.name)+'</h3><p>'+esc(x.desc)+'</p></article>')});
  vp.slice(1).forEach(function(v){tiles.push('<article class="tile"><h3>'+esc(v.title)+'</h3><p>'+esc(v.desc)+'</p></article>')});
  var grid='<section id="services"><div class="wrap"><div class="head">'+ey('What we offer')+'<h2>Built for '+firstCust(s)+'.</h2></div><div class="bento">'+tiles.join('')+'</div></div></section>';
  var matrix=why.length?'<section id="why"><div class="wrap">'+ey('The difference')+'<h2>Why choose '+n+'.</h2><div class="matrix">'+why.map(function(x,i){return '<div><span class="ix">0'+(i+1)+'</span><p>'+esc(x)+'</p></div>'}).join('')+'</div></div></section>':'';
  return hero+grid+matrix;}
function L_showcase(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),sv=(s.services||[]).slice(0,5);
  var hero='<section class="hero"><div class="wrap"><div class="stage"><div class="s-copy">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+'</div></div></div></section>';
  var rib=(s.trust||[]).concat(sv.map(function(x){return x.name})).slice(0,8);
  var ribbon=rib.length?'<div class="wrap ribbon">'+rib.concat(rib).map(function(x){return '<span>'+esc(x)+'</span>'}).join('')+'</div>':'';
  var panels=sv.length?'<section id="services"><div class="wrap"><div class="head">'+ey('What we offer')+'<h2>Services built for '+firstCust(s)+'.</h2></div><div class="panels">'+sv.map(function(x,i){return '<div class="panel"><b>0'+(i+1)+'</b><div><h3>'+esc(x.name)+'</h3><p class="lead">'+esc(x.desc)+'</p></div></div>'}).join('')+'</div></div></section>':'';
  return hero+ribbon+panels+whyList(s,true);}
function L_stack(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,5);
  var hero='<section class="hero"><div class="wrap hero-center">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+pillsHtml(s)+'</div></section>';
  var value=vp.length?'<section id="why"><div class="wrap"><div class="head center">'+ey('Why '+s.businessName)+'<h2>'+esc(s.valueHead||'Built to deliver')+'</h2></div><div class="bare">'+vp.map(function(v){return '<div><h3>'+esc(v.title)+'</h3><p>'+esc(v.desc)+'</p></div>'}).join('')+'</div></div></section>':'';
  var services=sv.length?'<section id="services"><div class="wrap"><div class="head center">'+ey('What we offer')+'<h2>Services built for '+firstCust(s)+'.</h2></div><div class="stack-svc">'+sv.map(function(x){return '<div class="row"><h3>'+esc(x.name)+'</h3><p class="lead" style="margin:0 auto">'+esc(x.desc)+'</p></div>'}).join('')+'</div></div></section>':'';
  return hero+value+services+whyList(s,false);}
function L_feature(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,4);
  var hero='<section class="hero"><div class="wrap hero-split"><div>'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+pillsHtml(s)+'</div><div class="hero-art"></div></div></section>';
  var services=sv.length?'<section id="services"><div class="wrap"><div class="head">'+ey('What we offer')+'<h2>Services built for '+firstCust(s)+'.</h2></div>'+sv.map(function(x,i){return '<div class="feat"><div><span class="ix">0'+(i+1)+'</span><h3>'+esc(x.name)+'</h3><p class="lead">'+esc(x.desc)+'</p></div><div class="feat-art"></div></div>'}).join('')+'</div></section>':'';
  var value=vp.length?'<section id="why"><div class="wrap"><div class="head center">'+ey('Why '+s.businessName)+'<h2>'+esc(s.valueHead||'Built to deliver')+'</h2></div><div class="grid g3">'+vp.map(function(v,i){return card(i,v.title,v.desc)}).join('')+'</div></div></section>':'';
  return hero+services+value+whyList(s,false);}

function L_banner(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,5);
  var hero='<section class="hero"><div class="wrap hero-center">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+pillsHtml(s)+'</div></section>';
  var value=vp.length?'<section class="band" id="why"><div class="wrap"><div class="head center">'+ey('Why '+s.businessName)+'<h2>'+esc(s.valueHead||'Built to deliver')+'</h2></div><div class="grid g3">'+vp.map(function(v,i){return card(i,v.title,v.desc)}).join('')+'</div></div></section>':'';
  var services=sv.length?'<section id="services"><div class="wrap"><div class="head">'+ey('What we offer')+'<h2>Services built for '+firstCust(s)+'.</h2></div><div class="panels">'+sv.map(function(x,i){return '<div class="panel"><b>0'+(i+1)+'</b><div><h3>'+esc(x.name)+'</h3><p class="lead">'+esc(x.desc)+'</p></div></div>'}).join('')+'</div></div></section>':'';
  var why=whyList(s,false).replace('<section>','<section class="band">');
  return hero+value+services+why;}
function L_spotlight(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,4);
  var hero='<section class="hero"><div class="wrap hero-center">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="sub">'+esc(s.subhead)+'</p>'+ctaBtns(n,cta)+'</div></section>';
  var rib=(s.trust||[]).slice(0,6);var ribbon=rib.length?'<div class="wrap ribbon">'+rib.concat(rib).map(function(x){return '<span>'+esc(x)+'</span>'}).join('')+'</div>':'';
  var services=sv.length?'<section id="services"><div class="wrap"><div class="head center">'+ey('What we offer')+'<h2>Services built for '+firstCust(s)+'.</h2></div><div class="grid g2">'+sv.map(function(x,i){return card(i,x.name,x.desc)}).join('')+'</div></div></section>':'';
  var value=vp.length?'<section id="why"><div class="wrap"><div class="head center">'+ey('Why '+s.businessName)+'<h2>'+esc(s.valueHead||'Built to deliver')+'</h2></div><div class="bare">'+vp.map(function(v){return '<div><h3>'+esc(v.title)+'</h3><p>'+esc(v.desc)+'</p></div>'}).join('')+'</div></div></section>':'';
  return hero+ribbon+services+value+whyList(s,false);}
function L_sidebar(s,t){var n=esc(s.businessName),cta=esc(s.primaryCta||'Contact Us'),vp=(s.valueProps||[]).slice(0,3),sv=(s.services||[]).slice(0,5),why=(s.whyUs||[]).slice(0,4);
  var rail='<aside class="side-rail">'+ey(s.eyebrow||t.name)+'<h1>'+esc(s.headline)+'</h1><p class="lead">'+esc(s.subhead)+'</p><div style="margin-top:1.2rem">'+ctaBtns(n,cta)+'</div>'+pillsHtml(s)+'<div class="mini">'+(s.phone?'<span>'+esc(s.phone)+'</span>':'')+(s.email?'<span>'+esc(s.email)+'</span>':'')+(s.address?'<span>'+esc(s.address)+'</span>':'')+'</div></aside>';
  var list='<div class="side-main"><div id="services"><h2 style="font-size:clamp(1.6rem,3vw,2.4rem);margin-bottom:1rem">What we offer</h2><div class="side-list">'+sv.map(function(x){return '<div class="row"><h3>'+esc(x.name)+'</h3><p>'+esc(x.desc)+'</p></div>'}).join('')+'</div></div></div>';
  var hero='<section class="hero"><div class="wrap side">'+rail+list+'</div></section>';
  var value=vp.length?'<section id="why"><div class="wrap"><div class="head center">'+ey('Why '+s.businessName)+'<h2>'+esc(s.valueHead||'Built to deliver')+'</h2></div><div class="grid g3">'+vp.map(function(v,i){return card(i,v.title,v.desc)}).join('')+'</div></div></section>':'';
  var whySec=why.length?'<section><div class="wrap why"><div class="head">'+ey('The difference')+'<h2>Why choose '+n+'.</h2></div><ul>'+why.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></div></section>':'';
  return hero+value+whySec;}

var RENDERERS={split:L_split,editorial:L_editorial,bento:L_bento,showcase:L_showcase,stack:L_stack,feature:L_feature,banner:L_banner,spotlight:L_spotlight,sidebar:L_sidebar};

function render(site,themeId,layoutId,fontId,sizeId,styleId){
  var s=site||{},t=themeById(themeId),f=fontId?fontById(fontId):null,fn=RENDERERS[layoutId]||L_split;
  var et=f?{id:t.id,name:t.name,light:t.light,bg:t.bg,bg2:t.bg2,accent:t.accent,accent2:t.accent2,disp:f.disp,body:f.body,fonts:f.fonts}:t;
  var scale=(sizeId==='s'||sizeId==='l')?sizeId:'m';
  var hs=(['upper','tight','airy','italic'].indexOf(styleId)>-1)?(' hs-'+styleId):'';
  var n=esc(s.businessName||'Your Business'),cta=esc(s.primaryCta||'Contact Us'),y=new Date().getFullYear();
  var main=fn(s,et)+aboutSection(s,cta)+processSection(s)+testimonialsSection(s)+ctaSection(s,cta);
  var nav='<header class="nav"><div class="wrap"><a href="#top" class="brand">'+n+'</a><nav class="navlinks"><a href="#services">Services</a><a href="#why">Why Us</a><a href="#contact" class="btn">'+cta+'</a></nav></div></header>';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>'+esc(s.metaTitle||s.businessName||'Website')+'</title><meta name="description" content="'+esc(s.metaDescription||'')+'"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="'+et.fonts+'" rel="stylesheet">'+themeCss(et)+'</head><body class="ts-'+scale+hs+'">'+nav+'<main id="top">'+main+contactSection(s)+'</main><footer><div class="wrap"><span>© '+y+' '+n+'. All rights reserved.</span><span>Crafted with AI4 Website Design</span></div></footer></body></html>';
}

return {render:render,THEMES:THEMES,LAYOUTS:LAYOUTS,FONTS:FONTS,SIZES:SIZES,STYLES:STYLES,esc:esc,clean:clean};
});

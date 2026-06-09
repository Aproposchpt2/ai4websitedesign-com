async function launchSite() {
  const btn = document.querySelector('.btn-launch');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending your website...'; }
  const email_   = sessionStorage.getItem('ai4_email') || '';
  const fullName = sessionStorage.getItem('ai4_full_name') || '';
  try {
    if (siteId && email_) {
      const res  = await fetch('https://ai4websitedesign.com/.netlify/functions/s
        method: 'POST', headers: { 'Content-Type':
'application/json
        body: JSON.stringify({ site_id: siteId, email: email_,
name: fullName })
      });
      const data > ({}));
      if (data.success) {
        const carcongrats-card');
        if (card) {
          card.qune').innerHTML ='Your website<br>is on its way!';
          card.qutextContent ='Check your inbox — your website file has been sent to ' +
email_ + '. Reply.';
          const actions =
card.querySelecto
          if (actions) actions.innerHTML = '<button
class="btn-logoffutton>';
        }
        return;
      }
    }
  } catch(e) { console.warn('send error:', e); }
  window.locationl';
}

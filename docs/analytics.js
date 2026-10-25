/* Website-only analytics: no Google requests before opt-in. */
(() => {
  'use strict';
  const id = 'G-SBMMGFZGFQ';
  const key = 'kero-site-analytics-v1';
  const ja = document.documentElement.lang === 'ja';
  let active = false;
  let initialized = false;
  const read = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = value => { try { localStorage.setItem(key, value); } catch { /* Choice applies to this page only. */ } };
  const cleanUrl = value => { try { const u = new URL(value); return u.origin + u.pathname; } catch { return ''; } };
  function start() {
    if (active) return;
    active = true;
    window['ga-disable-' + id] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    if (initialized) return;
    initialized = true;
    gtag('consent', 'default', {analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    gtag('consent', 'update', {analytics_storage:'granted'});
    gtag('js', new Date());
    gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: location.hostname,
      cookie_path: '/KeroTranslate/',
      cookie_expires: 7776000,
      cookie_update: false,
      page_location: cleanUrl(location.href),
      page_referrer: cleanUrl(document.referrer)
    });
    gtag('event', 'page_view', {page_title:document.title, page_location:cleanUrl(location.href), page_referrer:cleanUrl(document.referrer)});
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.append(script);
  }
  function stop() {
    window['ga-disable-' + id] = true;
    // Disable collection before removing the tag; do not send denied-state pings.
    active = false;
    window.gtag = () => {};
    for (const part of document.cookie.split(';')) {
      const name = part.trim().split('=')[0];
      if (name !== '_ga' && name !== '_ga_SBMMGFZGFQ') continue;
      for (const domain of ['', ';domain=' + location.hostname]) {
        document.cookie = name + '=;max-age=0;path=/KeroTranslate/' + domain;
      }
    }
  }
  const box = document.createElement('section');
  box.className = 'analytics-consent';
  box.setAttribute('aria-label', ja ? 'アクセス解析の設定' : 'Website analytics preferences');
  const message = document.createElement('p');
  message.textContent = ja
    ? 'サイト改善のため、同意した場合のみGoogle Analyticsで閲覧状況とストアリンクのクリックを計測します。Cookieを使用します。拒否しても全ページを利用できます。'
    : 'With your permission, Google Analytics uses cookies to measure page visits and store-link clicks to improve this website. All pages work if you decline.';
  const policy = document.createElement('a');
  policy.href = ja ? 'privacy.jp.html#website-analytics' : 'privacy.html#website-analytics';
  policy.textContent = ja ? '詳しい説明' : 'Privacy details';
  const actions = document.createElement('div');
  actions.className = 'analytics-actions';
  const button = (label, handler) => { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=handler; return b; };
  const manage = button(ja ? 'アクセス解析の設定' : 'Analytics preferences', () => { box.hidden=false; decline.focus(); });
  function choose(value) {
    write(value);
    if (value === 'accepted') start(); else stop();
    box.hidden=true;
    manage.focus();
  }
  const decline = button(ja ? '拒否する' : 'Decline', () => choose('declined'));
  const accept = button(ja ? '同意する' : 'Accept', () => choose('accepted'));
  actions.append(decline, accept);
  box.append(message, policy, actions);
  document.body.append(box);
  (document.querySelector('footer') || document.body).append(manage);
  manage.className='analytics-manage';
  box.hidden = ['accepted','declined'].includes(read());
  if (read() === 'accepted') start();
  document.addEventListener('click', event => {
    const a = event.target.closest?.('a[href]');
    if (!active || !a) return;
    if (new URL(a.href).hostname === 'chromewebstore.google.com') {
      window.gtag('event', 'store_link_click', {destination:'chrome_web_store'});
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === key && event.newValue !== 'accepted') {
      stop();
      box.hidden = event.newValue === 'declined';
    }
  });
})();

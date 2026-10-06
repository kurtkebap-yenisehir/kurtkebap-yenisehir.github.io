import { getAnalyticsConfig } from './analytics-config.js';
import { ANALYTICS_CONSENT_KEY, ANALYTICS_VISITOR_KEY, ANALYTICS_SESSION_KEY, analyticsUuid, buildAnalyticsEvent, createAnalyticsIdentity, isAnalyticsEligible } from './analytics-shared.js';

function storage(name) {
  try { return window[name]; } catch { return undefined; }
}

function startAnalytics() {
  const config = getAnalyticsConfig();
  if (!config || !isAnalyticsEligible(location, navigator)) return;
  const localStore = storage('localStorage');
  const sessionStore = storage('sessionStorage');
  let consent;
  try { consent = localStore?.getItem(ANALYTICS_CONSENT_KEY); } catch { /* Ask again without persistent storage. */ }
  let identity;
  let pageSent = false;

  const notice = document.createElement('section');
  notice.className = 'analytics-notice';
  notice.setAttribute('aria-label', 'İstatistik tercihleri');
  notice.innerHTML = '<p>Ziyaret ve tıklama istatistikleri için izin verir misiniz?</p><small>Sayfa ziyaretleri ve buton tıklamaları rastgele bir tarayıcı kimliğiyle ölçülür. İzninizi istediğiniz zaman değiştirebilirsiniz.</small><div class="analytics-actions"><button type="button" data-consent="accepted">İzin ver</button><button type="button" data-consent="rejected">İzin verme</button></div><button type="button" class="analytics-dismiss" aria-label="Tercih penceresini kapat" hidden>×</button>';
  const preferences = document.createElement('button');
  preferences.type = 'button';
  preferences.className = 'analytics-preferences';
  preferences.textContent = 'İstatistik tercihleri';
  const dismiss = notice.querySelector('.analytics-dismiss');
  document.querySelector('footer')?.append(preferences);
  document.body.append(notice);

  function collect(eventName) {
    if (consent !== 'accepted' || !isAnalyticsEligible(location, navigator)) return;
    identity ||= createAnalyticsIdentity({ localStorage: localStore, sessionStorage: sessionStore });
    const event = buildAnalyticsEvent(eventName, location.pathname, identity.current(), analyticsUuid());
    if (!event) return;
    try {
      void fetch(`${config.url}/functions/v1/menu-analytics`, {
        method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
        headers: { 'content-type': 'application/json', apikey: config.publishableKey }, body: JSON.stringify(event),
      }).catch(() => {});
    } catch { /* Analytics must never interrupt browsing or navigation. */ }
  }
  function pageView() {
    if (consent !== 'accepted' || pageSent) return;
    pageSent = true;
    collect('page_view');
  }
  function displayNotice() {
    notice.hidden = false;
    dismiss.hidden = !['accepted', 'rejected'].includes(consent);
    notice.querySelector('[data-consent="accepted"]').focus({ preventScroll: true });
  }
  function setConsent(value) {
    consent = value;
    try { localStore?.setItem(ANALYTICS_CONSENT_KEY, value); } catch { /* This document keeps the choice in memory. */ }
    if (value === 'rejected') {
      identity?.clear(); identity = null;
      for (const [store, key] of [[localStore, ANALYTICS_VISITOR_KEY], [sessionStore, ANALYTICS_SESSION_KEY]]) {
        try { store?.removeItem(key); } catch { /* No persistent identifiers are required. */ }
      }
    }
    notice.hidden = true;
    pageView();
  }
  notice.querySelectorAll('[data-consent]').forEach(button => button.addEventListener('click', () => setConsent(button.dataset.consent)));
  preferences.addEventListener('click', displayNotice);
  dismiss.addEventListener('click', () => { notice.hidden = true; preferences.focus(); });
  notice.hidden = ['accepted', 'rejected'].includes(consent);

  // Other tabs withdrawing permission stop this document immediately as well.
  window.addEventListener('storage', event => {
    if (event.key !== ANALYTICS_CONSENT_KEY) return;
    consent = event.newValue;
    if (consent !== 'accepted') { identity?.clear(); identity = null; }
    notice.hidden = ['accepted', 'rejected'].includes(consent);
    pageView();
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[data-track]') : null;
    if (anchor) collect(anchor.dataset.track);
  });
  document.addEventListener('toggle', event => {
    const detail = event.target;
    if (detail instanceof HTMLDetailsElement && detail.open && detail.dataset.track === 'order_open') collect('order_open');
  }, true);
  pageView();
}

// A missing/invalid configuration leaves the whole public site unchanged.
startAnalytics();

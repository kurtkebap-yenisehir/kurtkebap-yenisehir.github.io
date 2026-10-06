import { getAnalyticsConfig } from './analytics-config.js';
import { analyticsUuid, buildAnalyticsEvent, createAnalyticsIdentity, isAnalyticsEligible } from './analytics-shared.js';

function storage(name) {
  try { return window[name]; } catch { return undefined; }
}

function startAnalytics() {
  const config = getAnalyticsConfig();
  if (!config || !isAnalyticsEligible(location, navigator)) return;
  const localStore = storage('localStorage');
  const sessionStore = storage('sessionStorage');
  let identity;

  function collect(eventName) {
    if (!isAnalyticsEligible(location, navigator)) return;
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
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[data-track]') : null;
    if (anchor) collect(anchor.dataset.track);
  });
  document.addEventListener('toggle', event => {
    const detail = event.target;
    if (detail instanceof HTMLDetailsElement && detail.open && detail.dataset.track === 'order_open') collect('order_open');
  }, true);
  // Modules run once per loaded document; BFCache restores do not add another view.
  collect('page_view');
}

// A missing/invalid configuration leaves the whole public site unchanged.
startAnalytics();

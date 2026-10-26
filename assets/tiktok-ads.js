/* TikTok Pixel for the active account configured in admin-gateway. */
(function (window, document) {
  'use strict';

  var ttq = window.ttq = window.ttq || [];
  window.TiktokAnalyticsObject = 'ttq';
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
  ttq.setAndDefer = function (target, name) {
    target[name] = function () { target.push([name].concat(Array.prototype.slice.call(arguments, 0))); };
  };
  for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
  ttq.instance = function (pixelId) {
    var target = ttq._i[pixelId] || [];
    for (var j = 0; j < ttq.methods.length; j++) ttq.setAndDefer(target, ttq.methods[j]);
    return target;
  };
  ttq.load = function (pixelId, options) {
    var sdk = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i || {};
    ttq._i[pixelId] = [];
    ttq._i[pixelId]._u = sdk;
    ttq._t = ttq._t || {};
    ttq._t[pixelId] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[pixelId] = options || {};
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = sdk + '?sdkid=' + encodeURIComponent(pixelId) + '&lib=ttq';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(script, first);
  };

  var storageKey = 'soarfly:ttclid';
  var clickId = new URLSearchParams(window.location.search).get('ttclid');
  if (clickId && clickId.length <= 500) {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ value: clickId, expires: Date.now() + 7 * 86400000 })); } catch (e) {}
    document.cookie = 'ttclid=' + encodeURIComponent(clickId) + '; Max-Age=604800; Path=/; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
  }

  function getTtclid() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (saved && saved.expires > Date.now()) return saved.value;
    } catch (e) {}
    var match = document.cookie.match(/(?:^|; )ttclid=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  var ready = fetch('/api/tiktok-pixels.php', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : { pixelIds: [] }; })
    .then(function (data) {
      var ids = Array.isArray(data.pixelIds) ? data.pixelIds.filter(function (id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id); }) : [];
      ids.forEach(function (id) { ttq.load(id); });
      if (ids.length) ttq.page();
      return ids;
    })
    .catch(function () { return []; });

  function track(eventName, properties, eventId) {
    return ready.then(function (ids) {
      if (!ids.length) return;
      var options = eventId ? { event_id: eventId } : undefined;
      ids.forEach(function (id) {
        ttq.instance(id).track(eventName, properties || {}, options);
      });
    });
  }

  window.TikTokAds = { ready: ready, track: track, getTtclid: getTtclid };

  var path = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') || '/';
  if (path === '/' || path === '/ferramenta') {
    track('ViewContent', { content_type: 'product', currency: 'BRL', value: 67.90 });
  } else if (path === '/checkout') {
    track('InitiateCheckout', { content_type: 'product', currency: 'BRL', value: 67.90 });
  }
})(window, document);

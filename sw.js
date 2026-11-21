/*
 * Builder Ascent service worker: lets the site work like an app, including with no signal.
 *
 * - Pages (HTML): network first, so people always get the latest version when online;
 *   the saved copy is used when offline, and /offline.html when a page was never saved.
 * - Files (CSS, JS, images, PDFs): served from the saved copy right away and refreshed
 *   in the background (stale-while-revalidate). Versioned files (?v=N) never go stale.
 * - Forms and tools are saved on install, so they work offline even before first visit.
 *
 * WHEN DEPLOYING: bump VERSION whenever this file's PRECACHE list changes
 * (new page, new ?v= number on a form/tool asset). Old saved copies are deleted on activate.
 * Records people fill in live in IndexedDB/localStorage and are never touched by this file.
 */
var VERSION = '2026-11-21-1';
var PRECACHE_NAME = 'ba-precache-' + VERSION;
var RUNTIME_NAME = 'ba-runtime-' + VERSION;
var FONT_NAME = 'ba-fonts';

var PRECACHE = [
    '/',
    '/index.html',
    '/assets/css/style.css?v=5',
    '/public/logos/approved/builder-ascent-favicon.png',
    '/offline.html',
    '/blueprint.html',
    '/assets/css/style.css?v=2',
    '/daily-system.html',
    '/forms/index.html',
    '/forms/',
    '/assets/css/field-tools.css?v=4',
    '/assets/css/field-forms.css?v=7',
    '/forms/safety-planning/index.html',
    '/forms/safety-planning/',
    '/assets/js/field-forms/ff-core.js?v=1',
    '/assets/js/field-forms/ff-store.js?v=1',
    '/assets/js/field-forms/ff-signature.js?v=1',
    '/assets/js/field-forms/ff-pdf.js?v=1',
    '/assets/js/field-forms/ff-share.js?v=2',
    '/assets/js/field-forms/ff-app.js?v=8',
    '/assets/js/field-forms/schemas/safety-planning.js?v=2',
    '/assets/js/field-forms/schemas/toolbox-talk.js?v=1',
    '/forms/inspections/index.html',
    '/forms/inspections/',
    '/assets/js/field-forms/schemas/inspections.js?v=2',
    '/forms/daily-report/index.html',
    '/forms/daily-report/',
    '/assets/js/field-forms/schemas/daily-report.js?v=1',
    '/forms/daily-builder/index.html',
    '/forms/daily-builder/',
    '/assets/js/field-forms/schemas/daily-builder.js?v=1',
    '/forms/incidents/index.html',
    '/forms/incidents/',
    '/assets/js/field-forms/schemas/incidents.js?v=1',
    '/forms/logs/index.html',
    '/forms/logs/',
    '/assets/js/field-forms/ff-log.js?v=2',
    '/assets/js/field-forms/schemas/punch-list.js?v=2',
    '/assets/js/field-forms/schemas/project-logs.js?v=1',
    '/tools/index.html',
    '/tools/',
    '/tools/concrete-pour-planner.html',
    '/assets/js/field-tools/field-tools-core.js?v=1',
    '/assets/js/field-tools/concrete-engine.js?v=1',
    '/assets/js/field-tools/concrete-ui.js?v=1',
    '/tools/material-takeoff.html',
    '/assets/js/field-tools/takeoff-engine.js?v=1',
    '/assets/js/field-tools/takeoff-ui.js?v=1',
    '/manifest.webmanifest',
    '/public/icons/icon-192.png',
    '/public/icons/icon-512.png',
    '/public/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(PRECACHE_NAME).then(function (cache) {
            // one failed file must not block the rest (e.g. a directory URL on a local test server)
            return Promise.all(PRECACHE.map(function (url) {
                return fetch(url, { cache: 'reload' }).then(function (res) {
                    if (res && res.ok) return cache.put(url, res);
                }).catch(function () { /* skip */ });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k !== PRECACHE_NAME && k !== RUNTIME_NAME && k !== FONT_NAME) return caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

function fromCache(request) {
    return caches.match(request).then(function (hit) {
        if (hit) return hit;
        // "/forms/" and "/forms/index.html" are the same page
        var url = new URL(request.url);
        if (url.origin === self.location.origin) {
            if (url.pathname.slice(-1) === '/') return caches.match(url.pathname + 'index.html');
            if (/\/index\.html$/.test(url.pathname)) return caches.match(url.pathname.replace(/index\.html$/, ''));
        }
        return undefined;
    });
}

function putRuntime(request, res) {
    if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(RUNTIME_NAME).then(function (c) { c.put(request, copy); });
    }
    return res;
}

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);

    // Google Fonts: keep a copy so text looks right offline
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(caches.open(FONT_NAME).then(function (cache) {
            return cache.match(req).then(function (hit) {
                var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
                return hit || net;
            });
        }));
        return;
    }
    if (url.origin !== self.location.origin) return;

    // Pages: network first, saved copy when offline or when the signal is too weak
    // to answer within 4 seconds, offline page as last resort
    if (req.mode === 'navigate') {
        event.respondWith(new Promise(function (resolve) {
            var done = false;
            function finish(r) { if (!done) { done = true; resolve(r); } }
            var timer = setTimeout(function () {
                fromCache(req).then(function (hit) { if (hit) finish(hit); });
            }, 4000);
            fetch(req).then(function (res) {
                clearTimeout(timer);
                finish(putRuntime(req, res));
            }).catch(function () {
                clearTimeout(timer);
                fromCache(req).then(function (hit) { finish(hit || caches.match('/offline.html')); });
            });
        }));
        return;
    }

    // Files: saved copy first, refresh in the background
    event.respondWith(
        fromCache(req).then(function (hit) {
            var net = fetch(req).then(function (res) { return putRuntime(req, res); });
            if (hit) { net.catch(function () {}); return hit; }
            return net;
        })
    );
});

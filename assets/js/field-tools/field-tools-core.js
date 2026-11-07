/*
 * Builder Ascent Field Tools - shared utilities (v1)
 *
 * Reusable by every Field Tool: strict number parsing, display formatting,
 * clock-time formatting and clipboard copy. No network, no storage.
 *
 * Exposed as window.BAFieldTools (and module.exports when available).
 */
(function (root) {
    'use strict';

    /* ---------- Strict number parsing ----------
     * Accepts: "12", "12.5", ".5", "12."  (dot decimal separator only)
     * Rejects: empty, negatives, letters, commas, multiple dots, Infinity/NaN.
     * Returns { ok, value, empty, error } and never NaN.
     */
    function parseNumber(raw, rules) {
        rules = rules || {};
        var s = raw === null || raw === undefined ? '' : String(raw).trim();
        if (s === '') {
            return { ok: false, empty: true, value: null, error: rules.optional ? null : 'Required' };
        }
        if (s.charAt(0) === '-') return { ok: false, value: null, error: 'Cannot be negative' };
        if (s.indexOf(',') !== -1) return { ok: false, value: null, error: 'Use a period for decimals, no commas' };
        if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { ok: false, value: null, error: 'Numbers only' };
        var v = parseFloat(s);
        if (!isFinite(v)) return { ok: false, value: null, error: 'Numbers only' };
        if (rules.integer && Math.floor(v) !== v) return { ok: false, value: null, error: 'Whole number only' };
        if (rules.positive && v <= 0) return { ok: false, value: null, error: 'Must be greater than zero' };
        if (rules.min !== undefined && v < rules.min) return { ok: false, value: null, error: 'Minimum ' + rules.min };
        if (rules.max !== undefined && v > rules.max) return { ok: false, value: null, error: 'Maximum ' + rules.max };
        if (rules.below !== undefined && v >= rules.below) return { ok: false, value: null, error: rules.belowMessage || ('Must be less than ' + rules.below) };
        return { ok: true, value: v, error: null };
    }

    /* ---------- Display formatting (display only - never feed back into math) ---------- */

    // Round half away from zero at the given places, guarding against float noise (51.2476.. -> 51.25).
    function roundForDisplay(x, places) {
        var f = Math.pow(10, places);
        var sign = x < 0 ? -1 : 1;
        return sign * Math.round(Math.abs(x) * f + 1e-7) / f;
    }

    function formatNumber(x, places) {
        if (typeof x !== 'number' || !isFinite(x)) return '—';
        var p = places === undefined ? 2 : places;
        return roundForDisplay(x, p).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p });
    }

    // Trims trailing zeros for user-echo values (e.g. 0.25, 8, 5.5)
    function formatPlain(x, maxPlaces) {
        if (typeof x !== 'number' || !isFinite(x)) return '—';
        var v = roundForDisplay(x, maxPlaces === undefined ? 4 : maxPlaces);
        return String(v);
    }

    // "HH:MM" (24h, from <input type=time>) -> minutes after midnight, or null
    function parseClock(hhmm) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
        if (!m) return null;
        var h = parseInt(m[1], 10), min = parseInt(m[2], 10);
        if (h > 23 || min > 59) return null;
        return h * 60 + min;
    }

    // minutes after midnight -> "7:05 AM" (+ " (+1 day)" past midnight)
    function formatClock(minutes) {
        if (typeof minutes !== 'number' || !isFinite(minutes)) return '—';
        var total = Math.round(minutes);
        var day = Math.floor(total / 1440);
        var m = ((total % 1440) + 1440) % 1440;
        var h24 = Math.floor(m / 60), mm = m % 60;
        var ampm = h24 >= 12 ? 'PM' : 'AM';
        var h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm + (day > 0 ? ' (+' + day + ' day' + (day > 1 ? 's' : '') + ')' : '');
    }

    // minutes -> "3 hr 20 min" / "45 min"
    function formatDuration(minutes) {
        if (typeof minutes !== 'number' || !isFinite(minutes)) return '—';
        var t = Math.round(minutes);
        var h = Math.floor(t / 60), m = t % 60;
        if (h === 0) return m + ' min';
        return h + ' hr' + (m ? ' ' + m + ' min' : '');
    }

    /* ---------- Clipboard ---------- */
    // Returns a Promise<boolean>. Uses the async Clipboard API when available,
    // otherwise a hidden-textarea fallback.
    function copyText(text) {
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch (e) {
                return false;
            }
        }
        if (root.navigator && navigator.clipboard && root.isSecureContext) {
            return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
        }
        return Promise.resolve(fallback());
    }

    var api = {
        parseNumber: parseNumber,
        roundForDisplay: roundForDisplay,
        formatNumber: formatNumber,
        formatPlain: formatPlain,
        parseClock: parseClock,
        formatClock: formatClock,
        formatDuration: formatDuration,
        copyText: copyText
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BAFieldTools = api;
})(typeof window !== 'undefined' ? window : this);

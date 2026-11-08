/*
 * Builder Ascent Field Forms - core utilities (v1)
 * Pure helpers shared by every Field Form: ids, dates, path get/set, escaping,
 * record numbers, file names. No DOM, no storage, no network.
 * Exposed as window.BAFF.core
 */
(function (root) {
    'use strict';

    function uid(prefix) {
        var a = new Uint8Array(8);
        (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
        return (prefix || 'id') + '_' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    // Local date "YYYY-MM-DD" (for <input type=date>)
    function todayISO(d) {
        d = d || new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function nowHHMM(d) { d = d || new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

    function formatDate(iso) {
        if (!iso) return '';
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
        if (!m) return String(iso);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) + ', ' + m[1];
    }
    function formatTime(hhmm) {
        var m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
        if (!m) return '';
        var h = parseInt(m[1], 10), ap = h >= 12 ? 'PM' : 'AM';
        return ((h % 12) || 12) + ':' + m[2] + ' ' + ap;
    }
    // ISO timestamp -> "Nov 7, 2026 7:14 AM"
    function formatStamp(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d)) return '';
        return formatDate(todayISO(d)) + ' ' + formatTime(nowHHMM(d));
    }

    // Record number, e.g. JHA-20261107-0714-4F2A (assigned at finalize)
    function recordNumber(prefix, d) {
        d = d || new Date();
        var rnd = uid('x').slice(2, 6).toUpperCase();
        return prefix + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '-' + rnd;
    }

    function safeFilePart(s, max) {
        return String(s || '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, max || 40) || 'Project';
    }

    // Dotted-path get/set: "steps.2.controls"
    function getPath(obj, path) {
        return String(path).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
    }
    function setPath(obj, path, value) {
        var keys = String(path).split('.'), o = obj;
        for (var i = 0; i < keys.length - 1; i++) {
            if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
            o = o[keys[i]];
        }
        o[keys[keys.length - 1]] = value;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function isBlank(v) { return v == null || String(v).trim() === ''; }

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function debounce(fn, ms) {
        var t;
        var d = function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
        d.flush = function () { clearTimeout(t); fn(); };
        return d;
    }

    // data:image/jpeg;base64,... -> Uint8Array
    function dataUrlToBytes(dataUrl) {
        var b64 = String(dataUrl).split(',')[1] || '';
        var bin = root.atob(b64), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    var api = {
        uid: uid, todayISO: todayISO, nowHHMM: nowHHMM, formatDate: formatDate, formatTime: formatTime,
        formatStamp: formatStamp, recordNumber: recordNumber, safeFilePart: safeFilePart,
        getPath: getPath, setPath: setPath, esc: esc, isBlank: isBlank, clone: clone, debounce: debounce,
        dataUrlToBytes: dataUrlToBytes
    };
    root.BAFF = root.BAFF || {};
    root.BAFF.core = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);

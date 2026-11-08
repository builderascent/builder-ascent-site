/*
 * Builder Ascent Field Forms - device storage (v1)
 * IndexedDB for records (drafts + finalized) and recent projects; localStorage for small preferences.
 * Everything stays on this device. If the browser blocks storage, the store reports it and keeps
 * working in memory so the user is never silently losing work.
 * Exposed as window.BAFF.store
 */
(function (root) {
    'use strict';

    var DB_NAME = 'builder-ascent-field-forms';
    var DB_VERSION = 1;
    var PREF_PREFIX = 'baff.';
    var dbPromise = null;
    var memory = { records: {}, projects: {} };
    var mode = 'unknown'; // 'indexeddb' | 'memory'

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve) {
            try {
                if (!root.indexedDB) { mode = 'memory'; resolve(null); return; }
                var req = root.indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function () {
                    var db = req.result;
                    if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'key' });
                };
                req.onsuccess = function () { mode = 'indexeddb'; resolve(req.result); };
                req.onerror = function () { mode = 'memory'; resolve(null); };
                req.onblocked = function () { mode = 'memory'; resolve(null); };
            } catch (e) { mode = 'memory'; resolve(null); }
        });
        return dbPromise;
    }

    function tx(storeName, kind, fn) {
        return openDb().then(function (db) {
            if (!db) return fn(null);
            return new Promise(function (resolve, reject) {
                try {
                    var t = db.transaction(storeName, kind);
                    var st = t.objectStore(storeName);
                    var result;
                    var r = fn(st);
                    if (r && 'onsuccess' in r) r.onsuccess = function () { result = r.result; };
                    t.oncomplete = function () { resolve(result); };
                    t.onerror = function () { reject(t.error || new Error('Storage error')); };
                    t.onabort = function () { reject(t.error || new Error('Storage aborted')); };
                } catch (e) { reject(e); }
            });
        });
    }

    function put(storeName, obj) {
        return tx(storeName, 'readwrite', function (st) {
            if (!st) { memory[storeName][obj.id || obj.key] = JSON.parse(JSON.stringify(obj)); return null; }
            return st.put(obj);
        });
    }
    function get(storeName, key) {
        return tx(storeName, 'readonly', function (st) {
            if (!st) return { onsuccess: null, result: memory[storeName][key] };
            return st.get(key);
        }).then(function (r) { return r === undefined && mode === 'memory' ? memory[storeName][key] : r; });
    }
    function all(storeName) {
        return tx(storeName, 'readonly', function (st) {
            if (!st) return null;
            return st.getAll();
        }).then(function (r) {
            if (mode === 'memory') return Object.keys(memory[storeName]).map(function (k) { return memory[storeName][k]; });
            return r || [];
        });
    }
    function del(storeName, key) {
        return tx(storeName, 'readwrite', function (st) {
            if (!st) { delete memory[storeName][key]; return null; }
            return st.delete(key);
        });
    }

    function pref(name, value) {
        try {
            if (arguments.length > 1) { root.localStorage.setItem(PREF_PREFIX + name, JSON.stringify(value)); return value; }
            var v = root.localStorage.getItem(PREF_PREFIX + name);
            return v == null ? null : JSON.parse(v);
        } catch (e) { return null; }
    }

    // Remove every Field Forms record, project and preference from this device.
    function clearAll() {
        memory = { records: {}, projects: {} };
        try {
            Object.keys(root.localStorage).forEach(function (k) { if (k.indexOf(PREF_PREFIX) === 0) root.localStorage.removeItem(k); });
        } catch (e) { /* ignore */ }
        return openDb().then(function (db) {
            if (!db) return true;
            return Promise.all([
                tx('records', 'readwrite', function (st) { return st.clear(); }),
                tx('projects', 'readwrite', function (st) { return st.clear(); })
            ]).then(function () { return true; });
        });
    }

    root.BAFF = root.BAFF || {};
    root.BAFF.store = {
        ready: function () { return openDb().then(function () { return mode; }); },
        mode: function () { return mode; },
        saveRecord: function (r) { return put('records', r); },
        getRecord: function (id) { return get('records', id); },
        listRecords: function () { return all('records'); },
        deleteRecord: function (id) { return del('records', id); },
        saveProject: function (p) { return put('projects', p); },
        listProjects: function () { return all('projects'); },
        deleteProject: function (key) { return del('projects', key); },
        pref: pref,
        clearAll: clearAll
    };
})(typeof window !== 'undefined' ? window : this);

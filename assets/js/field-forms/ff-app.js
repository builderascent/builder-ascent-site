/*
 * Builder Ascent Field Forms - app engine (v1)
 * Shared by every Field Form. A form is a "schema" (sections + render/validate/review/pdf functions);
 * this engine supplies: routing, step-by-step screens with a section map, field components,
 * validation display, autosave + draft recovery, crew sign-on and sign-off (typed name +
 * acknowledgement + optional drawn signature), review, finalize/lock, revision, PDF/print/share.
 * Everything runs and stays in this browser. Nothing is uploaded.
 * Exposed as window.BAFF.app
 */
(function (root) {
    'use strict';

    var BAFF = root.BAFF, C = BAFF.core, S = BAFF.store, esc = C.esc;
    var OLD_DRAFT_DAYS = 30;
    var forms = {}, order = [];
    var screen, banner, dlg, cdlg;
    var rec = null, dirty = false, projects = [], sigPad = null, lastFocus = null, sigMode = null;

    function schemaOf(r) { return forms[r.type]; }
    function nowISO() { return new Date().toISOString(); }
    function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
    function fid(path) { return 'f-' + String(path).replace(/[^A-Za-z0-9]+/g, '-'); }
    function val(path) { var v = C.getPath(rec.data, path); return v == null ? '' : v; }
    function reqTag(o) { return o && o.required ? ' <span class="ff-req">Required</span>' : ''; }
    function errP(id) { return '<p class="ff-err" id="' + id + '-err"></p>'; }
    function trim(s) { return String(s == null ? '' : s).trim(); }

    // =====================================================================
    // Field components (return HTML; bound through data-bind / data-kind)
    // =====================================================================
    var ui = {
        text: function (path, label, o) {
            o = o || {};
            var id = o.id || fid(path), v = val(path);
            var describe = ' aria-describedby="' + id + '-err' + (o.hint ? ' ' + id + '-hint' : '') + '"';
            var common = 'id="' + id + '" data-bind="' + esc(path) + '" data-kind="text"' + describe +
                (o.required ? ' aria-required="true"' : '') + (o.list ? ' list="' + o.list + '"' : '') +
                ' autocomplete="' + (o.autocomplete || 'off') + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
                (o.maxlength ? ' maxlength="' + o.maxlength + '"' : '');
            var input = o.multiline
                ? '<textarea class="ff-input ff-textarea" rows="' + (o.rows || 3) + '" data-autogrow="1" ' + common + '>' + esc(v) + '</textarea>'
                : '<input class="ff-input" type="' + (o.type || 'text') + '"' + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') + ' ' + common + ' value="' + esc(v) + '">';
            if (o.now) input = '<div class="ff-inline">' + input + '<button type="button" class="ff-btn-sm" data-action="now" data-path="' + esc(path) + '" aria-label="Set ' + esc(label.toLowerCase()) + ' to now">Now</button></div>';
            return '<div class="ff-field"><label class="ff-label" for="' + id + '">' + esc(label) + reqTag(o) + '</label>' +
                (o.hint ? '<p class="ff-hint" id="' + id + '-hint">' + esc(o.hint) + '</p>' : '') + input + errP(id) + '</div>';
        },

        // Multi-select chips (+ optional groups, custom items, one exclusive "none" choice)
        choices: function (path, label, o) {
            o = o || {};
            var id = o.id || fid(path), arr = C.getPath(rec.data, path) || [], n = 0, known = [], body = '';
            function chip(v, cls) {
                var cid = id + '-' + (n++), on = arr.indexOf(v) >= 0;
                return '<label class="ff-chip' + (cls || '') + '" for="' + cid + '"><input type="checkbox" id="' + cid + '" data-bind="' + esc(path) +
                    '" data-kind="checkarr" value="' + esc(v) + '"' + (on ? ' checked' : '') + (v === o.exclusive ? ' data-exclusive="1"' : '') +
                    '><span>' + esc(v) + '</span></label>';
            }
            if (o.groups) {
                o.groups.forEach(function (g, gi) {
                    known = known.concat(g.items);
                    var count = g.items.filter(function (v) { return arr.indexOf(v) >= 0; }).length;
                    body += '<details class="ff-group" id="' + id + '-g' + gi + '"' + (count ? ' open' : '') + '><summary>' + esc(g.name) +
                        (count ? ' <span class="ff-count">' + count + ' selected</span>' : '') + '</summary><div class="ff-chips">' +
                        g.items.map(function (v) { return chip(v); }).join('') + '</div></details>';
                });
            } else {
                known = o.options.slice();
                body = '<div class="ff-chips">' + o.options.map(function (v) { return chip(v); }).join('') + '</div>';
            }
            var custom = arr.filter(function (v) { return known.indexOf(v) < 0 && v !== o.exclusive; });
            if (custom.length) body += '<div class="ff-custom-chips"><p class="ff-sublabel">Added by you</p><div class="ff-chips">' + custom.map(function (v) { return chip(v); }).join('') + '</div></div>';
            if (o.custom !== false) {
                body += '<div class="ff-add-own"><label class="ff-sublabel" for="' + id + '-own">' + esc(o.customLabel || 'Add your own') + '</label>' +
                    '<div class="ff-inline"><input class="ff-input ff-input--sm" type="text" id="' + id + '-own" data-enter="' + id + '-own-btn" autocomplete="off" maxlength="120">' +
                    '<button type="button" class="ff-btn-sm" id="' + id + '-own-btn" data-action="add-custom" data-path="' + esc(path) + '" data-src="' + id + '-own"' +
                    (o.exclusive ? ' data-exclusive-value="' + esc(o.exclusive) + '"' : '') + '>Add</button></div></div>';
            }
            if (o.exclusive) body += '<div class="ff-exclusive">' + chip(o.exclusive, ' ff-chip--none') + (o.exclusiveHint ? '<p class="ff-hint">' + esc(o.exclusiveHint) + '</p>' : '') + '</div>';
            var selected = arr.length ? '<p class="ff-selected"><span>Selected:</span> ' + esc(arr.join(', ')) + '</p>' : '';
            return '<fieldset class="ff-field ff-fieldset" id="' + id + '" tabindex="-1" aria-describedby="' + id + '-err"><legend class="ff-label">' + esc(label) + reqTag(o) + '</legend>' +
                (o.hint ? '<p class="ff-hint">' + esc(o.hint) + '</p>' : '') + selected + body + errP(id) + '</fieldset>';
        },

        // Single choice, no default; can be cleared
        segment: function (path, label, options, o) {
            o = o || {};
            var id = o.id || fid(path), v = val(path);
            var h = '<fieldset class="ff-field ff-fieldset" id="' + id + '" tabindex="-1" aria-describedby="' + id + '-err"><legend class="ff-label">' + esc(label) + reqTag(o) + '</legend>' +
                (o.hint ? '<p class="ff-hint">' + esc(o.hint) + '</p>' : '') + '<div class="ff-seg">';
            options.forEach(function (op, i) {
                h += '<label class="ff-seg-opt" for="' + id + '-' + i + '"><input type="radio" id="' + id + '-' + i + '" name="' + id + '" data-bind="' + esc(path) +
                    '" data-kind="radio" value="' + esc(op[0]) + '"' + (v === op[0] ? ' checked' : '') + '><span>' + esc(op[1]) + '</span></label>';
            });
            h += '</div>';
            if (v && !o.noClear) h += '<button type="button" class="ff-link ff-link--small" data-action="clear-value" data-path="' + esc(path) + '">Clear ' + esc(label.toLowerCase()) + '</button>';
            return h + errP(id) + '</fieldset>';
        },

        // List of short editable text items (controls, conditions...)
        items: function (path, label, o) {
            o = o || {};
            var id = o.id || fid(path), arr = C.getPath(rec.data, path) || [], il = o.itemLabel || 'Item';
            var h = '<fieldset class="ff-field ff-fieldset" id="' + id + '" tabindex="-1" aria-describedby="' + id + '-err"><legend class="ff-label">' + esc(label) + reqTag(o) + '</legend>' +
                (o.hint ? '<p class="ff-hint">' + esc(o.hint) + '</p>' : '');
            if (arr.length) {
                h += '<ol class="ff-items">' + arr.map(function (t, i) {
                    var iid = id + '-' + i;
                    return '<li class="ff-item"><label class="ff-sr-only" for="' + iid + '">' + esc(il) + ' ' + (i + 1) + '</label>' +
                        '<textarea rows="1" class="ff-input ff-input--item" id="' + iid + '" data-bind="' + esc(path) + '.' + i + '" data-kind="text" data-autogrow="1">' + esc(t) + '</textarea>' +
                        '<button type="button" class="ff-x" data-action="remove-item" data-path="' + esc(path) + '" data-index="' + i + '" aria-label="Remove ' + esc(il.toLowerCase()) + ' ' + (i + 1) + '">&times;</button></li>';
                }).join('') + '</ol>';
            }
            h += '<button type="button" class="ff-btn-sm" data-action="add-item" data-path="' + esc(path) + '" data-focus="' + id + '-' + arr.length + '">+ ' + esc(o.addLabel || 'Add') + '</button>';
            var sugg = (o.suggestions || []).filter(function (s) { return arr.indexOf(s) < 0; });
            if (sugg.length) {
                h += '<div class="ff-suggest"><p class="ff-sublabel">' + esc(o.suggestLabel || 'Suggestions') + ' <span class="ff-hint-inline">&mdash; tap to add, then edit. Not a complete list; verify against your site safety plan.</span></p><div class="ff-chips">' +
                    sugg.map(function (s) { return '<button type="button" class="ff-chip ff-chip--add" data-action="add-text" data-path="' + esc(path) + '" data-text="' + esc(s) + '"><span>+ ' + esc(s) + '</span></button>'; }).join('') + '</div></div>';
            }
            return h + errP(id) + '</fieldset>';
        },

        check: function (path, label, o) {
            o = o || {};
            var id = o.id || fid(path);
            return '<div class="ff-field"><label class="ff-check" for="' + id + '"><input type="checkbox" id="' + id + '" data-bind="' + esc(path) + '" data-kind="bool"' + (val(path) ? ' checked' : '') + '><span>' + esc(label) + '</span></label>' + errP(id) + '</div>';
        },

        note: function (html, cls) { return '<div class="ff-note' + (cls ? ' ' + cls : '') + '">' + html + '</div>'; },

        /*
         * Inspection checklist. items: [{k, label, desc}]; o.options: [[value, label] x3], o.bad: the failing value,
         * o.badLabel / o.badNoteLabel, o.extraPath (user-added items). No status is ever pre-selected.
         */
        checklist: function (path, items, o) {
            var checks = C.getPath(rec.data, path) || {}, extra = o.extraPath ? (C.getPath(rec.data, o.extraPath) || []) : [];
            var cnt = checklistCounts(rec, path, items, o);
            o = Object.assign({}, o, { _focus: fid(path) });
            var h = '<div class="ff-ck" id="' + fid(path) + '" tabindex="-1"><p class="ff-ck-progress"><strong>' + cnt.done + ' of ' + cnt.total + '</strong> checked' +
                (cnt.bad ? ' &middot; <span class="ff-ck-badcount">' + cnt.bad + ' ' + esc(o.badLabel) + '</span>' : '') + '</p>';
            items.forEach(function (it) { h += ckItem(path + '.' + it.k, it.label, it.desc, checks[it.k] || {}, o, null); });
            extra.forEach(function (x, i) { h += ckItem(o.extraPath + '.' + i, null, null, x, o, i); });
            if (o.extraPath) h += '<button type="button" class="ff-btn-sm" data-action="ck-add" data-path="' + esc(o.extraPath) + '">+ ' + esc(o.extraLabel || 'Add an item') + '</button>';
            return h + '</div>';
        },

        projectPicker: function () {
            if (!projects.length) return '';
            return '<div class="ff-field ff-picker"><label class="ff-label" for="ff-project-pick">Use a saved project <span class="ff-opt">(this device)</span></label>' +
                '<select class="ff-input" id="ff-project-pick"><option value="">Choose a project&hellip;</option>' +
                projects.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + (p.number ? ' (' + esc(p.number) + ')' : '') + '</option>'; }).join('') +
                '</select><p class="ff-hint">Fills the project details below. Everything stays editable.</p></div>';
        },

        crewDatalist: function () {
            var names = (rec.data.crew || []).map(function (c) { return trim(c.name); }).filter(Boolean);
            var lead = [C.getPath(rec.data, 'people.preparedBy'), C.getPath(rec.data, 'people.foreman'), C.getPath(rec.data, 'project.foreman')].map(trim).filter(Boolean);
            names = lead.concat(names).filter(function (v, i, a) { return a.indexOf(v) === i; });
            return '<datalist id="ff-crew-names">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
        },

        // Crew list with acknowledgement / signature status
        crew: function (o) {
            o = o || {};
            var crew = rec.data.crew || [], acked = crew.filter(function (c) { return c.ack; }).length;
            var h = '<div class="ff-crew" id="ff-crew" tabindex="-1">';
            h += '<p class="ff-hint">' + esc(o.intro || 'Each person reads the plan, types their name, confirms the acknowledgement and signs on this device.') + '</p>';
            h += '<div class="ff-crew-top"><button type="button" class="ff-btn ff-btn--primary" data-action="crew-pass">Start crew sign-on (pass the device)</button>' +
                '<p class="ff-crew-count" aria-live="polite"><strong>' + acked + '</strong> acknowledged</p></div>';
            if (crew.length) {
                h += '<ul class="ff-crew-list">' + crew.map(function (c, i) {
                    var base = 'crew.' + i, nid = fid(base + '.name');
                    if (c.ack) {
                        return '<li class="ff-crew-row is-acked"><div class="ff-crew-main"><p class="ff-crew-name">' + esc(c.name) + '</p>' + (c.role ? '<p class="ff-crew-role">' + esc(c.role) + '</p>' : '') +
                            '<p class="ff-crew-status">' + statusText(c) + '</p></div>' +
                            (c.sig ? '<img class="ff-sig-thumb" src="' + c.sig.dataUrl + '" alt="Signature of ' + esc(c.name) + '">' : '') +
                            '<div class="ff-crew-actions"><button type="button" class="ff-btn-sm" data-action="crew-redo" data-index="' + i + '">Redo<span class="ff-sr-only"> acknowledgement for ' + esc(c.name) + '</span></button>' +
                            '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="crew-remove" data-index="' + i + '">Remove<span class="ff-sr-only"> ' + esc(c.name) + '</span></button></div></li>';
                    }
                    return '<li class="ff-crew-row"><div class="ff-crew-fields">' +
                        '<div class="ff-field"><label class="ff-label ff-label--small" for="' + nid + '">Name</label><input class="ff-input ff-input--sm" id="' + nid + '" data-bind="' + base + '.name" data-kind="text" value="' + esc(c.name || '') + '" autocomplete="off"></div>' +
                        '<div class="ff-field"><label class="ff-label ff-label--small" for="' + fid(base + '.role') + '">Trade / position</label><input class="ff-input ff-input--sm" id="' + fid(base + '.role') + '" data-bind="' + base + '.role" data-kind="text" value="' + esc(c.role || '') + '" autocomplete="off"></div>' +
                        '</div><p class="ff-crew-status">Not yet acknowledged</p><div class="ff-crew-actions"><button type="button" class="ff-btn-sm ff-btn-sm--primary" data-action="crew-sign" data-index="' + i + '">Sign on<span class="ff-sr-only"> crew member ' + (i + 1) + '</span></button>' +
                        '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="crew-remove" data-index="' + i + '">Remove<span class="ff-sr-only"> crew member ' + (i + 1) + '</span></button></div></li>';
                }).join('') + '</ul>';
            } else {
                h += '<p class="ff-none">No crew listed yet.</p>';
            }
            h += '<div class="ff-row-btns"><button type="button" class="ff-btn-sm" data-action="crew-add">+ Add crew member</button>' +
                '<button type="button" class="ff-btn-sm" data-action="crew-copy">Copy names from my last record</button></div>' +
                '<p class="ff-hint">Copying brings over names and trades only. Every person acknowledges and signs again for this record.</p>' +
                '<p class="ff-save" id="ff-crew-msg" role="status" aria-live="polite"></p></div>';
            return h;
        },

        // Prepared-by / reviewed-by / foreman sign-off block
        signoff: function (role, label, namePath, nameWhere) {
            var name = trim(val(namePath)), so = C.getPath(rec.data, 'signoff.' + role), valid = signoffValid(role, namePath);
            var h = '<div class="ff-signoff" id="ff-so-' + role + '" tabindex="-1"><h3 class="ff-signoff-title">' + esc(label) + '</h3>';
            h += '<p class="ff-signoff-name"><span>Name</span> ' + (name ? '<strong>' + esc(name) + '</strong>' : '<em>Not entered &mdash; add it in ' + esc(nameWhere) + '.</em>') + '</p>';
            if (valid) {
                h += '<p class="ff-crew-status">' + statusText(so) + '</p>' + (so.sig ? '<img class="ff-sig-thumb" src="' + so.sig.dataUrl + '" alt="Signature of ' + esc(so.name) + '">' : '') +
                    '<button type="button" class="ff-btn-sm" data-action="so-redo" data-role="' + role + '">Redo<span class="ff-sr-only"> ' + esc(label) + ' sign-off</span></button>';
            } else {
                if (so && so.ack && so.name !== name) h += '<p class="ff-warn-text">A sign-off was captured for &ldquo;' + esc(so.name) + '&rdquo;, but the name has changed. Sign again.</p>';
                h += '<p class="ff-crew-status">Not signed</p><button type="button" class="ff-btn-sm ff-btn-sm--primary" data-action="so-sign" data-role="' + role + '"' + (name ? '' : ' disabled') + '>Sign<span class="ff-sr-only"> as ' + esc(label) + '</span></button>';
            }
            return h + '</div>';
        }
    };

    // ---- checklist helpers (shared by every inspection form) ----
    function ckItem(base, label, desc, v, o, extraIdx) {
        var id = fid(base), isBad = v.s === o.bad;
        var showNote = isBad || !C.isBlank(v.note) || (rec.ui.notes && rec.ui.notes[base]);
        var h = '<fieldset class="ff-ck-item' + (isBad ? ' is-bad' : (v.s ? ' is-set' : '')) + '" id="' + id + '" tabindex="-1" aria-describedby="' + id + '-err">';
        if (extraIdx == null) {
            h += '<legend class="ff-ck-label">' + esc(label) + '</legend>' + (desc ? '<p class="ff-ck-desc">' + esc(desc) + '</p>' : '');
        } else {
            h += '<legend class="ff-sr-only">Added item ' + (extraIdx + 1) + (v.label ? ': ' + esc(v.label) : '') + '</legend>' +
                '<div class="ff-field ff-ck-own"><label class="ff-label ff-label--small" for="' + id + '-label">' + esc(o.extraItemLabel || 'Item') + ' <span class="ff-req">Required</span></label>' +
                '<div class="ff-inline"><input class="ff-input ff-input--sm" id="' + id + '-label" data-bind="' + esc(base) + '.label" data-kind="text" value="' + esc(v.label || '') + '" autocomplete="off" maxlength="120">' +
                '<button type="button" class="ff-x" data-action="ck-remove" data-path="' + esc(o.extraPath) + '" data-index="' + extraIdx + '" data-focus="' + o._focus + '" aria-label="Remove added item ' + (extraIdx + 1) + '">&times;</button></div></div>';
        }
        h += '<div class="ff-seg ff-seg--ck">' + o.options.map(function (op, i) {
            return '<label class="ff-seg-opt' + (op[0] === o.bad ? ' ff-seg-opt--bad' : '') + '" for="' + id + '-' + i + '"><input type="radio" id="' + id + '-' + i + '" name="' + id + '" data-bind="' + esc(base) + '.s" data-kind="radio" value="' + esc(op[0]) + '"' +
                (v.s === op[0] ? ' checked' : '') + '><span>' + esc(op[1]) + '</span></label>';
        }).join('') + '</div>';
        if (showNote) {
            h += '<div class="ff-field ff-ck-note"><label class="ff-label ff-label--small" for="' + id + '-note">' + esc(isBad ? o.badNoteLabel : 'Comment') + (isBad ? ' <span class="ff-req">Required</span>' : '') + '</label>' +
                '<textarea class="ff-input ff-input--item" rows="1" data-autogrow="1" id="' + id + '-note" data-bind="' + esc(base) + '.note" data-kind="text">' + esc(v.note || '') + '</textarea></div>';
        } else {
            h += '<button type="button" class="ff-link ff-link--small" data-action="ck-note" data-path="' + esc(base) + '">Add a comment<span class="ff-sr-only"> for ' + esc(label || v.label || 'this item') + '</span></button>';
        }
        return h + errP(id) + '</fieldset>';
    }
    function checklistRows(r, path, items, o) {
        var checks = C.getPath(r.data, path) || {}, rows = [];
        items.forEach(function (it) { var v = checks[it.k] || {}; rows.push({ base: path + '.' + it.k, label: it.label, s: v.s || '', note: v.note || '', extra: false }); });
        if (o.extraPath) (C.getPath(r.data, o.extraPath) || []).forEach(function (x, i) { rows.push({ base: o.extraPath + '.' + i, label: x.label || '', s: x.s || '', note: x.note || '', extra: true, n: i + 1 }); });
        return rows;
    }
    function checklistCounts(r, path, items, o) {
        var c = { total: 0, done: 0, bad: 0, by: {}, badLabels: [] };
        checklistRows(r, path, items, o).forEach(function (row) {
            c.total++;
            if (row.s) { c.done++; c.by[row.s] = (c.by[row.s] || 0) + 1; }
            if (row.s === o.bad) { c.bad++; c.badLabels.push(trim(row.label) || 'Added item'); }
        });
        return c;
    }
    function checklistIssues(r, path, items, o, sec) {
        var out = [];
        checklistRows(r, path, items, o).forEach(function (row) {
            var id = fid(row.base), name = row.extra ? (trim(row.label) || 'Added item ' + row.n) : row.label;
            if (row.extra && !trim(row.label)) out.push({ sec: sec, id: id, msg: 'Added item ' + row.n + ': name the item' });
            if (!row.s) out.push({ sec: sec, id: id, msg: name + ': not checked' });
            else if (row.s === o.bad && C.isBlank(row.note)) out.push({ sec: sec, id: id, msg: name + ': add a note on the problem and the action' });
        });
        return out;
    }
    function checklistSummary(r, path, items, o) {
        var c = checklistCounts(r, path, items, o);
        return c.done + ' of ' + c.total + ' checked: ' + o.options.map(function (op) { return (c.by[op[0]] || 0) + ' ' + op[1]; }).join(', ');
    }
    function optLabel(o, v) { for (var i = 0; i < o.options.length; i++) if (o.options[i][0] === v) return o.options[i][1]; return ''; }

    function statusText(e) {
        var t = 'Acknowledged ' + esc(C.formatStamp(e.at));
        if (e.sig) return t + ' &middot; Signed on this device';
        return t + ' &middot; Typed name only (no drawn signature)';
    }
    function signoffValid(role, namePath) {
        var so = C.getPath(rec.data, 'signoff.' + role);
        return !!(so && so.ack && so.name === trim(C.getPath(rec.data, namePath)));
    }

    // =====================================================================
    // Review (read-only HTML) helpers
    // =====================================================================
    var rv = {
        fields: function (pairs) {
            var rows = pairs.filter(function (p) { return !C.isBlank(p[1]) || p[2]; }).map(function (p) {
                return '<div class="ff-dl-row"><dt>' + esc(p[0]) + '</dt><dd>' + (C.isBlank(p[1]) ? '<span class="ff-missing">Missing</span>' : esc(p[1]).replace(/\n/g, '<br>')) + '</dd></div>';
            });
            return rows.length ? '<dl class="ff-dl">' + rows.join('') + '</dl>' : '<p class="ff-none">Nothing entered.</p>';
        },
        list: function (arr, emptyText) {
            arr = (arr || []).filter(function (x) { return !C.isBlank(x); });
            return arr.length ? '<ul class="ff-rv-list">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : (emptyText ? '<p class="ff-none">' + esc(emptyText) + '</p>' : '');
        },
        text: function (t, label) {
            if (C.isBlank(t)) return '';
            return (label ? '<p class="ff-rv-label">' + esc(label) + '</p>' : '') + '<p class="ff-rv-text">' + esc(t).replace(/\n/g, '<br>') + '</p>';
        },
        label: function (t) { return '<p class="ff-rv-label">' + esc(t) + '</p>'; },
        missing: function (msg) { return '<p class="ff-missing">' + esc(msg) + '</p>'; },
        checklist: function (r, path, items, o) {
            return '<p class="ff-rv-text"><strong>' + esc(checklistSummary(r, path, items, o)) + '</strong></p>' +
                '<div class="ff-table-wrap"><table class="ff-table ff-table--ck"><thead><tr><th scope="col">Item</th><th scope="col">Result</th><th scope="col">Comment / action</th></tr></thead><tbody>' +
                checklistRows(r, path, items, o).map(function (row) {
                    var res = row.s ? esc(optLabel(o, row.s)) : '<span class="ff-missing">Not checked</span>';
                    if (row.s === o.bad) res = '<strong class="ff-ck-badtext">' + res + '</strong>';
                    return '<tr><th scope="row" data-label="Item">' + (trim(row.label) ? esc(row.label) : '<span class="ff-missing">Unnamed item</span>') + '</th><td data-label="Result">' + res + '</td><td data-label="Comment">' +
                        (C.isBlank(row.note) ? (row.s === o.bad ? '<span class="ff-missing">Missing</span>' : '') : esc(row.note)) + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        },
        crew: function (r, statement) {
            var rows = (r.data.crew || []).filter(function (c) { return trim(c.name); });
            if (!rows.length) return '<p class="ff-none">No crew listed.</p>';
            return '<p class="ff-rv-note">Acknowledgement: &ldquo;' + esc(statement) + '&rdquo;</p><div class="ff-table-wrap"><table class="ff-table"><thead><tr><th scope="col">Name</th><th scope="col">Trade / position</th><th scope="col">Acknowledged</th><th scope="col">Signature</th></tr></thead><tbody>' +
                rows.map(function (c) {
                    return '<tr><th scope="row" data-label="Name">' + esc(c.name) + '</th><td data-label="Trade / position">' + esc(c.role || '') + '</td><td data-label="Acknowledged">' +
                        (c.ack ? esc(C.formatStamp(c.at)) : '<span class="ff-missing">Not acknowledged</span>') + '</td><td data-label="Signature">' +
                        (c.sig ? '<img class="ff-sig-print" src="' + c.sig.dataUrl + '" alt="Signature of ' + esc(c.name) + '">' : (c.ack ? 'Typed name only' : '')) + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        },
        signoffs: function (r, roles) {
            var saved = rec; rec = r;
            var out = roles.map(function (ro) {
                var name = trim(C.getPath(r.data, ro.namePath)), so = C.getPath(r.data, 'signoff.' + ro.role), ok = signoffValid(ro.role, ro.namePath);
                if (!name && !ro.required) return '';
                return '<div class="ff-rv-sign"><p class="ff-rv-label">' + esc(ro.label) + '</p><p class="ff-rv-text"><strong>' + (name ? esc(name) : '<span class="ff-missing">Missing</span>') + '</strong>' +
                    (ok ? ' &middot; ' + statusText(so) : ' &middot; Not signed') + '</p>' + (ok && so.sig ? '<img class="ff-sig-print" src="' + so.sig.dataUrl + '" alt="Signature of ' + esc(name) + '">' : '') + '</div>';
            }).join('');
            rec = saved;
            return out || '<p class="ff-none">Nothing entered.</p>';
        }
    };

    // =====================================================================
    // PDF helpers shared by schemas
    // =====================================================================
    var pdfParts = {
        checklist: function (doc, r, path, items, o) {
            doc.paragraph(checklistSummary(r, path, items, o), { font: 'B', size: 9.5 });
            doc.table([{ title: 'Item', w: 0.34 }, { title: 'Result', w: 0.17 }, { title: 'Comment / action', w: 0.49 }],
                checklistRows(r, path, items, o).map(function (row) {
                    var bad = row.s === o.bad, res = row.s ? optLabel(o, row.s) : 'Not checked';
                    return [{ parts: [{ t: trim(row.label) || 'Unnamed item', b: true }] }, { parts: [{ t: bad ? res.toUpperCase() : res, b: bad }] }, row.note || ''];
                }));
        },
        sigCell: function (doc, sig, cache) {
            if (!sig || !sig.dataUrl) return null;
            var img = cache[sig.dataUrl] || (cache[sig.dataUrl] = doc.addImage(C.dataUrlToBytes(sig.dataUrl)));
            return img ? { img: img, h: 34 } : null;
        },
        crew: function (doc, r, statement, cache) {
            var rows = (r.data.crew || []).filter(function (c) { return trim(c.name); });
            if (!rows.length) { doc.paragraph('No crew listed.', { font: 'I' }); return; }
            doc.paragraph('Each person marked "Acknowledged" confirmed: "' + statement + '"', { size: 8.8, font: 'I' });
            doc.table([{ title: 'Name', w: 0.26 }, { title: 'Trade / position', w: 0.2 }, { title: 'Acknowledged', w: 0.2 }, { title: 'Signature', w: 0.34 }],
                rows.map(function (c) {
                    var sc = c.ack ? pdfParts.sigCell(doc, c.sig, cache) : null;
                    return [{ parts: [{ t: c.name, b: true }] }, c.role || '', c.ack ? C.formatStamp(c.at) : 'Not acknowledged',
                        sc ? { image: sc, parts: [] } : (c.ack ? { parts: [{ t: 'Typed name only - no drawn signature', i: true }] } : '')];
                }));
        },
        signoffs: function (doc, r, roles, cache) {
            var saved = rec; rec = r;
            var rows = [];
            roles.forEach(function (ro) {
                var name = trim(C.getPath(r.data, ro.namePath)), so = C.getPath(r.data, 'signoff.' + ro.role), ok = signoffValid(ro.role, ro.namePath);
                if (!name) return;
                var sc = ok ? pdfParts.sigCell(doc, so.sig, cache) : null;
                rows.push([{ parts: [{ t: ro.label, b: true }] }, name, ok ? C.formatStamp(so.at) : 'Not signed',
                    sc ? { image: sc, parts: [] } : (ok ? { parts: [{ t: 'Typed name only - no drawn signature', i: true }] } : '')]);
            });
            rec = saved;
            if (!rows.length) return;
            doc.table([{ title: 'Role', w: 0.2 }, { title: 'Name', w: 0.26 }, { title: 'Date / time', w: 0.2 }, { title: 'Signature', w: 0.34 }], rows);
        }
    };

    // =====================================================================
    // Saving
    // =====================================================================
    function setStatus(state) {
        var el = document.getElementById('ff-save');
        if (!el) return;
        el.classList.remove('is-error');
        if (S.mode() === 'memory') { el.textContent = 'Not saved on this device (private window or storage blocked)'; el.classList.add('is-error'); return; }
        if (state === 'pending') el.textContent = 'Saving…';
        else if (state === 'error') { el.textContent = 'Not saved — this browser refused to save. Download a PDF before leaving.'; el.classList.add('is-error'); }
        else el.textContent = 'Saved on this device · ' + C.formatTime(C.nowHHMM());
    }
    function saveNow() {
        if (!rec || !dirty) return Promise.resolve();
        dirty = false;
        rec.updatedAt = nowISO();
        var snapshot = C.clone(rec);
        return S.saveRecord(snapshot).then(function () { setStatus('saved'); rememberProject(snapshot); }, function () { dirty = true; setStatus('error'); });
    }
    var saveSoon = C.debounce(saveNow, 700);
    function flush() { if (dirty) { saveSoon.flush(); } }

    function rememberProject(r) {
        var p = r.data.project || {};
        if (C.isBlank(p.name)) return;
        var e = r.data.emergency || {};
        var prof = { key: trim(p.name).toLowerCase(), name: trim(p.name), number: p.number || '', company: p.company || '', trade: p.trade || '', location: p.location || '',
            emergencyContact: e.contact || '', emergencyPhone: e.phone || '', hospital: e.hospital || '', updatedAt: nowISO() };
        S.saveProject(prof).then(loadProjects, function () { /* ignore */ });
    }
    function loadProjects() {
        return S.listProjects().then(function (list) {
            list.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
            list.slice(10).forEach(function (p) { S.deleteProject(p.key); });
            projects = list.slice(0, 10);
        }, function () { projects = []; });
    }

    function markChanged(rerender) {
        if (!rec || rec.status === 'final') return;
        dirty = true;
        setStatus('pending');
        saveSoon();
        if (rerender) rerenderSection(); else { applyErrors(); updateMap(); }
    }

    // =====================================================================
    // Edit screen
    // =====================================================================
    function currentSection() {
        var s = schemaOf(rec);
        for (var i = 0; i < s.sections.length; i++) if (s.sections[i].id === rec.section) return { sec: s.sections[i], idx: i };
        return { sec: s.sections[0], idx: 0 };
    }

    function issues(r) { return schemaOf(r).validate(r, { fid: fid, signoffValid: function (role, path) { var sv = rec; rec = r; var v = signoffValid(role, path); rec = sv; return v; } }); }

    function sectionState(sec, all) {
        var errs = all.filter(function (i) { return i.sec === sec.id && i.level !== 'warn'; }).length;
        var shown = rec.ui.showErr[sec.id] || rec.ui.reviewed;
        if (errs && shown) return 'attention';
        if (!errs && rec.ui.visited[sec.id]) return 'done';
        return 'todo';
    }

    function mapHtml(curIdx) {
        var s = schemaOf(rec), all = issues(rec);
        return s.sections.map(function (sec, i) {
            var st = sectionState(sec, all);
            var mark = st === 'done' ? '&#10003;' : st === 'attention' ? '!' : '';
            var sr = st === 'done' ? ' (complete)' : st === 'attention' ? ' (needs attention)' : '';
            return '<li><a class="ff-map-link is-' + st + (i === curIdx ? ' is-current' : '') + '" href="#/edit/' + rec.id + '/' + sec.id + '"' + (i === curIdx ? ' aria-current="step"' : '') +
                '><span class="ff-map-num" aria-hidden="true">' + (i + 1) + '</span><span class="ff-map-t">' + esc(sec.title) + '</span><span class="ff-map-state" aria-hidden="true">' + mark + '</span><span class="ff-sr-only">' + sr + '</span></a></li>';
        }).join('') + '<li><a class="ff-map-link ff-map-review" href="#/review/' + rec.id + '"><span class="ff-map-num" aria-hidden="true">&#9654;</span><span class="ff-map-t">' + (isLog() ? 'Summary &amp; export' : 'Review &amp; finalize') + '</span></a></li>';
    }
    function updateMap() {
        var list = document.getElementById('ff-map-list');
        if (list) list.innerHTML = mapHtml(currentSection().idx);
    }

    // "log" schemas (punch list, RFI log...) stay open: no finalize/lock, permanent log ID, export snapshots any time
    function isLog(r) { var x = r || rec; return !!(x && forms[x.type] && forms[x.type].mode === 'log'); }

    function headHtml(label) {
        var s = schemaOf(rec), p = trim(C.getPath(rec.data, 'project.name'));
        return '<div class="ff-rec-head"><div class="ff-rec-id"><span class="ff-kicker">' + esc(s.shortTitle(rec)) + ' &middot; ' + esc(label) +
            (rec.revisionOf ? ' &middot; Revision ' + rec.revision + ' of ' + esc(rec.revisionOf) : '') + '</span>' +
            '<p class="ff-rec-proj">' + esc(p || 'Untitled project') + '</p></div><p class="ff-save" id="ff-save" role="status" aria-live="polite"></p></div>';
    }

    function renderEdit(secId, focusId) {
        var s = schemaOf(rec);
        if (secId) rec.section = secId;
        var cur = currentSection(), sec = cur.sec, idx = cur.idx;
        rec.ui.visited[sec.id] = true;
        dirty = true; saveSoon();
        screen.innerHTML = '<div class="ff-edit">' + headHtml(isLog() ? 'Log ' + (rec.logNo || '') : 'Draft') +
            '<div class="ff-layout"><nav class="ff-map" aria-label="Form sections">' +
            '<button type="button" class="ff-map-toggle" aria-expanded="false" aria-controls="ff-map-list" data-action="map-toggle"><span>Section ' + (idx + 1) + ' of ' + s.sections.length + ' &middot; ' + esc(sec.title) + '</span><span class="ff-map-caret" aria-hidden="true">&#9662;</span></button>' +
            '<ol class="ff-map-list" id="ff-map-list">' + mapHtml(idx) + '</ol></nav>' +
            '<section class="ff-sec" aria-labelledby="ff-sec-title"><h2 class="ff-sec-title" id="ff-sec-title" tabindex="-1"><span class="ff-sec-num" aria-hidden="true">' + (idx + 1) + '</span>' + esc(sec.title) + '</h2>' +
            (sec.intro ? '<p class="ff-sec-intro">' + esc(sec.intro) + '</p>' : '') +
            '<div id="ff-attn"></div><div id="ff-sec-body" class="ff-sec-body">' + sec.render(rec, ui) + '</div></section></div>' +
            '<div class="ff-bar"><button type="button" class="ff-btn ff-btn--ghost" data-action="nav-back">' + (idx ? '&larr; Back' : '&larr; Start') + '</button>' +
            '<button type="button" class="ff-btn ff-btn--primary" data-action="nav-next">' + (idx < s.sections.length - 1 ? 'Next &rarr;' : (isLog() ? 'Summary &rarr;' : 'Review &rarr;')) + '</button></div></div>';
        afterRender();
        setStatus('saved');
        var target = focusId && document.getElementById(focusId);
        if (target) {
            reveal(target);
            target.scrollIntoView({ block: 'center' });
            var f = target.matches('input,textarea,select,button') ? target : (target.querySelector('input,textarea,select,button') || target);
            f.focus({ preventScroll: true });
        } else {
            scrollToScreen();
            document.getElementById('ff-sec-title').focus({ preventScroll: true });
        }
    }

    function rerenderSection() {
        var body = document.getElementById('ff-sec-body');
        if (!body) return;
        var ae = document.activeElement, aid = ae && ae.id, open = {};
        body.querySelectorAll('details[id]').forEach(function (d) { open[d.id] = d.open; });
        body.innerHTML = currentSection().sec.render(rec, ui);
        body.querySelectorAll('details[id]').forEach(function (d) { if (open[d.id]) d.open = true; });
        afterRender();
        if (aid) { var el = document.getElementById(aid); if (el) el.focus({ preventScroll: true }); }
    }

    function afterRender() {
        document.querySelectorAll('[data-autogrow]').forEach(grow);
        applyErrors();
        updateMap();
    }
    function grow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 4) + 'px'; }
    // open any collapsed <details> around an element so it can be seen and focused
    function reveal(el) { for (var p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS' && !p.open) p.open = true; }

    function applyErrors() {
        var box = document.getElementById('ff-attn');
        if (!box || !rec) return;
        var sec = currentSection().sec;
        document.querySelectorAll('#ff-sec-body .ff-err').forEach(function (p) { p.textContent = ''; });
        document.querySelectorAll('#ff-sec-body [aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
        document.querySelectorAll('#ff-sec-body .is-invalid').forEach(function (e) { e.classList.remove('is-invalid'); });
        if (!(rec.ui.showErr[sec.id] || rec.ui.reviewed)) { box.innerHTML = ''; return; }
        var list = issues(rec).filter(function (i) { return i.sec === sec.id && i.level !== 'warn'; });
        list.forEach(function (i) {
            var el = i.id && document.getElementById(i.id);
            if (!el) return;
            var p = document.getElementById(i.id + '-err');
            if (p && !p.textContent) p.textContent = i.msg;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.setAttribute('aria-invalid', 'true'); else el.classList.add('is-invalid');
        });
        box.innerHTML = list.length ? '<div class="ff-attn-box" role="status"><p class="ff-attn-h">Needs attention (' + list.length + ')</p><ul>' +
            list.map(function (i) { return '<li>' + (i.id ? '<button type="button" class="ff-link" data-action="focus" data-id="' + i.id + '">' + esc(i.msg) + '</button>' : esc(i.msg)) + '</li>'; }).join('') + '</ul></div>' : '';
    }

    function scrollToScreen() {
        var top = screen.getBoundingClientRect().top + root.pageYOffset - 84;
        root.scrollTo(0, Math.max(0, top));
    }

    // =====================================================================
    // Start screen
    // =====================================================================
    function renderStart(msg) {
        rec = null;
        Promise.all([S.listRecords(), loadProjects()]).then(function (res) {
            var list = res[0] || [];
            list.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
            var logs = list.filter(function (r) { return forms[r.type] && isLog(r); });
            var drafts = list.filter(function (r) { return r.status !== 'final' && forms[r.type] && !isLog(r); });
            var finals = list.filter(function (r) { return r.status === 'final' && forms[r.type]; });
            var jt = S.pref('jhaTitle') === 'JSA' ? 'JSA' : 'JHA';
            var h = '<div class="ff-start">';
            if (msg) h += '<p class="ff-flash" role="status">' + esc(msg) + '</p>';
            if (logs.length) {
                h += '<section class="ff-panel" aria-labelledby="ff-logs-h"><h2 class="ff-h2" id="ff-logs-h">Your logs on this device</h2><ul class="ff-rec-list">' +
                    logs.map(function (r) { return recItem(r, true, true); }).join('') + '</ul></section>';
            }
            if (drafts.length) {
                h += '<section class="ff-panel" aria-labelledby="ff-drafts-h"><h2 class="ff-h2" id="ff-drafts-h">Resume a draft</h2><ul class="ff-rec-list">' +
                    drafts.map(function (r) { return recItem(r, true); }).join('') + '</ul></section>';
            }
            h += '<section class="ff-panel" aria-labelledby="ff-new-h"><h2 class="ff-h2" id="ff-new-h">Start a new record</h2><div class="ff-choice-grid">';
            order.forEach(function (type) {
                var s = forms[type];
                h += '<article class="ff-choice" aria-labelledby="ff-c-' + type + '"><h3 class="ff-choice-title" id="ff-c-' + type + '">' + esc(s.label) + '</h3><p class="ff-choice-desc">' + esc(s.description) + '</p>';
                if (type === 'jha') {
                    h += '<fieldset class="ff-fieldset ff-title-pick"><legend class="ff-label">Record title</legend><div class="ff-seg">' +
                        ['JHA', 'JSA'].map(function (t) {
                            return '<label class="ff-seg-opt" for="ff-start-title-' + t + '"><input type="radio" name="ff-start-title" id="ff-start-title-' + t + '" value="' + t + '"' + (jt === t ? ' checked' : '') + '><span>' + t + '</span></label>';
                        }).join('') + '</div><p class="ff-hint">Same form either way &mdash; choose the name your company uses. JHA = Job Hazard Analysis, JSA = Job Safety Analysis.</p></fieldset>';
                }
                h += '<button type="button" class="ff-btn ff-btn--primary ff-choice-btn" data-action="new" data-type="' + type + '" id="ff-new-' + type + '">' + esc(type === 'jha' ? 'Start ' + jt : s.startLabel) + '</button></article>';
            });
            h += '</div></section>';
            if (finals.length) {
                h += '<section class="ff-panel" aria-labelledby="ff-finals-h"><h2 class="ff-h2" id="ff-finals-h">Finalized records on this device</h2><ul class="ff-rec-list">' +
                    finals.map(function (r) { return recItem(r, false); }).join('') + '</ul></section>';
            }
            h += '<section class="ff-panel ff-device" aria-labelledby="ff-dev-h"><h2 class="ff-h2" id="ff-dev-h">Your data stays on this device</h2><ul class="ff-points">' +
                '<li>Drafts, records, names and signatures are saved only in this browser on this device. Nothing is uploaded to Builder Ascent.</li>' +
                '<li>This is not a backup. Clearing browser data, private windows, or Safari removing website data after about 7 days without a visit can delete drafts. Download or share the PDF to keep a record.</li>' +
                '<li>Records don&rsquo;t sync between devices or browsers.</li>' +
                '<li>Using a shared or company device? Delete your drafts and records when you are done.</li></ul>' +
                '<p class="ff-hint">Saved projects on this device: ' + projects.length + '.</p>' +
                '<div class="ff-row-btns">' + (projects.length ? '<button type="button" class="ff-btn-sm" data-action="clear-projects">Clear saved projects</button>' : '') +
                '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="clear-all">Clear all Field Forms data on this device</button></div></section>';
            h += '</div>';
            screen.innerHTML = h;
            showStorageBanner();
        });
    }

    function recItem(r, isDraft, log) {
        var s = forms[r.type], p = trim(C.getPath(r.data, 'project.name')) || 'Untitled project';
        var label = (s.listTitle ? s.listTitle(r) : s.shortTitle(r)) + ' · ' + p;
        if (log) {
            return '<li class="ff-rec-item"><div class="ff-rec-info"><p class="ff-rec-title">' + esc(label) + '</p>' +
                '<p class="ff-rec-meta">' + esc(r.logNo || '') + ' &middot; updated ' + esc(C.formatStamp(r.updatedAt)) + (s.listMeta ? ' &middot; ' + esc(s.listMeta(r)) : '') + '</p></div>' +
                '<div class="ff-rec-actions"><a class="ff-btn-sm ff-btn-sm--primary" href="#/edit/' + r.id + '/' + (r.section || '') + '">Open<span class="ff-sr-only"> ' + esc(label) + '</span></a>' +
                '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="delete" data-id="' + r.id + '">Delete<span class="ff-sr-only"> ' + esc(label) + '</span></button></div></li>';
        }
        var old = isDraft && (Date.now() - new Date(r.updatedAt).getTime()) > OLD_DRAFT_DAYS * 864e5;
        return '<li class="ff-rec-item"><div class="ff-rec-info"><p class="ff-rec-title">' + esc(label) + (old ? ' <span class="ff-old">Old draft</span>' : '') + '</p>' +
            '<p class="ff-rec-meta">' + (isDraft ? 'Edited ' + esc(C.formatStamp(r.updatedAt)) : esc(r.recordNo || '') + ' &middot; finalized ' + esc(C.formatStamp(r.finalizedAt))) +
            (r.data.project && r.data.project.date ? ' &middot; record date ' + esc(C.formatDate(r.data.project.date)) : '') +
            (old ? ' &middot; over ' + OLD_DRAFT_DAYS + ' days old &mdash; check it is still needed' : '') + '</p></div>' +
            '<div class="ff-rec-actions"><a class="ff-btn-sm ff-btn-sm--primary" href="#/' + (isDraft ? 'edit/' + r.id + '/' + (r.section || '') : 'record/' + r.id) + '">' + (isDraft ? 'Resume' : 'Open') + '<span class="ff-sr-only"> ' + esc(label) + '</span></a>' +
            '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="delete" data-id="' + r.id + '">Delete<span class="ff-sr-only"> ' + esc(label) + '</span></button></div></li>';
    }

    function showStorageBanner() {
        S.ready().then(function (mode) {
            banner.innerHTML = mode === 'memory' ? '<p class="ff-banner" role="alert"><strong>This browser is not letting Field Forms save on this device</strong> (private window or storage blocked). Your work will be lost when this page closes. Finish and download the PDF before leaving.</p>' : '';
        });
    }

    function newRecord(type) {
        var s = forms[type], t = nowISO();
        rec = { id: C.uid('rec'), type: type, status: 'draft', schemaVersion: 1, createdAt: t, updatedAt: t, data: s.newData({ pref: S.pref }), ui: { visited: {}, showErr: {} } };
        rec.section = s.sections[0].id;
        if (s.mode === 'log') rec.logNo = C.recordNumber(s.prefix(rec));
        dirty = true;
        saveNow().then(function () { go('#/edit/' + rec.id + '/' + rec.section); });
    }

    // =====================================================================
    // Review, finalize, record
    // =====================================================================
    function recordHtml(r, editable) {
        var s = schemaOf(r), saved = rec; rec = r;
        var h = '<header class="ff-doc-head"><p class="ff-doc-kicker">Builder Ascent &middot; Field Forms</p><h2 class="ff-doc-title">' + esc(s.docTitle(r)) + '</h2>' +
            '<p class="ff-doc-meta">' + (isLog(r) ? 'Log ID <strong>' + esc(r.logNo) + '</strong> &middot; status as of ' + esc(C.formatStamp(nowISO())) :
                r.status === 'final' ? 'Record ID <strong>' + esc(r.recordNo) + '</strong> &middot; Finalized ' + esc(C.formatStamp(r.finalizedAt)) : '<strong>DRAFT</strong> &middot; not finalized') +
            (r.revisionOf ? ' &middot; Revision ' + r.revision + ' of ' + esc(r.revisionOf) : '') + '</p></header>';
        s.sections.forEach(function (sec, i) {
            h += '<section class="ff-rv" aria-labelledby="ff-rv-' + sec.id + '"><div class="ff-rv-head"><h3 class="ff-rv-title" id="ff-rv-' + sec.id + '">' + (i + 1) + '. ' + esc(sec.title) + '</h3>' +
                (editable ? '<a class="ff-link" href="#/edit/' + r.id + '/' + sec.id + '">Edit<span class="ff-sr-only"> ' + esc(sec.title) + '</span></a>' : '') + '</div>' + sec.review(r, rv) + '</section>';
        });
        if (r.finalStatement) h += '<p class="ff-rv-note">Finalized with the preparer&rsquo;s statement: &ldquo;' + esc(r.finalStatement) + '&rdquo;</p>';
        h += '<p class="ff-rv-note">Prepared on a personal device with Builder Ascent Field Forms. Names are typed by each person; signatures are drawn on the device and are not identity-verified. This record shows only the information that was selected or entered.</p>';
        rec = saved;
        return h;
    }

    function renderLogSummary() {
        var s = schemaOf(rec), all = issues(rec), canShare = BAFF.share.canShareFiles();
        var errs = all.filter(function (i) { return i.level !== 'warn'; }), warns = all.filter(function (i) { return i.level === 'warn'; });
        rec.ui.reviewed = true; dirty = true; saveSoon();
        var link = function (i) { return '<li><a href="#/edit/' + rec.id + '/' + i.sec + '/' + (i.id || '') + '">' + esc(i.msg) + '</a></li>'; };
        var h = '<div class="ff-review">' + headHtml('Log ' + (rec.logNo || '')) +
            '<h2 class="ff-sec-title" id="ff-sec-title" tabindex="-1">Summary &amp; export</h2>' +
            '<p class="ff-sec-intro">This log stays open so you can keep adding and closing items. Export a PDF snapshot or a spreadsheet whenever you need to send it.</p>' +
            (errs.length ? '<div class="ff-attn-box" id="ff-errs" tabindex="-1"><p class="ff-attn-h">Needs attention (' + errs.length + ')</p><ul>' + errs.map(link).join('') + '</ul></div>' : '') +
            (warns.length ? '<div class="ff-attn-box ff-attn-box--warn"><p class="ff-attn-h">Heads up</p><ul>' + warns.map(link).join('') + '</ul></div>' : '') +
            '<div class="ff-out" role="group" aria-label="Export this log">' +
            '<button type="button" class="ff-btn ff-btn--primary" data-action="pdf-download">Download PDF snapshot</button>' +
            (s.csv ? '<button type="button" class="ff-btn ff-btn--primary" data-action="csv-download">Download spreadsheet (CSV)</button>' : '') +
            (canShare ? '<button type="button" class="ff-btn ff-btn--ghost" data-action="pdf-share">Share PDF</button>' : '') +
            '<button type="button" class="ff-btn ff-btn--ghost" data-action="print">Print</button>' +
            '<a class="ff-btn ff-btn--ghost" href="' + esc(BAFF.share.mailtoHref(emailSubject(rec), emailBody(rec))) + '">Email summary</a></div>' +
            '<p class="ff-hint">The PDF and spreadsheet show the log as it is right now. The spreadsheet opens in Excel, Google Sheets or Numbers. Email opens your email app with a summary &mdash; attach the file you downloaded' + (canShare ? ', or use Share PDF' : '') + '.</p>' +
            '<p class="ff-save" id="ff-out-status" role="status" aria-live="polite"></p>' +
            '<div class="ff-printable">' + recordHtml(rec, true) + '</div>' +
            '<div class="ff-actions"><a class="ff-btn ff-btn--ghost" href="#/edit/' + rec.id + '/' + (s.logHome || s.sections[0].id) + '">&larr; Back to items</a>' +
            '<a class="ff-btn ff-btn--ghost" href="#/">All logs</a></div></div>';
        screen.innerHTML = h;
        setStatus('saved');
        scrollToScreen();
        document.getElementById('ff-sec-title').focus({ preventScroll: true });
    }

    function toCSV(rows) {
        return rows.map(function (row) {
            return row.map(function (v) {
                v = v == null ? '' : String(v);
                if (/^[=+@\t\r]/.test(v)) v = "'" + v;            // keep spreadsheet apps from treating text as a formula
                return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
            }).join(',');
        }).join('\r\n') + '\r\n';
    }

    function renderReview() {
        if (isLog()) { renderLogSummary(); return; }
        var s = schemaOf(rec), all = issues(rec);
        var errs = all.filter(function (i) { return i.level !== 'warn'; }), warns = all.filter(function (i) { return i.level === 'warn'; });
        rec.ui.reviewed = true; dirty = true; saveSoon();
        var link = function (i) { return '<li><a href="#/edit/' + rec.id + '/' + i.sec + '/' + (i.id || '') + '">' + esc(i.msg) + '</a></li>'; };
        var h = '<div class="ff-review">' + headHtml('Review') +
            '<h2 class="ff-sec-title" id="ff-sec-title" tabindex="-1">Review &amp; finalize</h2>' +
            (errs.length ? '<div class="ff-attn-box" id="ff-errs" tabindex="-1"><p class="ff-attn-h">Needs attention before finalizing (' + errs.length + ')</p><ul>' + errs.map(link).join('') + '</ul></div>'
                : '<div class="ff-ok-box"><p>All required items are complete.</p></div>') +
            (warns.length ? '<div class="ff-attn-box ff-attn-box--warn"><p class="ff-attn-h">Check before finalizing (optional)</p><ul>' + warns.map(link).join('') + '</ul></div>' : '') +
            '<div class="ff-printable">' + recordHtml(rec, true) + '</div>' +
            '<div class="ff-actions"><button type="button" class="ff-btn ff-btn--primary" data-action="finalize"' + (errs.length ? ' aria-disabled="true"' : '') + '>Finalize ' + esc(s.shortTitle(rec)) + '</button>' +
            '<button type="button" class="ff-btn ff-btn--ghost" data-action="draft-pdf">Download draft PDF</button>' +
            '<a class="ff-btn ff-btn--ghost" href="#/edit/' + rec.id + '/' + s.sections[s.sections.length - 1].id + '">&larr; Back to editing</a></div>' +
            '<p class="ff-save" id="ff-out-status" role="status" aria-live="polite"></p></div>';
        screen.innerHTML = h;
        setStatus('saved');
        scrollToScreen();
        document.getElementById('ff-sec-title').focus({ preventScroll: true });
    }

    function openFinalize() {
        var s = schemaOf(rec), errs = issues(rec).filter(function (i) { return i.level !== 'warn'; });
        if (errs.length) {
            var st = document.getElementById('ff-out-status');
            if (st) st.textContent = 'Fix the items under “Needs attention” first.';
            var box = document.getElementById('ff-errs');
            if (box) { box.scrollIntoView({ block: 'center' }); box.focus({ preventScroll: true }); }
            return;
        }
        lastFocus = document.activeElement;
        cdlg.innerHTML = '<div class="ff-dlg-body"><h2 class="ff-dlg-title" id="ff-cdlg-title">Finalize this ' + esc(s.shortTitle(rec)) + '?</h2>' +
            '<p>Finalizing locks this record on this device and gives it a record ID. You can still create a revision later.</p>' +
            '<label class="ff-check ff-check--box" for="ff-fin-ack"><input type="checkbox" id="ff-fin-ack"><span>' + esc(s.finalizeStatement) + '</span></label>' +
            '<div class="ff-dlg-actions"><button type="button" class="ff-btn ff-btn--primary" id="ff-fin-go" disabled>Finalize</button><button type="button" class="ff-btn ff-btn--ghost" id="ff-fin-cancel">Keep editing</button></div></div>';
        cdlg.setAttribute('aria-labelledby', 'ff-cdlg-title');
        cdlg.showModal();
        var ack = document.getElementById('ff-fin-ack'), goBtn = document.getElementById('ff-fin-go');
        ack.addEventListener('change', function () { goBtn.disabled = !ack.checked; });
        document.getElementById('ff-fin-cancel').addEventListener('click', function () { cdlg.close(); });
        goBtn.addEventListener('click', function () {
            if (!ack.checked) return;
            var d = new Date();
            rec.status = 'final';
            rec.finalizedAt = d.toISOString();
            rec.recordNo = C.recordNumber(s.prefix(rec), d);
            rec.finalStatement = s.finalizeStatement;
            dirty = true;
            cdlg.close();
            saveNow().then(function () { go('#/record/' + rec.id); });
        });
        ack.focus();
    }

    function renderRecord() {
        var s = schemaOf(rec);
        if (rec.status !== 'final') { go('#/review/' + rec.id); return; }
        var canShare = BAFF.share.canShareFiles();
        var h = '<div class="ff-record">' + headHtml('Final') +
            '<div class="ff-final-banner"><h2 class="ff-sec-title" id="ff-sec-title" tabindex="-1">' + esc(s.shortTitle(rec)) + ' finalized</h2>' +
            '<p>Record ID <strong>' + esc(rec.recordNo) + '</strong> &middot; finalized on this device ' + esc(C.formatStamp(rec.finalizedAt)) + '</p>' +
            '<p class="ff-hint">This record is locked. To change it, create a revision. The copy on this device is not a backup &mdash; download or share the PDF to keep it.</p></div>' +
            '<div class="ff-out" role="group" aria-label="Save, share or print this record">' +
            '<button type="button" class="ff-btn ff-btn--primary" data-action="pdf-download">Download PDF</button>' +
            (canShare ? '<button type="button" class="ff-btn ff-btn--primary" data-action="pdf-share">Share PDF</button>' : '') +
            '<button type="button" class="ff-btn ff-btn--ghost" data-action="print">Print</button>' +
            '<a class="ff-btn ff-btn--ghost" href="' + esc(BAFF.share.mailtoHref(emailSubject(rec), emailBody(rec))) + '">Email summary</a></div>' +
            '<p class="ff-hint">Email opens your email app with a summary. A web page can&rsquo;t attach the PDF for you &mdash; download it first and attach it' + (canShare ? ', or use Share PDF to send the file directly' : '') + '.</p>' +
            '<p class="ff-save" id="ff-out-status" role="status" aria-live="polite"></p>' +
            '<div class="ff-printable">' + recordHtml(rec, false) + '</div>' +
            '<div class="ff-actions"><button type="button" class="ff-btn ff-btn--ghost" data-action="revise">Create revision</button>' +
            '<a class="ff-btn ff-btn--ghost" href="#/">Back to start</a>' +
            '<button type="button" class="ff-btn ff-btn--danger" data-action="delete" data-id="' + rec.id + '">Delete from this device</button></div></div>';
        screen.innerHTML = h;
        scrollToScreen();
        document.getElementById('ff-sec-title').focus({ preventScroll: true });
    }

    function emailSubject(r) {
        var s = schemaOf(r), proj = trim(C.getPath(r.data, 'project.name')) || 'Project';
        if (isLog(r)) return s.shortTitle(r) + ' - ' + proj + ' - status ' + C.formatDate(C.todayISO()) + ' - ' + r.logNo;
        return s.shortTitle(r) + ' - ' + proj + ' - ' + C.formatDate(C.getPath(r.data, 'project.date')) + (r.recordNo ? ' - ' + r.recordNo : '');
    }
    function emailBody(r) {
        var body = schemaOf(r).summary(r);
        if (body.length > 1400) body = body.slice(0, 1400) + '\n...';
        return body + '\n\nPlease attach the PDF you downloaded - this email does not include it automatically.\n\nPrepared with Builder Ascent Field Forms (builderascent.com). Signatures are captured on the preparer\'s device and are not identity-verified.';
    }

    function buildPdf(r) {
        var s = schemaOf(r), saved = rec; rec = r;
        var log = isLog(r), snap = C.formatStamp(nowISO());
        var rid = log ? r.logNo : r.status === 'final' ? r.recordNo : 'DRAFT - not finalized';
        var proj = trim(C.getPath(r.data, 'project.name')) || 'Project';
        var doc = BAFF.pdf.create({
            title: s.docTitle(r) + ' - ' + proj,
            subject: 'Builder Ascent Field Forms - ' + s.docTitle(r),
            author: trim(C.getPath(r.data, s.authorPath)) || 'Builder Ascent Field Forms user',
            watermark: r.status === 'final' || log ? null : 'DRAFT',
            runningHeader: s.shortTitle(r) + '  ·  ' + proj + '  ·  ' + rid + (log ? '  ·  status as of ' + snap : ''),
            footer1: 'Builder Ascent Field Forms  ·  builderascent.com  ·  Record ' + rid,
            footer2: 'Generated ' + C.formatStamp(nowISO()) + '. Prepared on a personal device; signatures are not identity-verified. Shows only the information selected or entered.'
        });
        var cache = {};
        doc.titleBlock({
            title: s.docTitle(r),
            status: log ? 'STATUS SNAPSHOT' : r.status === 'final' ? 'FINAL' : 'DRAFT - NOT FINALIZED',
            meta: log ? [[['Log ID', rid], ['Status as of', snap]]] : [[['Record ID', rid], ['Record date', C.formatDate(C.getPath(r.data, 'project.date'))]]]
                .concat(r.status === 'final' ? [[['Finalized', C.formatStamp(r.finalizedAt)]].concat(r.revisionOf ? [['Revision', r.revision + ' of ' + r.revisionOf]] : [])] : (r.revisionOf ? [[['Revision', r.revision + ' of ' + r.revisionOf]]] : []))
        });
        s.pdf(r, doc, { parts: pdfParts, cache: cache, signoffValid: signoffValid });
        if (r.finalStatement) doc.paragraph('Finalized with the preparer\'s statement: "' + r.finalStatement + '"', { size: 8.5, font: 'I' });
        var bytes = doc.output();
        rec = saved;
        var date = log ? C.todayISO() : (C.getPath(r.data, 'project.date') || C.todayISO());
        var filename = 'BA_' + s.prefix(r) + '_' + C.safeFilePart(proj) + '_' + date + '_' + (log ? r.logNo : (r.recordNo || 'DRAFT')) + '.pdf';
        return { bytes: bytes, filename: filename };
    }

    function outStatus(t) { var el = document.getElementById('ff-out-status'); if (el) el.textContent = t; }

    // =====================================================================
    // Sign-on dialog (crew "pass the device" + sign-offs)
    // =====================================================================
    function openSign(mode) {
        var s = schemaOf(rec), isCrew = mode.kind === 'crew';
        var row = isCrew && mode.index != null ? rec.data.crew[mode.index] : null;
        var name = isCrew ? (row ? row.name : '') : trim(val(mode.namePath));
        var statement = isCrew ? s.crewStatement : mode.statement;
        var signed = (rec.data.crew || []).filter(function (c) { return c.ack; }).length;
        sigMode = mode;
        if (!dlg.open) lastFocus = document.activeElement;
        if (sigPad) { sigPad.destroy(); sigPad = null; }
        dlg.innerHTML = '<div class="ff-dlg-body">' +
            '<h2 class="ff-dlg-title" id="ff-dlg-title">' + (isCrew ? 'Crew sign-on' : esc(mode.label) + ' sign-off') + '</h2>' +
            (isCrew ? '<p class="ff-dlg-count" aria-live="polite">' + signed + ' acknowledged so far' + (mode.flash ? ' &middot; ' + esc(mode.flash) : '') + '</p>' : '') +
            '<details class="ff-plan"><summary>Read the plan summary</summary><pre class="ff-plan-text">' + esc(s.summary(rec)) + '</pre></details>' +
            (isCrew ? '<div class="ff-field"><label class="ff-label" for="ff-sg-name">Your full name <span class="ff-req">Required</span></label><input class="ff-input" id="ff-sg-name" autocomplete="off" value="' + esc(name) + '"></div>' +
                '<div class="ff-field"><label class="ff-label" for="ff-sg-role">Trade / position</label><input class="ff-input" id="ff-sg-role" autocomplete="off" value="' + esc(row ? row.role || '' : '') + '"></div>'
                : '<p class="ff-dlg-name"><span>Name</span> <strong>' + esc(name || 'Not entered') + '</strong></p>') +
            '<div class="ff-ack"><p class="ff-ack-text">&ldquo;' + esc(statement) + '&rdquo;</p><label class="ff-check" for="ff-sg-ack"><input type="checkbox" id="ff-sg-ack"><span>I confirm this statement.</span></label></div>' +
            '<div class="ff-field"><p class="ff-label" id="ff-sg-pad-label">Signature</p><div id="ff-sg-pad"></div><p class="ff-hint">Draw with a finger, stylus or mouse. Captured on this device; not identity-verified.</p></div>' +
            '<p class="ff-err ff-err--block" id="ff-sg-err" role="alert"></p>' +
            '<div class="ff-dlg-actions"><button type="button" class="ff-btn ff-btn--primary" id="ff-sg-sign">' + (isCrew && mode.pass ? 'Sign &amp; next person' : 'Save signature') + '</button>' +
            '<button type="button" class="ff-btn ff-btn--ghost" id="ff-sg-typed">Can&rsquo;t sign on this device &mdash; save typed acknowledgement</button>' +
            '<button type="button" class="ff-btn ff-btn--text" id="ff-sg-close">' + (isCrew && mode.pass ? 'Done' : 'Cancel') + '</button></div></div>';
        dlg.setAttribute('aria-labelledby', 'ff-dlg-title');
        if (!dlg.open) dlg.showModal();
        sigPad = BAFF.signature.create(document.getElementById('ff-sg-pad'), { label: 'Signature pad for ' + (name || 'the person signing') + '. Draw with a finger, stylus or mouse.' });
        document.getElementById('ff-sg-sign').addEventListener('click', function () { commitSign('sign'); });
        document.getElementById('ff-sg-typed').addEventListener('click', function () { commitSign('typed'); });
        document.getElementById('ff-sg-close').addEventListener('click', closeSign);
        var first = isCrew ? document.getElementById(name ? 'ff-sg-ack' : 'ff-sg-name') : document.getElementById('ff-sg-ack');
        first.focus();
    }

    function commitSign(kind) {
        var mode = sigMode, isCrew = mode.kind === 'crew', err = document.getElementById('ff-sg-err');
        var name = isCrew ? trim(document.getElementById('ff-sg-name').value) : trim(val(mode.namePath));
        var ack = document.getElementById('ff-sg-ack');
        function fail(t, focusId) { err.textContent = t; if (focusId) document.getElementById(focusId).focus(); }
        if (!name) return fail(isCrew ? 'Type your full name.' : 'The name is missing. Close this and enter it first.', isCrew ? 'ff-sg-name' : null);
        if (!ack.checked) return fail('Check the box to confirm the statement.', 'ff-sg-ack');
        var sig = null;
        if (kind === 'sign') {
            if (sigPad.isEmpty()) return fail('Draw your signature in the box, or choose “Can’t sign on this device”.');
            sig = sigPad.toJPEG();
        }
        var entry = { name: name, ack: true, sig: sig, sigUnavailable: kind === 'typed', at: nowISO() };
        if (isCrew) {
            entry.role = trim(document.getElementById('ff-sg-role').value);
            if (mode.index != null && rec.data.crew[mode.index]) C.setPath(rec.data, 'crew.' + mode.index, Object.assign(rec.data.crew[mode.index], entry));
            else rec.data.crew.push(Object.assign({ id: C.uid('crew') }, entry));
        } else {
            C.setPath(rec.data, 'signoff.' + mode.role, entry);
        }
        markChanged(true);
        if (isCrew && mode.pass) {
            var next = null;
            rec.data.crew.forEach(function (c, i) { if (next == null && !c.ack && trim(c.name)) next = i; });
            openSign({ kind: 'crew', index: next, pass: true, flash: 'Saved for ' + name + '. Pass the device to the next person.' });
        } else {
            closeSign();
        }
    }

    function closeSign() {
        if (sigPad) { sigPad.destroy(); sigPad = null; }
        if (dlg.open) dlg.close();
    }

    // =====================================================================
    // Events
    // =====================================================================
    function onInput(e) {
        var el = e.target;
        if (el.matches && el.matches('[data-autogrow]')) grow(el);
        if (!rec || rec.status === 'final' || !el.closest || !el.closest('#ff-sec-body')) return;
        var kind = el.getAttribute('data-kind'), path = el.getAttribute('data-bind');
        if (!path) return;
        if (kind === 'text') {
            if (e.type !== 'input') return;
            C.setPath(rec.data, path, el.value);
            var s = schemaOf(rec);
            markChanged(!!(s.rerenderOn && s.rerenderOn(path)));
            return;
        }
        if (e.type !== 'change') return;
        if (kind === 'radio') { if (el.checked) C.setPath(rec.data, path, el.value); }
        else if (kind === 'bool') C.setPath(rec.data, path, el.checked);
        else if (kind === 'checkarr') {
            var arr = (C.getPath(rec.data, path) || []).slice(), v = el.value, i = arr.indexOf(v);
            if (el.checked && i < 0) arr.push(v);
            if (!el.checked && i >= 0) arr.splice(i, 1);
            if (el.checked) {
                if (el.hasAttribute('data-exclusive')) arr = [v];
                else {
                    var fs = el.closest('fieldset'), ex = fs && fs.querySelector('[data-exclusive]');
                    if (ex) arr = arr.filter(function (x) { return x !== ex.value; });
                }
            }
            C.setPath(rec.data, path, arr);
        }
        if (schemaOf(rec).onChange) schemaOf(rec).onChange(rec, path, { pref: S.pref });
        markChanged(true);
    }

    function onKey(e) {
        var t = e.target;
        if (e.key === 'Enter' && t.getAttribute && t.getAttribute('data-enter')) {
            e.preventDefault();
            var b = document.getElementById(t.getAttribute('data-enter'));
            if (b) b.click();
        }
    }

    function onChangeMisc(e) {
        var t = e.target;
        if (t.id === 'ff-project-pick' && t.value !== '' && rec) {
            var p = projects[parseInt(t.value, 10)];
            if (!p) return;
            var d = rec.data;
            d.project = d.project || {};
            ['name', 'number', 'company', 'trade', 'location'].forEach(function (k) { if (p[k]) d.project[k] = p[k]; });
            if (d.emergency) {
                if (p.emergencyContact) d.emergency.contact = p.emergencyContact;
                if (p.emergencyPhone) d.emergency.phone = p.emergencyPhone;
                if (p.hospital) d.emergency.hospital = p.hospital;
            }
            markChanged(true);
            var nm = document.getElementById(fid('project.name'));
            if (nm) nm.focus();
        }
        if (t.name === 'ff-start-title') {
            S.pref('jhaTitle', t.value);
            var b = document.getElementById('ff-new-jha');
            if (b) b.textContent = 'Start ' + t.value;
        }
    }

    function onClick(e) {
        var a = e.target.closest && e.target.closest('[data-action]');
        if (!a) return;
        var act = a.getAttribute('data-action'), path = a.getAttribute('data-path'), idx = parseInt(a.getAttribute('data-index'), 10);
        var s = rec && schemaOf(rec);
        if (s && s.actions && s.actions[act]) { s.actions[act](rec, a, { changed: markChanged, uid: C.uid, focusLater: focusLater }); return; }
        var arr;
        switch (act) {
            case 'new': newRecord(a.getAttribute('data-type')); break;
            case 'delete':
                if (!root.confirm('Delete this record from this device? This cannot be undone.')) return;
                S.deleteRecord(a.getAttribute('data-id')).then(function () { rec = null; dirty = false; go('#/'); renderStart('Deleted from this device.'); });
                break;
            case 'clear-all':
                if (!root.confirm('Delete ALL Field Forms drafts, records, saved projects and settings from this device? This cannot be undone.')) return;
                S.clearAll().then(function () { projects = []; renderStart('All Field Forms data was deleted from this device.'); });
                break;
            case 'clear-projects':
                if (!root.confirm('Remove all saved projects from this device?')) return;
                Promise.all(projects.map(function (p) { return S.deleteProject(p.key); })).then(function () { projects = []; renderStart('Saved projects removed.'); });
                break;
            case 'map-toggle':
                var open = a.getAttribute('aria-expanded') !== 'true';
                a.setAttribute('aria-expanded', open ? 'true' : 'false');
                a.parentNode.classList.toggle('is-open', open);
                break;
            case 'nav-next':
            case 'nav-back':
                var cur = currentSection(), secs = s.sections;
                if (act === 'nav-next') rec.ui.showErr[cur.sec.id] = true;
                dirty = true; flush();
                if (act === 'nav-next') go(cur.idx < secs.length - 1 ? '#/edit/' + rec.id + '/' + secs[cur.idx + 1].id : '#/review/' + rec.id);
                else go(cur.idx > 0 ? '#/edit/' + rec.id + '/' + secs[cur.idx - 1].id : '#/');
                break;
            case 'csv-download':
                try {
                    var csv = s.csv(rec), cname = 'BA_' + s.prefix(rec) + '_' + C.safeFilePart(trim(C.getPath(rec.data, 'project.name')) || 'Project') + '_' + C.todayISO() + '_' + (rec.logNo || 'LOG') + '.csv';
                    BAFF.share.downloadText('\uFEFF' + toCSV([csv.header].concat(csv.rows)), cname, 'text/csv');
                    outStatus('Spreadsheet created: ' + cname + ' \u2014 check your downloads.');
                } catch (errc) { outStatus('Could not create the spreadsheet on this device.'); if (root.console) console.error(errc); }
                break;
            case 'focus':
                var el = document.getElementById(a.getAttribute('data-id'));
                if (el) { reveal(el); el.scrollIntoView({ block: 'center' }); (el.matches('input,textarea,select') ? el : (el.querySelector('input,textarea,select,button') || el)).focus({ preventScroll: true }); }
                break;
            case 'now': C.setPath(rec.data, path, C.nowHHMM()); markChanged(true); break;
            case 'clear-value': C.setPath(rec.data, path, ''); markChanged(true); var fs = document.getElementById(fid(path)); if (fs) focusLater(fid(path) + '-0'); break;
            case 'add-item':
                arr = (C.getPath(rec.data, path) || []).slice(); arr.push(''); C.setPath(rec.data, path, arr);
                markChanged(true); focusLater(a.getAttribute('data-focus'));
                break;
            case 'add-text':
                arr = (C.getPath(rec.data, path) || []).slice(); arr.push(a.getAttribute('data-text')); C.setPath(rec.data, path, arr);
                markChanged(true); focusLater(fid(path) + '-' + (arr.length - 1));
                break;
            case 'remove-item':
                arr = (C.getPath(rec.data, path) || []).slice(); arr.splice(idx, 1); C.setPath(rec.data, path, arr);
                markChanged(true); focusLater(arr.length ? fid(path) + '-' + Math.min(idx, arr.length - 1) : fid(path));
                break;
            case 'add-custom':
                var src = document.getElementById(a.getAttribute('data-src')), v = trim(src && src.value);
                if (!v) { if (src) src.focus(); return; }
                arr = (C.getPath(rec.data, path) || []).slice();
                var ex = a.getAttribute('data-exclusive-value');
                if (ex) arr = arr.filter(function (x) { return x !== ex; });
                var known = Array.prototype.map.call(document.querySelectorAll('input[data-bind="' + path + '"][data-kind="checkarr"]'), function (i) { return i.value; });
                var match = known.filter(function (k) { return k.toLowerCase() === v.toLowerCase(); })[0] || v;
                if (arr.indexOf(match) < 0) arr.push(match);
                C.setPath(rec.data, path, arr);
                if (s.onChange) s.onChange(rec, path, { pref: S.pref });
                markChanged(true);
                var src2 = document.getElementById(a.getAttribute('data-src'));
                if (src2) { src2.value = ''; src2.focus(); }
                break;
            case 'ck-note':
                rec.ui.notes = rec.ui.notes || {}; rec.ui.notes[path] = true;
                markChanged(true); focusLater(fid(path) + '-note');
                break;
            case 'ck-add':
                arr = (C.getPath(rec.data, path) || []).slice(); arr.push({ id: C.uid('ck'), label: '', s: '', note: '' }); C.setPath(rec.data, path, arr);
                markChanged(true); focusLater(fid(path + '.' + (arr.length - 1)) + '-label');
                break;
            case 'ck-remove':
                arr = (C.getPath(rec.data, path) || []).slice();
                var ckx = arr[idx];
                if (ckx && (trim(ckx.label) || ckx.s || trim(ckx.note)) && !root.confirm('Remove "' + (trim(ckx.label) || 'this item') + '" from the checklist?')) return;
                arr.splice(idx, 1); C.setPath(rec.data, path, arr);
                markChanged(true); focusLater(a.getAttribute('data-focus'));
                break;
            case 'crew-add':
                rec.data.crew.push({ id: C.uid('crew'), name: '', role: '' });
                markChanged(true); focusLater(fid('crew.' + (rec.data.crew.length - 1) + '.name'));
                break;
            case 'crew-remove':
                var who = rec.data.crew[idx];
                if (who && (who.ack || trim(who.name)) && !root.confirm('Remove ' + (trim(who.name) || 'this person') + ' from the crew list' + (who.ack ? ' (including their acknowledgement)' : '') + '?')) return;
                rec.data.crew.splice(idx, 1); markChanged(true); focusLater('ff-crew');
                break;
            case 'crew-redo':
                var c = rec.data.crew[idx];
                if (!root.confirm('Clear the acknowledgement and signature for ' + c.name + '? They will need to sign again.')) return;
                rec.data.crew[idx] = { id: c.id, name: c.name, role: c.role };
                markChanged(true); focusLater(fid('crew.' + idx + '.name'));
                break;
            case 'crew-sign': openSign({ kind: 'crew', index: idx, pass: false }); break;
            case 'crew-pass':
                var nxt = null;
                rec.data.crew.forEach(function (c2, i) { if (nxt == null && !c2.ack && trim(c2.name)) nxt = i; });
                openSign({ kind: 'crew', index: nxt, pass: true });
                break;
            case 'crew-copy': copyCrew(); break;
            case 'so-sign':
                var ro = s.signoffRoles.filter(function (r2) { return r2.role === a.getAttribute('data-role'); })[0];
                openSign({ kind: 'signoff', role: ro.role, label: ro.label, namePath: ro.namePath, statement: ro.statement });
                break;
            case 'so-redo':
                if (!root.confirm('Clear this sign-off? It will need to be signed again.')) return;
                delete rec.data.signoff[a.getAttribute('data-role')];
                markChanged(true); focusLater('ff-so-' + a.getAttribute('data-role'));
                break;
            case 'finalize': openFinalize(); break;
            case 'draft-pdf':
            case 'pdf-download':
                try { var out = buildPdf(rec); BAFF.share.download(out.bytes, out.filename); outStatus('PDF created: ' + out.filename + ' — check your downloads.'); }
                catch (err) { outStatus('Could not create the PDF on this device. Use Print instead.'); if (root.console) console.error(err); }
                break;
            case 'pdf-share':
                var o2;
                try { o2 = buildPdf(rec); } catch (err2) { outStatus('Could not create the PDF on this device.'); return; }
                BAFF.share.shareFile(o2.bytes, o2.filename, schemaOf(rec).docTitle(rec), emailSubject(rec)).then(function (res) {
                    outStatus(res === 'shared' ? 'Shared.' : 'Share cancelled.');
                }, function () { outStatus('Sharing is not available here. Use Download PDF instead.'); });
                break;
            case 'print': BAFF.share.print(); break;
            case 'revise': revise(); break;
        }
    }

    function focusLater(id) {
        setTimeout(function () { var el = id && document.getElementById(id); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); } }, 0);
    }

    function copyCrew() {
        var msg = function (t) { var m = document.getElementById('ff-crew-msg'); if (m) m.textContent = t; };
        S.listRecords().then(function (list) {
            list = list.filter(function (r) { return r.id !== rec.id && (r.data.crew || []).some(function (c) { return trim(c.name); }); });
            list.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
            if (!list.length) { msg('No earlier record with crew names on this device.'); return; }
            var have = rec.data.crew.map(function (c) { return trim(c.name).toLowerCase(); }), added = 0;
            list[0].data.crew.forEach(function (c) {
                var nm = trim(c.name);
                if (nm && have.indexOf(nm.toLowerCase()) < 0) { rec.data.crew.push({ id: C.uid('crew'), name: nm, role: c.role || '' }); have.push(nm.toLowerCase()); added++; }
            });
            markChanged(true);
            msg(added ? 'Added ' + added + ' name' + (added > 1 ? 's' : '') + '. Each person still needs to acknowledge and sign.' : 'Everyone from your last record is already listed.');
        });
    }

    function revise() {
        var s = schemaOf(rec), t = nowISO(), nr = C.clone(rec);
        nr.id = C.uid('rec'); nr.status = 'draft'; nr.revisionOf = rec.recordNo; nr.revision = (rec.revision || 0) + 1;
        delete nr.recordNo; delete nr.finalizedAt; delete nr.finalStatement;
        nr.createdAt = nr.updatedAt = t;
        nr.data.crew = (nr.data.crew || []).filter(function (c) { return trim(c.name); }).map(function (c) { return { id: C.uid('crew'), name: c.name, role: c.role || '' }; });
        nr.data.signoff = {};
        nr.ui = { visited: {}, showErr: {} };
        nr.section = s.sections[0].id;
        rec = nr; dirty = true;
        saveNow().then(function () { go('#/edit/' + nr.id + '/' + nr.section); });
    }

    // =====================================================================
    // Router
    // =====================================================================
    function route() {
        flush();
        if (dlg && dlg.open) closeSign();
        if (cdlg && cdlg.open) cdlg.close();
        var parts = location.hash.replace(/^#\/?/, '').split('/');
        var view = parts[0] || '', id = parts[1], sec = parts[2], focusId = parts[3];
        if (!view || !id) { renderStart(); return; }
        var p = rec && rec.id === id ? Promise.resolve(rec) : S.getRecord(id);
        p.then(function (r) {
            if (!r || !forms[r.type]) { renderStart('That record is not on this device.'); return; }
            if (rec !== r) { rec = r; rec.ui = rec.ui || { visited: {}, showErr: {} }; dirty = false; }
            if (view === 'edit') { if (rec.status === 'final') { go('#/record/' + id); return; } renderEdit(sec, focusId); }
            else if (view === 'review') { if (rec.status === 'final') { go('#/record/' + id); return; } renderReview(); }
            else if (view === 'record') { if (isLog()) { go('#/review/' + id); return; } renderRecord(); }
            else renderStart();
            showStorageBanner();
        }, function () { renderStart('Could not open storage on this device.'); });
    }

    function start(opts) {
        var mount = opts.mount;
        try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
        mount.innerHTML = '<div id="ff-banner"></div><div id="ff-screen" class="ff-screen"></div>' +
            '<dialog id="ff-dlg" class="ff-dlg"></dialog><dialog id="ff-cdlg" class="ff-dlg ff-dlg--small"></dialog>';
        banner = document.getElementById('ff-banner');
        screen = document.getElementById('ff-screen');
        dlg = document.getElementById('ff-dlg');
        cdlg = document.getElementById('ff-cdlg');
        dlg.addEventListener('close', function () {
            if (sigPad) { sigPad.destroy(); sigPad = null; }
            dlg.innerHTML = '';
            if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); else focusLater('ff-crew');
        });
        cdlg.addEventListener('close', function () { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); });
        mount.addEventListener('input', onInput);
        mount.addEventListener('change', onInput);
        mount.addEventListener('change', onChangeMisc);
        mount.addEventListener('click', onClick);
        mount.addEventListener('keydown', onKey);
        root.addEventListener('hashchange', route);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
        root.addEventListener('pagehide', flush);
        S.ready().then(loadProjects).then(route);
    }

    root.BAFF.app = {
        register: function (schema) { forms[schema.type] = schema; order.push(schema.type); },
        start: start, fid: fid, ui: ui, rv: rv, pdfParts: pdfParts,
        isLog: isLog, toCSV: toCSV,
        checklist: { issues: checklistIssues, counts: checklistCounts, summary: checklistSummary, label: optLabel },
        // exposed for QA scripts
        _debug: { current: function () { return rec; }, buildPdf: function (r) { return buildPdf(r || rec); }, flush: function () { return saveNow(); } }
    };
})(typeof window !== 'undefined' ? window : this);

/*
 * Builder Ascent Field Forms - log builder (v1)
 * Turns a short config into a "living log" schema for the shared engine (mode: 'log'):
 * project block, auto-numbered entries (collapsible cards with status badges, totals, filters),
 * distribution / notes, sign-offs, PDF status snapshot and CSV spreadsheet export.
 * Used by the RFI, Change Order and Materials logs.
 * Exposed as window.BAFF.logs
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function today() { return C.todayISO(); }
    function snippet(s, n) { s = trim(s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    // "$1,250.50", "(500)", "-500" -> number; blank -> NaN
    function num(v) {
        var s = trim(v);
        if (!s) return NaN;
        var neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
        s = s.replace(/[^0-9.]/g, '');
        if (!s) return NaN;
        var n = parseFloat(s);
        return neg ? -n : n;
    }
    function money(n) {
        if (isNaN(n)) return '';
        var a = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (n < 0 ? '-$' : '$') + a;
    }
    function pad3(n) { return ('00' + n).slice(-3); }

    function define(cfg) {
        var STATUS_TEXT = {}, CLOSED = {};
        cfg.statuses.forEach(function (s) { STATUS_TEXT[s[0]] = s[1]; if (s[2] === 'closed') CLOSED[s[0]] = true; });
        var FILTERS = [['all', 'All']].concat(cfg.statuses.map(function (s) { return [s[0], s[1]]; })).concat(cfg.dueField ? [['overdue', 'Overdue']] : []);
        var ROLES = [
            { role: 'prepared', label: cfg.preparedLabel || 'Prepared by', namePath: 'project.preparedBy', statement: 'I prepared this ' + cfg.noun + '.', required: true },
            { role: 'reviewed', label: 'Reviewed by', namePath: 'people.reviewedBy', statement: 'I reviewed this ' + cfg.noun + ' as it stands now.' },
            { role: 'approved', label: 'Approved by', namePath: 'people.approvedBy', statement: 'I approve this ' + cfg.noun + ' as it stands now.' }
        ];
        var SIGN_NOTE = 'Each sign-off records the date and time it was signed. Entries can change after that — the PDF snapshot shows both.';

        function numberOf(it) { return cfg.numberFormat ? cfg.numberFormat(it.no) : '#' + it.no; }
        function isOverdue(it) { return !!(cfg.dueField && !CLOSED[it.status] && it[cfg.dueField] && it[cfg.dueField] < today()); }
        function counts(r) {
            var c = { total: 0, overdue: 0, by: {} };
            cfg.statuses.forEach(function (s) { c.by[s[0]] = 0; });
            (r.data.items || []).forEach(function (it) { c.total++; c.by[it.status] = (c.by[it.status] || 0) + 1; if (isOverdue(it)) c.overdue++; });
            c.closed = cfg.statuses.reduce(function (a, s) { return a + (CLOSED[s[0]] ? c.by[s[0]] : 0); }, 0);
            c.notClosed = c.total - c.closed;
            return c;
        }
        function totals(r) { return (cfg.totals || []).map(function (t) { return [t.label, t.format(t.value(r.data.items || []))]; }); }
        function matches(it, f) { if (!f || f === 'all') return true; if (f === 'overdue') return isOverdue(it); return it.status === f; }
        function newItem(r) {
            var no = r.data.nextNo || ((r.data.items || []).length + 1);
            r.data.nextNo = no + 1;
            var it = { id: C.uid('lg'), no: no, status: cfg.statuses[0][0] };
            cfg.fields.forEach(function (f) { it[f.k] = f.type === 'chips' ? [] : (f.today ? today() : ''); });
            return it;
        }
        function fieldHtml(ui, b, f, it) {
            var p = b + '.' + f.k;
            if (f.type === 'seg') return ui.segment(p, f.label, f.options, { hint: f.hint, noClear: f.noClear });
            if (f.type === 'chips') return ui.choices(p, f.label, { options: f.options, customLabel: f.customLabel || 'Add another', hint: f.hint });
            return ui.text(p, f.label, { required: f.required, multiline: f.type === 'multiline', rows: f.rows || 3, type: f.type === 'date' ? 'date' : 'text',
                inputmode: (f.type === 'number' || f.type === 'money') ? 'decimal' : null, list: f.list ? 'ff-lg-' + f.k : null, placeholder: f.placeholder, hint: f.hint });
        }
        function itemBody(ui, b, it) {
            var h = '', half = [];
            function flush() { if (half.length) { h += '<div class="ff-grid2">' + half.join('') + '</div>'; half = []; } }
            cfg.fields.forEach(function (f) {
                if (f.showIf && !f.showIf(it)) return;
                if (f.heading) { flush(); h += '<h4 class="ff-lg-h">' + esc(f.heading) + '</h4>'; }
                if (f.k === '__status') { flush(); h += ui.segment(b + '.status', 'Status', cfg.statuses.map(function (s) { return [s[0], s[1]]; }), { noClear: true }); return; }
                var html = fieldHtml(ui, b, f, it);
                if (f.half) half.push(html); else { flush(); h += html; }
            });
            flush();
            return h;
        }
        function statusBadge(st) { return '<span class="ff-pl-badge ff-pl-badge--' + (CLOSED[st] ? 'complete' : (st === cfg.statuses[0][0] ? 'open' : 'progress')) + '">' + esc(STATUS_TEXT[st] || st) + '</span>'; }

        var schema = {
            type: cfg.type, mode: 'log', logHome: 'items',
            label: cfg.label, description: cfg.description, startLabel: cfg.startLabel, blankPdf: cfg.blankPdf,
            authorPath: 'project.preparedBy',
            prefix: function () { return cfg.prefix; },
            shortTitle: function () { return cfg.label; },
            docTitle: function () { return cfg.docTitle || cfg.label; },
            listMeta: function (r) {
                var c = counts(r);
                return c.total + ' ' + (c.total === 1 ? cfg.itemNoun : cfg.itemNounPlural) + ', ' + c.notClosed + ' ' + (cfg.notClosedWord || 'open') + (c.overdue ? ', ' + c.overdue + ' overdue' : '');
            },
            signoffRoles: ROLES,
            newData: function () {
                return {
                    project: { name: '', number: '', company: '', trade: '', location: '', date: today(), preparedBy: '' },
                    people: { reviewedBy: '', approvedBy: '' },
                    items: [], nextNo: 1,
                    closeout: { distributedTo: [], distributedDate: '', notes: '' },
                    signoff: {}
                };
            },
            onChange: function (r, path) {
                var m = /^items\.(\d+)\.status$/.exec(path);
                if (m && cfg.statusDates) {
                    var it = r.data.items[+m[1]], k = cfg.statusDates[it.status];
                    if (k && !it[k]) it[k] = today();
                }
            },
            sections: [
                {
                    id: 'project', title: 'Project',
                    render: function (r, ui) {
                        return ui.projectPicker() + '<div class="ff-grid2">' +
                            ui.text('project.name', 'Project name', { required: true }) + ui.text('project.number', 'Project #') +
                            ui.text('project.location', 'Location', { required: true }) + ui.text('project.company', 'Contractor') +
                            ui.text('project.preparedBy', (cfg.preparedLabel || 'Prepared by') + ' (name)', { required: true }) +
                            ui.text('project.date', cfg.dateLabel || 'Date', { type: 'date', required: true }) +
                            ui.text('people.reviewedBy', 'Reviewed by (name)', { hint: 'Optional.' }) + ui.text('people.approvedBy', 'Approved by (name)', { hint: 'Optional.' }) + '</div>';
                    },
                    review: function (r, rv) {
                        var p = r.data.project, pp = r.data.people;
                        return rv.fields([['Project', p.name, true], ['Project #', p.number], ['Location', p.location, true], ['Contractor', p.company],
                            [cfg.preparedLabel || 'Prepared by', p.preparedBy, true], [cfg.dateLabel || 'Date', C.formatDate(p.date), true], ['Reviewed by', pp.reviewedBy], ['Approved by', pp.approvedBy]]);
                    }
                },
                {
                    id: 'items', title: cfg.itemsTitle, intro: cfg.itemsIntro,
                    render: function (r, ui) {
                        var c = counts(r), f = r.ui.lgFilter || 'all', items = r.data.items || [], h = '';
                        cfg.fields.forEach(function (fd) {
                            if (!fd.list) return;
                            var vals = fd.list.slice();
                            items.forEach(function (it) { var v = trim(it[fd.k]); if (v && vals.indexOf(v) < 0) vals.push(v); });
                            h += '<datalist id="ff-lg-' + fd.k + '">' + vals.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
                        });
                        h += '<div class="ff-pl-stats" aria-label="Totals"><span><strong>' + c.total + '</strong> total</span>' +
                            cfg.statuses.map(function (s) { return '<span><strong>' + c.by[s[0]] + '</strong> ' + esc(s[1].toLowerCase()) + '</span>'; }).join('') +
                            (c.overdue ? '<span class="ff-pl-overdue"><strong>' + c.overdue + '</strong> overdue</span>' : '') +
                            totals(r).map(function (t) { return '<span>' + esc(t[0]) + ' <strong>' + esc(t[1]) + '</strong></span>'; }).join('') + '</div>';
                        h += '<button type="button" class="ff-btn ff-btn--primary ff-pl-add" data-action="lg-add">+ ' + esc(cfg.addLabel) + '</button>';
                        if (items.length) {
                            h += '<div class="ff-pl-filter" role="group" aria-label="Show entries">' + FILTERS.map(function (x) {
                                return '<button type="button" class="ff-btn-sm' + (f === x[0] ? ' ff-btn-sm--primary' : '') + '" data-action="lg-filter" data-v="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + esc(x[1]) + '</button>';
                            }).join('') + '</div>';
                        }
                        var shown = 0;
                        h += '<div class="ff-pl-list">';
                        items.forEach(function (it, i) {
                            if (!matches(it, f)) return;
                            shown++;
                            var od = isOverdue(it), extra = cfg.badges ? cfg.badges(it) : [];
                            h += '<details class="ff-pl-item is-' + (CLOSED[it.status] ? 'complete' : (it.status === cfg.statuses[0][0] ? 'open' : 'progress')) + (od ? ' is-overdue' : '') + '" id="ff-lg-' + it.id + '"' + (r.ui.lgOpen === it.id ? ' open' : '') + '>' +
                                '<summary><span class="ff-pl-no">' + esc(numberOf(it)) + '</span><span class="ff-pl-sum"><span class="ff-pl-loc">' + esc(snippet(cfg.title(it), 70) || 'Untitled') + '</span>' +
                                '<span class="ff-pl-desc">' + esc(snippet(cfg.subtitle(it), 80)) + '</span></span><span class="ff-pl-badges">' + statusBadge(it.status) +
                                extra.map(function (x) { return '<span class="ff-pl-badge ff-pl-badge--' + x[1] + '">' + esc(x[0]) + '</span>'; }).join('') +
                                (od ? '<span class="ff-pl-badge ff-pl-badge--overdue">Overdue</span>' : '') + '</span></summary>' +
                                '<div class="ff-pl-body">' + itemBody(ui, 'items.' + i, it) +
                                '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="lg-remove" data-index="' + i + '">Delete ' + esc(numberOf(it)) + '</button></div></details>';
                        });
                        h += '</div>';
                        if (!items.length) h += '<p class="ff-none">Nothing logged yet. Tap “' + esc(cfg.addLabel) + '” to start.</p>';
                        else if (!shown) h += '<p class="ff-none">No entries match this filter.</p>';
                        if (items.length > 4) h += '<button type="button" class="ff-btn ff-btn--ghost ff-pl-add" data-action="lg-add">+ ' + esc(cfg.addLabel) + '</button>';
                        return h;
                    },
                    review: function (r, rv) {
                        var items = r.data.items || [], c = counts(r);
                        if (!items.length) return '<p class="ff-none">Nothing logged yet.</p>';
                        return '<p class="ff-rv-text"><strong>' + c.total + ' ' + esc(cfg.itemNounPlural) + ': ' + cfg.statuses.map(function (s) { return c.by[s[0]] + ' ' + s[1].toLowerCase(); }).join(', ') +
                            (c.overdue ? ', ' + c.overdue + ' overdue' : '') + '</strong>' + totals(r).map(function (t) { return ' &middot; ' + esc(t[0]) + ' ' + esc(t[1]); }).join('') + '</p>' +
                            '<div class="ff-table-wrap"><table class="ff-table"><thead><tr><th scope="col">#</th>' + cfg.reviewColumns.map(function (col) { return '<th scope="col">' + esc(col[0]) + '</th>'; }).join('') +
                            '<th scope="col">Status</th></tr></thead><tbody>' + items.map(function (it) {
                                return '<tr><th scope="row" data-label="#">' + esc(numberOf(it)) + '</th>' + cfg.reviewColumns.map(function (col) {
                                    var v = col[1](it);
                                    return '<td data-label="' + esc(col[0]) + '">' + (col[2] && !trim(v) ? '<span class="ff-missing">Missing</span>' : esc(v)).replace(/\n/g, '<br>') + '</td>';
                                }).join('') + '<td data-label="Status">' + (isOverdue(it) ? '<strong class="ff-ck-badtext">' + esc(STATUS_TEXT[it.status]) + ' (overdue)</strong>' : esc(STATUS_TEXT[it.status])) + '</td></tr>';
                            }).join('') + '</tbody></table></div>';
                    }
                },
                {
                    id: 'notes', title: 'Distribution & Notes',
                    render: function (r, ui) {
                        return ui.choices('closeout.distributedTo', 'Distributed to', { options: cfg.distribution, customLabel: 'Add another recipient' }) +
                            ui.text('closeout.distributedDate', 'Date distributed', { type: 'date' }) +
                            ui.text('closeout.notes', 'Additional notes / comments', { multiline: true, rows: 4 });
                    },
                    review: function (r, rv) {
                        var co = r.data.closeout;
                        return rv.fields([['Distributed to', co.distributedTo.join(', ')], ['Date distributed', C.formatDate(co.distributedDate)], ['Notes', co.notes]]);
                    }
                },
                {
                    id: 'signoff', title: 'Sign-Offs', intro: SIGN_NOTE,
                    render: function (r, ui) { return ROLES.map(function (ro) { return ui.signoff(ro.role, ro.label, ro.namePath, 'Project'); }).join(''); },
                    review: function (r, rv) { return rv.signoffs(r, ROLES); }
                }
            ],
            validate: function (r) {
                var out = [], d = r.data;
                [['project.name', 'Project name is required'], ['project.location', 'Location is required'], ['project.preparedBy', (cfg.preparedLabel || 'Prepared by') + ' (name) is required'], ['project.date', (cfg.dateLabel || 'Date') + ' is required']]
                    .forEach(function (p) { if (C.isBlank(C.getPath(d, p[0]))) out.push({ sec: 'project', id: fid(p[0]), msg: p[1] }); });
                (d.items || []).forEach(function (it, i) {
                    cfg.fields.forEach(function (f) {
                        if (f.required && (!f.showIf || f.showIf(it)) && C.isBlank(it[f.k])) out.push({ sec: 'items', id: fid('items.' + i + '.' + f.k), msg: numberOf(it) + ': ' + f.label.toLowerCase() + ' is required' });
                    });
                    if (isOverdue(it)) out.push({ sec: 'items', id: fid('items.' + i + '.' + cfg.dueField), msg: numberOf(it) + ' is past its ' + cfg.dueLabel, level: 'warn' });
                    (cfg.warnings ? cfg.warnings(it) : []).forEach(function (w) { out.push({ sec: 'items', id: fid('items.' + i + '.' + w[1]), msg: numberOf(it) + ': ' + w[0], level: 'warn' }); });
                });
                if (!(d.items || []).length) out.push({ sec: 'items', msg: 'Nothing logged yet', level: 'warn' });
                return out;
            },
            actions: {
                'lg-add': function (r, el, x) {
                    var it = newItem(r);
                    r.data.items.push(it);
                    r.ui.lgOpen = it.id;
                    if (r.ui.lgFilter && r.ui.lgFilter !== 'all' && r.ui.lgFilter !== it.status) r.ui.lgFilter = 'all';
                    x.changed(true);
                    x.focusLater(fid('items.' + (r.data.items.length - 1) + '.' + cfg.firstField));
                },
                'lg-remove': function (r, el, x) {
                    var i = parseInt(el.getAttribute('data-index'), 10), it = r.data.items[i];
                    if (!it || !root.confirm('Delete ' + numberOf(it) + (trim(cfg.title(it)) ? ' (' + snippet(cfg.title(it), 40) + ')' : '') + '? This cannot be undone.')) return;
                    r.data.items.splice(i, 1);
                    x.changed(true);
                    x.focusLater('ff-sec-title');
                },
                'lg-filter': function (r, el, x) {
                    r.ui.lgFilter = el.getAttribute('data-v');
                    x.changed(true);
                    setTimeout(function () { var b = document.querySelector('[data-action="lg-filter"][data-v="' + r.ui.lgFilter + '"]'); if (b) b.focus(); }, 0);
                }
            },
            summary: function (r) {
                var d = r.data, c = counts(r), L = [];
                L.push(cfg.label + ' ' + (r.logNo || '') + ' - status as of ' + C.formatStamp(new Date().toISOString()));
                L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
                L.push(c.total + ' ' + cfg.itemNounPlural + ': ' + cfg.statuses.map(function (s) { return c.by[s[0]] + ' ' + s[1].toLowerCase(); }).join(', ') + (c.overdue ? ', ' + c.overdue + ' overdue' : ''));
                totals(r).forEach(function (t) { L.push(t[0] + ': ' + t[1]); });
                var open = (d.items || []).filter(function (it) { return !CLOSED[it.status]; });
                if (open.length) {
                    L.push('');
                    L.push((cfg.notClosedWord ? cfg.notClosedWord.charAt(0).toUpperCase() + cfg.notClosedWord.slice(1) : 'Open') + ':');
                    open.slice(0, 25).forEach(function (it) { L.push(numberOf(it) + ' ' + snippet(cfg.title(it), 70) + ' [' + STATUS_TEXT[it.status] + ']' + (isOverdue(it) ? ' OVERDUE' : '')); });
                    if (open.length > 25) L.push('...and ' + (open.length - 25) + ' more (see the PDF or spreadsheet).');
                }
                return L.join('\n');
            },
            csv: function (r) {
                return {
                    header: ['#'].concat(cfg.csvColumns.map(function (c) { return c[0]; })).concat(['Status', 'Overdue']),
                    rows: (r.data.items || []).map(function (it) {
                        return [numberOf(it)].concat(cfg.csvColumns.map(function (c) { return c[1](it); })).concat([STATUS_TEXT[it.status] || '', isOverdue(it) ? 'Yes' : '']);
                    })
                };
            },
            pdf: function (r, doc, h) {
                var d = r.data, p = d.project, pp = d.people, co = d.closeout, c = counts(r);
                doc.section('Project');
                doc.fields([['Project', p.name], ['Project #', p.number], ['Location', p.location], ['Contractor', p.company], [cfg.preparedLabel || 'Prepared by', p.preparedBy],
                    [cfg.dateLabel || 'Date', C.formatDate(p.date)], ['Reviewed by', pp.reviewedBy], ['Approved by', pp.approvedBy]].filter(function (x) { return trim(x[1]); }), 3);
                doc.section('Summary');
                var sum = [['Total', String(c.total)]].concat(cfg.statuses.map(function (s) { return [s[1], String(c.by[s[0]])]; }));
                if (cfg.dueField) sum.push(['Overdue', String(c.overdue)]);
                doc.fields(sum, Math.min(sum.length, 6));
                if (totals(r).length) doc.fields(totals(r), Math.min(totals(r).length, 3));
                doc.section(cfg.itemsTitle, 80);
                if (!(d.items || []).length) doc.paragraph('Nothing logged.', { font: 'I' });
                else doc.table([{ title: '#', w: cfg.numberWidth || 0.07 }].concat(cfg.pdfColumns.map(function (col) { return { title: col[0], w: col[1] }; })),
                    d.items.map(function (it) {
                        return [{ parts: [{ t: numberOf(it), b: true }] }].concat(cfg.pdfColumns.map(function (col) {
                            var v = col[2](it, { status: STATUS_TEXT[it.status] + (isOverdue(it) ? ' (OVERDUE)' : ''), overdue: isOverdue(it), closed: !!CLOSED[it.status] });
                            return typeof v === 'string' ? v : v;
                        }));
                    }));
                var cf = [['Distributed to', co.distributedTo.join(', ')], ['Date distributed', C.formatDate(co.distributedDate)]].filter(function (x) { return trim(x[1]); });
                if (cf.length || trim(co.notes)) {
                    doc.section('Distribution and notes');
                    if (cf.length) doc.fields(cf, 2);
                    if (trim(co.notes)) doc.paragraph(co.notes);
                }
                doc.section('Sign-offs', 70);
                doc.paragraph(SIGN_NOTE, { size: 8.5, font: 'I' });
                h.parts.signoffs(doc, r, ROLES, h.cache);
            }
        };
        return schema;
    }

    root.BAFF.logs = { define: define, num: num, money: money, pad3: pad3 };
})(typeof window !== 'undefined' ? window : this);

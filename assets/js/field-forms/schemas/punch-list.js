/*
 * Builder Ascent Field Forms - Punch List (v1)
 * A living log: stays open while items are added, worked and closed. No finalize/lock.
 * Export a PDF status snapshot or a CSV spreadsheet at any time. Fields come from the
 * existing Builder Ascent Punch List (public/downloads/punch_list.pdf).
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }

    var STATUS = [['open', 'Open'], ['progress', 'In progress'], ['complete', 'Complete']];
    var STATUS_TEXT = { open: 'Open', progress: 'In progress', complete: 'Complete' };
    var PRIORITY = [['high', 'High'], ['med', 'Medium'], ['low', 'Low']];
    var PRIORITY_TEXT = { high: 'High', med: 'Medium', low: 'Low' };
    var TRADES = ['Drywall', 'Paint', 'Electrical', 'Plumbing', 'HVAC / mechanical', 'Fire protection', 'Doors & hardware', 'Flooring', 'Ceilings', 'Millwork / casework', 'Glazing', 'Concrete', 'Masonry', 'Roofing', 'Low voltage', 'Specialties', 'Cleaning', 'Landscaping'];
    var DISTRIBUTION = ['Project Manager', 'Superintendent', 'Foreman', 'Subcontractor', 'Owner / Client', 'Architect / Engineer'];
    var FILTERS = [['all', 'All'], ['open', 'Open'], ['progress', 'In progress'], ['complete', 'Complete'], ['overdue', 'Overdue']];
    var SIGN_NOTE = 'Each sign-off records the date and time it was signed. Items can change after that — the PDF snapshot shows both.';

    function today() { return C.todayISO(); }
    function isOverdue(it) { return it.status !== 'complete' && it.target && it.target < today(); }
    function counts(r) {
        var c = { total: 0, open: 0, progress: 0, complete: 0, overdue: 0 };
        (r.data.items || []).forEach(function (it) { c.total++; c[it.status || 'open']++; if (isOverdue(it)) c.overdue++; });
        c.pct = c.total ? Math.round(c.complete / c.total * 100) : 0;
        return c;
    }
    function matches(it, f) {
        if (!f || f === 'all') return true;
        if (f === 'overdue') return isOverdue(it);
        return (it.status || 'open') === f;
    }
    function snippet(s, n) { s = trim(s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function newItem(r) {
        var no = r.data.nextNo || ((r.data.items || []).length + 1);
        r.data.nextNo = no + 1;
        return { id: C.uid('pi'), no: no, desc: '', loc: '', trade: '', assignedTo: '', priority: '', identified: today(), target: '',
            status: 'open', completedBy: '', completedDate: '', verifiedBy: '', verifiedDate: '', comments: '' };
    }
    function statusLine(it) {
        var t = STATUS_TEXT[it.status] || 'Open';
        if (it.status === 'complete') {
            if (it.completedDate || it.completedBy) t += ' ' + [C.formatDate(it.completedDate), it.completedBy ? 'by ' + it.completedBy : ''].filter(Boolean).join(' ');
            if (it.verifiedBy) t += '; verified by ' + it.verifiedBy + (it.verifiedDate ? ' ' + C.formatDate(it.verifiedDate) : '');
        }
        if (isOverdue(it)) t += ' (OVERDUE)';
        return t;
    }

    var punch = {
        type: 'punch',
        mode: 'log',
        logHome: 'items',
        label: 'Punch List',
        description: 'Walk the job, log every item with its location, trade and target date, and close items out as they’re done. Export a PDF or spreadsheet any time.',
        startLabel: 'Start a Punch List',
        blankPdf: '/public/downloads/punch_list.pdf',
        authorPath: 'project.preparedBy',
        prefix: function () { return 'PL'; },
        shortTitle: function () { return 'Punch List'; },
        docTitle: function () { return 'Punch List'; },
        listMeta: function (r) { var c = counts(r); return c.total + ' item' + (c.total === 1 ? '' : 's') + ', ' + (c.open + c.progress) + ' not complete' + (c.overdue ? ', ' + c.overdue + ' overdue' : ''); },
        signoffRoles: [
            { role: 'prepared', label: 'Prepared by', namePath: 'project.preparedBy', statement: 'I prepared this punch list.', required: true },
            { role: 'reviewed', label: 'Reviewed by', namePath: 'people.reviewedBy', statement: 'I reviewed this punch list as it stands now.' },
            { role: 'approved', label: 'Approved by', namePath: 'people.approvedBy', statement: 'I approve this punch list as it stands now.' }
        ],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: today(), preparedBy: '' },
                people: { reviewedBy: '', approvedBy: '' },
                items: [], nextNo: 1,
                closeout: { distributedTo: [], distributedDate: '', closedDate: '', closedBy: '', notes: '' },
                signoff: {}
            };
        },
        onChange: function (r, path) {
            var m = /^items\.(\d+)\.status$/.exec(path);
            if (m) { var it = r.data.items[+m[1]]; if (it && it.status === 'complete' && !it.completedDate) it.completedDate = today(); }
        },
        sections: [
            {
                id: 'project', title: 'Project',
                render: function (r, ui) {
                    return ui.projectPicker() + '<div class="ff-grid2">' +
                        ui.text('project.name', 'Project name', { required: true }) +
                        ui.text('project.number', 'Project #') +
                        ui.text('project.location', 'Location / building / area', { required: true }) +
                        ui.text('project.company', 'Contractor') +
                        ui.text('project.preparedBy', 'Prepared by (name)', { required: true }) +
                        ui.text('project.date', 'Date prepared', { type: 'date', required: true }) +
                        ui.text('people.reviewedBy', 'Reviewed by (name)', { hint: 'Optional.' }) +
                        ui.text('people.approvedBy', 'Approved by (name)', { hint: 'Optional.' }) + '</div>';
                },
                review: function (r, rv) {
                    var p = r.data.project, pp = r.data.people;
                    return rv.fields([['Project', p.name, true], ['Project #', p.number], ['Location / building / area', p.location, true], ['Contractor', p.company],
                        ['Prepared by', p.preparedBy, true], ['Date prepared', C.formatDate(p.date), true], ['Reviewed by', pp.reviewedBy], ['Approved by', pp.approvedBy]]);
                }
            },
            {
                id: 'items', title: 'Punch Items',
                intro: 'Add an item for each thing that needs fixing. Tap an item to open it; change its status as work moves along.',
                render: function (r, ui) {
                    var c = counts(r), f = r.ui.plFilter || 'all', items = r.data.items || [];
                    var trades = TRADES.slice();
                    items.forEach(function (it) { if (trim(it.trade) && trades.indexOf(trim(it.trade)) < 0) trades.push(trim(it.trade)); });
                    var h = '<datalist id="ff-pl-trades">' + trades.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
                    h += '<div class="ff-pl-stats" aria-label="Punch list totals"><span><strong>' + c.total + '</strong> total</span><span><strong>' + c.open + '</strong> open</span><span><strong>' + c.progress +
                        '</strong> in progress</span><span><strong>' + c.complete + '</strong> complete</span><span><strong>' + c.pct + '%</strong> done</span>' +
                        (c.overdue ? '<span class="ff-pl-overdue"><strong>' + c.overdue + '</strong> overdue</span>' : '') + '</div>';
                    h += '<button type="button" class="ff-btn ff-btn--primary ff-pl-add" data-action="pl-add">+ Add punch item</button>';
                    if (items.length) {
                        h += '<div class="ff-pl-filter" role="group" aria-label="Show items">' + FILTERS.map(function (x) {
                            return '<button type="button" class="ff-btn-sm' + (f === x[0] ? ' ff-btn-sm--primary' : '') + '" data-action="pl-filter" data-v="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>';
                        }).join('') + '</div>';
                    }
                    var shown = 0;
                    h += '<div class="ff-pl-list">';
                    items.forEach(function (it, i) {
                        if (!matches(it, f)) return;
                        shown++;
                        var b = 'items.' + i, st = it.status || 'open', od = isOverdue(it);
                        h += '<details class="ff-pl-item is-' + st + (od ? ' is-overdue' : '') + '" id="ff-pl-' + it.id + '"' + (r.ui.plOpen === it.id ? ' open' : '') + '>' +
                            '<summary><span class="ff-pl-no">#' + it.no + '</span><span class="ff-pl-sum"><span class="ff-pl-loc">' + esc(trim(it.loc) || 'No location yet') + '</span>' +
                            '<span class="ff-pl-desc">' + esc(snippet(it.desc, 70) || 'No description yet') + '</span></span>' +
                            '<span class="ff-pl-badges"><span class="ff-pl-badge ff-pl-badge--' + st + '">' + STATUS_TEXT[st] + '</span>' +
                            (it.priority === 'high' ? '<span class="ff-pl-badge ff-pl-badge--high">High</span>' : '') + (od ? '<span class="ff-pl-badge ff-pl-badge--overdue">Overdue</span>' : '') + '</span></summary>' +
                            '<div class="ff-pl-body">' +
                            ui.text(b + '.desc', 'Description of item', { required: true, multiline: true, rows: 2 }) +
                            '<div class="ff-grid2">' + ui.text(b + '.loc', 'Location / area', { required: true, placeholder: 'e.g. Room 204, east wall' }) +
                            ui.text(b + '.trade', 'Trade responsible', { list: 'ff-pl-trades' }) +
                            ui.text(b + '.assignedTo', 'Assigned to') +
                            ui.text(b + '.identified', 'Date identified', { type: 'date' }) +
                            ui.text(b + '.target', 'Target completion date', { type: 'date' }) + '</div>' +
                            ui.segment(b + '.priority', 'Priority', PRIORITY, { hint: 'Optional.' }) +
                            ui.segment(b + '.status', 'Status', STATUS, { noClear: true }) +
                            (st === 'complete' ? '<div class="ff-grid2">' + ui.text(b + '.completedBy', 'Work completed by') + ui.text(b + '.completedDate', 'Date completed', { type: 'date' }) +
                                ui.text(b + '.verifiedBy', 'Verified by') + ui.text(b + '.verifiedDate', 'Verification date', { type: 'date' }) + '</div>' : '') +
                            ui.text(b + '.comments', 'Comments', { multiline: true, rows: 2 }) +
                            '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="pl-remove" data-index="' + i + '">Delete item #' + it.no + '</button>' +
                            '</div></details>';
                    });
                    h += '</div>';
                    if (!items.length) h += '<p class="ff-none">No items yet. Tap “Add punch item” to start.</p>';
                    else if (!shown) h += '<p class="ff-none">No items match this filter.</p>';
                    if (items.length > 4) h += '<button type="button" class="ff-btn ff-btn--ghost ff-pl-add" data-action="pl-add">+ Add punch item</button>';
                    return h;
                },
                review: function (r, rv) {
                    var c = counts(r), items = r.data.items || [];
                    if (!items.length) return '<p class="ff-none">No items yet.</p>';
                    return '<p class="ff-rv-text"><strong>' + c.total + ' items: ' + c.open + ' open, ' + c.progress + ' in progress, ' + c.complete + ' complete (' + c.pct + '% done)' + (c.overdue ? ', ' + c.overdue + ' overdue' : '') + '</strong></p>' +
                        '<div class="ff-table-wrap"><table class="ff-table"><thead><tr><th scope="col">#</th><th scope="col">Item</th><th scope="col">Location</th><th scope="col">Trade / assigned</th><th scope="col">Priority</th><th scope="col">Target</th><th scope="col">Status</th></tr></thead><tbody>' +
                        items.map(function (it) {
                            return '<tr><th scope="row" data-label="#">' + it.no + '</th><td data-label="Item">' + (trim(it.desc) ? esc(it.desc) : '<span class="ff-missing">Missing</span>') + (trim(it.comments) ? '<br><em>' + esc(it.comments) + '</em>' : '') + '</td>' +
                                '<td data-label="Location">' + (trim(it.loc) ? esc(it.loc) : '<span class="ff-missing">Missing</span>') + '</td>' +
                                '<td data-label="Trade / assigned">' + esc([it.trade, it.assignedTo].filter(function (x) { return trim(x); }).join(' / ')) + '</td>' +
                                '<td data-label="Priority">' + (PRIORITY_TEXT[it.priority] || '') + '</td><td data-label="Target">' + esc(C.formatDate(it.target)) + '</td>' +
                                '<td data-label="Status">' + (isOverdue(it) ? '<strong class="ff-ck-badtext">' + esc(statusLine(it)) + '</strong>' : esc(statusLine(it))) + '</td></tr>';
                        }).join('') + '</tbody></table></div>';
                }
            },
            {
                id: 'closeout', title: 'Distribution & Close-Out',
                render: function (r, ui) {
                    var c = counts(r), allDone = c.total && c.complete === c.total;
                    return ui.choices('closeout.distributedTo', 'Distributed to', { options: DISTRIBUTION, customLabel: 'Add another recipient' }) +
                        ui.text('closeout.distributedDate', 'Date distributed', { type: 'date' }) +
                        '<h3 class="ff-h3">Close-out</h3>' +
                        '<p class="ff-rv-text"><strong>All items complete: ' + (allDone ? 'Yes' : 'No') + '</strong>' + (c.total && !allDone ? ' (' + (c.total - c.complete) + ' not complete)' : '') + (c.total ? '' : ' (no items yet)') + '</p>' +
                        '<div class="ff-grid2">' + ui.text('closeout.closedDate', 'Date closed', { type: 'date' }) + ui.text('closeout.closedBy', 'Closed by') + '</div>' +
                        ui.text('closeout.notes', 'Closure notes', { multiline: true, rows: 3 });
                },
                review: function (r, rv) {
                    var co = r.data.closeout, c = counts(r);
                    return rv.fields([['Distributed to', co.distributedTo.join(', ')], ['Date distributed', C.formatDate(co.distributedDate)],
                        ['All items complete', c.total ? (c.complete === c.total ? 'Yes' : 'No (' + (c.total - c.complete) + ' not complete)') : ''],
                        ['Date closed', C.formatDate(co.closedDate)], ['Closed by', co.closedBy], ['Closure notes', co.notes]]);
                }
            },
            {
                id: 'signoff', title: 'Sign-Offs', intro: SIGN_NOTE,
                render: function (r, ui) {
                    return ui.signoff('prepared', 'Prepared by', 'project.preparedBy', 'Project') +
                        ui.signoff('reviewed', 'Reviewed by', 'people.reviewedBy', 'Project') +
                        ui.signoff('approved', 'Approved by', 'people.approvedBy', 'Project');
                },
                review: function (r, rv) { return rv.signoffs(r, punch.signoffRoles); }
            }
        ],
        validate: function (r) {
            var out = [], d = r.data;
            [['project.name', 'Project name is required'], ['project.location', 'Location / building / area is required'], ['project.preparedBy', 'Prepared by (name) is required'], ['project.date', 'Date prepared is required']]
                .forEach(function (p) { if (C.isBlank(C.getPath(d, p[0]))) out.push({ sec: 'project', id: fid(p[0]), msg: p[1] }); });
            (d.items || []).forEach(function (it, i) {
                if (C.isBlank(it.desc)) out.push({ sec: 'items', id: fid('items.' + i + '.desc'), msg: 'Item #' + it.no + ': add a description' });
                if (C.isBlank(it.loc)) out.push({ sec: 'items', id: fid('items.' + i + '.loc'), msg: 'Item #' + it.no + ': add a location' });
                if (isOverdue(it)) out.push({ sec: 'items', id: fid('items.' + i + '.target'), msg: 'Item #' + it.no + ' is past its target date', level: 'warn' });
            });
            if (!(d.items || []).length) out.push({ sec: 'items', msg: 'No punch items yet', level: 'warn' });
            var c = counts(r);
            if (d.closeout.closedDate && c.complete < c.total) out.push({ sec: 'closeout', id: fid('closeout.closedDate'), msg: 'A close date is set but ' + (c.total - c.complete) + ' item(s) are not complete', level: 'warn' });
            return out;
        },
        actions: {
            'pl-add': function (r, el, x) {
                var it = newItem(r);
                r.data.items.push(it);
                r.ui.plOpen = it.id;
                if (r.ui.plFilter && r.ui.plFilter !== 'all' && r.ui.plFilter !== 'open') r.ui.plFilter = 'all';
                x.changed(true);
                x.focusLater(fid('items.' + (r.data.items.length - 1) + '.desc'));
            },
            'pl-remove': function (r, el, x) {
                var i = parseInt(el.getAttribute('data-index'), 10), it = r.data.items[i];
                if (!it || !root.confirm('Delete punch item #' + it.no + (trim(it.desc) ? ' (' + snippet(it.desc, 40) + ')' : '') + '? This cannot be undone.')) return;
                r.data.items.splice(i, 1);
                x.changed(true);
                x.focusLater('ff-sec-title');
            },
            'pl-filter': function (r, el, x) {
                r.ui.plFilter = el.getAttribute('data-v');
                x.changed(true);
                x.focusLater(null);
                setTimeout(function () { var b = document.querySelector('[data-action="pl-filter"][data-v="' + r.ui.plFilter + '"]'); if (b) b.focus(); }, 0);
            }
        },
        summary: function (r) {
            var d = r.data, c = counts(r), L = [];
            L.push('Punch List ' + (r.logNo || '') + ' - status as of ' + C.formatStamp(new Date().toISOString()));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            if (d.project.preparedBy) L.push('Prepared by: ' + d.project.preparedBy);
            L.push(c.total + ' items: ' + c.open + ' open, ' + c.progress + ' in progress, ' + c.complete + ' complete (' + c.pct + '% done)' + (c.overdue ? ', ' + c.overdue + ' overdue' : ''));
            var notDone = (d.items || []).filter(function (it) { return it.status !== 'complete'; });
            if (notDone.length) {
                L.push('');
                L.push('Not complete:');
                notDone.slice(0, 25).forEach(function (it) {
                    L.push('#' + it.no + ' ' + (it.loc ? it.loc + ' - ' : '') + snippet(it.desc, 80) + (it.trade ? ' [' + it.trade + ']' : '') + (it.target ? ' target ' + C.formatDate(it.target) : '') + (isOverdue(it) ? ' OVERDUE' : ''));
                });
                if (notDone.length > 25) L.push('...and ' + (notDone.length - 25) + ' more (see the PDF or spreadsheet).');
            }
            return L.join('\n');
        },
        csv: function (r) {
            return {
                header: ['Item #', 'Description', 'Location / area', 'Trade responsible', 'Assigned to', 'Priority', 'Date identified', 'Target completion', 'Status', 'Overdue',
                    'Work completed by', 'Date completed', 'Verified by', 'Verification date', 'Comments'],
                rows: (r.data.items || []).map(function (it) {
                    return [it.no, it.desc, it.loc, it.trade, it.assignedTo, PRIORITY_TEXT[it.priority] || '', it.identified, it.target, STATUS_TEXT[it.status] || 'Open', isOverdue(it) ? 'Yes' : '',
                        it.completedBy, it.completedDate, it.verifiedBy, it.verifiedDate, it.comments];
                })
            };
        },
        pdf: function (r, doc, h) {
            var d = r.data, p = d.project, pp = d.people, co = d.closeout, c = counts(r), P = h.parts;
            doc.section('Project');
            doc.fields([['Project', p.name], ['Project #', p.number], ['Location / building / area', p.location], ['Contractor', p.company], ['Prepared by', p.preparedBy],
                ['Date prepared', C.formatDate(p.date)], ['Reviewed by', pp.reviewedBy], ['Approved by', pp.approvedBy]].filter(function (x) { return trim(x[1]); }), 3);
            doc.section('Summary');
            doc.fields([['Total items', String(c.total)], ['Open', String(c.open)], ['In progress', String(c.progress)], ['Complete', String(c.complete)], ['Completion', c.pct + '%']]
                .concat(c.overdue ? [['Overdue', String(c.overdue)]] : []), c.overdue ? 6 : 5);
            doc.section('Punch items', 80);
            if (!(d.items || []).length) doc.paragraph('No items.', { font: 'I' });
            else doc.table([{ title: '#', w: 0.05 }, { title: 'Item / comments', w: 0.3 }, { title: 'Location', w: 0.15 }, { title: 'Trade / assigned', w: 0.14 }, { title: 'Priority', w: 0.08 },
                { title: 'Identified / target', w: 0.12 }, { title: 'Status', w: 0.16 }],
                d.items.map(function (it) {
                    return [{ parts: [{ t: String(it.no), b: true }] },
                        { parts: [{ t: it.desc || '' }].concat(trim(it.comments) ? [{ t: 'Note: ' + it.comments, i: true }] : []) },
                        it.loc || '', [it.trade, it.assignedTo].filter(function (x) { return trim(x); }).join(' / '), PRIORITY_TEXT[it.priority] || '',
                        [it.identified ? 'Found ' + C.formatDate(it.identified) : '', it.target ? 'Target ' + C.formatDate(it.target) : ''].filter(Boolean).join('\n'),
                        { parts: [{ t: statusLine(it), b: it.status !== 'complete' }] }];
                }));
            var cf = [['Distributed to', co.distributedTo.join(', ')], ['Date distributed', C.formatDate(co.distributedDate)], ['Date closed', C.formatDate(co.closedDate)], ['Closed by', co.closedBy]].filter(function (x) { return trim(x[1]); });
            if (cf.length || trim(co.notes)) {
                doc.section('Distribution and close-out');
                if (cf.length) doc.fields(cf, 2);
                if (trim(co.notes)) doc.paragraph(co.notes);
            }
            doc.section('Sign-offs', 70);
            doc.paragraph(SIGN_NOTE, { size: 8.5, font: 'I' });
            P.signoffs(doc, r, punch.signoffRoles, h.cache);
        }
    };

    A.register(punch);
})(typeof window !== 'undefined' ? window : this);

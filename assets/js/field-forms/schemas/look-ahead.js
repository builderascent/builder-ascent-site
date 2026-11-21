/*
 * Builder Ascent Field Forms - 3-Week Look-Ahead (v1)
 * A living plan (log mode): activities with dates, crew, responsible person and open constraints,
 * shown as a 3-week bar view on screen and in the PDF snapshot. Built on BAFF.logs.define.
 * "Week 1 starts" is the Monday the look-ahead begins; "Roll forward one week" moves it for the weekly update.
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app, L = BAFF.logs;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }

    var TRADES = ['General / carpentry', 'Concrete', 'Masonry', 'Steel', 'Framing / drywall', 'Electrical', 'Plumbing', 'HVAC / mechanical', 'Fire protection', 'Roofing', 'Glazing', 'Painting', 'Flooring', 'Site / earthwork'];
    var CONSTRAINTS = ['Materials', 'Equipment', 'Manpower', 'Inspection', 'Design / RFI', 'Submittal', 'Permit', 'Predecessor work', 'Access / space', 'Weather'];
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    // ---- dates (ISO yyyy-mm-dd, local time) ----
    function parse(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
    function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
    function monday(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
    function short(d) { return MON[d.getMonth()] + ' ' + d.getDate(); }
    function dayLabel(isoStr) { var d = parse(isoStr); return d ? DOW[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate() : ''; }
    function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

    function workdaySet(r) { return r.data.project.days === '6' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]; }
    function windowStart(r) { var d = parse(r.data.project.date) || new Date(); return monday(d); }
    // the 3-week window as an array of { iso, d, week }
    function windowDays(r) {
        var start = windowStart(r), set = workdaySet(r), out = [];
        for (var i = 0; i < 21; i++) {
            var d = addDays(start, i);
            if (set.indexOf(d.getDay()) >= 0) out.push({ iso: iso(d), d: d, week: Math.floor(i / 7) });
        }
        return out;
    }
    function workdays(it, set) {
        var a = parse(it.start), b = parse(it.finish);
        if (!a || !b || b < a) return 0;
        var n = 0;
        for (var d = a; d <= b; d = addDays(d, 1)) if (set.indexOf(d.getDay()) >= 0) n++;
        return n;
    }
    function openConstraints(it) { return (it.constraints || []).filter(function (c) { return trim(c); }); }
    function datesText(it) {
        if (!it.start && !it.finish) return '';
        return dayLabel(it.start) + (it.finish && it.finish !== it.start ? ' – ' + dayLabel(it.finish) : '');
    }

    var cfg = {
        type: 'lookahead', prefix: 'LA', noun: 'look-ahead', itemNoun: 'activity', itemNounPlural: 'activities', notClosedWord: 'not done',
        label: '3-Week Look-Ahead', docTitle: '3-Week Look-Ahead Schedule',
        description: 'Plan the next three weeks: activities, crews, dates and what has to be ready first. Shows a 3-week bar view and makes a clean PDF for the coordination meeting.',
        startLabel: 'Start a Look-Ahead', addLabel: 'Add an activity', itemsTitle: 'Activities',
        itemsIntro: 'One entry per activity. Mark what is not ready yet so it gets cleared before the start date.',
        preparedLabel: 'Prepared by', dateLabel: 'Week 1 starts (Monday)',
        statuses: [['planned', 'Planned'], ['ready', 'Ready'], ['inprogress', 'In progress'], ['done', 'Done', 'closed'], ['delayed', 'Delayed']],
        dueField: 'finish', dueLabel: 'finish date', firstField: 'activity',
        numberFormat: function (n) { return 'A' + L.pad3(n); },
        distribution: ['Superintendent', 'Project manager', 'Foremen', 'Subcontractors', 'Owner rep'],
        fields: [
            { k: 'activity', label: 'Activity / task', required: true, placeholder: 'e.g. Frame level 2 walls, grids A-D' },
            { k: 'area', label: 'Area / location', half: true },
            { k: 'trade', label: 'Crew / trade', half: true, list: TRADES },
            { k: 'start', label: 'Start', type: 'date', half: true, required: true },
            { k: 'finish', label: 'Finish', type: 'date', half: true, required: true },
            { k: 'crew', label: 'Crew size', type: 'number', half: true },
            { k: 'responsible', label: 'Responsible', half: true },
            { k: '__status', heading: 'Status' },
            { k: 'constraints', label: 'Not ready yet (open constraints)', type: 'chips', options: CONSTRAINTS, customLabel: 'Add another constraint', hint: 'Select what still has to be cleared before this can start. Leave empty when it is ready to go.', heading: 'Ready to start?' },
            { k: 'constraintNotes', label: 'Constraint notes', type: 'multiline', rows: 2, placeholder: 'e.g. Inspection requested for Tue 11/24; RFI-012 open' },
            { k: 'notes', label: 'Notes', type: 'multiline', rows: 2 }
        ],
        title: function (it) { return it.activity; },
        subtitle: function (it) { return [datesText(it), trim(it.trade), trim(it.area)].filter(Boolean).join(' · '); },
        badges: function (it) { var n = it.status === 'done' ? 0 : openConstraints(it).length; return n ? [[n + ' not ready', 'overdue']] : []; },
        warnings: function (it) {
            var w = [], s = parse(it.start), f = parse(it.finish), today = parse(C.todayISO());
            if (s && f && f < s) w.push(['finish is before start', 'finish']);
            if (it.status !== 'done' && openConstraints(it).length && s) {
                var days = daysBetween(today, s);
                if (days <= 7) w.push([(days < 0 ? 'started' : days === 0 ? 'starts today' : 'starts in ' + days + ' day' + (days === 1 ? '' : 's')) + ' with open constraints: ' + openConstraints(it).join(', '), 'constraints']);
            }
            if ((it.status === 'ready' || it.status === 'inprogress') && openConstraints(it).length) w.push(['marked ' + (it.status === 'ready' ? 'Ready' : 'In progress') + ' but still has open constraints', 'constraints']);
            return w;
        },
        reviewColumns: [['Activity', function (it) { return it.activity; }, true], ['Dates', datesText], ['Crew / trade', function (it) { return [trim(it.trade), it.crew ? it.crew + ' workers' : ''].filter(Boolean).join(', '); }],
            ['Not ready yet', function (it) { return openConstraints(it).join(', '); }]],
        csvColumns: [['Activity', function (it) { return it.activity; }], ['Area', function (it) { return it.area; }], ['Crew / trade', function (it) { return it.trade; }],
            ['Start', function (it) { return it.start; }], ['Finish', function (it) { return it.finish; }], ['Crew size', function (it) { return it.crew; }],
            ['Responsible', function (it) { return it.responsible; }], ['Open constraints', function (it) { return openConstraints(it).join('; '); }],
            ['Constraint notes', function (it) { return it.constraintNotes; }], ['Notes', function (it) { return it.notes; }]],
        numberWidth: 0.07,
        pdfColumns: [
            ['Activity', 0.30, function (it) { return { parts: [{ t: trim(it.activity) || '-', b: true }].concat(trim(it.area) || trim(it.trade) ? [{ t: [trim(it.trade), trim(it.area)].filter(Boolean).join(' · '), g: 0.35 }] : []) }; }],
            ['Dates', 0.16, function (it) { return datesText(it) || '-'; }],
            ['Crew / resp.', 0.14, function (it) { return [it.crew ? it.crew + ' workers' : '', trim(it.responsible)].filter(Boolean).join('\n') || '-'; }],
            ['Not ready yet', 0.21, function (it) { var c = openConstraints(it); return c.length && it.status !== 'done' ? { parts: [{ t: c.join(', '), b: true }].concat(trim(it.constraintNotes) ? [{ t: it.constraintNotes, g: 0.35 }] : []) } : (it.status === 'done' ? '-' : 'Ready'); }],
            ['Status', 0.12, function (it, s) { return s.overdue ? { parts: [{ t: s.status, b: true }] } : s.status; }]
        ]
    };

    var schema = L.define(cfg);

    // ---- data: default to this week's Monday and a 5-day week ----
    var baseNew = schema.newData;
    schema.newData = function () { var d = baseNew(); d.project.date = iso(monday(new Date())); d.project.days = '5'; return d; };
    schema.listTitle = function (r) { var s = windowStart(r); return '3-Week Look-Ahead · from ' + short(s); };
    schema.rerenderOn = function (path) { return path === 'project.date'; };

    // ---- project section: workweek choice + roll forward ----
    var proj = schema.sections[0], baseRender = proj.render;
    proj.render = function (r, ui) {
        var s = windowStart(r), e = addDays(s, 20);
        return baseRender(r, ui) +
            ui.segment('project.days', 'Work days shown', [['5', 'Mon – Fri'], ['6', 'Mon – Sat']], { noClear: true }) +
            '<div class="ff-la-window"><p><strong>This look-ahead covers ' + esc(short(s)) + ' – ' + esc(short(e)) + '.</strong> Each week, tap <em>Roll forward one week</em> and update the dates and statuses.</p>' +
            '<button type="button" class="ff-btn-sm" data-action="la-roll" data-dir="-1">&larr; Back a week</button> ' +
            '<button type="button" class="ff-btn-sm ff-btn-sm--primary" data-action="la-roll" data-dir="1">Roll forward one week &rarr;</button></div>';
    };
    schema.actions['la-roll'] = function (r, el, x) {
        var dir = parseInt(el.getAttribute('data-dir'), 10) || 1;
        r.data.project.date = iso(addDays(windowStart(r), 7 * dir));
        x.changed(true);
    };

    // ---- 3-week view (screen) ----
    function placed(r) {
        var days = windowDays(r), first = days[0].iso, last = days[days.length - 1].iso;
        var items = (r.data.items || []).slice(), inWin = [], noDates = 0, outside = 0;
        items.forEach(function (it) {
            if (!it.start || !it.finish || it.finish < it.start) { noDates++; return; }
            if (it.finish < first || it.start > last) { outside++; return; }
            inWin.push(it);
        });
        inWin.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : (a.no - b.no); });
        return { days: days, items: inWin, noDates: noDates, outside: outside };
    }
    function gridHtml(r) {
        var g = placed(r), today = C.todayISO(), per = workdaySet(r).length;
        var h = '';
        if (!g.items.length) {
            h += '<p class="ff-none">No activities fall in these three weeks yet. Add activities with start and finish dates.</p>';
        } else {
            h += '<div class="ff-la-wrap" tabindex="0" aria-label="3-week view, scrolls sideways"><table class="ff-la"><thead><tr><th class="ff-la-act" rowspan="2" scope="col">Activity</th>';
            for (var w = 0; w < 3; w++) h += '<th colspan="' + per + '" scope="colgroup" class="ff-la-wk">Week ' + (w + 1) + ' · ' + esc(short(addDays(windowStart(r), 7 * w))) + '</th>';
            h += '</tr><tr>' + g.days.map(function (d, i) {
                return '<th scope="col" class="ff-la-day' + (d.iso === today ? ' is-today' : '') + (i % per === 0 ? ' is-wk' : '') + '"><span>' + LETTER[d.d.getDay()] + '</span>' + d.d.getDate() + '</th>';
            }).join('') + '</tr></thead><tbody>';
            g.items.forEach(function (it) {
                var open = it.status !== 'done' && openConstraints(it).length, flagged = false;
                h += '<tr><th scope="row" class="ff-la-act"><span class="ff-la-no">' + esc(cfg.numberFormat(it.no)) + '</span> ' + esc(trim(it.activity) || 'Untitled') +
                    (trim(it.trade) || trim(it.area) ? '<small>' + esc([trim(it.trade), trim(it.area)].filter(Boolean).join(' · ')) + '</small>' : '') + '</th>';
                g.days.forEach(function (d, i) {
                    var on = d.iso >= it.start && d.iso <= it.finish;
                    var mark = on && open && !flagged ? (flagged = true, '!') : '';
                    h += '<td class="' + (on ? 'on s-' + it.status : '') + (d.iso === today ? ' is-today' : '') + (i % per === 0 ? ' is-wk' : '') + '"' +
                        (on ? ' title="' + esc(trim(it.activity) + ' · ' + d.iso) + '"' : '') + '>' + mark + '</td>';
                });
                h += '</tr>';
            });
            h += '</tbody></table></div>';
        }
        h += '<ul class="ff-la-legend" aria-label="Legend"><li><span class="s-planned"></span>Planned</li><li><span class="s-ready"></span>Ready</li><li><span class="s-inprogress"></span>In progress</li>' +
            '<li><span class="s-done"></span>Done</li><li><span class="s-delayed"></span>Delayed</li><li><b>!</b> Not ready yet</li></ul>';
        var notes = [];
        if (g.outside) notes.push(g.outside + ' ' + (g.outside === 1 ? 'activity falls' : 'activities fall') + ' outside these three weeks.');
        if (g.noDates) notes.push(g.noDates + ' ' + (g.noDates === 1 ? 'activity needs' : 'activities need') + ' a start and finish date.');
        if (notes.length) h += '<p class="ff-hint">' + esc(notes.join(' ')) + '</p>';
        return h;
    }
    schema.sections.splice(2, 0, {
        id: 'grid', title: '3-Week View',
        intro: 'Bars show each activity\'s working days. Scroll sideways on a phone. Today is outlined.',
        render: function (r) { return gridHtml(r); },
        review: function (r) { return gridHtml(r); }
    });

    // ---- 3-week view (PDF): drawn before the activities table ----
    function drawGrid(doc, r) {
        var P = BAFF.pdf, E = P.encode, M = 36, W = P.CONTENT_W, g = placed(r), per = workdaySet(r).length;
        var cNo = 0.06 * W, cAct = 0.28 * W, gx = M + cNo + cAct, cw = (W - cNo - cAct) / g.days.length, HEAD = 30;
        var FILL = { planned: 0.62, ready: 0.48, inprogress: 0.25, done: 0.85, delayed: 0.12 };
        doc.section('3-week view', 90);
        if (!g.items.length) { doc.paragraph('No activities fall in these three weeks.', { font: 'I' }); return; }
        function header() {
            var y = doc.y;
            doc.rect(M, y, W, HEAD, 0.88, 0.55, 0.5);
            doc.text(M + 4, y + 19, E('#'), 'B', 7.2);
            doc.text(M + cNo + 4, y + 19, E('ACTIVITY'), 'B', 7.2);
            for (var w = 0; w < 3; w++) {
                var x = gx + w * per * cw;
                doc.text(x + 3, y + 9, E('WEEK ' + (w + 1) + '  ' + short(addDays(windowStart(r), 7 * w)).toUpperCase()), 'B', 6.6);
                doc.line(x, y, x, y + HEAD, 0.8, 0.4);
            }
            doc.line(gx, y + 12, M + W, y + 12, 0.4, 0.6);
            g.days.forEach(function (d, i) {
                var x = gx + i * cw, l = E(LETTER[d.d.getDay()]), n = E(String(d.d.getDate()));
                doc.text(x + (cw - P.width(l, 'B', 6.4)) / 2, y + 20, l, 'B', 6.4);
                doc.text(x + (cw - P.width(n, 'R', 6)) / 2, y + 27, n, 'R', 6);
                if (i % per) doc.line(x, y + 12, x, y + HEAD, 0.3, 0.7);
            });
            doc.line(M + cNo, y, M + cNo, y + HEAD, 0.5, 0.55);
            doc.line(gx, y, gx, y + HEAD, 0.8, 0.4);
            doc.y = y + HEAD;
        }
        doc.ensure(HEAD + 24);
        header();
        doc.tableHeader = header;
        g.items.forEach(function (it) {
            var title = P.wrap(E(trim(it.activity) || 'Untitled'), 'B', 7.8, cAct - 8).slice(0, 2);
            var subTxt = [trim(it.trade), trim(it.area)].filter(Boolean).join(' · ');
            var sub = subTxt ? P.wrap(E(subTxt), 'R', 6.8, cAct - 8).slice(0, 1) : [];
            var rowH = Math.max(20, 8 + title.length * 9.5 + sub.length * 8.5);
            doc.ensure(rowH);
            var y = doc.y, open = it.status !== 'done' && openConstraints(it).length, flagged = false;
            doc.rect(M, y, W, rowH, null, 0.55, 0.5);
            doc.text(M + 4, y + 11, E(cfg.numberFormat(it.no)), 'B', 7);
            title.forEach(function (ln, k) { doc.text(M + cNo + 4, y + 11 + k * 9.5, ln, 'B', 7.8); });
            sub.forEach(function (ln) { doc.text(M + cNo + 4, y + 11 + title.length * 9.5, ln, 'R', 6.8, 0.35); });
            doc.line(M + cNo, y, M + cNo, y + rowH, 0.5, 0.55);
            g.days.forEach(function (d, i) {
                var x = gx + i * cw;
                if (i % per) doc.line(x, y, x, y + rowH, 0.3, 0.8); else doc.line(x, y, x, y + rowH, 0.8, 0.4);
                if (d.iso >= it.start && d.iso <= it.finish) {
                    var f = FILL[it.status] == null ? 0.5 : FILL[it.status];
                    doc.rect(x + 1.2, y + 4, cw - 2.4, rowH - 8, f, null);
                    if (open && !flagged) { flagged = true; var bang = E('!'); doc.text(x + (cw - P.width(bang, 'B', 8)) / 2, y + rowH / 2 + 3, bang, 'B', 8, f < 0.5 ? 1 : 0); }
                }
            });
            doc.y = y + rowH;
        });
        doc.tableHeader = null;
        doc.y += 4;
        doc.paragraph('Bar shade: darkest = delayed, dark = in progress, medium = ready, lighter = planned, lightest = done. "!" = not ready yet (open constraints).' +
            (g.outside ? ' ' + g.outside + ' activit' + (g.outside === 1 ? 'y falls' : 'ies fall') + ' outside this window.' : '') +
            (g.noDates ? ' ' + g.noDates + ' activit' + (g.noDates === 1 ? 'y has' : 'ies have') + ' no dates.' : ''), { size: 7.8, font: 'I', gray: 0.3 });
    }
    var basePdf = schema.pdf;
    schema.pdf = function (r, doc, h) {
        var orig = doc.section, drawn = false;
        doc.section = function (title, keep) {
            if (!drawn && title === cfg.itemsTitle) { drawn = true; doc.section = orig; drawGrid(doc, r); }
            return orig.call(doc, title, keep);
        };
        try { basePdf(r, doc, h); } finally { doc.section = orig; }
    };
    var baseSummary = schema.summary;
    schema.summary = function (r) {
        var s = windowStart(r);
        return baseSummary(r).replace(/\n/, '\nWindow: ' + short(s) + ' - ' + short(addDays(s, 20)) + '\n');
    };

    A.register(schema);
})(typeof window !== 'undefined' ? window : this);

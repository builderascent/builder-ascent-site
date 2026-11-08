/*
 * Builder Ascent Field Forms - Daily Builder Checklist (v1)
 * Personal daily routine from the Daily Builder System (daily-system.html): Morning Plan, Midday Check,
 * End of Day Review and Track Your Growth. One record per day, no signatures (self-coaching, not a
 * compliance record). Nothing is pre-checked. Typing a note marks that question as covered.
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }

    var BLOCKS = [
        { id: 'morning', title: 'Morning Plan', time: '5 minutes', intro: 'Before the crew starts. Plan the day so nobody waits.',
            qs: [['plan', 'What are we doing today?'], ['risks', 'What could slow us down?'], ['needs', 'What materials, tools, or information do we need?'], ['tell', 'Who needs to know the plan?']] },
        { id: 'midday', title: 'Midday Check', time: '2 minutes', intro: 'Halfway through. Catch problems while there is still time to fix them.',
            qs: [['track', 'Are we on track?'], ['slow', 'What is slowing us down?'], ['fix', 'What needs to be fixed now?'], ['update', 'Who needs an update?']] },
        { id: 'end', title: 'End of Day Review', time: '5 minutes', intro: 'Before you leave. Close out today and set up tomorrow.',
            qs: [['done', 'What got done?'], ['notdone', 'What did not get done?'], ['waste', 'What caused delays or waste?'], ['ready', 'What needs to be ready for tomorrow?']] }
    ];
    var BLOCK = {};
    BLOCKS.forEach(function (b) { BLOCK[b.id] = b; });
    var GROWTH = [['planned', 'I planned the work before starting.'], ['communicated', 'I communicated clearly.'], ['waiting', 'I helped prevent waiting.'],
        ['solved', 'I solved a problem instead of only pointing it out.'], ['tracked', 'I tracked what happened.'], ['prepared', 'I prepared for tomorrow.']];
    var RULES = ['If you’re reacting, you’re already behind.', 'If your crew is waiting, something was missed.', 'If you don’t track it, you don’t control it.',
        'If you bring problems without solutions, you are not leading yet.', 'If you prepare tomorrow today, you separate yourself.'];

    function weekday(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return ''; return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(+m[1], +m[2] - 1, +m[3]).getDay()]; }
    function q(d, b, k) { return (d[b] && d[b][k]) || {}; }
    function covered(d, b) { return BLOCK[b].qs.filter(function (x) { return q(d, b, x[0]).c; }).length; }
    function growthCount(d) { return GROWTH.filter(function (g) { return d.growth && d.growth[g[0]]; }).length; }
    function progText(d, b) { return covered(d, b) + ' of ' + BLOCK[b].qs.length + ' covered'; }

    function blockHtml(r, b) {
        var blk = BLOCK[b], d = r.data;
        var h = '<p class="ff-dbc-prog" id="' + fid(b) + '-prog" aria-live="polite"><strong>' + esc(progText(d, b)) + '</strong> &middot; ' + esc(blk.time) + '</p>';
        blk.qs.forEach(function (x, i) {
            var base = b + '.' + x[0], v = q(d, b, x[0]), id = fid(base);
            h += '<fieldset class="ff-ck-item ff-dbc-q' + (v.c ? ' is-set' : '') + '" id="' + id + '" tabindex="-1">' +
                '<legend class="ff-ck-label"><span class="ff-dbc-n">' + (i + 1) + '</span> ' + esc(x[1]) + '</legend>' +
                '<label class="ff-check ff-dbc-check" for="' + fid(base + '.c') + '"><input type="checkbox" id="' + fid(base + '.c') + '" data-bind="' + base + '.c" data-kind="bool"' + (v.c ? ' checked' : '') + '><span>Covered</span></label>' +
                '<div class="ff-field ff-dbc-note"><label class="ff-label ff-label--small" for="' + fid(base + '.a') + '">Notes <span class="ff-opt">(optional)</span></label>' +
                '<textarea class="ff-input ff-input--item" rows="1" data-autogrow="1" id="' + fid(base + '.a') + '" data-bind="' + base + '.a" data-kind="text" maxlength="600">' + esc(v.a || '') + '</textarea></div>' +
                '</fieldset>';
        });
        return h;
    }
    function blockReview(r, b) {
        var d = r.data;
        return '<p class="ff-rv-text"><strong>' + esc(progText(d, b)) + '</strong></p><ul class="ff-rv-list ff-dbc-rv">' + BLOCK[b].qs.map(function (x) {
            var v = q(d, b, x[0]);
            return '<li><strong>' + (v.c ? '&#10003; ' : '&ndash; ') + esc(x[1]) + '</strong>' + (trim(v.a) ? '<br>' + esc(v.a).replace(/\n/g, '<br>') : '') + (v.c ? '' : ' <span class="ff-missing">Not covered</span>') + '</li>';
        }).join('') + '</ul>';
    }

    var dbc = {
        type: 'dbc',
        label: 'Daily Builder Checklist',
        description: 'Your daily routine from the Daily Builder System: Morning Plan, Midday Check, End of Day Review and Track Your Growth. About 12 minutes a day.',
        startLabel: 'Start Today’s Checklist',
        blankPdf: '/public/downloads/daily_builder_checklist.pdf',
        authorPath: 'project.builder',
        prefix: function () { return 'DBC'; },
        shortTitle: function () { return 'Daily Builder Checklist'; },
        listTitle: function (r) { var d = r.data.project.date; return 'Daily Builder Checklist' + (d ? ' · ' + weekday(d).slice(0, 3) + ' ' + C.formatDate(d) : ''); },
        docTitle: function () { return 'Daily Builder Checklist'; },
        headTitle: function (r) { var p = r.data.project; return trim(p.name) || trim(p.builder); },
        finalizeStatement: 'This checklist is my honest record of today.',
        signoffRoles: [],
        newData: function () {
            var d = { project: { builder: '', role: '', name: '', date: C.todayISO() }, growth: {}, tomorrow: '', notes: '' };
            BLOCKS.forEach(function (b) { d[b.id] = {}; b.qs.forEach(function (x) { d[b.id][x[0]] = { c: false, a: '' }; }); });
            GROWTH.forEach(function (g) { d.growth[g[0]] = false; });
            return d;
        },
        rerenderOn: function (path) { return path === 'project.date'; },
        // Typing a note marks the question as covered (updated in place, no re-render while typing)
        afterTextInput: function (r, path) {
            var m = /^(morning|midday|end)\.(\w+)\.a$/.exec(path);
            if (!m) return;
            var v = r.data[m[1]][m[2]];
            if (!trim(v.a) || v.c) return;
            v.c = true;
            var cb = document.getElementById(fid(m[1] + '.' + m[2] + '.c'));
            if (cb) cb.checked = true;
            var fs = document.getElementById(fid(m[1] + '.' + m[2]));
            if (fs) fs.classList.add('is-set');
            var pg = document.getElementById(fid(m[1]) + '-prog');
            if (pg) pg.innerHTML = '<strong>' + esc(progText(r.data, m[1])) + '</strong> &middot; ' + esc(BLOCK[m[1]].time);
        },
        sections: [
            {
                id: 'day', title: 'Today',
                intro: 'This only works if you use it daily. Don’t read it — apply it.',
                render: function (r, ui) {
                    var d = r.data.project.date;
                    return '<div class="ff-grid2">' +
                        ui.text('project.builder', 'Your name', { required: true, autocomplete: 'name' }) + ui.text('project.role', 'Role', { placeholder: 'e.g. Foreman, crew leader' }) +
                        ui.text('project.name', 'Project', { list: null }) + ui.text('project.date', 'Date', { type: 'date', required: true, hint: d ? weekday(d) : '' }) + '</div>';
                },
                review: function (r, rv) {
                    var p = r.data.project;
                    return rv.fields([['Name', p.builder, true], ['Role', p.role], ['Project', p.name], ['Date', (p.date ? weekday(p.date) + ', ' : '') + C.formatDate(p.date), true]]);
                }
            },
            { id: 'morning', title: 'Morning Plan', intro: BLOCK.morning.intro, render: function (r) { return blockHtml(r, 'morning'); }, review: function (r) { return blockReview(r, 'morning'); } },
            { id: 'midday', title: 'Midday Check', intro: BLOCK.midday.intro, render: function (r) { return blockHtml(r, 'midday'); }, review: function (r) { return blockReview(r, 'midday'); } },
            { id: 'end', title: 'End of Day Review', intro: BLOCK.end.intro, render: function (r) { return blockHtml(r, 'end'); }, review: function (r) { return blockReview(r, 'end'); } },
            {
                id: 'growth', title: 'Track Your Growth',
                intro: 'Be honest. Check what you actually did today.',
                render: function (r, ui) {
                    return '<p class="ff-dbc-prog"><strong>' + growthCount(r.data) + ' of ' + GROWTH.length + '</strong> today</p>' +
                        GROWTH.map(function (g) { return ui.check('growth.' + g[0], g[1]); }).join('') +
                        ui.text('tomorrow', 'One thing I will do better tomorrow', { multiline: true, rows: 2 }) +
                        ui.text('notes', 'Other notes', { multiline: true, rows: 2 }) +
                        '<div class="ff-statement ff-dbc-rules"><p class="ff-sublabel">Builder Ascent Rules</p><ul>' + RULES.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
                },
                review: function (r, rv) {
                    var d = r.data;
                    return '<p class="ff-rv-text"><strong>' + growthCount(d) + ' of ' + GROWTH.length + '</strong></p><ul class="ff-rv-list ff-dbc-rv">' +
                        GROWTH.map(function (g) { return '<li>' + (d.growth[g[0]] ? '&#10003; ' : '&ndash; ') + esc(g[1]) + '</li>'; }).join('') + '</ul>' +
                        rv.text(d.tomorrow, 'Better tomorrow') + rv.text(d.notes, 'Other notes');
                }
            }
        ],
        validate: function (r) {
            var out = [], d = r.data;
            if (C.isBlank(d.project.builder)) out.push({ sec: 'day', id: fid('project.builder'), msg: 'Your name is required' });
            if (C.isBlank(d.project.date)) out.push({ sec: 'day', id: fid('project.date'), msg: 'Date is required' });
            BLOCKS.forEach(function (b) {
                var n = covered(d, b.id), left = b.qs.length - n;
                if (!n) out.push({ sec: b.id, id: fid(b.id + '.' + b.qs[0][0]), msg: b.title + ': nothing covered yet', level: 'warn' });
                else if (left) out.push({ sec: b.id, id: fid(b.id + '.' + b.qs.filter(function (x) { return !q(d, b.id, x[0]).c; })[0][0]), msg: b.title + ': ' + left + ' of ' + b.qs.length + ' not covered', level: 'warn' });
            });
            return out;
        },
        summary: function (r) {
            var d = r.data, p = d.project, L = [];
            L.push('Daily Builder Checklist' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push((p.builder || '-') + (p.role ? ', ' + p.role : '') + ' - ' + (p.date ? weekday(p.date) + ' ' : '') + C.formatDate(p.date) + (p.name ? ' - ' + p.name : ''));
            BLOCKS.forEach(function (b) {
                L.push(''); L.push(b.title.toUpperCase() + ' (' + progText(d, b.id) + ')');
                b.qs.forEach(function (x) { var v = q(d, b.id, x[0]); L.push((v.c ? '[x] ' : '[ ] ') + x[1] + (trim(v.a) ? ' - ' + trim(v.a).replace(/\s*\n\s*/g, '; ') : '')); });
            });
            L.push(''); L.push('TRACK YOUR GROWTH (' + growthCount(d) + ' of ' + GROWTH.length + ')');
            GROWTH.forEach(function (g) { L.push((d.growth[g[0]] ? '[x] ' : '[ ] ') + g[1]); });
            if (trim(d.tomorrow)) L.push('Better tomorrow: ' + trim(d.tomorrow));
            if (trim(d.notes)) L.push('Notes: ' + trim(d.notes));
            return L.join('\n');
        },
        pdf: function (r, doc) {
            var d = r.data, p = d.project;
            doc.section('Today');
            doc.fields([['Name', p.builder], ['Role', p.role], ['Project', p.name], ['Date', (p.date ? weekday(p.date) + ', ' : '') + C.formatDate(p.date)]].filter(function (x) { return trim(x[1]); }), 4);
            BLOCKS.forEach(function (b) {
                doc.section(b.title + ' - ' + b.time + '  (' + progText(d, b.id) + ')', 60);
                doc.table([{ title: 'Question', w: 0.4 }, { title: 'Covered', w: 0.12 }, { title: 'Notes', w: 0.48 }], b.qs.map(function (x) {
                    var v = q(d, b.id, x[0]);
                    return [{ parts: [{ t: x[1], b: true }] }, v.c ? 'Yes' : { parts: [{ t: 'No', i: true }] }, trim(v.a)];
                }));
            });
            doc.section('Track your growth  (' + growthCount(d) + ' of ' + GROWTH.length + ')', 290);
            doc.table([{ title: 'Today', w: 0.82 }, { title: 'Did it', w: 0.18 }], GROWTH.map(function (g) {
                return [g[1], d.growth[g[0]] ? { parts: [{ t: 'Yes', b: true }] } : { parts: [{ t: 'No', i: true }] }];
            }));
            if (trim(d.tomorrow)) { doc.section('One thing I will do better tomorrow', 30); doc.paragraph(d.tomorrow); }
            if (trim(d.notes)) { doc.section('Other notes', 30); doc.paragraph(d.notes); }
            doc.section('Builder Ascent Rules', 60);
            doc.bullets(RULES, { size: 8.8 });
        }
    };

    A.register(dbc);
})(typeof window !== 'undefined' ? window : this);

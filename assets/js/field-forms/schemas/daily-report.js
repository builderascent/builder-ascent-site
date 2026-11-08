/*
 * Builder Ascent Field Forms - Daily Report / Foreman Log (v1)
 * One record per day: finalized and locked like the safety forms. Fields come from the existing
 * Builder Ascent Daily Report / Foreman Log (public/downloads/daily_report.pdf).
 * Nothing implying a safety or quality answer is pre-selected.
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function filled(arr) { return (arr || []).filter(function (x) { return trim(x); }); }
    function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
    function fmt(n) { return (Math.round(n * 10) / 10).toString(); }

    var CONDITIONS = ['Clear', 'Partly cloudy', 'Overcast', 'Rain', 'Snow', 'Fog', 'Windy', 'Hot', 'Cold'];
    var YESNO = [['yes', 'Yes'], ['no', 'No']];
    var YN = { yes: 'Yes', no: 'No' };
    var DELAY_CAUSES = ['Weather', 'Material', 'Equipment', 'Labor', 'Inspection', 'Design / RFI', 'Other trade'];
    var TRADES = ['General / carpentry', 'Concrete', 'Masonry', 'Steel', 'Framing / drywall', 'Electrical', 'Plumbing', 'HVAC / mechanical', 'Fire protection', 'Roofing', 'Glazing', 'Painting', 'Flooring', 'Site / earthwork', 'Laborers'];

    // repeatable rows (manpower, equipment, deliveries)
    var ROWS = {
        crew: { label: 'Trade / company', add: 'Add a trade', fields: [['trade', 'Trade / company', 'text', true], ['workers', '# of workers', 'num'], ['hours', 'Hours each', 'num'], ['notes', 'Notes / work area', 'text']] },
        equipment: { label: 'Equipment', add: 'Add equipment', fields: [['name', 'Equipment', 'text', true], ['qty', 'Qty', 'num'], ['hours', 'Hours used', 'num'], ['notes', 'Notes', 'text']] },
        deliveries: { label: 'Material', add: 'Add a delivery', fields: [['material', 'Material', 'text', true], ['qty', 'Quantity', 'text'], ['by', 'Delivered by', 'text'], ['notes', 'Notes', 'text']] }
    };
    function crewTotals(d) {
        var w = 0, mh = 0;
        (d.crew || []).forEach(function (r) { var n = num(r.workers); w += n; mh += n * num(r.hours); });
        return { workers: w, manHours: mh };
    }
    function rowsHtml(r, ui, key) {
        var cfg = ROWS[key], rows = r.data[key] || [], h = '<div class="ff-dr-rows" id="' + fid(key) + '" tabindex="-1">';
        rows.forEach(function (row, i) {
            var b = key + '.' + i;
            h += '<div class="ff-dr-row"><div class="ff-dr-row-head"><span class="ff-dr-row-n">' + esc(cfg.label) + ' ' + (i + 1) + '</span>' +
                '<button type="button" class="ff-x" data-action="dr-row-remove" data-key="' + key + '" data-index="' + i + '" aria-label="Remove ' + esc(cfg.label.toLowerCase()) + ' ' + (i + 1) + '">&times;</button></div><div class="ff-grid2">';
            cfg.fields.forEach(function (f) {
                h += ui.text(b + '.' + f[0], f[1], { inputmode: f[2] === 'num' ? 'decimal' : null, list: key === 'crew' && f[0] === 'trade' ? 'ff-dr-trades' : null });
            });
            h += '</div></div>';
        });
        h += '<button type="button" class="ff-btn-sm" data-action="dr-row-add" data-key="' + key + '">+ ' + esc(cfg.add) + '</button></div>';
        return h;
    }
    function rowsFilled(d, key) { var f0 = ROWS[key].fields[0][0]; return (d[key] || []).filter(function (row) { return ROWS[key].fields.some(function (f) { return trim(row[f[0]]); }) || trim(row[f0]); }); }
    function weekday(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return ''; return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(+m[1], +m[2] - 1, +m[3]).getDay()]; }

    var daily = {
        type: 'daily',
        label: 'Daily Report / Foreman Log',
        description: 'The end-of-day record: weather, work done and planned, crew and equipment on site, deliveries, delays, safety and quality — signed and sent as a PDF.',
        startLabel: 'Start Today’s Report',
        blankPdf: '/public/downloads/daily_report.pdf',
        authorPath: 'project.foreman',
        prefix: function () { return 'DR'; },
        shortTitle: function () { return 'Daily Report'; },
        listTitle: function (r) { var d = r.data.project.date; return 'Daily Report' + (d ? ' · ' + weekday(d).slice(0, 3) + ' ' + C.formatDate(d) : ''); },
        docTitle: function () { return 'Daily Report / Foreman Log'; },
        finalizeStatement: 'This report is an accurate record of today’s work to the best of my knowledge.',
        signoffRoles: [
            { role: 'foreman', label: 'Foreman', namePath: 'project.foreman', statement: 'I prepared this daily report.', required: true },
            { role: 'super', label: 'Superintendent', namePath: 'project.superintendent', statement: 'I reviewed this daily report.' }
        ],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), reportNo: '', superintendent: '', foreman: '' },
                weather: { am: [], pm: [], high: '', low: '', precip: '', precipAmount: '', wind: '', windDir: '', impact: '' },
                work: { done: [''], planned: [] },
                crew: [], equipment: [], deliveries: [],
                delays: { text: '', causes: [], impact: '' },
                safety: { meeting: '', topic: '', incidents: '', incidentText: '', nearMiss: '', nearMissText: '' },
                quality: { inspections: '', meetsStandards: '', notes: '' },
                notes: '', signoff: {}
            };
        },
        rerenderOn: function (path) { return path === 'project.date'; },   // refresh the day-of-week hint
        // live crew totals while typing worker counts / hours
        afterTextInput: function (r, path) {
            if (!/^crew\./.test(path)) return;
            var el = document.getElementById('ff-dr-crew-total');
            if (el) { var t = crewTotals(r.data); el.innerHTML = '<strong>' + fmt(t.workers) + '</strong> workers &middot; <strong>' + fmt(t.manHours) + '</strong> man-hours'; }
        },
        sections: [
            {
                id: 'project', title: 'Project & Crew Leads',
                render: function (r, ui) {
                    var wd = weekday(r.data.project.date);
                    return ui.projectPicker() + '<div class="ff-grid2">' +
                        ui.text('project.name', 'Project name', { required: true }) + ui.text('project.number', 'Project #') +
                        ui.text('project.location', 'Location', { required: true }) + ui.text('project.company', 'Company / trade') +
                        ui.text('project.date', 'Date', { type: 'date', required: true, hint: wd ? wd : '' }) + ui.text('project.reportNo', 'Report #', { hint: 'Optional — your own numbering.' }) +
                        ui.text('project.superintendent', 'Superintendent') + ui.text('project.foreman', 'Foreman (name)', { required: true, hint: 'The foreman signs the report.' }) + '</div>';
                },
                review: function (r, rv) {
                    var p = r.data.project;
                    return rv.fields([['Project', p.name, true], ['Project #', p.number], ['Location', p.location, true], ['Company / trade', p.company],
                        ['Date', p.date ? weekday(p.date) + ', ' + C.formatDate(p.date) : '', true], ['Report #', p.reportNo], ['Superintendent', p.superintendent], ['Foreman', p.foreman, true]]);
                }
            },
            {
                id: 'weather', title: 'Weather',
                render: function (r, ui) {
                    var w = r.data.weather;
                    return ui.choices('weather.am', 'AM conditions', { options: CONDITIONS, customLabel: 'Add other' }) +
                        ui.choices('weather.pm', 'PM conditions', { options: CONDITIONS, customLabel: 'Add other' }) +
                        '<div class="ff-grid2">' + ui.text('weather.high', 'High temp (°F)', { inputmode: 'decimal' }) + ui.text('weather.low', 'Low temp (°F)', { inputmode: 'decimal' }) + '</div>' +
                        ui.segment('weather.precip', 'Precipitation', YESNO) +
                        (w.precip === 'yes' ? ui.text('weather.precipAmount', 'Amount', { placeholder: 'e.g. 0.5 in' }) : '') +
                        '<div class="ff-grid2">' + ui.text('weather.wind', 'Wind (mph)', { inputmode: 'decimal' }) + ui.text('weather.windDir', 'Wind direction') + '</div>' +
                        ui.text('weather.impact', 'Weather impact on work', { multiline: true, rows: 2 });
                },
                review: function (r, rv) {
                    var w = r.data.weather;
                    return rv.fields([['AM', w.am.join(', ')], ['PM', w.pm.join(', ')], ['High / low', [w.high ? w.high + '°F' : '', w.low ? w.low + '°F' : ''].filter(Boolean).join(' / ')],
                        ['Precipitation', YN[w.precip] ? YN[w.precip] + (w.precipAmount ? ' (' + w.precipAmount + ')' : '') : ''], ['Wind', [w.wind ? w.wind + ' mph' : '', w.windDir].filter(Boolean).join(' ')], ['Impact on work', w.impact]]);
                }
            },
            {
                id: 'work', title: 'Work Performed & Planned',
                render: function (r, ui) {
                    return ui.items('work.done', 'Work performed today', { required: true, itemLabel: 'Work item', addLabel: 'Add work performed', hint: 'One line per activity, with location — e.g. “Poured L2 deck, grids C–F”.' }) +
                        ui.items('work.planned', 'Work planned for tomorrow', { itemLabel: 'Planned item', addLabel: 'Add planned work' });
                },
                review: function (r, rv) {
                    return rv.label('Work performed today') + (filled(r.data.work.done).length ? rv.list(r.data.work.done) : rv.missing('Work performed is missing')) +
                        (filled(r.data.work.planned).length ? rv.label('Planned for tomorrow') + rv.list(r.data.work.planned) : '');
                }
            },
            {
                id: 'crew', title: 'Crew & Equipment',
                render: function (r, ui) {
                    var t = crewTotals(r.data);
                    return '<datalist id="ff-dr-trades">' + TRADES.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
                        '<h3 class="ff-h3">Crew / manpower on site</h3>' + rowsHtml(r, ui, 'crew') +
                        '<p class="ff-pl-stats" id="ff-dr-crew-total"><strong>' + fmt(t.workers) + '</strong> workers &middot; <strong>' + fmt(t.manHours) + '</strong> man-hours</p>' +
                        '<h3 class="ff-h3">Equipment on site</h3>' + rowsHtml(r, ui, 'equipment');
                },
                review: function (r, rv) {
                    var d = r.data, t = crewTotals(d), c = rowsFilled(d, 'crew'), e = rowsFilled(d, 'equipment');
                    return (c.length ? '<div class="ff-table-wrap"><table class="ff-table"><thead><tr><th scope="col">Trade / company</th><th scope="col">Workers</th><th scope="col">Hours</th><th scope="col">Notes</th></tr></thead><tbody>' +
                        c.map(function (x) { return '<tr><th scope="row" data-label="Trade">' + esc(x.trade) + '</th><td data-label="Workers">' + esc(x.workers) + '</td><td data-label="Hours">' + esc(x.hours) + '</td><td data-label="Notes">' + esc(x.notes) + '</td></tr>'; }).join('') +
                        '</tbody></table></div><p class="ff-rv-text"><strong>Total: ' + fmt(t.workers) + ' workers, ' + fmt(t.manHours) + ' man-hours</strong></p>' : '<p class="ff-none">No crew listed.</p>') +
                        (e.length ? rv.label('Equipment') + rv.list(e.map(function (x) { return [x.name, x.qty ? 'qty ' + x.qty : '', x.hours ? x.hours + ' hrs' : '', x.notes].filter(function (y) { return trim(y); }).join(' · '); })) : '');
                }
            },
            {
                id: 'materials', title: 'Deliveries & Delays',
                render: function (r, ui) {
                    return '<h3 class="ff-h3">Materials delivered to site</h3>' + rowsHtml(r, ui, 'deliveries') +
                        '<h3 class="ff-h3">Delays / issues</h3>' +
                        ui.text('delays.text', 'Delays, issues or obstacles', { multiline: true, rows: 3, hint: 'Leave blank if there were none.' }) +
                        ui.choices('delays.causes', 'Cause', { options: DELAY_CAUSES, customLabel: 'Add other cause' }) +
                        ui.text('delays.impact', 'Impact on schedule', { placeholder: 'e.g. lost 2 hours, pour moved to Thursday' });
                },
                review: function (r, rv) {
                    var d = r.data, del = rowsFilled(d, 'deliveries');
                    return (del.length ? rv.label('Deliveries') + rv.list(del.map(function (x) { return [x.material, x.qty, x.by ? 'by ' + x.by : '', x.notes].filter(function (y) { return trim(y); }).join(' · '); })) : '<p class="ff-none">No deliveries listed.</p>') +
                        (trim(d.delays.text) || d.delays.causes.length ? rv.fields([['Delays / issues', d.delays.text], ['Cause', d.delays.causes.join(', ')], ['Schedule impact', d.delays.impact]]) : '<p class="ff-rv-text">No delays recorded.</p>');
                }
            },
            {
                id: 'safety', title: 'Safety & Quality',
                intro: 'Answer each safety question — nothing is filled in for you.',
                render: function (r, ui) {
                    var s = r.data.safety, q = r.data.quality, h = '';
                    h += ui.segment('safety.meeting', 'Safety meeting conducted today?', YESNO, { required: true });
                    if (s.meeting === 'yes') h += ui.text('safety.topic', 'Topic', { placeholder: 'e.g. Pre-task plan, ladder safety' });
                    h += ui.segment('safety.incidents', 'Any incidents or injuries?', YESNO, { required: true });
                    if (s.incidents === 'yes') h += '<div class="ff-result-warn"><strong>Report it.</strong> Describe it below, notify your supervisor, and complete an Incident Report.</div>' +
                        ui.text('safety.incidentText', 'Describe the incident', { required: true, multiline: true, rows: 3 });
                    h += ui.segment('safety.nearMiss', 'Any near misses?', YESNO, { required: true });
                    if (s.nearMiss === 'yes') h += ui.text('safety.nearMissText', 'Describe the near miss', { required: true, multiline: true, rows: 2 });
                    h += '<h3 class="ff-h3">Quality</h3>' + ui.segment('quality.inspections', 'Quality inspections performed?', YESNO) +
                        ui.segment('quality.meetsStandards', 'Work meets standards?', YESNO) +
                        ui.text('quality.notes', 'Notes / corrective actions', { multiline: true, rows: 2, hint: q.meetsStandards === 'no' ? 'Required: what is wrong and what will be done.' : '' });
                    return h;
                },
                review: function (r, rv) {
                    var s = r.data.safety, q = r.data.quality;
                    return rv.fields([['Safety meeting', YN[s.meeting] ? YN[s.meeting] + (s.topic ? ' — ' + s.topic : '') : '', true], ['Incidents', YN[s.incidents], true], ['Incident details', s.incidentText],
                        ['Near misses', YN[s.nearMiss], true], ['Near-miss details', s.nearMissText], ['Quality inspections', YN[q.inspections]], ['Meets standards', YN[q.meetsStandards]], ['Quality notes', q.notes]]);
                }
            },
            {
                id: 'notes', title: 'Notes',
                render: function (r, ui) { return ui.text('notes', 'Additional notes / comments', { multiline: true, rows: 5, hint: 'Visitors, inspections, instructions received, anything worth a record.' }); },
                review: function (r, rv) { return rv.text(r.data.notes) || '<p class="ff-none">No notes.</p>'; }
            },
            {
                id: 'signoff', title: 'Sign-Off',
                intro: 'The foreman’s typed name is required. The superintendent can review and sign on the same device if they’re there.',
                render: function (r, ui) { return ui.signoff('foreman', 'Foreman', 'project.foreman', 'Project & Crew Leads') + ui.signoff('super', 'Superintendent', 'project.superintendent', 'Project & Crew Leads'); },
                review: function (r, rv) { return rv.signoffs(r, daily.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            [['project.name', 'Project name is required'], ['project.location', 'Location is required'], ['project.date', 'Date is required'], ['project.foreman', 'Foreman name is required']]
                .forEach(function (p) { if (C.isBlank(C.getPath(d, p[0]))) out.push({ sec: 'project', id: fid(p[0]), msg: p[1] }); });
            if (!filled(d.work.done).length) out.push({ sec: 'work', id: fid('work.done'), msg: 'Add at least one line of work performed' });
            if (!d.safety.meeting) out.push({ sec: 'safety', id: fid('safety.meeting'), msg: 'Answer: safety meeting conducted?' });
            if (!d.safety.incidents) out.push({ sec: 'safety', id: fid('safety.incidents'), msg: 'Answer: any incidents or injuries?' });
            if (d.safety.incidents === 'yes' && C.isBlank(d.safety.incidentText)) out.push({ sec: 'safety', id: fid('safety.incidentText'), msg: 'Describe the incident' });
            if (!d.safety.nearMiss) out.push({ sec: 'safety', id: fid('safety.nearMiss'), msg: 'Answer: any near misses?' });
            if (d.safety.nearMiss === 'yes' && C.isBlank(d.safety.nearMissText)) out.push({ sec: 'safety', id: fid('safety.nearMissText'), msg: 'Describe the near miss' });
            if (d.quality.meetsStandards === 'no' && C.isBlank(d.quality.notes)) out.push({ sec: 'safety', id: fid('quality.notes'), msg: 'Work does not meet standards — add the corrective action' });
            (d.crew || []).forEach(function (row, i) { if (!trim(row.trade) && (trim(row.workers) || trim(row.hours) || trim(row.notes))) out.push({ sec: 'crew', id: fid('crew.' + i + '.trade'), msg: 'Crew row ' + (i + 1) + ': add the trade / company' }); });
            if (!rowsFilled(d, 'crew').length) out.push({ sec: 'crew', id: fid('crew'), msg: 'No crew listed for today', level: 'warn' });
            if (d.safety.incidents === 'yes') out.push({ sec: 'safety', id: fid('safety.incidentText'), msg: 'Incident reported — make sure an Incident Report is completed', level: 'warn' });
            if (trim(d.project.foreman) && !h.signoffValid('foreman', 'project.foreman')) out.push({ sec: 'signoff', id: 'ff-so-foreman', msg: 'Foreman has not signed', level: 'warn' });
            return out;
        },
        actions: {
            'dr-row-add': function (r, el, x) {
                var key = el.getAttribute('data-key'), row = {};
                ROWS[key].fields.forEach(function (f) { row[f[0]] = ''; });
                r.data[key] = (r.data[key] || []).concat([row]);
                x.changed(true);
                x.focusLater(fid(key + '.' + (r.data[key].length - 1) + '.' + ROWS[key].fields[0][0]));
            },
            'dr-row-remove': function (r, el, x) {
                var key = el.getAttribute('data-key'), i = parseInt(el.getAttribute('data-index'), 10), row = r.data[key][i];
                if (ROWS[key].fields.some(function (f) { return trim(row[f[0]]); }) && !root.confirm('Remove this ' + ROWS[key].label.toLowerCase() + ' row?')) return;
                r.data[key].splice(i, 1);
                x.changed(true);
                x.focusLater(fid(key));
            }
        },
        summary: function (r) {
            var d = r.data, t = crewTotals(d), L = [];
            L.push('Daily Report' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('Date: ' + (d.project.date ? weekday(d.project.date) + ', ' + C.formatDate(d.project.date) : '-') + (d.project.foreman ? ' - foreman ' + d.project.foreman : ''));
            if (d.weather.am.length || d.weather.high) L.push('Weather: ' + [d.weather.am.join('/'), d.weather.high ? 'high ' + d.weather.high + 'F' : ''].filter(Boolean).join(', '));
            L.push('Crew: ' + fmt(t.workers) + ' workers, ' + fmt(t.manHours) + ' man-hours');
            L.push('');
            L.push('Work performed:');
            filled(d.work.done).forEach(function (x) { L.push('  - ' + x); });
            if (filled(d.work.planned).length) { L.push('Planned for tomorrow:'); filled(d.work.planned).forEach(function (x) { L.push('  - ' + x); }); }
            if (trim(d.delays.text)) L.push('Delays: ' + d.delays.text + (d.delays.impact ? ' (' + d.delays.impact + ')' : ''));
            L.push('Safety meeting: ' + (YN[d.safety.meeting] || '-') + '; incidents: ' + (YN[d.safety.incidents] || '-') + '; near misses: ' + (YN[d.safety.nearMiss] || '-'));
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, p = d.project, w = d.weather, P = h.parts, t = crewTotals(d);
            doc.section('Project');
            doc.fields([['Project', p.name], ['Project #', p.number], ['Location', p.location], ['Company / trade', p.company], ['Date', p.date ? weekday(p.date) + ', ' + C.formatDate(p.date) : ''],
                ['Report #', p.reportNo], ['Superintendent', p.superintendent], ['Foreman', p.foreman]].filter(function (x) { return trim(x[1]); }), 4);
            var wf = [['AM', w.am.join(', ')], ['PM', w.pm.join(', ')], ['High / low', [w.high ? w.high + ' F' : '', w.low ? w.low + ' F' : ''].filter(Boolean).join(' / ')],
                ['Precipitation', YN[w.precip] ? YN[w.precip] + (w.precipAmount ? ' (' + w.precipAmount + ')' : '') : ''], ['Wind', [w.wind ? w.wind + ' mph' : '', w.windDir].filter(Boolean).join(' ')]].filter(function (x) { return trim(x[1]); });
            if (wf.length || trim(w.impact)) { doc.section('Weather'); if (wf.length) doc.fields(wf, Math.min(wf.length, 5)); if (trim(w.impact)) doc.paragraph('Impact on work: ' + w.impact); }
            doc.section('Work performed today');
            doc.bullets(filled(d.work.done));
            if (filled(d.work.planned).length) { doc.section('Work planned for tomorrow'); doc.bullets(filled(d.work.planned)); }
            var c = rowsFilled(d, 'crew');
            doc.section('Crew / manpower on site', 60);
            if (c.length) doc.table([{ title: 'Trade / company', w: 0.36 }, { title: 'Workers', w: 0.12 }, { title: 'Hours', w: 0.12 }, { title: 'Notes', w: 0.4 }],
                c.map(function (x) { return [{ parts: [{ t: x.trade, b: true }] }, x.workers, x.hours, x.notes]; }).concat([[{ parts: [{ t: 'TOTAL', b: true }] }, { parts: [{ t: fmt(t.workers), b: true }] }, '', { parts: [{ t: fmt(t.manHours) + ' man-hours', b: true }] }]]));
            else doc.paragraph('No crew listed.', { font: 'I' });
            var e = rowsFilled(d, 'equipment');
            if (e.length) { doc.section('Equipment on site', 50); doc.table([{ title: 'Equipment', w: 0.4 }, { title: 'Qty', w: 0.1 }, { title: 'Hours', w: 0.12 }, { title: 'Notes', w: 0.38 }], e.map(function (x) { return [x.name, x.qty, x.hours, x.notes]; })); }
            var del = rowsFilled(d, 'deliveries');
            if (del.length) { doc.section('Materials delivered', 50); doc.table([{ title: 'Material', w: 0.34 }, { title: 'Quantity', w: 0.16 }, { title: 'Delivered by', w: 0.2 }, { title: 'Notes', w: 0.3 }], del.map(function (x) { return [x.material, x.qty, x.by, x.notes]; })); }
            doc.section('Delays / issues');
            if (trim(d.delays.text) || d.delays.causes.length) doc.fields([['Delays / issues', d.delays.text], ['Cause', d.delays.causes.join(', ')], ['Schedule impact', d.delays.impact]].filter(function (x) { return trim(x[1]); }), 1);
            else doc.paragraph('No delays recorded.');
            var s = d.safety, q = d.quality;
            doc.section('Safety and quality', 60);
            doc.table([{ title: 'Question', w: 0.36 }, { title: 'Answer', w: 0.12 }, { title: 'Details', w: 0.52 }], [
                ['Safety meeting conducted', { parts: [{ t: YN[s.meeting] || '-', b: true }] }, s.topic || ''],
                ['Incidents / injuries', { parts: [{ t: YN[s.incidents] || '-', b: true }] }, s.incidentText || ''],
                ['Near misses', { parts: [{ t: YN[s.nearMiss] || '-', b: true }] }, s.nearMissText || '']
            ].concat(q.inspections || q.meetsStandards || trim(q.notes) ? [['Quality inspections performed', YN[q.inspections] || '', ''], ['Work meets standards', { parts: [{ t: YN[q.meetsStandards] || '', b: q.meetsStandards === 'no' }] }, q.notes || '']] : []));
            if (trim(d.notes)) { doc.section('Additional notes'); doc.paragraph(d.notes); }
            doc.section('Sign-off', 70);
            P.signoffs(doc, r, daily.signoffRoles, h.cache);
        }
    };

    A.register(daily);
})(typeof window !== 'undefined' ? window : this);

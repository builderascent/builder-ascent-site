/*
 * Builder Ascent Field Forms - Inspection schemas (v1)
 *   equip : Equipment Inspection Checklist (replaces public/downloads/equipment_checklist.pdf as the working form)
 *   ppe   : PPE Inspection Checklist      (replaces public/downloads/ppe_checklist.pdf as the working form)
 * Inspection points come from the existing Builder Ascent checklists. Nothing is pre-selected; every point
 * must be answered (OK / Not OK / N/A); a failing point needs a comment. Lists are a starting point only.
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app, CK = A.checklist;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function filled(arr) { return (arr || []).filter(function (x) { return trim(x); }); }

    // ---------------- shared ----------------
    function infoFields(ui, o) {
        return ui.projectPicker() + '<div class="ff-grid2">' +
            ui.text('project.name', 'Project name', { required: true }) +
            ui.text('project.location', 'Location / work area', { required: true }) +
            ui.text('project.date', 'Date', { type: 'date', required: true }) +
            ui.text('project.time', 'Time', { type: 'time', now: true }) +
            ui.text('project.inspector', 'Inspected by (name)', { required: true, hint: 'The person doing the inspection signs it at the end.' }) +
            ui.text('project.company', 'Company') + '</div>' + (o || '');
    }
    function infoIssues(out, r, sec) {
        [['project.name', 'Project name is required'], ['project.location', 'Location / work area is required'], ['project.date', 'Date is required'], ['project.inspector', 'Inspected by (name) is required']]
            .forEach(function (p) { if (C.isBlank(C.getPath(r.data, p[0]))) out.push({ sec: sec, id: fid(p[0]), msg: p[1] }); });
    }
    function infoPairs(r) {
        var p = r.data.project;
        return [['Project', p.name], ['Location / work area', p.location], ['Date', C.formatDate(p.date)], ['Time', C.formatTime(p.time)], ['Inspected by', p.inspector], ['Company', p.company]];
    }
    function nonBlank(pairs) { return pairs.filter(function (x) { return trim(x[1]); }); }
    var SIGN_INTRO = 'The inspector’s typed name is required. A drawn signature is recommended.';

    // =====================================================================
    // Equipment Inspection
    // =====================================================================
    var EQ_ITEMS = [
        { k: 'general', label: 'General condition', desc: 'Overall condition, cleanliness, damage, leaks, loose or missing parts' },
        { k: 'safety', label: 'Safety devices', desc: 'Guards, seat belts, ROPS / FOPS, backup alarm, horn, lights' },
        { k: 'engine', label: 'Engine / power system', desc: 'No unusual noises, leaks, fluid levels (oil, fuel, coolant)' },
        { k: 'hydraulic', label: 'Hydraulic system', desc: 'Hoses, fittings, cylinders, leaks, connection security' },
        { k: 'tires', label: 'Tires / tracks / undercarriage', desc: 'Tire pressure and condition, track tension, wear, damage' },
        { k: 'brakes', label: 'Brakes', desc: 'Service brake and parking brake function properly' },
        { k: 'electrical', label: 'Electrical system', desc: 'Battery, wiring, connections, instruments, gauges' },
        { k: 'attachments', label: 'Attachments / accessories', desc: 'Pins, couplers, buckets, forks, chains, cables' },
        { k: 'manual', label: 'Operator’s manual', desc: 'Manual available and legible' }
    ];
    var EQ_OPTS = { options: [['ok', 'OK'], ['bad', 'Not OK'], ['na', 'N/A']], bad: 'bad', badLabel: 'Not OK', badNoteLabel: 'Problem / action required',
        extraPath: 'extraChecks', extraLabel: 'Add an inspection point', extraItemLabel: 'Inspection point' };
    var EQ_RESULT = [['safe', 'Safe to use'], ['repair', 'Needs repair'], ['dnu', 'Do not use']];
    var EQ_RESULT_TEXT = { safe: 'SAFE TO USE', repair: 'NEEDS REPAIR', dnu: 'DO NOT USE' };
    var EQ_TYPES = ['Excavator', 'Skid steer / compact track loader', 'Wheel loader', 'Backhoe', 'Dozer', 'Forklift', 'Telehandler', 'Scissor lift', 'Boom lift', 'Crane', 'Dump truck', 'Roller / compactor', 'Generator', 'Air compressor', 'Concrete pump', 'Light tower', 'Welder'];
    var EQ_LIST_NOTE = 'These inspection points are a starting point, not a complete list. Follow the manufacturer’s inspection requirements and your site’s equipment rules.';

    var equip = {
        type: 'equip',
        label: 'Equipment Inspection',
        description: 'Pre-use inspection for a piece of equipment: condition, safety devices, power, hydraulics, tires/tracks, brakes, electrical and attachments — with a clear result.',
        startLabel: 'Start Equipment Inspection',
        authorPath: 'project.inspector',
        prefix: function () { return 'EQI'; },
        shortTitle: function () { return 'Equipment Inspection'; },
        listTitle: function (r) { var e = r.data.equipment; return 'Equipment Inspection' + (e.type || e.unit ? ' \u00B7 ' + [e.type, e.unit ? '#' + e.unit : ''].filter(Boolean).join(' ') : ''); },
        docTitle: function () { return 'Equipment Inspection Checklist'; },
        finalizeStatement: 'I inspected this equipment and recorded the results above.',
        signoffRoles: [{ role: 'inspector', label: 'Inspector', namePath: 'project.inspector', statement: 'I inspected this equipment and the results recorded here are what I found.', required: true }],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '', inspector: '' },
                equipment: { type: '', unit: '', make: '', meter: '' },
                checks: {}, extraChecks: [],
                result: { status: '', comments: '', taggedOut: false },
                deficiencies: [],
                repair: { by: '', date: '', verifiedBy: '', verifiedDate: '' },
                signoff: {}
            };
        },
        sections: [
            {
                id: 'info', title: 'Inspection Info',
                render: function (r, ui) {
                    return infoFields(ui) + '<h3 class="ff-h3">Equipment</h3>' +
                        '<datalist id="ff-equip-types">' + EQ_TYPES.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
                        '<div class="ff-grid2">' +
                        ui.text('equipment.type', 'Equipment type', { required: true, list: 'ff-equip-types', hint: 'Pick from the list or type your own.' }) +
                        ui.text('equipment.unit', 'Equipment ID / unit #', { required: true }) +
                        ui.text('equipment.make', 'Make / model') +
                        ui.text('equipment.meter', 'Meter / hour reading', { inputmode: 'decimal' }) + '</div>';
                },
                review: function (r, rv) {
                    var e = r.data.equipment, p = r.data.project;
                    return rv.fields([['Project', p.name, true], ['Location / work area', p.location, true], ['Date', C.formatDate(p.date), true], ['Time', C.formatTime(p.time)], ['Inspected by', p.inspector, true], ['Company', p.company],
                        ['Equipment type', e.type, true], ['Equipment ID / unit #', e.unit, true], ['Make / model', e.make], ['Meter / hour reading', e.meter]]);
                }
            },
            {
                id: 'checks', title: 'Inspection Points',
                intro: 'Check each point: OK, Not OK or N/A. Anything Not OK needs a note on the problem and the action required.',
                render: function (r, ui) { return '<p class="ff-hint">' + esc(EQ_LIST_NOTE) + '</p>' + ui.checklist('checks', EQ_ITEMS, EQ_OPTS); },
                review: function (r, rv) { return rv.checklist(r, 'checks', EQ_ITEMS, EQ_OPTS); }
            },
            {
                id: 'result', title: 'Result & Deficiencies',
                render: function (r, ui) {
                    var c = CK.counts(r, 'checks', EQ_ITEMS, EQ_OPTS), st = r.data.result.status, h = '';
                    if (c.bad) h += '<div class="ff-result-warn"><strong>' + c.bad + ' point' + (c.bad > 1 ? 's' : '') + ' marked Not OK:</strong> ' + esc(c.badLabels.join(', ')) + '</div>';
                    h += ui.segment('result.status', 'This equipment is', EQ_RESULT, { required: true, noClear: true, hint: 'Your call as the inspector. Nothing is selected for you.' });
                    if (st === 'dnu') {
                        h += '<div class="ff-result-warn"><strong>Do not use.</strong> Tag the equipment out of service, keep the key or lock it out, and tell your supervisor before anyone operates it.</div>' +
                            ui.check('result.taggedOut', 'Equipment tagged out of service and supervisor notified');
                    }
                    h += ui.text('result.comments', 'Comments', { multiline: true, rows: 3, hint: st === 'safe' && c.bad ? 'Required: explain why the equipment is safe to use with points marked Not OK.' : '' });
                    h += ui.items('deficiencies', 'Deficiencies / actions required', { required: st === 'repair' || st === 'dnu', itemLabel: 'Deficiency', addLabel: 'Add a deficiency',
                        suggestions: c.badLabels.map(function (l) { return l + ' — '; }), suggestLabel: 'Start from the points marked Not OK' });
                    h += '<h3 class="ff-h3">Repair follow-up <span class="ff-opt">(optional)</span></h3><p class="ff-hint">Fill in now if repairs are done before you finalize, or record them later in a revision.</p>' +
                        '<div class="ff-grid2">' + ui.text('repair.by', 'Repairs completed by') + ui.text('repair.date', 'Repair date', { type: 'date' }) +
                        ui.text('repair.verifiedBy', 'Verified by') + ui.text('repair.verifiedDate', 'Verified date', { type: 'date' }) + '</div>';
                    return h;
                },
                review: function (r, rv) {
                    var res = r.data.result, rp = r.data.repair;
                    return (res.status ? '<p class="ff-rv-text"><strong class="' + (res.status === 'safe' ? '' : 'ff-ck-badtext') + '">' + esc(EQ_RESULT_TEXT[res.status]) + '</strong>' +
                        (res.status === 'dnu' ? ' &middot; ' + (res.taggedOut ? 'tagged out of service, supervisor notified' : '<span class="ff-missing">tag-out not confirmed</span>') : '') + '</p>' : rv.missing('Overall result is missing')) +
                        rv.text(res.comments, 'Comments') +
                        (filled(r.data.deficiencies).length ? rv.label('Deficiencies / actions required') + rv.list(r.data.deficiencies) : '') +
                        (nonBlank([['x', rp.by], ['x', rp.verifiedBy]]).length ? rv.fields([['Repairs completed by', rp.by], ['Repair date', C.formatDate(rp.date)], ['Verified by', rp.verifiedBy], ['Verified date', C.formatDate(rp.verifiedDate)]]) : '');
                }
            },
            {
                id: 'signoff', title: 'Inspector Sign-Off', intro: SIGN_INTRO,
                render: function (r, ui) { return ui.signoff('inspector', 'Inspector', 'project.inspector', 'Inspection Info'); },
                review: function (r, rv) { return rv.signoffs(r, equip.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            infoIssues(out, r, 'info');
            if (C.isBlank(d.equipment.type)) out.push({ sec: 'info', id: fid('equipment.type'), msg: 'Equipment type is required' });
            if (C.isBlank(d.equipment.unit)) out.push({ sec: 'info', id: fid('equipment.unit'), msg: 'Equipment ID / unit # is required' });
            out = out.concat(CK.issues(r, 'checks', EQ_ITEMS, EQ_OPTS, 'checks'));
            var st = d.result.status, bad = CK.counts(r, 'checks', EQ_ITEMS, EQ_OPTS).bad;
            if (!st) out.push({ sec: 'result', id: fid('result.status'), msg: 'Choose the overall result' });
            if (st === 'safe' && bad && C.isBlank(d.result.comments)) out.push({ sec: 'result', id: fid('result.comments'), msg: 'Explain why it is safe to use with points marked Not OK' });
            if ((st === 'repair' || st === 'dnu') && !filled(d.deficiencies).length) out.push({ sec: 'result', id: fid('deficiencies'), msg: 'List at least one deficiency / action required' });
            if (st === 'dnu' && !d.result.taggedOut) out.push({ sec: 'result', id: fid('result.taggedOut'), msg: 'Tag-out / supervisor notification not confirmed', level: 'warn' });
            if (trim(d.project.inspector) && !h.signoffValid('inspector', 'project.inspector')) out.push({ sec: 'signoff', id: 'ff-so-inspector', msg: 'Inspector has not signed', level: 'warn' });
            return out;
        },
        summary: function (r) {
            var d = r.data, L = [];
            L.push('Equipment Inspection' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Equipment: ' + [d.equipment.type, d.equipment.unit ? '#' + d.equipment.unit : '', d.equipment.make].filter(Boolean).join(' ') + (d.equipment.meter ? ' (meter ' + d.equipment.meter + ')' : ''));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('Date: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : '') + (d.project.inspector ? ' - inspected by ' + d.project.inspector : ''));
            L.push('');
            L.push('RESULT: ' + (EQ_RESULT_TEXT[d.result.status] || 'not chosen'));
            L.push(CK.summary(r, 'checks', EQ_ITEMS, EQ_OPTS));
            var c = CK.counts(r, 'checks', EQ_ITEMS, EQ_OPTS);
            if (c.bad) L.push('Not OK: ' + c.badLabels.join(', '));
            filled(d.deficiencies).forEach(function (x) { L.push('  - ' + x); });
            if (d.result.comments) L.push('Comments: ' + d.result.comments);
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, e = d.equipment, rp = d.repair, P = h.parts;
            doc.section('Inspection');
            doc.fields(nonBlank(infoPairs(r)), 3);
            doc.section('Equipment');
            doc.fields(nonBlank([['Equipment type', e.type], ['Equipment ID / unit #', e.unit], ['Make / model', e.make], ['Meter / hour reading', e.meter]]), 2);
            doc.section('Overall result', 40);
            doc.paragraph('This equipment is: ' + (EQ_RESULT_TEXT[d.result.status] || 'NOT CHOSEN'), { font: 'B', size: 13, after: 4 });
            if (d.result.status === 'dnu') doc.paragraph(d.result.taggedOut ? 'Tagged out of service and supervisor notified.' : 'Tag-out / supervisor notification NOT confirmed.', { font: 'B', size: 9.5 });
            if (trim(d.result.comments)) { doc.paragraph('Comments', { font: 'B', size: 8.5, after: 1 }); doc.paragraph(d.result.comments); }
            doc.section('Inspection points', 80);
            P.checklist(doc, r, 'checks', EQ_ITEMS, EQ_OPTS);
            doc.paragraph(EQ_LIST_NOTE, { size: 8, font: 'I', gray: 0.25 });
            if (filled(d.deficiencies).length) { doc.section('Deficiencies / actions required'); doc.bullets(filled(d.deficiencies)); }
            var rf = nonBlank([['Repairs completed by', rp.by], ['Repair date', C.formatDate(rp.date)], ['Verified by', rp.verifiedBy], ['Verified date', C.formatDate(rp.verifiedDate)]]);
            if (rf.length) { doc.section('Repair follow-up'); doc.fields(rf, 2); }
            doc.section('Inspector sign-off', 70);
            P.signoffs(doc, r, equip.signoffRoles, h.cache);
        }
    };

    // =====================================================================
    // PPE Inspection
    // =====================================================================
    var PPE_ITEMS = [
        { k: 'hardhat', label: 'Hard hat', desc: 'Check for cracks, dents and damage; suspension intact' },
        { k: 'glasses', label: 'Safety glasses', desc: 'Lenses and frames free of scratches or damage' },
        { k: 'gloves', label: 'Gloves', desc: 'No tears, holes or excessive wear' },
        { k: 'hivis', label: 'High-vis vest', desc: 'No tears or rips; reflective strips still visible' },
        { k: 'hearing', label: 'Hearing protection', desc: 'Clean and fits properly' },
        { k: 'resp', label: 'Respiratory protection', desc: 'Straps, seals, filters and valves' },
        { k: 'boots', label: 'Safety boots', desc: 'Soles, toes and overall condition' },
        { k: 'fall', label: 'Fall protection', desc: 'Harness, lanyard and hardware' }
    ];
    var PPE_OPTS = { options: [['good', 'Good'], ['replace', 'Replace'], ['na', 'N/A']], bad: 'replace', badLabel: 'to replace', badNoteLabel: 'Problem / action taken',
        extraPath: 'extraChecks', extraLabel: 'Add other PPE', extraItemLabel: 'PPE item' };
    var PPE_LIST_NOTE = 'This list is a starting point, not a complete list. Follow the manufacturer’s instructions and your site’s PPE requirements.';

    var ppe = {
        type: 'ppe-insp',
        label: 'PPE Inspection',
        description: 'Check hard hats, eye and hearing protection, gloves, high-vis, respirators, boots and fall protection — and record anything that needs replacing.',
        startLabel: 'Start PPE Inspection',
        authorPath: 'project.inspector',
        prefix: function () { return 'PPE'; },
        shortTitle: function () { return 'PPE Inspection'; },
        docTitle: function () { return 'PPE Inspection Checklist'; },
        finalizeStatement: 'I inspected the PPE listed and recorded the results above.',
        signoffRoles: [{ role: 'inspector', label: 'Inspector', namePath: 'project.inspector', statement: 'I inspected the PPE listed and the results recorded here are what I found.', required: true }],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '', inspector: '', worker: '' },
                checks: {}, extraChecks: [],
                actions: { removed: false, notes: '' },
                signoff: {}
            };
        },
        sections: [
            {
                id: 'info', title: 'Inspection Info',
                render: function (r, ui) {
                    return infoFields(ui, ui.text('project.worker', 'Worker / crew whose PPE was inspected', { hint: 'Optional. Leave blank for a general PPE check.' }));
                },
                review: function (r, rv) {
                    var p = r.data.project;
                    return rv.fields([['Project', p.name, true], ['Location / work area', p.location, true], ['Date', C.formatDate(p.date), true], ['Time', C.formatTime(p.time)], ['Inspected by', p.inspector, true], ['Company', p.company], ['Worker / crew', p.worker]]);
                }
            },
            {
                id: 'checks', title: 'PPE Items',
                intro: 'Check each item: Good, Replace (needs replacement) or N/A. Anything that needs replacing needs a note on the problem and the action taken.',
                render: function (r, ui) { return '<p class="ff-hint">' + esc(PPE_LIST_NOTE) + '</p>' + ui.checklist('checks', PPE_ITEMS, PPE_OPTS); },
                review: function (r, rv) { return rv.checklist(r, 'checks', PPE_ITEMS, PPE_OPTS); }
            },
            {
                id: 'actions', title: 'Notes & Actions',
                render: function (r, ui) {
                    var c = CK.counts(r, 'checks', PPE_ITEMS, PPE_OPTS), h = '';
                    if (c.bad) {
                        h += '<div class="ff-result-warn"><strong>' + c.bad + (c.bad > 1 ? ' items need' : ' item needs') + ' replacement:</strong> ' + esc(c.badLabels.join(', ')) +
                            '. Do not use damaged PPE — remove it from service and replace it before work.</div>' +
                            ui.check('actions.removed', 'PPE that needs replacement was removed from service');
                    } else {
                        h += '<p class="ff-hint">No items are marked Replace.</p>';
                    }
                    return h + ui.text('actions.notes', 'General notes / actions taken', { multiline: true, rows: 4 });
                },
                review: function (r, rv) {
                    var c = CK.counts(r, 'checks', PPE_ITEMS, PPE_OPTS), a = r.data.actions;
                    return (c.bad ? '<p class="ff-rv-text"><strong class="ff-ck-badtext">' + c.bad + (c.bad > 1 ? ' items need' : ' item needs') + ' replacement</strong> &middot; ' +
                        (a.removed ? 'removed from service' : '<span class="ff-missing">removal from service not confirmed</span>') + '</p>' : '<p class="ff-rv-text">No items need replacement.</p>') +
                        rv.text(a.notes, 'General notes / actions taken');
                }
            },
            {
                id: 'signoff', title: 'Inspector Sign-Off', intro: SIGN_INTRO,
                render: function (r, ui) { return ui.signoff('inspector', 'Inspector', 'project.inspector', 'Inspection Info'); },
                review: function (r, rv) { return rv.signoffs(r, ppe.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            infoIssues(out, r, 'info');
            out = out.concat(CK.issues(r, 'checks', PPE_ITEMS, PPE_OPTS, 'checks'));
            if (CK.counts(r, 'checks', PPE_ITEMS, PPE_OPTS).bad && !d.actions.removed) out.push({ sec: 'actions', id: fid('actions.removed'), msg: 'Removal from service not confirmed for PPE that needs replacement', level: 'warn' });
            if (trim(d.project.inspector) && !h.signoffValid('inspector', 'project.inspector')) out.push({ sec: 'signoff', id: 'ff-so-inspector', msg: 'Inspector has not signed', level: 'warn' });
            return out;
        },
        summary: function (r) {
            var d = r.data, L = [], c = CK.counts(r, 'checks', PPE_ITEMS, PPE_OPTS);
            L.push('PPE Inspection' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('Date: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : '') + (d.project.inspector ? ' - inspected by ' + d.project.inspector : ''));
            if (d.project.worker) L.push('Worker / crew: ' + d.project.worker);
            L.push('');
            L.push(CK.summary(r, 'checks', PPE_ITEMS, PPE_OPTS));
            if (c.bad) L.push('Needs replacement: ' + c.badLabels.join(', ') + (d.actions.removed ? ' (removed from service)' : ''));
            if (d.actions.notes) L.push('Notes: ' + d.actions.notes);
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, P = h.parts, c = CK.counts(r, 'checks', PPE_ITEMS, PPE_OPTS);
            doc.section('Inspection');
            doc.fields(nonBlank(infoPairs(r).concat([['Worker / crew', d.project.worker]])), 3);
            doc.section('PPE items', 80);
            P.checklist(doc, r, 'checks', PPE_ITEMS, PPE_OPTS);
            doc.paragraph(PPE_LIST_NOTE, { size: 8, font: 'I', gray: 0.25 });
            doc.section('Notes and actions');
            if (c.bad) doc.paragraph(c.bad + (c.bad > 1 ? ' items need' : ' item needs') + ' replacement: ' + c.badLabels.join(', ') + '. ' +
                (d.actions.removed ? 'Removed from service.' : 'Removal from service NOT confirmed.'), { font: 'B' });
            else doc.paragraph('No items need replacement.');
            if (trim(d.actions.notes)) doc.paragraph(d.actions.notes);
            doc.section('Inspector sign-off', 70);
            P.signoffs(doc, r, ppe.signoffRoles, h.cache);
        }
    };

    A.register(equip);
    A.register(ppe);
})(typeof window !== 'undefined' ? window : this);

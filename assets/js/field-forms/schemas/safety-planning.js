/*
 * Builder Ascent Field Forms - Safety Planning schemas (v1)
 *   jha : Hazard Analysis, titled JHA (Job Hazard Analysis) or JSA (Job Safety Analysis) - same record (D-02, D-13)
 *   ptp : Daily Pre-Task Plan - separate, shorter shift-start record (R-07). Never titled JSA.
 * Libraries are a starting point, never a complete list (D-05). Nothing is pre-selected.
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function filled(arr) { return (arr || []).filter(function (x) { return trim(x); }); }

    // ---------------- Libraries (D-05: existing forms + controlled expansion) ----------------
    var HAZARD_GROUPS = [
        { name: 'Falls & access', items: ['Falls (heights, edges, openings)', 'Ladders / scaffolding', 'Slips / trips'] },
        { name: 'Struck-by & caught', items: ['Struck-by', 'Caught-in / between', 'Overhead work / suspended loads', 'Heavy equipment', 'Traffic / mobile equipment'] },
        { name: 'Energy & fire', items: ['Electrical', 'Hot work / fire'] },
        { name: 'Ground & spaces', items: ['Excavation / trenching', 'Confined space'] },
        { name: 'Health & environment', items: ['Silica / dust', 'Noise', 'Weather / heat / cold'] },
        { name: 'Body & tools', items: ['Manual handling / lifting', 'Tools / equipment'] }
    ];
    var CONTROL_SUGGESTIONS = {
        'Falls (heights, edges, openings)': ['Guardrails or covers in place', 'Personal fall arrest used where required', 'Holes covered, secured and marked', 'Inspect harness and lanyard before use'],
        'Ladders / scaffolding': ['Inspect ladder before use', 'Maintain 3 points of contact', 'Scaffold inspected and tagged before use', 'Ladder secured and extended above landing'],
        'Slips / trips': ['Keep walkways clear', 'Clean up as work proceeds', 'Route cords and hoses out of walkways'],
        'Struck-by': ['Barricade the work area', 'Stay clear of load and swing paths', 'Secure tools and materials at height'],
        'Caught-in / between': ['Stay clear of pinch points', 'Guards in place on equipment', 'Never stand between equipment and a fixed object'],
        'Overhead work / suspended loads': ['Never work under suspended loads', 'Use tag lines to control loads', 'Barricade the area below overhead work'],
        'Heavy equipment': ['Spotter for equipment moves', 'Eye contact with the operator before approaching', 'Backup alarms working'],
        'Traffic / mobile equipment': ['High-visibility clothing worn', 'Designated walkways and traffic routes', 'Flagger or spotter at crossings'],
        'Electrical': ['Lockout/Tagout before work', 'GFCI protection on cords and tools', 'Inspect cords and tools for damage', 'Keep clear of overhead lines'],
        'Hot work / fire': ['Hot work permit in place', 'Fire extinguisher within reach', 'Fire watch during and after hot work', 'Remove or cover combustibles'],
        'Excavation / trenching': ['Protective system (slope, shore or shield) in place', 'Competent person inspection', 'Spoils set back from the edge', 'Safe access and exit in the trench'],
        'Confined space': ['Permit and atmospheric testing', 'Attendant posted', 'Rescue plan in place'],
        'Silica / dust': ['Wet methods or vacuum dust collection', 'Respiratory protection as required', 'Follow the exposure control plan'],
        'Noise': ['Hearing protection in high-noise areas', 'Limit time near noise sources'],
        'Weather / heat / cold': ['Water, rest and shade', 'Watch the crew for heat or cold stress', 'Stop work for lightning or high wind'],
        'Manual handling / lifting': ['Team lift or mechanical aid for heavy items', 'Lift with the legs, keep the load close', 'Plan the carry path first'],
        'Tools / equipment': ['Inspect tools before use', 'Guards in place', 'Right tool for the task', 'Trained operators only']
    };
    var PPE = ['Hard hat', 'Safety glasses', 'Gloves', 'High-vis vest', 'Steel-toe boots', 'Hearing protection', 'Respiratory protection', 'Fall protection', 'Face shield'];
    var PPE_NONE = 'No PPE beyond site minimum';
    var PERMITS = ['Hot work', 'Confined space', 'Excavation', 'Lockout/Tagout', 'Crane / critical lift', 'Energized electrical work'];
    var PERMITS_NONE = 'None';
    var TOOLS = ['Hand tools', 'Power tools', 'Saws / cutting tools', 'Ladders', 'Scaffold', 'Aerial / scissor lift', 'Forklift / telehandler', 'Crane / hoist', 'Excavator / loader', 'Welding / cutting equipment', 'Concrete pump / buggy', 'Generator / compressor'];
    var HAZ_NONE = 'No significant hazards identified';
    var RISK = [['L', 'Low'], ['M', 'Medium'], ['H', 'High']];
    var RISK_TEXT = { L: 'Low', M: 'Medium', H: 'High' };

    var STOP_WORK = 'Every worker has the authority and the responsibility to stop work when conditions are unsafe or change, or when the plan no longer fits the work. Stop, make the area safe, tell your foreman or supervisor, and do not restart until the hazard is controlled and the plan is updated.';
    var HAZARD_DISCLAIMER = 'This record lists only the hazards, controls and PPE that were selected or entered. It is not a list of every hazard on site. Follow the site safety plan, project requirements and applicable regulations.';
    var LIB_HINT = 'Not a complete list. Add any hazard that applies to this work.';

    function suggestionsFor(hazards) {
        var out = [];
        (hazards || []).forEach(function (h) { (CONTROL_SUGGESTIONS[h] || []).forEach(function (s) { if (out.indexOf(s) < 0) out.push(s); }); });
        return out;
    }
    function hazKey(name) { return 'h_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60); }

    // ---------------- shared section renderers ----------------
    function projectFields(ui, extra) {
        return ui.projectPicker() + '<div class="ff-grid2">' +
            ui.text('project.name', 'Project name', { required: true }) +
            ui.text('project.number', 'Project number') +
            ui.text('project.company', 'Company / contractor') +
            ui.text('project.trade', 'Trade / subcontractor') +
            '</div>' + ui.text('project.location', 'Location / work area', { required: true, placeholder: 'e.g. Level 2, grid C-D' }) +
            '<div class="ff-grid2">' + ui.text('project.date', 'Date', { type: 'date', required: true, hint: 'The record date. Defaults to today.' }) +
            ui.text('project.time', extra && extra.timeLabel || 'Start time', { type: 'time', now: true }) + '</div>';
    }
    function emergencyFields(ui, withPlan) {
        return '<div class="ff-grid2">' + ui.text('emergency.contact', 'Emergency contact') +
            ui.text('emergency.phone', 'Emergency phone', { type: 'tel', inputmode: 'tel', autocomplete: 'off' }) + '</div>' +
            ui.text('emergency.hospital', 'Nearest hospital / clinic') +
            (withPlan ? ui.text('emergency.plan', 'What to do if something goes wrong', { multiline: true, rows: 3, placeholder: 'e.g. Call 911, then the superintendent. Meet at the gate on Main St.' }) : '');
    }
    function stopWorkBlock(ui) {
        return '<div class="ff-statement"><p class="ff-sublabel">Stop-work authority (always printed)</p><p>' + C.esc(STOP_WORK) + '</p></div>' +
            ui.text('stopWork.conditions', 'Stop-work conditions for this work', { multiline: true, rows: 3, hint: 'Optional. Specific conditions that mean stop, e.g. wind over the lift limit, a trench wall cracking.' });
    }
    function reqIssue(list, r, path, sec, msg) { if (C.isBlank(C.getPath(r.data, path))) list.push({ sec: sec, id: fid(path), msg: msg }); }

    function rvProject(r, rv, extraPairs) {
        var p = r.data.project || {};
        return rv.fields([['Project', p.name, true], ['Project number', p.number], ['Company / contractor', p.company], ['Trade / subcontractor', p.trade],
            ['Location / work area', p.location, true], ['Date', C.formatDate(p.date), true], ['Time', C.formatTime(p.time)]].concat(extraPairs || []));
    }
    function pdfProjectPairs(r, extra) {
        var p = r.data.project || {};
        return [['Project', p.name], ['Project number', p.number], ['Company / contractor', p.company], ['Trade / subcontractor', p.trade],
            ['Location / work area', p.location], ['Date', C.formatDate(p.date)], ['Time', C.formatTime(p.time)]].concat(extra || [])
            .filter(function (x) { return !C.isBlank(x[1]); });
    }
    function ppeText(arr) { return (arr || []).indexOf(PPE_NONE) >= 0 ? [PPE_NONE + ' (confirmed)'] : (arr || []); }

    // =====================================================================
    // JHA / JSA
    // =====================================================================
    var jha = {
        type: 'jha',
        label: 'Hazard Analysis — JHA / JSA',
        description: 'Break a task into steps, list the hazards and controls for each step, then review it with the crew. Same form whether your company calls it a JHA or a JSA.',
        startLabel: 'Start JHA',
        blankPdf: '/public/downloads/jha.pdf',
        authorPath: 'people.preparedBy',
        prefix: function (r) { return r.data.recordTitle === 'JSA' ? 'JSA' : 'JHA'; },
        shortTitle: function (r) { return jha.prefix(r); },
        docTitle: function (r) { return r.data.recordTitle === 'JSA' ? 'Job Safety Analysis (JSA)' : 'Job Hazard Analysis (JHA)'; },
        crewStatement: 'I have reviewed this hazard analysis and understand the hazards, controls and PPE for my work.',
        finalizeStatement: 'I reviewed the hazards, controls and PPE with the people listed.',
        signoffRoles: [
            { role: 'prepared', label: 'Prepared by', namePath: 'people.preparedBy', statement: 'I prepared this hazard analysis and reviewed it with the crew listed.', required: true },
            { role: 'reviewed', label: 'Reviewed by', namePath: 'people.reviewedBy', statement: 'I reviewed this hazard analysis.' }
        ],
        newData: function (ctx) {
            return {
                recordTitle: ctx.pref('jhaTitle') === 'JSA' ? 'JSA' : 'JHA',
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '' },
                people: { preparedBy: '', position: '', foreman: '', reviewedBy: '' },
                work: { scope: '', tools: [], permits: [] },
                steps: [{ id: C.uid('st'), desc: '', hazards: [], riskBefore: '', controls: [], responsible: '', riskAfter: '' }],
                ppe: [], emergency: { contact: '', phone: '', hospital: '', plan: '' }, stopWork: { conditions: '' }, notes: '',
                crew: [], signoff: {}
            };
        },
        onChange: function (r, path, ctx) { if (path === 'recordTitle') ctx.pref('jhaTitle', r.data.recordTitle); },
        sections: [
            {
                id: 'project', title: 'Project & People',
                render: function (r, ui) {
                    return ui.segment('recordTitle', 'Record title', [['JHA', 'JHA — Job Hazard Analysis'], ['JSA', 'JSA — Job Safety Analysis']], { noClear: true, hint: 'Same form either way — choose the name your company uses. Locked when the record is finalized.' }) +
                        projectFields(ui) +
                        '<h3 class="ff-h3">People</h3><div class="ff-grid2">' +
                        ui.text('people.preparedBy', 'Prepared by (name)', { required: true }) +
                        ui.text('people.position', 'Prepared by (position / title)') +
                        ui.text('people.foreman', 'Foreman / supervisor') +
                        ui.text('people.reviewedBy', 'Reviewed by (name)', { hint: 'Leave blank unless someone will review this analysis. Never filled in for you.' }) + '</div>';
                },
                review: function (r, rv) {
                    var pp = r.data.people;
                    return rv.fields([['Record title', jha.docTitle(r)]]) + rvProject(r, rv) +
                        rv.fields([['Prepared by', pp.preparedBy, true], ['Position / title', pp.position], ['Foreman / supervisor', pp.foreman], ['Reviewed by', pp.reviewedBy]]);
                }
            },
            {
                id: 'work', title: 'Work, Tools & Permits',
                render: function (r, ui) {
                    return ui.text('work.scope', 'Scope of work / task description', { required: true, multiline: true, rows: 4, placeholder: 'What is the crew doing, where, and with what?' }) +
                        ui.choices('work.tools', 'Tools / equipment', { options: TOOLS, customLabel: 'Add other tools or equipment' }) +
                        ui.choices('work.permits', 'Permits required', { options: PERMITS, exclusive: PERMITS_NONE, exclusiveHint: 'Choose “None” only if no permit applies to this work.', customLabel: 'Add another permit' });
                },
                review: function (r, rv) {
                    var w = r.data.work;
                    return rv.text(w.scope, 'Scope of work') + (C.isBlank(w.scope) ? rv.missing('Scope of work is missing') : '') +
                        (w.tools.length ? rv.label('Tools / equipment') + rv.list(w.tools) : '') +
                        (w.permits.length ? rv.label('Permits required') + rv.list(w.permits) : '');
                }
            },
            {
                id: 'steps', title: 'Task Steps',
                intro: 'Break the work into steps. For each step, list the hazards and the controls that will be used.',
                render: function (r, ui) {
                    var steps = r.data.steps, n = steps.length;
                    var h = ui.crewDatalist();
                    steps.forEach(function (st, i) {
                        var b = 'steps.' + i;
                        h += '<article class="ff-step-card" id="ff-step-' + i + '" aria-labelledby="ff-step-h-' + i + '"><div class="ff-step-head"><h3 class="ff-h3" id="ff-step-h-' + i + '">Step ' + (i + 1) + ' of ' + n + '</h3><div class="ff-step-tools">' +
                            (i > 0 ? '<button type="button" class="ff-btn-sm" data-action="step-move" data-index="' + i + '" data-dir="-1">Move up<span class="ff-sr-only"> step ' + (i + 1) + '</span></button>' : '') +
                            (i < n - 1 ? '<button type="button" class="ff-btn-sm" data-action="step-move" data-index="' + i + '" data-dir="1">Move down<span class="ff-sr-only"> step ' + (i + 1) + '</span></button>' : '') +
                            (n > 1 ? '<button type="button" class="ff-btn-sm ff-btn-sm--danger" data-action="step-remove" data-index="' + i + '">Delete<span class="ff-sr-only"> step ' + (i + 1) + '</span></button>' : '') +
                            '</div></div>' +
                            ui.text(b + '.desc', 'What is being done?', { required: true, multiline: true, rows: 2 }) +
                            ui.choices(b + '.hazards', 'Hazards', { required: true, groups: HAZARD_GROUPS, hint: LIB_HINT, customLabel: 'Add a hazard' }) +
                            ui.segment(b + '.riskBefore', 'Risk before controls', RISK, { hint: 'Optional. No default.' }) +
                            ui.items(b + '.controls', 'Controls', { required: true, itemLabel: 'Control', addLabel: 'Add a control', suggestions: suggestionsFor(st.hazards), suggestLabel: 'Suggestions for the hazards you picked' }) +
                            ui.text(b + '.responsible', 'Person responsible', { list: 'ff-crew-names' }) +
                            ui.segment(b + '.riskAfter', 'Residual risk after controls', RISK, { hint: 'Optional. No default.' }) +
                            '</article>';
                    });
                    return h + '<button type="button" class="ff-btn ff-btn--ghost ff-add-step" data-action="step-add">+ Add another step</button>';
                },
                review: function (r, rv) {
                    var esc = C.esc;
                    return '<div class="ff-table-wrap"><table class="ff-table ff-table--steps"><thead><tr><th scope="col">#</th><th scope="col">Step</th><th scope="col">Hazards</th><th scope="col">Risk before</th><th scope="col">Controls</th><th scope="col">Responsible</th><th scope="col">Risk after</th></tr></thead><tbody>' +
                        r.data.steps.map(function (st, i) {
                            var c = filled(st.controls);
                            return '<tr><th scope="row" data-label="Step">' + (i + 1) + '</th><td data-label="What">' + (trim(st.desc) ? esc(st.desc) : '<span class="ff-missing">Missing</span>') + '</td>' +
                                '<td data-label="Hazards">' + (st.hazards.length ? esc(st.hazards.join(', ')) : '<span class="ff-missing">Missing</span>') + '</td>' +
                                '<td data-label="Risk before">' + (RISK_TEXT[st.riskBefore] || '') + '</td>' +
                                '<td data-label="Controls">' + (c.length ? '<ul class="ff-cell-list">' + c.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<span class="ff-missing">Missing</span>') + '</td>' +
                                '<td data-label="Responsible">' + esc(st.responsible || '') + '</td><td data-label="Risk after">' + (RISK_TEXT[st.riskAfter] || '') + '</td></tr>';
                        }).join('') + '</tbody></table></div><p class="ff-rv-note">' + C.esc(HAZARD_DISCLAIMER) + '</p>';
                }
            },
            {
                id: 'ppe', title: 'PPE',
                render: function (r, ui) {
                    return ui.choices('ppe', 'Required PPE', { required: true, options: PPE, exclusive: PPE_NONE, exclusiveHint: 'Choose this only if nothing beyond your site’s minimum PPE is needed.', customLabel: 'Add other PPE', hint: 'Nothing is pre-selected. Pick what this work needs.' });
                },
                review: function (r, rv) { return r.data.ppe.length ? rv.list(ppeText(r.data.ppe)) : rv.missing('PPE is missing'); }
            },
            {
                id: 'emergency', title: 'Emergency & Stop-Work',
                render: function (r, ui) { return '<h3 class="ff-h3">Emergency</h3>' + emergencyFields(ui, true) + '<h3 class="ff-h3">Stop-work</h3>' + stopWorkBlock(ui); },
                review: function (r, rv) {
                    var e = r.data.emergency;
                    return rv.fields([['Emergency contact', e.contact], ['Emergency phone', e.phone], ['Nearest hospital / clinic', e.hospital]]) + rv.text(e.plan, 'What to do if something goes wrong') +
                        rv.text(STOP_WORK, 'Stop-work authority') + rv.text(r.data.stopWork.conditions, 'Stop-work conditions for this work');
                }
            },
            {
                id: 'notes', title: 'Notes',
                render: function (r, ui) { return ui.text('notes', 'Additional notes / special instructions', { multiline: true, rows: 5 }); },
                review: function (r, rv) { return rv.text(r.data.notes) || '<p class="ff-none">No notes.</p>'; }
            },
            {
                id: 'crew', title: 'Crew Acknowledgement',
                intro: 'Recommended before work starts. Each person types their own name, confirms they reviewed the plan, and signs.',
                render: function (r, ui) { return ui.crew(); },
                review: function (r, rv) { return rv.crew(r, jha.crewStatement); }
            },
            {
                id: 'signoff', title: 'Sign-Off',
                intro: 'Prepared by is required (typed name). Signatures are recommended. Reviewed by is separate and optional — crew signatures never count as a review.',
                render: function (r, ui) { return ui.signoff('prepared', 'Prepared by', 'people.preparedBy', 'Project & People') + ui.signoff('reviewed', 'Reviewed by', 'people.reviewedBy', 'Project & People'); },
                review: function (r, rv) { return rv.signoffs(r, jha.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            reqIssue(out, r, 'project.name', 'project', 'Project name is required');
            reqIssue(out, r, 'project.location', 'project', 'Location / work area is required');
            reqIssue(out, r, 'project.date', 'project', 'Date is required');
            reqIssue(out, r, 'people.preparedBy', 'project', 'Prepared by (name) is required');
            reqIssue(out, r, 'work.scope', 'work', 'Scope of work is required');
            if (!d.steps.length) out.push({ sec: 'steps', msg: 'Add at least one task step' });
            d.steps.forEach(function (st, i) {
                var b = 'steps.' + i;
                if (!trim(st.desc)) out.push({ sec: 'steps', id: fid(b + '.desc'), msg: 'Step ' + (i + 1) + ': describe what is being done' });
                if (!st.hazards.length) out.push({ sec: 'steps', id: fid(b + '.hazards'), msg: 'Step ' + (i + 1) + ': add at least one hazard' });
                if (!filled(st.controls).length) out.push({ sec: 'steps', id: fid(b + '.controls'), msg: 'Step ' + (i + 1) + ': add at least one control' });
            });
            if (!d.ppe.length) out.push({ sec: 'ppe', id: fid('ppe'), msg: 'Choose the required PPE, or “' + PPE_NONE + '”' });
            // warnings (not blockers)
            if (!d.crew.some(function (c) { return c.ack; })) out.push({ sec: 'crew', id: 'ff-crew', msg: 'No crew acknowledgements yet', level: 'warn' });
            if (trim(d.people.preparedBy) && !h.signoffValid('prepared', 'people.preparedBy')) out.push({ sec: 'signoff', id: 'ff-so-prepared', msg: 'Prepared by has not signed', level: 'warn' });
            if (!trim(d.people.reviewedBy)) out.push({ sec: 'project', id: fid('people.reviewedBy'), msg: 'Reviewed by is empty', level: 'warn' });
            else if (!h.signoffValid('reviewed', 'people.reviewedBy')) out.push({ sec: 'signoff', id: 'ff-so-reviewed', msg: 'Reviewed by has not signed', level: 'warn' });
            d.crew.forEach(function (c, i) { if (trim(c.name) && !c.ack) out.push({ sec: 'crew', id: fid('crew.' + i + '.name'), msg: c.name + ' has not acknowledged', level: 'warn' }); });
            return out;
        },
        actions: {
            'step-add': function (r, el, x) {
                r.data.steps.push({ id: x.uid('st'), desc: '', hazards: [], riskBefore: '', controls: [], responsible: '', riskAfter: '' });
                x.changed(true); x.focusLater(fid('steps.' + (r.data.steps.length - 1) + '.desc'));
            },
            'step-remove': function (r, el, x) {
                var i = parseInt(el.getAttribute('data-index'), 10), st = r.data.steps[i];
                var hasContent = trim(st.desc) || st.hazards.length || filled(st.controls).length;
                if (hasContent && !root.confirm('Delete step ' + (i + 1) + ' and everything in it?')) return;
                r.data.steps.splice(i, 1);
                x.changed(true); x.focusLater('ff-step-h-' + Math.max(0, i - 1));
            },
            'step-move': function (r, el, x) {
                var i = parseInt(el.getAttribute('data-index'), 10), d = parseInt(el.getAttribute('data-dir'), 10), s = r.data.steps;
                var t = s[i]; s[i] = s[i + d]; s[i + d] = t;
                x.changed(true); x.focusLater('ff-step-h-' + (i + d));
            }
        },
        summary: function (r) {
            var d = r.data, L = [];
            L.push(jha.docTitle(r) + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('Date: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : ''));
            if (d.people.preparedBy) L.push('Prepared by: ' + d.people.preparedBy);
            L.push('');
            L.push('Scope: ' + (d.work.scope || '-'));
            d.steps.forEach(function (st, i) {
                L.push('');
                L.push('Step ' + (i + 1) + ': ' + (st.desc || '-'));
                if (st.hazards.length) L.push('  Hazards: ' + st.hazards.join(', '));
                filled(st.controls).forEach(function (c) { L.push('  - ' + c); });
                if (st.responsible) L.push('  Responsible: ' + st.responsible);
            });
            L.push('');
            L.push('PPE: ' + (ppeText(d.ppe).join(', ') || '-'));
            if (d.work.permits.length) L.push('Permits: ' + d.work.permits.join(', '));
            if (d.emergency.contact || d.emergency.phone) L.push('Emergency: ' + [d.emergency.contact, d.emergency.phone].filter(Boolean).join(' '));
            if (d.emergency.hospital) L.push('Nearest hospital: ' + d.emergency.hospital);
            L.push('');
            L.push('Stop-work: ' + STOP_WORK);
            if (d.stopWork.conditions) L.push('Stop-work conditions: ' + d.stopWork.conditions);
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, P = h.parts;
            doc.section('Project');
            doc.fields(pdfProjectPairs(r), 3);
            var pp = [['Prepared by', d.people.preparedBy], ['Position / title', d.people.position], ['Foreman / supervisor', d.people.foreman], ['Reviewed by', d.people.reviewedBy]].filter(function (x) { return trim(x[1]); });
            if (pp.length) { doc.section('People'); doc.fields(pp, 2); }
            doc.section('Scope of work');
            doc.paragraph(d.work.scope);
            if (d.work.tools.length || d.work.permits.length) {
                doc.fields([['Tools / equipment', d.work.tools.join(', ')], ['Permits required', d.work.permits.join(', ')]].filter(function (x) { return trim(x[1]); }), 1);
            }
            doc.section('Task steps, hazards and controls', 80);
            doc.table([{ title: '#', w: 0.045 }, { title: 'Step', w: 0.2 }, { title: 'Hazards', w: 0.185 }, { title: 'Risk before', w: 0.08 }, { title: 'Controls', w: 0.29 }, { title: 'Responsible', w: 0.12 }, { title: 'Risk after', w: 0.08 }],
                d.steps.map(function (st, i) {
                    return [{ parts: [{ t: String(i + 1), b: true }] }, st.desc || '', st.hazards.join(', '), RISK_TEXT[st.riskBefore] || '',
                        { parts: filled(st.controls).map(function (c) { return { t: '• ' + c }; }) }, st.responsible || '', RISK_TEXT[st.riskAfter] || ''];
                }));
            doc.paragraph(HAZARD_DISCLAIMER, { size: 8, font: 'I', gray: 0.25 });
            doc.section('Required PPE');
            doc.paragraph(ppeText(d.ppe).join('  ·  ') || '-');
            var e = d.emergency, ep = [['Emergency contact', e.contact], ['Emergency phone', e.phone], ['Nearest hospital / clinic', e.hospital]].filter(function (x) { return trim(x[1]); });
            if (ep.length || trim(e.plan)) {
                doc.section('Emergency');
                if (ep.length) doc.fields(ep, 3);
                if (trim(e.plan)) { doc.paragraph('What to do if something goes wrong', { font: 'B', size: 8.5, after: 1 }); doc.paragraph(e.plan); }
            }
            doc.section('Stop-work authority');
            doc.paragraph(STOP_WORK);
            if (trim(d.stopWork.conditions)) { doc.paragraph('Stop-work conditions for this work', { font: 'B', size: 8.5, after: 1 }); doc.paragraph(d.stopWork.conditions); }
            if (trim(d.notes)) { doc.section('Notes'); doc.paragraph(d.notes); }
            doc.section('Crew acknowledgement', 70);
            P.crew(doc, r, jha.crewStatement, h.cache);
            doc.section('Sign-off', 70);
            P.signoffs(doc, r, jha.signoffRoles, h.cache);
        }
    };

    // =====================================================================
    // Daily Pre-Task Plan
    // =====================================================================
    var ptp = {
        type: 'ptp',
        label: 'Daily Pre-Task Plan',
        description: 'The short shift-start plan: today’s work, hazards and controls, PPE and permits, then crew sign-on. About 5 minutes.',
        startLabel: 'Start Pre-Task Plan',
        blankPdf: '/public/downloads/pre_task_safety_plan.pdf',
        authorPath: 'project.foreman',
        prefix: function () { return 'PTP'; },
        shortTitle: function () { return 'Pre-Task Plan'; },
        docTitle: function () { return 'Daily Pre-Task Plan'; },
        crewStatement: 'I have reviewed today’s pre-task plan and understand the hazards, controls and PPE for my work.',
        finalizeStatement: 'I reviewed today’s hazards, controls and PPE with the crew listed.',
        signoffRoles: [
            { role: 'foreman', label: 'Foreman', namePath: 'project.foreman', statement: 'I prepared today’s pre-task plan and reviewed it with the crew listed.', required: true }
        ],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '', superintendent: '', foreman: '' },
                work: { scope: '', tools: [] },
                hazards: [], hazardControls: {}, ppe: [], permits: [],
                emergency: { contact: '', phone: '', hospital: '' }, stopWork: { conditions: '' }, notes: '',
                crew: [], signoff: {}
            };
        },
        sections: [
            {
                id: 'project', title: 'Project & Crew Leads',
                render: function (r, ui) {
                    return projectFields(ui, { timeLabel: 'Time' }) + '<div class="ff-grid2">' +
                        ui.text('project.superintendent', 'Superintendent') +
                        ui.text('project.foreman', 'Foreman (name)', { required: true, hint: 'The foreman signs off this plan.' }) + '</div>';
                },
                review: function (r, rv) { var p = r.data.project; return rvProject(r, rv, [['Superintendent', p.superintendent], ['Foreman', p.foreman, true]]); }
            },
            {
                id: 'work', title: 'Today’s Work',
                render: function (r, ui) {
                    return ui.text('work.scope', 'Today’s scope of work', { required: true, multiline: true, rows: 4, placeholder: 'What is the crew doing today, and where?' }) +
                        ui.choices('work.tools', 'Tools / equipment', { options: TOOLS, customLabel: 'Add other tools or equipment' });
                },
                review: function (r, rv) {
                    var w = r.data.work;
                    return (rv.text(w.scope, 'Today’s scope') || rv.missing('Scope of work is missing')) + (w.tools.length ? rv.label('Tools / equipment') + rv.list(w.tools) : '');
                }
            },
            {
                id: 'hazards', title: 'Hazards & Controls',
                intro: 'Pick the hazards for today’s work. Each hazard you pick needs at least one control.',
                render: function (r, ui) {
                    var h = ui.choices('hazards', 'Today’s hazards', { required: true, groups: HAZARD_GROUPS, hint: LIB_HINT, customLabel: 'Add a hazard', exclusive: HAZ_NONE,
                        exclusiveHint: 'Choose this only if, after looking at today’s work, no significant hazards were identified. It is printed on the record.' });
                    var hz = r.data.hazards.filter(function (x) { return x !== HAZ_NONE; });
                    if (hz.length) {
                        h += '<h3 class="ff-h3">Controls for each hazard</h3>';
                        hz.forEach(function (name) {
                            var k = hazKey(name);
                            if (!r.data.hazardControls[k]) r.data.hazardControls[k] = [];
                            h += '<div class="ff-haz-card">' + ui.items('hazardControls.' + k, 'Controls for: ' + name, { required: true, itemLabel: 'Control for ' + name, addLabel: 'Add a control', suggestions: CONTROL_SUGGESTIONS[name] || [] }) + '</div>';
                        });
                    }
                    return h;
                },
                review: function (r, rv) {
                    var d = r.data, esc = C.esc;
                    if (d.hazards.indexOf(HAZ_NONE) >= 0) return '<p class="ff-rv-text"><strong>' + esc(HAZ_NONE) + '</strong> (confirmed by the preparer)</p>';
                    if (!d.hazards.length) return rv.missing('Hazards are missing');
                    return '<div class="ff-table-wrap"><table class="ff-table"><thead><tr><th scope="col">Hazard</th><th scope="col">Controls</th></tr></thead><tbody>' +
                        d.hazards.map(function (name) {
                            var c = filled(d.hazardControls[hazKey(name)]);
                            return '<tr><th scope="row" data-label="Hazard">' + esc(name) + '</th><td data-label="Controls">' + (c.length ? '<ul class="ff-cell-list">' + c.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<span class="ff-missing">Missing</span>') + '</td></tr>';
                        }).join('') + '</tbody></table></div><p class="ff-rv-note">' + esc(HAZARD_DISCLAIMER) + '</p>';
                }
            },
            {
                id: 'ppe', title: 'PPE & Permits',
                render: function (r, ui) {
                    return ui.choices('ppe', 'Required PPE', { required: true, options: PPE, exclusive: PPE_NONE, exclusiveHint: 'Choose this only if nothing beyond your site’s minimum PPE is needed.', customLabel: 'Add other PPE', hint: 'Nothing is pre-selected.' }) +
                        ui.choices('permits', 'Permits', { options: PERMITS, exclusive: PERMITS_NONE, exclusiveHint: 'Choose “None” only if no permit applies today.', customLabel: 'Add another permit' });
                },
                review: function (r, rv) {
                    return rv.label('Required PPE') + (r.data.ppe.length ? rv.list(ppeText(r.data.ppe)) : rv.missing('PPE is missing')) +
                        (r.data.permits.length ? rv.label('Permits') + rv.list(r.data.permits) : '');
                }
            },
            {
                id: 'stop', title: 'Stop-Work, Emergency & Notes',
                render: function (r, ui) {
                    return stopWorkBlock(ui) + '<h3 class="ff-h3">Emergency <span class="ff-opt">(optional, recommended)</span></h3>' + emergencyFields(ui, false) +
                        '<h3 class="ff-h3">Notes</h3>' + ui.text('notes', 'Notes', { multiline: true, rows: 3 });
                },
                review: function (r, rv) {
                    var e = r.data.emergency;
                    return rv.text(STOP_WORK, 'Stop-work authority') + rv.text(r.data.stopWork.conditions, 'Stop-work conditions') +
                        rv.fields([['Emergency contact', e.contact], ['Emergency phone', e.phone], ['Nearest hospital / clinic', e.hospital]]).replace('<p class="ff-none">Nothing entered.</p>', '') +
                        rv.text(r.data.notes, 'Notes');
                }
            },
            {
                id: 'crew', title: 'Crew Sign-On',
                intro: 'At least one crew acknowledgement is required. Pass the device: each person types their name, confirms and signs.',
                render: function (r, ui) { return ui.crew(); },
                review: function (r, rv) { return rv.crew(r, ptp.crewStatement); }
            },
            {
                id: 'signoff', title: 'Foreman Sign-Off',
                intro: 'The foreman’s typed name is required. A drawn signature is recommended.',
                render: function (r, ui) { return ui.signoff('foreman', 'Foreman', 'project.foreman', 'Project & Crew Leads'); },
                review: function (r, rv) { return rv.signoffs(r, ptp.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            reqIssue(out, r, 'project.name', 'project', 'Project name is required');
            reqIssue(out, r, 'project.location', 'project', 'Location / work area is required');
            reqIssue(out, r, 'project.date', 'project', 'Date is required');
            reqIssue(out, r, 'project.foreman', 'project', 'Foreman name is required');
            reqIssue(out, r, 'work.scope', 'work', 'Today’s scope of work is required');
            if (!d.hazards.length) out.push({ sec: 'hazards', id: fid('hazards'), msg: 'Pick at least one hazard, or confirm “' + HAZ_NONE + '”' });
            d.hazards.forEach(function (name) {
                if (name === HAZ_NONE) return;
                var k = hazKey(name);
                if (!filled(d.hazardControls[k]).length) out.push({ sec: 'hazards', id: fid('hazardControls.' + k), msg: 'Add a control for: ' + name });
            });
            if (!d.ppe.length) out.push({ sec: 'ppe', id: fid('ppe'), msg: 'Choose the required PPE, or “' + PPE_NONE + '”' });
            if (!d.crew.some(function (c) { return c.ack; })) out.push({ sec: 'crew', id: 'ff-crew', msg: 'At least one crew member must acknowledge the plan' });
            if (trim(d.project.foreman) && !h.signoffValid('foreman', 'project.foreman')) out.push({ sec: 'signoff', id: 'ff-so-foreman', msg: 'Foreman has not signed', level: 'warn' });
            d.crew.forEach(function (c, i) { if (trim(c.name) && !c.ack) out.push({ sec: 'crew', id: fid('crew.' + i + '.name'), msg: c.name + ' has not acknowledged', level: 'warn' }); });
            return out;
        },
        summary: function (r) {
            var d = r.data, L = [];
            L.push('Daily Pre-Task Plan' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('Date: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : ''));
            if (d.project.foreman) L.push('Foreman: ' + d.project.foreman);
            L.push('');
            L.push('Today\'s work: ' + (d.work.scope || '-'));
            L.push('');
            if (d.hazards.indexOf(HAZ_NONE) >= 0) L.push(HAZ_NONE + ' (confirmed)');
            else d.hazards.forEach(function (name) {
                L.push('Hazard: ' + name);
                filled(d.hazardControls[hazKey(name)]).forEach(function (c) { L.push('  - ' + c); });
            });
            L.push('');
            L.push('PPE: ' + (ppeText(d.ppe).join(', ') || '-'));
            if (d.permits.length) L.push('Permits: ' + d.permits.join(', '));
            L.push('');
            L.push('Stop-work: ' + STOP_WORK);
            if (d.stopWork.conditions) L.push('Stop-work conditions: ' + d.stopWork.conditions);
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, P = h.parts;
            doc.section('Project');
            doc.fields(pdfProjectPairs(r, [['Superintendent', d.project.superintendent], ['Foreman', d.project.foreman]]), 3);
            doc.section('Today\'s scope of work');
            doc.paragraph(d.work.scope);
            if (d.work.tools.length) doc.fields([['Tools / equipment', d.work.tools.join(', ')]], 1);
            doc.section('Hazards and controls', 70);
            if (d.hazards.indexOf(HAZ_NONE) >= 0) doc.paragraph(HAZ_NONE + ' (confirmed by the preparer).', { font: 'B' });
            else doc.table([{ title: 'Hazard', w: 0.32 }, { title: 'Controls', w: 0.68 }], d.hazards.map(function (name) {
                return [{ parts: [{ t: name, b: true }] }, { parts: filled(d.hazardControls[hazKey(name)]).map(function (c) { return { t: '• ' + c }; }) }];
            }));
            doc.paragraph(HAZARD_DISCLAIMER, { size: 8, font: 'I', gray: 0.25 });
            doc.section('PPE and permits');
            doc.fields([['Required PPE', ppeText(d.ppe).join(', ')], ['Permits', d.permits.join(', ')]].filter(function (x) { return trim(x[1]); }), 1);
            doc.section('Stop-work authority');
            doc.paragraph(STOP_WORK);
            if (trim(d.stopWork.conditions)) { doc.paragraph('Stop-work conditions', { font: 'B', size: 8.5, after: 1 }); doc.paragraph(d.stopWork.conditions); }
            var e = d.emergency, ep = [['Emergency contact', e.contact], ['Emergency phone', e.phone], ['Nearest hospital / clinic', e.hospital]].filter(function (x) { return trim(x[1]); });
            if (ep.length) { doc.section('Emergency'); doc.fields(ep, 3); }
            if (trim(d.notes)) { doc.section('Notes'); doc.paragraph(d.notes); }
            doc.section('Crew sign-on', 70);
            P.crew(doc, r, ptp.crewStatement, h.cache);
            doc.section('Foreman sign-off', 70);
            P.signoffs(doc, r, ptp.signoffRoles, h.cache);
        }
    };

    A.register(ptp);
    A.register(jha);
    BAFF.safetyLibraries = { HAZARD_GROUPS: HAZARD_GROUPS, CONTROL_SUGGESTIONS: CONTROL_SUGGESTIONS, PPE: PPE, PERMITS: PERMITS, TOOLS: TOOLS };
})(typeof window !== 'undefined' ? window : this);

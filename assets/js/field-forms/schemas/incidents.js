/*
 * Builder Ascent Field Forms - Incident Report and Near Miss Report (v1)
 * Decision D-09 / R-20 (Scott, 2026-11-08): MINIMAL DETAIL. Records keep what happened, where and when,
 * people involved (name, company, role), type, level of care only, causes, actions and follow-up.
 * No diagnosis, body part, treatment details or medical history. Fields come from the existing
 * Builder Ascent sheets (public/downloads/incident_report.pdf, near_miss_report.pdf).
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function filled(arr) { return (arr || []).filter(function (x) { return trim(x); }); }

    var PRIVACY = '<div class="ff-privacy"><strong>Privacy:</strong> record facts only. Do not enter diagnosis, body part, treatment details or medical history here &mdash; those go through your company&rsquo;s injury reporting. This record is saved only on this device.</div>';
    var RECORD_NOTE = 'This record may name the people involved. Once the PDF has been sent to the right people, delete it from this device (button at the bottom of this page).';
    var CAUSES = ['Unsafe condition', 'Unsafe act', 'Equipment failure', 'Lack of training', 'Poor planning', 'Communication breakdown', 'PPE not used', 'Housekeeping', 'Weather'];
    var NOTIFIED = ['Supervisor', 'Superintendent', 'Safety manager', 'Project manager', 'Owner / GC', 'Emergency services (911)'];
    var YESNO = [['yes', 'Yes'], ['no', 'No']];
    var ROLES = [['injured', 'Injured'], ['involved', 'Involved'], ['witness', 'Witness']];
    var ROLE_TEXT = { injured: 'Injured', involved: 'Involved', witness: 'Witness' };

    function infoReview(rv, p, extra) {
        return rv.fields([['Project', p.name, true], ['Location', p.location, true], ['Date', C.formatDate(p.date), true], ['Time', C.formatTime(p.time)]].concat(extra || []));
    }
    function peopleRows(r, ui) {
        var rows = r.data.people || [], h = '<div class="ff-dr-rows" id="' + fid('people') + '" tabindex="-1">';
        rows.forEach(function (row, i) {
            var b = 'people.' + i;
            h += '<div class="ff-dr-row"><div class="ff-dr-row-head"><span class="ff-dr-row-n">Person ' + (i + 1) + '</span>' +
                '<button type="button" class="ff-x" data-action="ir-person-remove" data-index="' + i + '" aria-label="Remove person ' + (i + 1) + '">&times;</button></div>' +
                '<div class="ff-grid2">' + ui.text(b + '.name', 'Name', { required: true }) + ui.text(b + '.company', 'Company / trade') + '</div>' +
                ui.segment(b + '.role', 'Role', ROLES, { noClear: true }) + '</div>';
        });
        return h + '<button type="button" class="ff-btn-sm" data-action="ir-person-add">+ Add a person</button></div>';
    }
    function namedPeople(d) { return (d.people || []).filter(function (x) { return trim(x.name); }); }
    var personActions = {
        'ir-person-add': function (r, el, x) {
            r.data.people = (r.data.people || []).concat([{ name: '', company: '', role: '' }]);
            x.changed(true); x.focusLater(fid('people.' + (r.data.people.length - 1) + '.name'));
        },
        'ir-person-remove': function (r, el, x) {
            var i = parseInt(el.getAttribute('data-index'), 10), p = r.data.people[i];
            if (trim(p.name) && !root.confirm('Remove ' + p.name + ' from this report?')) return;
            r.data.people.splice(i, 1); x.changed(true); x.focusLater(fid('people'));
        }
    };

    // =====================================================================
    // Incident Report
    // =====================================================================
    var TYPES = ['Injury', 'Illness', 'Property damage', 'Equipment damage', 'Environmental (spill / release)', 'Vehicle'];
    var CARE = [['none', 'None needed'], ['firstaid', 'First aid'], ['medical', 'Medical treatment'], ['losttime', 'Lost time'], ['restricted', 'Restricted duty'], ['fatality', 'Fatality']];
    var CARE_TEXT = {}; CARE.forEach(function (c) { CARE_TEXT[c[0]] = c[1]; });
    function hasInjury(d) { return (d.what.types || []).some(function (t) { return t === 'Injury' || t === 'Illness'; }); }

    var incident = {
        type: 'incident',
        label: 'Incident Report',
        description: 'Record an incident while it’s fresh: what happened, who was involved, the level of care, causes, what was done right away and what will prevent it next time.',
        startLabel: 'Start an Incident Report',
        blankPdf: '/public/downloads/incident_report.pdf',
        authorPath: 'project.reporter',
        recordNote: RECORD_NOTE,
        prefix: function () { return 'IR'; },
        shortTitle: function () { return 'Incident Report'; },
        docTitle: function () { return 'Incident Report'; },
        finalizeStatement: 'This report is a factual account of the incident to the best of my knowledge.',
        signoffRoles: [
            { role: 'reporter', label: 'Reported by', namePath: 'project.reporter', statement: 'This is a factual account of what happened, to the best of my knowledge.', required: true },
            { role: 'supervisor', label: 'Supervisor', namePath: 'project.supervisor', statement: 'I reviewed this incident report.' }
        ],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '', reporter: '', jobTitle: '', supervisor: '', reported: C.todayISO() },
                what: { types: [], care: '', description: '', task: '' },
                people: [],
                causes: { list: [], detail: '', immediate: '', notified: [], workStopped: '', preventive: [''] },
                followup: { responsible: '', target: '', completed: '', verifiedBy: '' },
                signoff: {}
            };
        },
        sections: [
            {
                id: 'info', title: 'Incident Info',
                render: function (r, ui) {
                    return ui.projectPicker() + '<div class="ff-grid2">' +
                        ui.text('project.name', 'Project name', { required: true }) + ui.text('project.location', 'Location / area', { required: true }) +
                        ui.text('project.date', 'Date of incident', { type: 'date', required: true }) + ui.text('project.time', 'Time of incident', { type: 'time', required: true, now: true }) +
                        ui.text('project.reporter', 'Reported by (name)', { required: true }) + ui.text('project.jobTitle', 'Job title') +
                        ui.text('project.company', 'Company') + ui.text('project.supervisor', 'Supervisor (name)') +
                        ui.text('project.reported', 'Date reported', { type: 'date' }) + '</div>';
                },
                review: function (r, rv) {
                    var p = r.data.project;
                    return infoReview(rv, p, [['Reported by', p.reporter, true], ['Job title', p.jobTitle], ['Company', p.company], ['Supervisor', p.supervisor], ['Date reported', C.formatDate(p.reported)]]);
                }
            },
            {
                id: 'what', title: 'What Happened',
                render: function (r, ui) {
                    var d = r.data;
                    return PRIVACY + ui.choices('what.types', 'Type of incident', { required: true, options: TYPES, customLabel: 'Add other type', hint: 'Check all that apply.' }) +
                        (hasInjury(d) ? ui.segment('what.care', 'Level of care (if injury or illness)', CARE, { required: true, hint: 'The highest level of care given. No diagnosis or treatment details.' }) : '') +
                        ui.text('what.description', 'What happened?', { required: true, multiline: true, rows: 5, hint: 'Facts only: who, what, where, when, how. No opinions or blame.' }) +
                        ui.text('what.task', 'What task was being performed?');
                },
                review: function (r, rv) {
                    var w = r.data.what;
                    return rv.fields([['Type', w.types.join(', '), true], ['Level of care', CARE_TEXT[w.care]], ['Task being performed', w.task]]) + (rv.text(w.description, 'What happened') || rv.missing('Description is missing'));
                }
            },
            {
                id: 'people', title: 'People Involved',
                render: function (r, ui) { return PRIVACY + '<p class="ff-hint">Names, company and role only.</p>' + peopleRows(r, ui); },
                review: function (r, rv) {
                    var p = namedPeople(r.data);
                    return p.length ? rv.list(p.map(function (x) { return x.name + (x.company ? ' (' + x.company + ')' : '') + (ROLE_TEXT[x.role] ? ' — ' + ROLE_TEXT[x.role] : ''); })) : '<p class="ff-none">No people listed.</p>';
                }
            },
            {
                id: 'causes', title: 'Causes & Actions',
                render: function (r, ui) {
                    return ui.choices('causes.list', 'What contributed to this incident?', { options: CAUSES, customLabel: 'Add other cause' }) +
                        ui.text('causes.detail', 'Explain the causes', { multiline: true, rows: 3 }) +
                        ui.text('causes.immediate', 'Immediate actions taken', { required: true, multiline: true, rows: 3, placeholder: 'e.g. First aid given, area barricaded, equipment tagged out' }) +
                        ui.choices('causes.notified', 'Who was notified?', { options: NOTIFIED, customLabel: 'Add other' }) +
                        ui.segment('causes.workStopped', 'Was work stopped?', YESNO) +
                        ui.items('causes.preventive', 'Preventive actions — what will stop this from happening again', { required: true, itemLabel: 'Preventive action', addLabel: 'Add an action' });
                },
                review: function (r, rv) {
                    var c = r.data.causes;
                    return rv.fields([['Contributing causes', c.list.join(', ')], ['Cause detail', c.detail], ['Immediate actions', c.immediate, true], ['Notified', c.notified.join(', ')], ['Work stopped', { yes: 'Yes', no: 'No' }[c.workStopped]]]) +
                        rv.label('Preventive actions') + (filled(c.preventive).length ? rv.list(c.preventive) : rv.missing('Preventive actions are missing'));
                }
            },
            {
                id: 'followup', title: 'Follow-Up',
                render: function (r, ui) {
                    return '<p class="ff-hint">Who makes sure the preventive actions get done. Fill in now or in a revision later.</p><div class="ff-grid2">' +
                        ui.text('followup.responsible', 'Responsible person') + ui.text('followup.target', 'Target completion date', { type: 'date' }) +
                        ui.text('followup.completed', 'Date completed', { type: 'date' }) + ui.text('followup.verifiedBy', 'Verified by') + '</div>';
                },
                review: function (r, rv) {
                    var f = r.data.followup;
                    return rv.fields([['Responsible person', f.responsible], ['Target date', C.formatDate(f.target)], ['Date completed', C.formatDate(f.completed)], ['Verified by', f.verifiedBy]]);
                }
            },
            {
                id: 'signoff', title: 'Sign-Off',
                intro: 'The reporter’s typed name is required. The supervisor reviews and signs separately.',
                render: function (r, ui) { return ui.signoff('reporter', 'Reported by', 'project.reporter', 'Incident Info') + ui.signoff('supervisor', 'Supervisor', 'project.supervisor', 'Incident Info'); },
                review: function (r, rv) { return rv.signoffs(r, incident.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            [['project.name', 'Project name is required'], ['project.location', 'Location is required'], ['project.date', 'Date of incident is required'], ['project.time', 'Time of incident is required'], ['project.reporter', 'Reported by (name) is required']]
                .forEach(function (p) { if (C.isBlank(C.getPath(d, p[0]))) out.push({ sec: 'info', id: fid(p[0]), msg: p[1] }); });
            if (!d.what.types.length) out.push({ sec: 'what', id: fid('what.types'), msg: 'Choose the type of incident' });
            if (hasInjury(d) && !d.what.care) out.push({ sec: 'what', id: fid('what.care'), msg: 'Choose the level of care given' });
            if (C.isBlank(d.what.description)) out.push({ sec: 'what', id: fid('what.description'), msg: 'Describe what happened' });
            (d.people || []).forEach(function (p, i) { if (!trim(p.name) && (trim(p.company) || p.role)) out.push({ sec: 'people', id: fid('people.' + i + '.name'), msg: 'Person ' + (i + 1) + ': add a name' }); });
            if (C.isBlank(d.causes.immediate)) out.push({ sec: 'causes', id: fid('causes.immediate'), msg: 'Describe the immediate actions taken' });
            if (!filled(d.causes.preventive).length) out.push({ sec: 'causes', id: fid('causes.preventive'), msg: 'Add at least one preventive action' });
            if (hasInjury(d) && !namedPeople(d).some(function (p) { return p.role === 'injured'; })) out.push({ sec: 'people', id: fid('people'), msg: 'Injury reported but no person marked "Injured"', level: 'warn' });
            if (!namedPeople(d).length) out.push({ sec: 'people', id: fid('people'), msg: 'No people listed', level: 'warn' });
            if (!d.causes.notified.length) out.push({ sec: 'causes', id: fid('causes.notified'), msg: 'No one recorded as notified', level: 'warn' });
            if (trim(d.project.reporter) && !h.signoffValid('reporter', 'project.reporter')) out.push({ sec: 'signoff', id: 'ff-so-reporter', msg: 'Reporter has not signed', level: 'warn' });
            return out;
        },
        actions: personActions,
        summary: function (r) {
            var d = r.data, L = [];
            L.push('Incident Report' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('When: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : '') + (d.project.reporter ? ' - reported by ' + d.project.reporter : ''));
            L.push('Type: ' + (d.what.types.join(', ') || '-') + (CARE_TEXT[d.what.care] ? ' - level of care: ' + CARE_TEXT[d.what.care] : ''));
            L.push(''); L.push(d.what.description || '');
            if (d.causes.immediate) { L.push(''); L.push('Immediate actions: ' + d.causes.immediate); }
            if (filled(d.causes.preventive).length) { L.push('Preventive actions:'); filled(d.causes.preventive).forEach(function (x) { L.push('  - ' + x); }); }
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, p = d.project, w = d.what, c = d.causes, f = d.followup, P = h.parts;
            doc.section('Incident information');
            doc.fields([['Project', p.name], ['Location / area', p.location], ['Date of incident', C.formatDate(p.date)], ['Time', C.formatTime(p.time)], ['Reported by', p.reporter],
                ['Job title', p.jobTitle], ['Company', p.company], ['Supervisor', p.supervisor], ['Date reported', C.formatDate(p.reported)]].filter(function (x) { return trim(x[1]); }), 3);
            doc.section('Type and level of care');
            doc.fields([['Type of incident', w.types.join(', ')], ['Level of care', CARE_TEXT[w.care]], ['Task being performed', w.task]].filter(function (x) { return trim(x[1]); }), 3);
            doc.section('What happened'); doc.paragraph(w.description);
            var ppl = namedPeople(d);
            if (ppl.length) { doc.section('People involved', 50); doc.table([{ title: 'Name', w: 0.4 }, { title: 'Company / trade', w: 0.4 }, { title: 'Role', w: 0.2 }], ppl.map(function (x) { return [{ parts: [{ t: x.name, b: true }] }, x.company || '', ROLE_TEXT[x.role] || '']; })); }
            doc.section('Causes');
            if (c.list.length || trim(c.detail)) doc.fields([['Contributing causes', c.list.join(', ')], ['Detail', c.detail]].filter(function (x) { return trim(x[1]); }), 1);
            else doc.paragraph('Not recorded.', { font: 'I' });
            doc.section('Actions');
            doc.fields([['Immediate actions taken', c.immediate], ['Notified', c.notified.join(', ')], ['Work stopped', { yes: 'Yes', no: 'No' }[c.workStopped]]].filter(function (x) { return trim(x[1]); }), 1);
            doc.paragraph('Preventive actions', { font: 'B', size: 8.5, after: 1 }); doc.bullets(filled(c.preventive));
            var ff = [['Responsible person', f.responsible], ['Target date', C.formatDate(f.target)], ['Date completed', C.formatDate(f.completed)], ['Verified by', f.verifiedBy]].filter(function (x) { return trim(x[1]); });
            if (ff.length) { doc.section('Follow-up'); doc.fields(ff, 2); }
            doc.section('Sign-off', 70);
            P.signoffs(doc, r, incident.signoffRoles, h.cache);
            doc.paragraph('Facts only. Medical details are not recorded on this form; they belong in the company\'s injury reporting.', { size: 8, font: 'I', gray: 0.25 });
        }
    };

    // =====================================================================
    // Near Miss Report
    // =====================================================================
    var OUTCOMES = ['Injury', 'Fatality', 'Property damage', 'Equipment damage', 'Environmental impact'];
    var SEVERITY = [['low', 'Low'], ['med', 'Medium'], ['high', 'High']];
    var SEV_TEXT = { low: 'Low', med: 'Medium', high: 'High' };
    var VERIFY = ['Issue corrected', 'Procedure updated', 'Training provided', 'Monitoring in place'];

    var nearmiss = {
        type: 'nearmiss',
        label: 'Near Miss Report',
        description: 'Report the close call before it becomes an injury: what happened, what could have happened, why, and what will fix it. Your name is optional.',
        startLabel: 'Report a Near Miss',
        blankPdf: '/public/downloads/near_miss_report.pdf',
        authorPath: 'project.reporter',
        recordNote: RECORD_NOTE,
        prefix: function () { return 'NM'; },
        shortTitle: function () { return 'Near Miss'; },
        docTitle: function () { return 'Near Miss Report'; },
        finalizeStatement: 'This is a factual account of the near miss to the best of my knowledge.',
        signoffRoles: [
            { role: 'reporter', label: 'Reported by', namePath: 'project.reporter', statement: 'This is a factual account of what happened, to the best of my knowledge.' },
            { role: 'supervisor', label: 'Supervisor', namePath: 'project.supervisor', statement: 'I reviewed this near miss report.' }
        ],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '', reporter: '', supervisor: '' },
                what: { description: '', where: '', outcomes: [], severity: '' },
                causes: { list: [], immediate: '', corrective: [''] },
                followup: { responsible: '', due: '', verification: [], verifiedBy: '', verifiedDate: '', lessons: '' },
                signoff: {}
            };
        },
        sections: [
            {
                id: 'info', title: 'Near Miss Info',
                render: function (r, ui) {
                    return ui.projectPicker() + '<div class="ff-grid2">' +
                        ui.text('project.name', 'Project name', { required: true }) + ui.text('project.location', 'Location', { required: true }) +
                        ui.text('project.date', 'Date', { type: 'date', required: true }) + ui.text('project.time', 'Time', { type: 'time', now: true }) +
                        ui.text('project.reporter', 'Reported by (name)', { hint: 'Optional — leave blank to report without your name.' }) + ui.text('project.supervisor', 'Supervisor (name)') + '</div>';
                },
                review: function (r, rv) { var p = r.data.project; return infoReview(rv, p, [['Reported by', p.reporter || 'Not given'], ['Supervisor', p.supervisor]]); }
            },
            {
                id: 'what', title: 'What Happened',
                render: function (r, ui) {
                    return PRIVACY + ui.text('what.description', 'Describe what happened', { required: true, multiline: true, rows: 5, hint: 'Facts only. No names needed.' }) +
                        ui.text('what.where', 'Where exactly did it occur?') +
                        ui.choices('what.outcomes', 'What could have happened?', { options: OUTCOMES, customLabel: 'Add other' }) +
                        ui.segment('what.severity', 'How serious could it have been?', SEVERITY);
                },
                review: function (r, rv) {
                    var w = r.data.what;
                    return (rv.text(w.description, 'What happened') || rv.missing('Description is missing')) + rv.fields([['Where exactly', w.where], ['Potential outcome', w.outcomes.join(', ')], ['Potential severity', SEV_TEXT[w.severity]]]);
                }
            },
            {
                id: 'causes', title: 'Cause & Corrective Action',
                render: function (r, ui) {
                    return ui.choices('causes.list', 'What led to this?', { options: CAUSES, customLabel: 'Add other cause' }) +
                        ui.text('causes.immediate', 'Immediate action taken', { multiline: true, rows: 2 }) +
                        ui.items('causes.corrective', 'Corrective actions — what will be done to prevent this', { required: true, itemLabel: 'Corrective action', addLabel: 'Add an action' });
                },
                review: function (r, rv) {
                    var c = r.data.causes;
                    return rv.fields([['Root cause', c.list.join(', ')], ['Immediate action', c.immediate]]) + rv.label('Corrective actions') + (filled(c.corrective).length ? rv.list(c.corrective) : rv.missing('Corrective actions are missing'));
                }
            },
            {
                id: 'followup', title: 'Follow-Up & Lessons',
                render: function (r, ui) {
                    return '<div class="ff-grid2">' + ui.text('followup.responsible', 'Responsible person') + ui.text('followup.due', 'Date to complete', { type: 'date' }) + '</div>' +
                        ui.choices('followup.verification', 'Follow-up verification', { options: VERIFY, customLabel: 'Add other', hint: 'Check what has been done so far.' }) +
                        '<div class="ff-grid2">' + ui.text('followup.verifiedBy', 'Verified by') + ui.text('followup.verifiedDate', 'Verification date', { type: 'date' }) + '</div>' +
                        ui.text('followup.lessons', 'Lessons learned — what should the crew take away?', { multiline: true, rows: 3 });
                },
                review: function (r, rv) {
                    var f = r.data.followup;
                    return rv.fields([['Responsible person', f.responsible], ['Date to complete', C.formatDate(f.due)], ['Verification', f.verification.join(', ')], ['Verified by', f.verifiedBy], ['Verification date', C.formatDate(f.verifiedDate)]]) + rv.text(f.lessons, 'Lessons learned');
                }
            },
            {
                id: 'signoff', title: 'Sign-Off',
                intro: 'Both sign-offs are optional for a near miss. Reporting it is what counts.',
                render: function (r, ui) { return ui.signoff('reporter', 'Reported by', 'project.reporter', 'Near Miss Info') + ui.signoff('supervisor', 'Supervisor', 'project.supervisor', 'Near Miss Info'); },
                review: function (r, rv) { return rv.signoffs(r, nearmiss.signoffRoles); }
            }
        ],
        validate: function (r) {
            var out = [], d = r.data;
            [['project.name', 'Project name is required'], ['project.location', 'Location is required'], ['project.date', 'Date is required']]
                .forEach(function (p) { if (C.isBlank(C.getPath(d, p[0]))) out.push({ sec: 'info', id: fid(p[0]), msg: p[1] }); });
            if (C.isBlank(d.what.description)) out.push({ sec: 'what', id: fid('what.description'), msg: 'Describe what happened' });
            if (!filled(d.causes.corrective).length) out.push({ sec: 'causes', id: fid('causes.corrective'), msg: 'Add at least one corrective action' });
            if (!d.what.severity) out.push({ sec: 'what', id: fid('what.severity'), msg: 'Potential severity not chosen', level: 'warn' });
            if (filled(d.causes.corrective).length && !trim(d.followup.responsible)) out.push({ sec: 'followup', id: fid('followup.responsible'), msg: 'No one named to complete the corrective actions', level: 'warn' });
            return out;
        },
        summary: function (r) {
            var d = r.data, L = [];
            L.push('Near Miss Report' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('When: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : ''));
            L.push(''); L.push(d.what.description || '');
            if (d.what.outcomes.length) L.push('Could have resulted in: ' + d.what.outcomes.join(', ') + (SEV_TEXT[d.what.severity] ? ' (' + SEV_TEXT[d.what.severity] + ' severity)' : ''));
            if (filled(d.causes.corrective).length) { L.push('Corrective actions:'); filled(d.causes.corrective).forEach(function (x) { L.push('  - ' + x); }); }
            if (d.followup.lessons) L.push('Lessons learned: ' + d.followup.lessons);
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, p = d.project, w = d.what, c = d.causes, f = d.followup, P = h.parts;
            doc.section('Near miss information');
            doc.fields([['Project', p.name], ['Location', p.location], ['Date', C.formatDate(p.date)], ['Time', C.formatTime(p.time)], ['Reported by', p.reporter || 'Not given'], ['Supervisor', p.supervisor]]
                .filter(function (x) { return trim(x[1]); }), 3);
            doc.section('What happened'); doc.paragraph(w.description);
            var wf = [['Where exactly', w.where], ['Potential outcome', w.outcomes.join(', ')], ['Potential severity', SEV_TEXT[w.severity]]].filter(function (x) { return trim(x[1]); });
            if (wf.length) doc.fields(wf, 3);
            doc.section('Cause and corrective action');
            var cf = [['Root cause', c.list.join(', ')], ['Immediate action', c.immediate]].filter(function (x) { return trim(x[1]); });
            if (cf.length) doc.fields(cf, 1);
            doc.paragraph('Corrective actions', { font: 'B', size: 8.5, after: 1 }); doc.bullets(filled(c.corrective));
            var ff = [['Responsible person', f.responsible], ['Date to complete', C.formatDate(f.due)], ['Verification', f.verification.join(', ')], ['Verified by', f.verifiedBy], ['Verification date', C.formatDate(f.verifiedDate)]].filter(function (x) { return trim(x[1]); });
            if (ff.length || trim(f.lessons)) { doc.section('Follow-up'); if (ff.length) doc.fields(ff, 3); if (trim(f.lessons)) { doc.paragraph('Lessons learned', { font: 'B', size: 8.5, after: 1 }); doc.paragraph(f.lessons); } }
            if (trim(p.reporter) || trim(p.supervisor)) { doc.section('Sign-off', 70); P.signoffs(doc, r, nearmiss.signoffRoles, h.cache); }
        }
    };

    A.register(incident);
    A.register(nearmiss);
})(typeof window !== 'undefined' ? window : this);

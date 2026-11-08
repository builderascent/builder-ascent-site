/*
 * Builder Ascent Field Forms - Toolbox Talk / Safety Meeting (v1)
 * Part of the Safety Planning family: reuses the crew sign-on ("pass the device") and sign-off
 * components. Fields come from the existing Builder Ascent Toolbox Talk sheet
 * (public/downloads/toolbox_talk.pdf). Nothing is pre-selected.
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, A = BAFF.app;
    var fid = A.fid, esc = C.esc;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function filled(arr) { return (arr || []).filter(function (x) { return trim(x); }); }

    var PPE = (BAFF.safetyLibraries && BAFF.safetyLibraries.PPE) || ['Hard hat', 'Safety glasses', 'Gloves', 'High-vis vest', 'Steel-toe boots', 'Hearing protection', 'Respiratory protection', 'Fall protection'];
    var TYPES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['special', 'Special']];
    var TYPE_TEXT = { daily: 'Daily', weekly: 'Weekly', special: 'Special' };
    var TOPICS = ['Ladder safety', 'Fall protection', 'Housekeeping', 'Heat illness prevention', 'Cold stress', 'Silica dust', 'Hearing protection', 'Electrical safety / Lockout-Tagout', 'Excavation and trenching', 'Struck-by hazards', 'Hand and power tools', 'Lifting and back safety', 'PPE inspection and use', 'Fire prevention / hot work', 'Scaffold safety', 'Aerial and scissor lifts', 'Crane and rigging', 'Hazard communication', 'Emergency procedures', 'Slips, trips and falls'];
    var STOP_WORK = 'If you see something unsafe, stop work. You have the authority and the responsibility to stop any job if an unsafe condition exists. We watch out for each other: speak up, stop it, fix it.';

    var tbt = {
        type: 'tbt',
        label: 'Toolbox Talk',
        description: 'Run the safety meeting: topic, key points, hazards and controls, PPE — then pass the device so every attendee signs in.',
        startLabel: 'Start a Toolbox Talk',
        blankPdf: '/public/downloads/toolbox_talk.pdf',
        authorPath: 'project.leader',
        prefix: function () { return 'TBT'; },
        shortTitle: function () { return 'Toolbox Talk'; },
        listTitle: function (r) { return 'Toolbox Talk' + (trim(r.data.project.topic) ? ' · ' + trim(r.data.project.topic) : ''); },
        docTitle: function () { return 'Toolbox Talk / Safety Meeting'; },
        crewStatement: 'I attended this safety meeting and understand the topics discussed.',
        finalizeStatement: 'I led this safety meeting with the people listed.',
        signoffRoles: [{ role: 'leader', label: 'Supervisor / leader', namePath: 'project.leader', statement: 'I led this safety meeting with the people listed.', required: true }],
        newData: function () {
            return {
                project: { name: '', number: '', company: '', trade: '', location: '', date: C.todayISO(), time: '', leader: '', topic: '', type: '' },
                talk: { details: '', points: [''], hazards: [], controls: [] },
                ppe: [], stopWork: { conditions: '' }, notes: '',
                crew: [], signoff: {}
            };
        },
        sections: [
            {
                id: 'info', title: 'Meeting Info',
                render: function (r, ui) {
                    return ui.projectPicker() + '<datalist id="ff-tbt-topics">' + TOPICS.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
                        ui.text('project.topic', 'Topic', { required: true, list: 'ff-tbt-topics', hint: 'Pick a common topic or type your own.' }) +
                        '<div class="ff-grid2">' +
                        ui.text('project.name', 'Project name', { required: true }) + ui.text('project.location', 'Location', { required: true }) +
                        ui.text('project.date', 'Date', { type: 'date', required: true }) + ui.text('project.time', 'Time', { type: 'time', now: true }) +
                        ui.text('project.leader', 'Supervisor / leader (name)', { required: true, hint: 'The person leading the talk signs it at the end.' }) + ui.text('project.company', 'Company / trade') + '</div>' +
                        ui.segment('project.type', 'Meeting type', TYPES, { hint: 'Optional.' });
                },
                review: function (r, rv) {
                    var p = r.data.project;
                    return rv.fields([['Topic', p.topic, true], ['Project', p.name, true], ['Location', p.location, true], ['Date', C.formatDate(p.date), true], ['Time', C.formatTime(p.time)],
                        ['Supervisor / leader', p.leader, true], ['Company / trade', p.company], ['Meeting type', TYPE_TEXT[p.type]]]);
                }
            },
            {
                id: 'talk', title: 'Topic & Discussion',
                render: function (r, ui) {
                    return ui.text('talk.details', 'What are we talking about today?', { multiline: true, rows: 3, hint: 'A sentence or two on why this topic matters on this job right now.' }) +
                        ui.items('talk.points', 'Key points discussed', { required: true, itemLabel: 'Key point', addLabel: 'Add a key point' }) +
                        ui.items('talk.hazards', 'Hazards / risks with this work', { itemLabel: 'Hazard', addLabel: 'Add a hazard' }) +
                        ui.items('talk.controls', 'What we are doing to control them', { itemLabel: 'Control', addLabel: 'Add a control' });
                },
                review: function (r, rv) {
                    var t = r.data.talk;
                    return rv.text(t.details, 'Today’s topic') + rv.label('Key points') + (filled(t.points).length ? rv.list(t.points) : rv.missing('Key points are missing')) +
                        (filled(t.hazards).length ? rv.label('Hazards / risks') + rv.list(t.hazards) : '') + (filled(t.controls).length ? rv.label('Controls') + rv.list(t.controls) : '');
                }
            },
            {
                id: 'ppe', title: 'Required PPE',
                render: function (r, ui) { return ui.choices('ppe', 'Required PPE for this work', { options: PPE, customLabel: 'Add other PPE', hint: 'Nothing is pre-selected. Optional.' }); },
                review: function (r, rv) { return r.data.ppe.length ? rv.list(r.data.ppe) : '<p class="ff-none">No PPE listed.</p>'; }
            },
            {
                id: 'stop', title: 'Stop-Work & Notes',
                render: function (r, ui) {
                    return '<div class="ff-statement"><p class="ff-sublabel">Stop-work authority (always printed)</p><p>' + esc(STOP_WORK) + '</p></div>' +
                        ui.text('notes', 'Additional notes / action items', { multiline: true, rows: 4, hint: 'Questions raised, follow-ups, who is doing what.' });
                },
                review: function (r, rv) { return rv.text(STOP_WORK, 'Stop-work authority') + rv.text(r.data.notes, 'Notes / action items'); }
            },
            {
                id: 'crew', title: 'Crew Attendance',
                intro: 'Pass the device: each attendee types their own name, confirms they attended and understood, and signs. At least one attendee is required.',
                render: function (r, ui) { return ui.crew({ intro: 'Each attendee types their name, confirms they attended and understood the talk, and signs on this device.' }); },
                review: function (r, rv) { return rv.crew(r, tbt.crewStatement); }
            },
            {
                id: 'signoff', title: 'Leader Sign-Off',
                intro: 'The leader’s typed name is required. A drawn signature is recommended.',
                render: function (r, ui) { return ui.signoff('leader', 'Supervisor / leader', 'project.leader', 'Meeting Info'); },
                review: function (r, rv) { return rv.signoffs(r, tbt.signoffRoles); }
            }
        ],
        validate: function (r, h) {
            var out = [], d = r.data;
            [['project.topic', 'Topic is required'], ['project.name', 'Project name is required'], ['project.location', 'Location is required'], ['project.date', 'Date is required'], ['project.leader', 'Supervisor / leader name is required']]
                .forEach(function (p) { if (C.isBlank(C.getPath(d, p[0]))) out.push({ sec: 'info', id: fid(p[0]), msg: p[1] }); });
            if (!filled(d.talk.points).length) out.push({ sec: 'talk', id: fid('talk.points'), msg: 'Add at least one key point discussed' });
            if (!d.crew.some(function (c) { return c.ack; })) out.push({ sec: 'crew', id: 'ff-crew', msg: 'At least one attendee must sign in' });
            d.crew.forEach(function (c, i) { if (trim(c.name) && !c.ack) out.push({ sec: 'crew', id: fid('crew.' + i + '.name'), msg: c.name + ' has not signed in', level: 'warn' }); });
            if (trim(d.project.leader) && !h.signoffValid('leader', 'project.leader')) out.push({ sec: 'signoff', id: 'ff-so-leader', msg: 'Leader has not signed', level: 'warn' });
            return out;
        },
        summary: function (r) {
            var d = r.data, L = [];
            L.push('Toolbox Talk' + (r.recordNo ? ' - ' + r.recordNo : ' - DRAFT') + ': ' + (d.project.topic || '-'));
            L.push('Project: ' + (d.project.name || '-') + (d.project.location ? ' - ' + d.project.location : ''));
            L.push('Date: ' + C.formatDate(d.project.date) + (d.project.time ? ' ' + C.formatTime(d.project.time) : '') + (d.project.leader ? ' - led by ' + d.project.leader : ''));
            if (trim(d.talk.details)) { L.push(''); L.push(d.talk.details); }
            L.push(''); L.push('Key points:'); filled(d.talk.points).forEach(function (x) { L.push('  - ' + x); });
            if (filled(d.talk.hazards).length) { L.push('Hazards:'); filled(d.talk.hazards).forEach(function (x) { L.push('  - ' + x); }); }
            if (filled(d.talk.controls).length) { L.push('Controls:'); filled(d.talk.controls).forEach(function (x) { L.push('  - ' + x); }); }
            if (d.ppe.length) L.push('PPE: ' + d.ppe.join(', '));
            L.push(''); L.push('Stop-work: ' + STOP_WORK);
            var n = d.crew.filter(function (c) { return c.ack; }).length;
            if (n) L.push('Attendees signed in: ' + n);
            return L.join('\n');
        },
        pdf: function (r, doc, h) {
            var d = r.data, p = d.project, t = d.talk, P = h.parts;
            doc.section('Meeting');
            doc.fields([['Topic', p.topic, 3], ['Project', p.name], ['Location', p.location], ['Date', C.formatDate(p.date)], ['Time', C.formatTime(p.time)], ['Supervisor / leader', p.leader],
                ['Company / trade', p.company], ['Meeting type', TYPE_TEXT[p.type]]].filter(function (x) { return trim(x[1]); }), 3);
            if (trim(t.details)) { doc.section('Today\'s topic'); doc.paragraph(t.details); }
            doc.section('Key points discussed'); doc.bullets(filled(t.points));
            if (filled(t.hazards).length) { doc.section('Hazards / risks'); doc.bullets(filled(t.hazards)); }
            if (filled(t.controls).length) { doc.section('Safety controls'); doc.bullets(filled(t.controls)); }
            if (d.ppe.length) { doc.section('Required PPE'); doc.paragraph(d.ppe.join('  ·  ')); }
            doc.section('Stop-work authority'); doc.paragraph(STOP_WORK);
            if (trim(d.notes)) { doc.section('Notes / action items'); doc.paragraph(d.notes); }
            doc.section('Crew attendance', 70);
            P.crew(doc, r, tbt.crewStatement, h.cache);
            doc.section('Leader sign-off', 70);
            P.signoffs(doc, r, tbt.signoffRoles, h.cache);
        }
    };

    A.register(tbt);
})(typeof window !== 'undefined' ? window : this);

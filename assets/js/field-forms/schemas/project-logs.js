/*
 * Builder Ascent Field Forms - project logs (v1): RFI Log, Change Order Log, Materials Log.
 * Built with the shared log builder (ff-log.js). Fields come from the existing Builder Ascent
 * sheets (images/RFILOG.png, public/downloads/change_order_log.pdf, public/downloads/materials_log.pdf).
 */
(function (root) {
    'use strict';
    var BAFF = root.BAFF, C = BAFF.core, L = BAFF.logs, A = BAFF.app;
    function trim(s) { return String(s == null ? '' : s).trim(); }
    function d(v) { return v ? C.formatDate(v) : ''; }
    function join(arr, sep) { return arr.filter(function (x) { return trim(x); }).join(sep || ' / '); }

    var TRADES = ['General', 'Architectural', 'Structural', 'Civil', 'Mechanical', 'Plumbing', 'Electrical', 'Fire protection', 'Low voltage', 'Concrete', 'Steel', 'Framing / drywall', 'Doors & hardware', 'Finishes', 'Roofing', 'Site / landscape'];
    var PRIORITY = [['low', 'Low'], ['med', 'Medium'], ['high', 'High']];
    var PRI = { low: 'Low', med: 'Medium', high: 'High' };
    var DIST = ['Project Manager', 'Superintendent', 'Engineer', 'Architect', 'Subcontractors', 'Owner'];

    // =====================================================================
    // RFI Log
    // =====================================================================
    var RFI_REQUIRES = ['No change', 'Clarification only', 'Plan / drawing revision', 'Specification revision', 'Cost impact', 'Schedule impact'];
    var rfi = L.define({
        type: 'rfi', prefix: 'RFI', label: 'RFI Log', noun: 'RFI log', itemNoun: 'RFI', itemNounPlural: 'RFIs',
        description: 'Track every Request for Information: the question, who it went to, when the answer is needed, the response and what it changes.',
        startLabel: 'Start an RFI Log', preparedLabel: 'Prepared by', dateLabel: 'Date',
        itemsTitle: 'RFIs', itemsIntro: 'Add an RFI for each question. Keep it open until the answer is in hand, then record the response and close it.',
        addLabel: 'Add RFI', firstField: 'subject',
        numberFormat: function (n) { return 'RFI-' + L.pad3(n); }, numberWidth: 0.09,
        statuses: [['open', 'Open'], ['answered', 'Answered'], ['closed', 'Closed', 'closed']],
        statusDates: { answered: 'responded', closed: 'closedDate' },
        dueField: 'needBy', dueLabel: '"response needed by" date', notClosedWord: 'not closed',
        distribution: DIST,
        fields: [
            { k: 'subject', label: 'Subject / title', required: true },
            { k: 'question', label: 'Question / information requested', type: 'multiline', required: true, hint: 'Be specific: what you need to know and why.' },
            { k: 'discipline', label: 'Discipline / trade', list: TRADES, half: true },
            { k: 'reference', label: 'Drawing / spec reference', half: true, placeholder: 'e.g. A-201 detail 4, spec 08 71 00' },
            { k: 'issued', label: 'Date issued', type: 'date', today: true, half: true },
            { k: 'needBy', label: 'Response needed by', type: 'date', half: true },
            { k: 'sentTo', label: 'Sent to (name / company)', half: true },
            { k: 'priority', label: 'Priority', type: 'seg', options: PRIORITY, hint: 'Optional.' },
            { k: '__status' },
            { k: 'respondedBy', label: 'Responded by', heading: 'Response', half: true },
            { k: 'responseCompany', label: 'Company', half: true },
            { k: 'responded', label: 'Date responded', type: 'date', half: true },
            { k: 'response', label: 'Response / answer', type: 'multiline' },
            { k: 'requires', label: 'Response requires', type: 'chips', options: RFI_REQUIRES, customLabel: 'Add other' },
            { k: 'action', label: 'Action taken / to be taken', type: 'multiline', rows: 2 },
            { k: 'responsible', label: 'Responsible person', half: true },
            { k: 'actionDue', label: 'Action due date', type: 'date', half: true },
            { k: 'closedDate', label: 'Date closed', type: 'date', half: true, heading: 'Closure', showIf: function (it) { return it.status === 'closed' || !!it.closedDate; } },
            { k: 'closedBy', label: 'Closed by', half: true, showIf: function (it) { return it.status === 'closed' || !!it.closedBy; } },
            { k: 'attachments', label: 'Attachments / references', type: 'multiline', rows: 2, hint: 'List sketches, photos or documents that go with this RFI (files stay wherever you keep them).' }
        ],
        title: function (it) { return it.subject; },
        subtitle: function (it) { return join([it.discipline, it.reference, it.needBy ? 'needed by ' + d(it.needBy) : ''], ' · '); },
        badges: function (it) { var b = []; if (it.priority === 'high') b.push(['High', 'high']); if ((it.requires || []).some(function (x) { return /Cost|Schedule/.test(x); })) b.push(['Impact', 'high']); return b; },
        warnings: function (it) { return it.status !== 'open' && !trim(it.response) ? [['marked ' + (it.status === 'closed' ? 'closed' : 'answered') + ' but no response recorded', 'response']] : []; },
        reviewColumns: [['Subject', function (it) { return it.subject; }, true], ['Question', function (it) { return it.question; }, true], ['Discipline / ref', function (it) { return join([it.discipline, it.reference]); }],
            ['Issued / needed', function (it) { return join([d(it.issued), it.needBy ? 'needed ' + d(it.needBy) : ''], '\n'); }], ['Response', function (it) { return join([it.response, (it.requires || []).join(', ')], '\n'); }]],
        pdfColumns: [
            ['Subject / question', 0.28, function (it) { return { parts: [{ t: it.subject || '', b: true }, { t: it.question || '' }] }; }],
            ['Discipline / ref', 0.13, function (it) { return join([it.discipline, it.reference], '\n'); }],
            ['Issued / needed', 0.12, function (it) { return join([it.issued ? 'Issued ' + d(it.issued) : '', it.needBy ? 'Needed ' + d(it.needBy) : '', PRI[it.priority] ? PRI[it.priority] + ' priority' : ''], '\n'); }],
            ['Response', 0.26, function (it) {
                return { parts: (trim(it.response) ? [{ t: it.response }] : []).concat(trim(it.respondedBy) || it.responded ? [{ t: join([it.respondedBy, it.responseCompany, d(it.responded)], ', '), i: true }] : [])
                    .concat((it.requires || []).length ? [{ t: 'Requires: ' + it.requires.join(', '), b: true }] : []) };
            }],
            ['Status', 0.12, function (it, s) { return { parts: [{ t: s.status, b: !s.closed }].concat(it.closedDate ? [{ t: 'Closed ' + d(it.closedDate) + (it.closedBy ? ' by ' + it.closedBy : '') }] : []) }; }]
        ],
        csvColumns: [['Subject', function (it) { return it.subject; }], ['Question', function (it) { return it.question; }], ['Discipline', function (it) { return it.discipline; }], ['Drawing / spec reference', function (it) { return it.reference; }],
            ['Date issued', function (it) { return it.issued; }], ['Response needed by', function (it) { return it.needBy; }], ['Sent to', function (it) { return it.sentTo; }], ['Priority', function (it) { return PRI[it.priority] || ''; }],
            ['Responded by', function (it) { return it.respondedBy; }], ['Company', function (it) { return it.responseCompany; }], ['Date responded', function (it) { return it.responded; }], ['Response', function (it) { return it.response; }],
            ['Response requires', function (it) { return (it.requires || []).join('; '); }], ['Action', function (it) { return it.action; }], ['Responsible', function (it) { return it.responsible; }], ['Action due', function (it) { return it.actionDue; }],
            ['Date closed', function (it) { return it.closedDate; }], ['Closed by', function (it) { return it.closedBy; }], ['Attachments', function (it) { return it.attachments; }]]
    });

    // =====================================================================
    // Change Order Log
    // =====================================================================
    function coSum(items, statuses) { var t = 0; items.forEach(function (it) { if (statuses.indexOf(it.status) >= 0) { var n = L.num(it.cost); if (!isNaN(n)) t += n; } }); return t; }
    function coDays(items, statuses) { var t = 0; items.forEach(function (it) { if (statuses.indexOf(it.status) >= 0) { var n = L.num(it.days); if (!isNaN(n)) t += n; } }); return t; }
    function costText(it) { var n = L.num(it.cost); return isNaN(n) ? '' : L.money(n) + (n < 0 ? ' (credit)' : ''); }
    function daysText(it) { var n = L.num(it.days); return isNaN(n) ? '' : (n > 0 ? '+' : '') + n + ' day' + (Math.abs(n) === 1 ? '' : 's'); }
    var co = L.define({
        type: 'co', prefix: 'COL', label: 'Change Order Log', noun: 'change order log', itemNoun: 'change order', itemNounPlural: 'change orders',
        description: 'Keep every change in one place: what changed and why, cost and time impact, and where approval stands.',
        startLabel: 'Start a Change Order Log', blankPdf: '/public/downloads/change_order_log.pdf', preparedLabel: 'Initiated by', dateLabel: 'Date initiated',
        itemsTitle: 'Change Orders', itemsIntro: 'Add each change as it comes up. Update the status as it moves through review and approval.',
        addLabel: 'Add change order', firstField: 'title',
        numberFormat: function (n) { return 'CO-' + L.pad3(n); }, numberWidth: 0.08,
        statuses: [['open', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected', 'closed'], ['closed', 'Closed', 'closed']],
        statusDates: { approved: 'approvedDate', closed: 'closedDate', rejected: 'closedDate' },
        notClosedWord: 'open',
        distribution: ['Owner', 'Project Manager', 'Superintendent', 'Architect / Engineer', 'Subcontractors'],
        totals: [
            { label: 'Approved cost', value: function (items) { return coSum(items, ['approved', 'closed']); }, format: L.money },
            { label: 'Pending cost', value: function (items) { return coSum(items, ['open']); }, format: L.money },
            { label: 'Approved time', value: function (items) { return coDays(items, ['approved', 'closed']); }, format: function (n) { return (n > 0 ? '+' : '') + n + ' days'; } }
        ],
        fields: [
            { k: 'title', label: 'Title / subject', required: true },
            { k: 'description', label: 'Description of change', type: 'multiline', required: true },
            { k: 'initiated', label: 'Date initiated', type: 'date', today: true, half: true },
            { k: 'requestedBy', label: 'Requested by', half: true },
            { k: 'reason', label: 'Reason / reference', placeholder: 'e.g. RFI-012, owner request, ASI 3, field condition' },
            { k: 'refs', label: 'Attachments / references', type: 'chips', options: ['Drawing', 'Specification', 'RFI / ASI', 'Field directive'], customLabel: 'Add other' },
            { k: 'cost', label: 'Cost impact (+ add / − credit)', type: 'money', half: true, placeholder: 'e.g. 1250 or -400', hint: 'Use a minus sign for a credit.' },
            { k: 'days', label: 'Time impact (days)', type: 'number', half: true, placeholder: 'e.g. 3 or -1' },
            { k: 'breakdown', label: 'Cost breakdown / justification', type: 'multiline', rows: 2, hint: 'Optional: labor, materials, equipment, subcontract, other.' },
            { k: '__status' },
            { k: 'approvedDate', label: 'Date approved', type: 'date', half: true, showIf: function (it) { return it.status === 'approved' || it.status === 'closed' || !!it.approvedDate; } },
            { k: 'approvedBy', label: 'Approved by', half: true, showIf: function (it) { return it.status === 'approved' || it.status === 'closed' || !!it.approvedBy; } },
            { k: 'closedDate', label: 'Date closed', type: 'date', half: true, showIf: function (it) { return it.status === 'closed' || it.status === 'rejected' || !!it.closedDate; } },
            { k: 'remarks', label: 'Remarks', type: 'multiline', rows: 2 }
        ],
        title: function (it) { return it.title; },
        subtitle: function (it) { return join([costText(it), daysText(it), it.reason], ' · '); },
        badges: function (it) { var n = L.num(it.cost); return !isNaN(n) && n < 0 ? [['Credit', 'complete']] : []; },
        warnings: function (it) {
            var w = [];
            if (it.cost && isNaN(L.num(it.cost))) w.push(['cost impact is not a number', 'cost']);
            if (it.days && isNaN(L.num(it.days))) w.push(['time impact is not a number', 'days']);
            return w;
        },
        reviewColumns: [['Title', function (it) { return it.title; }, true], ['Description', function (it) { return it.description; }, true], ['Reason / ref', function (it) { return it.reason; }],
            ['Cost', costText], ['Time', daysText], ['Dates', function (it) { return join([it.initiated ? 'Initiated ' + d(it.initiated) : '', it.approvedDate ? 'Approved ' + d(it.approvedDate) : '', it.closedDate ? 'Closed ' + d(it.closedDate) : ''], '\n'); }]],
        pdfColumns: [
            ['Change', 0.33, function (it) { return { parts: [{ t: it.title || '', b: true }, { t: it.description || '' }].concat(trim(it.remarks) ? [{ t: 'Remarks: ' + it.remarks, i: true }] : []) }; }],
            ['Reason / requested by', 0.15, function (it) { return join([it.reason, it.requestedBy ? 'Req. ' + it.requestedBy : ''], '\n'); }],
            ['Cost', 0.12, function (it) { return { parts: [{ t: costText(it), b: true }] }; }],
            ['Time', 0.08, function (it) { return daysText(it); }],
            ['Dates', 0.12, function (it) { return join([it.initiated ? 'Init. ' + d(it.initiated) : '', it.approvedDate ? 'Appr. ' + d(it.approvedDate) : '', it.closedDate ? 'Closed ' + d(it.closedDate) : ''], '\n'); }],
            ['Status', 0.12, function (it, s) { return { parts: [{ t: s.status, b: true }].concat(it.approvedBy ? [{ t: 'by ' + it.approvedBy }] : []) }; }]
        ],
        csvColumns: [['Title', function (it) { return it.title; }], ['Description', function (it) { return it.description; }], ['Date initiated', function (it) { return it.initiated; }], ['Requested by', function (it) { return it.requestedBy; }],
            ['Reason / reference', function (it) { return it.reason; }], ['Attachments', function (it) { return (it.refs || []).join('; '); }], ['Cost impact', function (it) { var n = L.num(it.cost); return isNaN(n) ? '' : n.toFixed(2); }],
            ['Time impact (days)', function (it) { var n = L.num(it.days); return isNaN(n) ? '' : n; }], ['Cost breakdown', function (it) { return it.breakdown; }], ['Date approved', function (it) { return it.approvedDate; }],
            ['Approved by', function (it) { return it.approvedBy; }], ['Date closed', function (it) { return it.closedDate; }], ['Remarks', function (it) { return it.remarks; }]]
    });

    // =====================================================================
    // Materials Log
    // =====================================================================
    function short(it) { var o = L.num(it.qtyOrdered), r = L.num(it.qtyReceived); return !isNaN(o) && !isNaN(r) && r < o; }
    var mat = L.define({
        type: 'materials', prefix: 'MTL', label: 'Materials Log', noun: 'materials log', itemNoun: 'delivery', itemNounPlural: 'deliveries',
        description: 'Log deliveries as they arrive: ticket, quantities ordered and received, condition, who received it and where it’s stored — then track it to installed.',
        startLabel: 'Start a Materials Log', blankPdf: '/public/downloads/materials_log.pdf', preparedLabel: 'Prepared by', dateLabel: 'Date',
        itemsTitle: 'Deliveries', itemsIntro: 'Add each delivery when it shows up. Flag damaged or short loads right away and update the status as material is issued and installed.',
        addLabel: 'Add delivery', firstField: 'material',
        statuses: [['storage', 'In storage'], ['issued', 'Issued to field'], ['installed', 'Installed', 'closed'], ['returned', 'Returned', 'closed']],
        statusDates: { issued: 'issuedDate', returned: 'returnedDate' },
        notClosedWord: 'on hand or in use',
        distribution: ['Project Manager', 'Superintendent', 'Foreman', 'Purchasing', 'Subcontractor'],
        totals: [
            { label: 'Damaged', value: function (items) { return items.filter(function (it) { return it.condition === 'damaged'; }).length; }, format: String },
            { label: 'Short', value: function (items) { return items.filter(short).length; }, format: String }
        ],
        fields: [
            { k: 'material', label: 'Material / description', required: true },
            { k: 'received', label: 'Date received', type: 'date', today: true, half: true },
            { k: 'ticket', label: 'Delivery ticket / PO #', half: true },
            { k: 'spec', label: 'Spec / part #', half: true },
            { k: 'deliveredBy', label: 'Delivered by (company)', half: true },
            { k: 'qtyOrdered', label: 'Qty ordered', type: 'number', half: true },
            { k: 'qtyReceived', label: 'Qty received', type: 'number', half: true },
            { k: 'unit', label: 'Unit', half: true, list: ['EA', 'LF', 'SF', 'CY', 'TON', 'LB', 'GAL', 'BOX', 'BUNDLE', 'PALLET', 'LOT'] },
            { k: 'condition', label: 'Delivery condition', type: 'seg', options: [['good', 'Good'], ['damaged', 'Damaged']], hint: 'No default — check the load.' },
            { k: 'receivedBy', label: 'Received by', half: true },
            { k: 'storage', label: 'Storage location', half: true },
            { k: '__status' },
            { k: 'issuedTo', label: 'Issued to (company / crew)', half: true, showIf: function (it) { return it.status !== 'storage' || !!it.issuedTo; } },
            { k: 'issuedDate', label: 'Date issued', type: 'date', half: true, showIf: function (it) { return it.status !== 'storage' || !!it.issuedDate; } },
            { k: 'usedFor', label: 'Used for (work / location)', showIf: function (it) { return it.status === 'issued' || it.status === 'installed' || !!it.usedFor; } },
            { k: 'returnReason', label: 'Return reason', type: 'seg', options: [['overage', 'Overage'], ['damaged', 'Damaged'], ['wrong', 'Wrong material']], showIf: function (it) { return it.status === 'returned'; } },
            { k: 'returnedDate', label: 'Date returned', type: 'date', half: true, showIf: function (it) { return it.status === 'returned'; } },
            { k: 'qtyReturned', label: 'Qty returned', type: 'number', half: true, showIf: function (it) { return it.status === 'returned'; } },
            { k: 'notes', label: 'Notes', type: 'multiline', rows: 2 }
        ],
        title: function (it) { return it.material; },
        subtitle: function (it) { return join([it.ticket ? 'Ticket ' + it.ticket : '', join([it.qtyReceived, it.unit], ' ') + (trim(it.qtyOrdered) ? ' of ' + it.qtyOrdered : ''), it.storage, d(it.received)], ' · '); },
        badges: function (it) { var b = []; if (it.condition === 'damaged') b.push(['Damaged', 'overdue']); if (short(it)) b.push(['Short', 'high']); return b; },
        warnings: function (it) {
            var w = [];
            if (it.condition === 'damaged' && !trim(it.notes)) w.push(['damaged — add a note on the damage and who was told', 'notes']);
            if (short(it)) w.push(['received less than ordered', 'qtyReceived']);
            return w;
        },
        reviewColumns: [['Material', function (it) { return it.material; }, true], ['Ticket / PO', function (it) { return it.ticket; }], ['Received', function (it) { return join([d(it.received), it.receivedBy], '\n'); }],
            ['Qty (rec / ord)', function (it) { return join([it.qtyReceived, it.qtyOrdered], ' / ') + (trim(it.unit) ? ' ' + it.unit : ''); }],
            ['Condition', function (it) { return it.condition === 'damaged' ? 'Damaged' : it.condition === 'good' ? 'Good' : ''; }], ['Storage / issued', function (it) { return join([it.storage, it.issuedTo], '\n'); }]],
        pdfColumns: [
            ['Material / notes', 0.25, function (it) { return { parts: [{ t: it.material || '', b: true }].concat(trim(it.spec) ? [{ t: 'Spec ' + it.spec }] : []).concat(trim(it.notes) ? [{ t: it.notes, i: true }] : []) }; }],
            ['Ticket / from', 0.14, function (it) { return join([it.ticket, it.deliveredBy], '\n'); }],
            ['Received', 0.12, function (it) { return join([d(it.received), it.receivedBy], '\n'); }],
            ['Qty rec / ord', 0.11, function (it) { return { parts: [{ t: join([it.qtyReceived, it.qtyOrdered], ' / ') + (trim(it.unit) ? ' ' + it.unit : ''), b: short(it) }].concat(short(it) ? [{ t: 'SHORT', b: true }] : []) }; }],
            ['Condition', 0.11, function (it) { return { parts: [{ t: it.condition === 'damaged' ? 'DAMAGED' : it.condition === 'good' ? 'Good' : '', b: it.condition === 'damaged' }] }; }],
            ['Storage / use', 0.12, function (it) { return join([it.storage, it.issuedTo ? 'Issued ' + it.issuedTo : '', it.usedFor], '\n'); }],
            ['Status', 0.08, function (it, s) { return { parts: [{ t: s.status, b: !s.closed }] }; }]
        ],
        csvColumns: [['Material / description', function (it) { return it.material; }], ['Date received', function (it) { return it.received; }], ['Delivery ticket / PO', function (it) { return it.ticket; }],
            ['Spec / part #', function (it) { return it.spec; }], ['Delivered by', function (it) { return it.deliveredBy; }], ['Qty ordered', function (it) { return it.qtyOrdered; }], ['Qty received', function (it) { return it.qtyReceived; }],
            ['Unit', function (it) { return it.unit; }], ['Condition', function (it) { return it.condition === 'damaged' ? 'Damaged' : it.condition === 'good' ? 'Good' : ''; }], ['Short', function (it) { return short(it) ? 'Yes' : ''; }],
            ['Received by', function (it) { return it.receivedBy; }], ['Storage location', function (it) { return it.storage; }], ['Issued to', function (it) { return it.issuedTo; }], ['Date issued', function (it) { return it.issuedDate; }],
            ['Used for', function (it) { return it.usedFor; }], ['Return reason', function (it) { return it.returnReason; }], ['Date returned', function (it) { return it.returnedDate; }], ['Qty returned', function (it) { return it.qtyReturned; }],
            ['Notes', function (it) { return it.notes; }]]
    });

    A.register(rfi);
    A.register(co);
    A.register(mat);
})(typeof window !== 'undefined' ? window : this);

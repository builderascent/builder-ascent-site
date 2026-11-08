/*
 * Builder Ascent Field Tools - Material Takeoff (v1) - page wiring
 * Depends on: field-tools-core.js (BAFieldTools), takeoff-engine.js (BATakeoffEngine)
 * Optional:   ff-pdf.js + ff-share.js (BAFF.pdf / BAFF.share) for PDF and CSV output.
 * All math lives in takeoff-engine.js. This file reads inputs, validates, renders and exports.
 * The draft is kept in this browser only (localStorage). Nothing is sent anywhere.
 */
(function () {
    'use strict';

    var FT = window.BAFieldTools;
    var TE = window.BATakeoffEngine;
    if (!FT || !TE) return;

    var $ = function (id) { return document.getElementById(id); };
    var form = $('ft-form');
    if (!form) return;

    var STORE_KEY = 'ba.takeoff.v1';
    var MAX_LINES = 100;
    var MEASURE_KEYS = ['EA', 'LF', 'SF', 'CY'];
    var MEASURE_LABEL = { EA: 'Count', LF: 'Linear ft', SF: 'Square ft', CY: 'Cubic yd' };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function today() {
        var d = new Date();
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    /* ---------- State ---------- */
    var data = null;          // persisted draft
    var touched = {};         // input id -> true once the user typed in it
    var results = [];         // per line: { line, ok, blank, res, errors, dimText }
    var totals = null;
    var storageOk = true;

    function newLine(prev) {
        var id = data.nextId++;
        return {
            id: id, desc: '', measure: prev ? prev.measure : 'SF', L: '', W: '', D: '', count: '1',
            waste: prev ? prev.waste : '0', unitName: '', coverage: '', cost: ''
        };
    }

    function blankData() {
        data = { v: 1, nextId: 1, header: { project: '', area: '', by: '', date: today() }, tax: '0', notes: '', lines: [] };
        data.lines.push(newLine(null));
        return data;
    }

    function load() {
        try {
            var raw = window.localStorage.getItem(STORE_KEY);
            if (raw) {
                var d = JSON.parse(raw);
                if (d && d.v === 1 && Array.isArray(d.lines)) {
                    data = d;
                    data.header = data.header || {};
                    if (!data.lines.length) data.lines.push(newLine(null));
                    return true;
                }
            }
        } catch (e) { storageOk = false; }
        blankData();
        return false;
    }

    var saveTimer = null;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            try {
                window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
                storageOk = true;
                var t = new Date();
                setText('tk-saved', 'Saved on this device · ' + t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
            } catch (e) {
                storageOk = false;
                setText('tk-saved', 'Not saved: this browser is blocking storage. Copy or save a PDF before leaving.');
            }
        }, 250);
    }

    function setText(id, text) { var el = $(id); if (el) el.textContent = text; }

    /* ---------- Rendering lines ---------- */
    function inputHTML(line, k, label, unit, opts) {
        opts = opts || {};
        var id = 'l' + line.id + '-' + k;
        return '<div class="ft-field tk-f-' + k + '">' +
            '<label class="ft-label ft-label--small" for="' + id + '">' + label + (unit ? ' <span class="ft-unit">' + unit + '</span>' : '') + '</label>' +
            '<input class="ft-input' + (opts.text ? ' ft-input--text' : '') + '" id="' + id + '" data-k="' + k + '" type="text"' +
            ' inputmode="' + (opts.mode || 'decimal') + '"' + (opts.max ? ' maxlength="' + opts.max + '"' : '') +
            ' placeholder="' + esc(opts.ph || '') + '" value="' + esc(line[k]) + '" aria-describedby="' + id + '-err">' +
            '<p class="ft-error-text" id="' + id + '-err" aria-live="polite"></p></div>';
    }

    function dimsHTML(line) {
        var h = '';
        var lenPh = "e.g. 24 or 24'6\"";
        if (line.measure === 'LF') {
            h += inputHTML(line, 'L', 'Length', 'ft or ft-in', { mode: 'text', ph: lenPh });
        } else if (line.measure === 'SF') {
            h += inputHTML(line, 'L', 'Length', 'ft or ft-in', { mode: 'text', ph: lenPh });
            h += inputHTML(line, 'W', 'Width / height', 'ft or ft-in', { mode: 'text', ph: lenPh });
        } else if (line.measure === 'CY') {
            h += inputHTML(line, 'L', 'Length', 'ft or ft-in', { mode: 'text', ph: lenPh });
            h += inputHTML(line, 'W', 'Width / height', 'ft or ft-in', { mode: 'text', ph: lenPh });
            h += inputHTML(line, 'D', 'Thickness / depth', 'inches', { ph: 'e.g. 4' });
        }
        h += inputHTML(line, 'count', line.measure === 'EA' ? 'Quantity' : 'Times', line.measure === 'EA' ? 'each' : 'repeat count', { ph: '1' });
        return h;
    }

    function lineHTML(line, idx) {
        var radios = MEASURE_KEYS.map(function (m) {
            return '<label class="ft-seg-option"><input type="radio" name="m-' + line.id + '" data-k="measure" value="' + m + '"' +
                (line.measure === m ? ' checked' : '') + '><span>' + MEASURE_LABEL[m] + ' <small>' + m + '</small></span></label>';
        }).join('');
        var buyOpen = line.unitName || line.coverage ? ' open' : '';
        return '<article class="ft-card tk-line" data-id="' + line.id + '" aria-labelledby="l' + line.id + '-title">' +
            '<div class="tk-line-head"><h3 class="tk-line-title" id="l' + line.id + '-title">Line ' + (idx + 1) + '</h3>' +
            '<div class="tk-line-tools"><button type="button" class="ft-link-btn" data-act="dup">Duplicate</button>' +
            '<button type="button" class="ft-link-btn tk-remove" data-act="remove">Remove</button></div></div>' +
            inputHTML(line, 'desc', 'Material / description', '', { mode: 'text', text: true, max: 80, ph: 'e.g. 5/8" Type X drywall' }) +
            '<div class="ft-field"><span class="ft-label ft-label--small" id="l' + line.id + '-mlbl">Measure by</span>' +
            '<div class="ft-segment ft-segment--2x2 tk-measure" role="radiogroup" aria-labelledby="l' + line.id + '-mlbl">' + radios + '</div></div>' +
            '<div class="tk-dims">' + dimsHTML(line) + '</div>' +
            '<div class="tk-pair">' +
            inputHTML(line, 'waste', 'Waste', '%', { ph: '0' }) +
            inputHTML(line, 'cost', 'Unit cost', '$ optional', { ph: '0.00' }) +
            '</div>' +
            '<details class="tk-buy"' + buyOpen + '><summary>Sold as (sheets, boxes, sticks&hellip;) <span class="ft-unit">optional</span></summary>' +
            '<div class="tk-pair">' +
            inputHTML(line, 'unitName', 'Purchase unit', '', { mode: 'text', max: 24, ph: 'e.g. sheets' }) +
            inputHTML(line, 'coverage', 'Each one covers', '<span data-cov-unit>' + line.measure + '</span>', { ph: 'e.g. 32' }) +
            '</div><p class="ft-help">Example: a 4&times;8 sheet covers 32 SF. The order is rounded <strong>up</strong> to whole purchase units.</p></details>' +
            '<dl class="ft-rows tk-out" aria-live="polite"></dl>' +
            '</article>';
    }

    function renderLines(focusId) {
        var wrap = $('tk-lines');
        wrap.innerHTML = data.lines.map(lineHTML).join('');
        $('tk-add').disabled = data.lines.length >= MAX_LINES;
        calculate();
        if (focusId) { var f = $(focusId); if (f) f.focus(); }
    }

    /* ---------- Validation + math ---------- */
    function showErr(inputId, msg) {
        var inp = $(inputId), el = $(inputId + '-err');
        if (el) el.textContent = msg || '';
        if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    }

    function lengthText(raw) {
        var s = String(raw).trim();
        if (/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return s + "'";
        if (/['’]\s*-?\s*[\d\/. ]*\d$/.test(s) || /^\d+\s*-\s*[\d\/. ]*\d$/.test(s)) return s + '"';
        return s;
    }

    function evalLine(line) {
        var base = 'l' + line.id + '-';
        var errors = {}, ok = true, blank = true;
        var dims = {}, dimParts = [];
        var md = TE.MEASURES[line.measure] || TE.MEASURES.SF;

        ['L', 'W', 'D', 'count', 'waste', 'cost', 'coverage'].forEach(function (k) {
            if (String(line[k] || '').trim() !== '' && !(k === 'count' && line[k] === '1') && !(k === 'waste' && /^0*$/.test(line[k]))) blank = false;
        });
        if (String(line.desc || '').trim()) blank = false;

        function need(k, msg) { errors[k] = touched[base + k] || !blank ? msg : ''; ok = false; }

        md.dims.forEach(function (d) {
            if (d === 'D') {
                var pd = FT.parseNumber(line.D, { positive: true, max: 1200 });
                if (!pd.ok) { need('D', pd.empty ? 'Required' : pd.error); return; }
                dims.depthIn = pd.value;
                dimParts.push('T ' + FT.formatPlain(pd.value, 4) + '"');
            } else {
                var pl = TE.parseLength(line[d]);
                if (!pl.ok) { need(d, pl.empty ? 'Required' : pl.error); return; }
                dims[d] = pl.feet;
                dimParts.push((d === 'L' ? 'L ' : 'W ') + lengthText(line[d]));
            }
        });
        var pc = FT.parseNumber(line.count, { positive: true, max: 1000000 });
        if (!pc.ok) need('count', pc.empty ? 'Required' : pc.error);
        var pw = FT.parseNumber(line.waste, { optional: true, min: 0, max: 100 });
        if (!pw.ok && !pw.empty) { errors.waste = pw.error; ok = false; }
        var costRaw = String(line.cost || '').trim().replace(/^\$\s*/, '');
        var pk = FT.parseNumber(costRaw, { optional: true, min: 0, max: 10000000 });
        if (!pk.ok && !pk.empty) { errors.cost = pk.error; ok = false; }
        var pv = FT.parseNumber(line.coverage, { optional: true, positive: true, max: 1000000 });
        if (!pv.ok && !pv.empty) { errors.coverage = pv.error; ok = false; }

        ['desc', 'L', 'W', 'D', 'count', 'waste', 'cost', 'coverage', 'unitName'].forEach(function (k) {
            if ($(base + k)) showErr(base + k, errors[k] || '');
        });

        if (!ok || blank) return { line: line, ok: false, blank: blank, errors: errors };

        var measured = TE.measuredQuantity(line.measure, dims, pc.value);
        var res = TE.buildLine({
            measure: line.measure,
            measured: measured,
            wastePct: pw.empty ? 0 : pw.value,
            coverage: pv.empty ? null : pv.value,
            unitCost: pk.empty ? null : pk.value
        });
        var count = pc.value;
        var dimText = line.measure === 'EA' ? FT.formatPlain(count, 4) + ' EA'
            : dimParts.join(' x ') + (count !== 1 ? ' x ' + FT.formatPlain(count, 4) : '');
        return { line: line, ok: true, blank: false, res: res, dimText: dimText, errors: errors };
    }

    var n2 = function (x) { return FT.formatNumber(x, 2); };
    function money(x) { return '$' + FT.formatNumber(x, 2); }
    function qtyText(x, measure) { return measure === 'CY' ? n2(x) : FT.formatNumber(x, x % 1 === 0 ? 0 : 2); }

    function orderUnit(r) {
        if (r.res.coverage) return String(r.line.unitName || '').trim() || 'units';
        return r.res.measure;
    }
    function orderText(r) {
        var o = r.res;
        if (o.coverage) return FT.formatNumber(o.order, 0) + ' ' + orderUnit(r);
        return qtyText(o.order, o.measure) + ' ' + o.measure;
    }
    function lineLabel(r, i) {
        return String(r.line.desc || '').trim() || ('Line ' + (i + 1));
    }

    function renderLineOut(r) {
        var card = form.querySelector('.tk-line[data-id="' + r.line.id + '"]');
        if (!card) return;
        var out = card.querySelector('.tk-out');
        var cu = card.querySelector('[data-cov-unit]');
        if (cu) cu.textContent = r.line.measure;
        if (!r.ok) {
            out.innerHTML = '<div class="ft-row"><dt class="tk-out-empty">' + (r.blank ? 'Enter dimensions to see the quantity.' : 'Fix the highlighted entries to see the quantity.') + '</dt></div>';
            return;
        }
        var o = r.res, rows = [];
        rows.push(['Measured <span class="ft-badge ft-badge--calc">CALCULATED</span>', (o.measure === 'EA' ? qtyText(o.measured, 'EA') : n2(o.measured)) + ' ' + o.measure]);
        if (o.wastePct) rows.push(['With ' + esc(FT.formatPlain(o.wastePct, 2)) + '% waste', n2(o.gross) + ' ' + o.measure]);
        if (o.coverage) rows.push(['Exact purchase units', n2(o.purchaseExact) + ' ' + esc(orderUnit(r))]);
        rows.push(['<strong>Order</strong> <span class="ft-badge ft-badge--calc">CALCULATED</span>', '<strong>' + esc(orderText(r)) + '</strong>', true]);
        if (o.cost !== null) rows.push(['Cost at ' + money(o.unitCost) + (o.coverage ? ' each' : ' / ' + o.measure), money(o.cost)]);
        out.innerHTML = rows.map(function (rw) {
            return '<div class="ft-row' + (rw[2] ? ' ft-row--strong' : '') + '"><dt>' + rw[0] + '</dt><dd>' + rw[1] + '</dd></div>';
        }).join('');
    }

    function calculate() {
        results = data.lines.map(evalLine);
        results.forEach(renderLineOut);

        var pt = FT.parseNumber(data.tax, { optional: true, min: 0, max: 100 });
        showErr('tk-tax', !pt.ok && !pt.empty ? pt.error : '');
        var good = results.filter(function (r) { return r.ok; });
        totals = TE.buildTotals(good.map(function (r) { return r.res; }), pt.ok ? pt.value : 0);
        totals.taxOk = pt.ok || pt.empty;
        renderTotals(good);
        $('ft-summary').value = good.length ? buildSummary() : 'Add a line with dimensions to build a summary.';
    }

    function renderTotals(good) {
        var bad = results.filter(function (r) { return !r.ok && !r.blank; }).length;
        var blank = results.filter(function (r) { return r.blank; }).length;
        $('tk-empty').hidden = good.length > 0;
        $('tk-body').hidden = good.length === 0;
        var notes = [];
        if (bad) notes.push(bad + ' line' + (bad === 1 ? ' has' : 's have') + ' entries to fix and ' + (bad === 1 ? 'is' : 'are') + ' not counted.');
        if (blank && good.length) notes.push(blank + ' empty line' + (blank === 1 ? ' is' : 's are') + ' ignored.');
        if (good.length && totals.unpricedLines) notes.push(totals.unpricedLines + ' line' + (totals.unpricedLines === 1 ? ' has' : 's have') + ' no unit cost and ' + (totals.unpricedLines === 1 ? 'is' : 'are') + ' not in the cost.');
        $('tk-notes-out').innerHTML = notes.map(function (t) { return '<p class="ft-warning">' + esc(t) + '</p>'; }).join('');

        var priced = totals.pricedLines > 0;
        setText('r-total', priced ? money(totals.total) : '—');
        setText('r-total-note', priced ? 'Material cost from your unit prices' + (totals.taxPct ? ' plus tax' : '') + '. Verify current pricing with your supplier.' : 'Add unit costs to lines to see a cost.');
        setText('r-lines', String(good.length));
        setText('r-subtotal', money(totals.subtotal));
        setText('r-tax-pct', FT.formatPlain(totals.taxPct, 3));
        setText('r-tax', money(totals.tax));
        setText('r-grand', money(totals.total));

        var tb = $('r-order-rows');
        tb.innerHTML = '';
        good.forEach(function (r) {
            var i = data.lines.indexOf(r.line);
            var tr = document.createElement('tr');
            [String(i + 1), lineLabel(r, i), orderText(r), r.res.cost !== null ? money(r.res.cost) : '—'].forEach(function (t, k) {
                var c = document.createElement(k === 0 ? 'th' : 'td');
                if (k === 0) c.setAttribute('scope', 'row');
                c.setAttribute('data-label', ['#', 'Material', 'Order', 'Cost'][k]);
                c.textContent = t;
                tr.appendChild(c);
            });
            tb.appendChild(tr);
        });

        var bar = $('ft-quickbar');
        bar.classList.toggle('is-visible', good.length > 0);
        setText('q-lines', String(good.length));
        setText('q-total', priced ? money(totals.total) : '—');
    }

    /* ---------- Field summary (clipboard) ---------- */
    function headerPairs() {
        var h = data.header;
        return [['Project', h.project], ['Area / location', h.area], ['Prepared by', h.by], ['Date', h.date]];
    }

    function buildSummary() {
        var L = [];
        L.push('BUILDER ASCENT - MATERIAL TAKEOFF');
        headerPairs().forEach(function (p) { if (String(p[1] || '').trim()) L.push(p[0] + ': ' + String(p[1]).trim()); });
        L.push('');
        results.forEach(function (r, i) {
            if (!r.ok) return;
            var o = r.res;
            L.push((i + 1) + '. ' + lineLabel(r, i));
            L.push('   ' + r.dimText + (o.measure === 'EA' ? '' : ' = ' + n2(o.measured) + ' ' + o.measure) + (o.wastePct ?' + ' + FT.formatPlain(o.wastePct, 2) + '% waste = ' + n2(o.gross) + ' ' + o.measure : '') + ' [CALCULATED]');
            var ord = '   ORDER: ' + orderText(r);
            if (o.coverage) ord += ' (' + FT.formatPlain(o.coverage, 4) + ' ' + o.measure + ' each)';
            if (o.cost !== null) ord += ' @ ' + money(o.unitCost) + ' = ' + money(o.cost);
            L.push(ord);
        });
        var skipped = results.filter(function (r) { return !r.ok && !r.blank; }).length;
        if (skipped) L.push('(' + skipped + ' line' + (skipped === 1 ? '' : 's') + ' with entries to fix not included)');
        if (totals.pricedLines) {
            L.push('');
            L.push('Material subtotal: ' + money(totals.subtotal));
            if (totals.taxPct) L.push('Tax (' + FT.formatPlain(totals.taxPct, 3) + '%): ' + money(totals.tax));
            L.push('TOTAL: ' + money(totals.total) + (totals.unpricedLines ? ' (' + totals.unpricedLines + ' unpriced line' + (totals.unpricedLines === 1 ? '' : 's') + ' not included)' : ''));
        }
        if (String(data.notes || '').trim()) { L.push(''); L.push('Notes: ' + String(data.notes).trim()); }
        L.push('');
        L.push('Orders are rounded up to whole units. Planning aid only - verify against plans, specs and supplier packaging.');
        L.push('Builder Ascent Field Tools - builderascent.com');
        return L.join('\n');
    }

    /* ---------- CSV ---------- */
    function csvCell(v) {
        var s = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function buildCSV() {
        var rows = [['Line', 'Description', 'Measure by', 'Length', 'Width / height', 'Depth (in)', 'Count', 'Measured qty', 'Measured unit',
            'Waste %', 'Qty with waste', 'Purchase unit', 'Each covers', 'Order qty', 'Order unit', 'Unit cost', 'Line cost']];
        results.forEach(function (r, i) {
            if (!r.ok) return;
            var o = r.res, l = r.line, md = TE.MEASURES[l.measure].dims;
            rows.push([i + 1, String(l.desc || '').trim(), o.measure,
                md.indexOf('L') >= 0 ? lengthText(l.L) : '', md.indexOf('W') >= 0 ? lengthText(l.W) : '', md.indexOf('D') >= 0 ? String(l.D).trim() : '',
                String(l.count).trim(), o.measured.toFixed(2), o.measure, FT.formatPlain(o.wastePct, 3), o.gross.toFixed(2),
                o.coverage ? orderUnit(r) : '', o.coverage ? FT.formatPlain(o.coverage, 4) : '',
                o.coverage ? String(o.order) : (o.measure === 'CY' ? o.order.toFixed(2) : String(o.order)), orderUnit(r),
                o.unitCost !== null ? o.unitCost.toFixed(2) : '', o.cost !== null ? o.cost.toFixed(2) : '']);
        });
        rows.push([]);
        rows.push(['', 'Material subtotal', '', '', '', '', '', '', '', '', '', '', '', '', '', '', totals.subtotal.toFixed(2)]);
        rows.push(['', 'Tax ' + FT.formatPlain(totals.taxPct, 3) + '%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', totals.tax.toFixed(2)]);
        rows.push(['', 'Total', '', '', '', '', '', '', '', '', '', '', '', '', '', '', totals.total.toFixed(2)]);
        return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    }

    function fileStem() {
        var p = String(data.header.project || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
        return 'BA_Takeoff_' + (p ? p + '_' : '') + (data.header.date || today());
    }

    /* ---------- PDF (uses the in-repo Field Forms PDF writer) ---------- */
    function buildPdf() {
        var P = window.BAFF && window.BAFF.pdf;
        if (!P) return null;
        var E = P.encode, h = data.header;
        var proj = String(h.project || '').trim();
        var d = P.create({
            title: 'Material Takeoff' + (proj ? ' - ' + proj : ''),
            subject: 'Material takeoff',
            author: String(h.by || '').trim(),
            runningHeader: 'MATERIAL TAKEOFF' + (proj ? '  ·  ' + proj : '') + (h.date ? '  ·  ' + h.date : ''),
            footer1: 'Builder Ascent Field Tools  ·  Material Takeoff',
            footer2: 'Planning aid. Quantities come only from the entries shown. Verify against plans, specifications and supplier packaging before ordering. builderascent.com'
        });
        var M = 36, y = d.y;
        d.text(M, y + 9, E('BUILDER ASCENT  ·  FIELD TOOLS'), 'B', 8, 0.35);
        y += 32;
        d.text(M, y, E('MATERIAL TAKEOFF'), 'B', 19);
        y += 6;
        d.line(M, y, M + P.CONTENT_W, y, 1.6, 0.25);
        d.y = y + 8;
        d.fields(headerPairs(), 2);

        d.section('Line items', 60);
        var rows = [];
        results.forEach(function (r, i) {
            if (!r.ok) return;
            var o = r.res;
            var ord = [{ t: orderText(r), b: true }];
            if (o.coverage) ord.push({ t: FT.formatPlain(o.coverage, 4) + ' ' + o.measure + ' each', g: 0.35 });
            rows.push([
                String(i + 1),
                { parts: [{ t: lineLabel(r, i), b: true }, { t: o.measure === 'EA' ? 'Count: ' + qtyText(o.measured, 'EA') : o.measure + ': ' + r.dimText, g: 0.35 }] },
                (o.measure === 'EA' ? qtyText(o.measured, 'EA') : n2(o.measured)) + ' ' + o.measure,
                o.wastePct ? FT.formatPlain(o.wastePct, 2) + '%' : '-',
                { parts: ord },
                o.unitCost !== null ? money(o.unitCost) : '-',
                o.cost !== null ? money(o.cost) : '-'
            ]);
        });
        d.table([
            { title: '#', w: 0.05 }, { title: 'Material / dimensions', w: 0.31 }, { title: 'Measured', w: 0.14 },
            { title: 'Waste', w: 0.08 }, { title: 'Order', w: 0.17 }, { title: 'Unit cost', w: 0.12 }, { title: 'Cost', w: 0.13 }
        ], rows, { size: 8.4 });

        d.section('Totals', 50);
        var trows = [['Material subtotal (' + totals.pricedLines + ' priced line' + (totals.pricedLines === 1 ? '' : 's') + ')', money(totals.subtotal)],
            ['Tax (' + FT.formatPlain(totals.taxPct, 3) + '%)', money(totals.tax)],
            [{ parts: [{ t: 'TOTAL', b: true }] }, { parts: [{ t: money(totals.total), b: true }] }]];
        d.table([{ title: 'Item', w: 0.75 }, { title: 'Amount', w: 0.25 }], trows, { size: 9 });
        var skipped = results.filter(function (r) { return !r.ok && !r.blank; }).length;
        var notes = [];
        notes.push('Order quantities are rounded up to whole purchase units (cubic yards to 0.01 CY).');
        if (totals.unpricedLines) notes.push(totals.unpricedLines + ' line' + (totals.unpricedLines === 1 ? ' has' : 's have') + ' no unit cost and ' + (totals.unpricedLines === 1 ? 'is' : 'are') + ' not in the total.');
        if (skipped) notes.push(skipped + ' line' + (skipped === 1 ? '' : 's') + ' with entries to fix ' + (skipped === 1 ? 'is' : 'are') + ' not included.');
        d.bullets(notes, { size: 8.6 });
        if (String(data.notes || '').trim()) {
            d.section('Notes', 30);
            d.paragraph(String(data.notes).trim());
        }
        return { bytes: d.output(), filename: fileStem() + '.pdf' };
    }

    /* ---------- Events ---------- */
    function lineOf(el) {
        var card = el.closest && el.closest('.tk-line');
        if (!card) return null;
        var id = parseInt(card.getAttribute('data-id'), 10);
        for (var i = 0; i < data.lines.length; i++) if (data.lines[i].id === id) return data.lines[i];
        return null;
    }

    form.addEventListener('input', function (e) {
        var el = e.target;
        if (!el) return;
        if (el.id) touched[el.id] = true;
        var k = el.getAttribute('data-k');
        var line = lineOf(el);
        if (line && k && k !== 'measure') line[k] = el.value;
        var hk = el.getAttribute('data-h');
        if (hk) data.header[hk] = el.value;
        if (el.id === 'tk-tax') data.tax = el.value;
        if (el.id === 'tk-notes') data.notes = el.value;
        save();
        calculate();
    });
    form.addEventListener('change', function (e) {
        var el = e.target;
        if (el && el.getAttribute('data-k') === 'measure') {
            var line = lineOf(el);
            if (!line) return;
            line.measure = el.value;
            var card = el.closest('.tk-line');
            card.querySelector('.tk-dims').innerHTML = dimsHTML(line);
            save();
            calculate();
        }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    form.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-act]');
        if (!btn) return;
        var line = lineOf(btn);
        var idx = data.lines.indexOf(line);
        if (idx < 0) return;
        var act = btn.getAttribute('data-act');
        if (act === 'remove') {
            var hasData = String(line.desc || '').trim() || String(line.L || '').trim() || String(line.cost || '').trim();
            if (hasData && !window.confirm('Remove line ' + (idx + 1) + (line.desc ? ' (' + line.desc + ')' : '') + '?')) return;
            data.lines.splice(idx, 1);
            if (!data.lines.length) data.lines.push(newLine(null));
            save();
            renderLines();
            var next = data.lines[Math.min(idx, data.lines.length - 1)];
            var f = $('l' + next.id + '-desc'); if (f) f.focus();
        } else if (act === 'dup' && data.lines.length < MAX_LINES) {
            var copy = JSON.parse(JSON.stringify(line));
            copy.id = data.nextId++;
            data.lines.splice(idx + 1, 0, copy);
            save();
            renderLines('l' + copy.id + '-desc');
        }
    });

    $('tk-add').addEventListener('click', function () {
        if (data.lines.length >= MAX_LINES) return;
        var ln = newLine(data.lines[data.lines.length - 1]);
        data.lines.push(ln);
        save();
        renderLines('l' + ln.id + '-desc');
    });

    function status(msg) { setText('ft-copy-status', msg); }
    function hasResults() { return results.some(function (r) { return r.ok; }); }

    $('ft-copy').addEventListener('click', function () {
        if (!hasResults()) { status('Nothing to copy yet - add a line with dimensions first.'); return; }
        FT.copyText(buildSummary()).then(function (ok) {
            status(ok ? 'Copied. Paste it into your text, email, order or daily report.' : 'Could not copy automatically. Select the text in the preview and copy it.');
        });
    });

    $('tk-pdf').addEventListener('click', function () {
        if (!hasResults()) { status('Nothing to save yet - add a line with dimensions first.'); return; }
        var pdf = buildPdf();
        if (!pdf || !window.BAFF.share) { status('PDF is not available in this browser. Use Copy Summary instead.'); return; }
        window.BAFF.share.download(pdf.bytes, pdf.filename);
        status('PDF saved: ' + pdf.filename);
    });

    var shareBtn = $('tk-share');
    if (shareBtn && window.BAFF && window.BAFF.share && window.BAFF.share.canShareFiles()) {
        shareBtn.hidden = false;
        shareBtn.addEventListener('click', function () {
            if (!hasResults()) { status('Nothing to share yet - add a line with dimensions first.'); return; }
            var pdf = buildPdf();
            window.BAFF.share.shareFile(pdf.bytes, pdf.filename, 'Material Takeoff', 'Material takeoff from Builder Ascent Field Tools').then(function (r) {
                if (r === 'shared') status('Shared.');
            }, function () { status('Could not share. Use Save PDF instead.'); });
        });
    }

    $('tk-csv').addEventListener('click', function () {
        if (!hasResults()) { status('Nothing to export yet - add a line with dimensions first.'); return; }
        if (!window.BAFF || !window.BAFF.share) { status('CSV download is not available in this browser.'); return; }
        window.BAFF.share.downloadText(buildCSV(), fileStem() + '.csv', 'text/csv;charset=utf-8');
        status('CSV saved: ' + fileStem() + '.csv');
    });

    $('ft-reset').addEventListener('click', function () {
        if (!window.confirm('Start a new takeoff? This clears every line on this device.')) return;
        touched = {};
        blankData();
        fillStatic();
        save();
        status('');
        renderLines();
    });

    function fillStatic() {
        form.querySelectorAll('[data-h]').forEach(function (inp) { inp.value = data.header[inp.getAttribute('data-h')] || ''; });
        $('tk-tax').value = data.tax == null ? '0' : data.tax;
        $('tk-notes').value = data.notes || '';
    }

    // Read-only hooks for QA (no effect on behavior)
    window.BATakeoffUI = {
        calculate: calculate,
        buildSummary: function () { return hasResults() ? buildSummary() : null; },
        buildCSV: function () { return hasResults() ? buildCSV() : null; },
        buildPdf: function () { return hasResults() ? buildPdf() : null; },
        getData: function () { return data; },
        getResults: function () { return results; },
        getTotals: function () { return totals; }
    };

    var restored = load();
    fillStatic();
    renderLines();
    setText('tk-saved', !storageOk ? 'Not saved: this browser is blocking storage. Copy or save a PDF before leaving.'
        : restored ? 'Your last takeoff was restored from this device.' : 'Saves on this device as you type.');
})();

/*
 * Builder Ascent Field Tools - Concrete Quantity & Pour Planner (v1) - page wiring
 * Depends on: field-tools-core.js (BAFieldTools), concrete-engine.js (BAConcreteEngine)
 * All math lives in concrete-engine.js. This file only reads inputs, validates, renders.
 */
(function () {
    'use strict';

    var FT = window.BAFieldTools;
    var CE = window.BAConcreteEngine;
    if (!FT || !CE) return;

    var $ = function (id) { return document.getElementById(id); };
    var form = $('ft-form');
    if (!form) return;

    /* ---------- Element modes (Version 1) ---------- */
    // kind: 'len' = feet+inches or decimal feet; 'thin' = inches or decimal feet; 'dia' = inches always
    var MODES = {
        slab:   { name: 'Rectangular Slab / Flatwork', qty: false, fields: [
                    { key: 'length', label: 'Length', kind: 'len', tag: 'L' },
                    { key: 'width', label: 'Width', kind: 'len', tag: 'W' },
                    { key: 'thick', label: 'Thickness', kind: 'thin', tag: 'T' }] },
        trench: { name: 'Continuous Linear Trench / Grade Beam', qty: false, fields: [
                    { key: 'length', label: 'Length', kind: 'len', tag: 'L' },
                    { key: 'width', label: 'Width', kind: 'len', tag: 'W' },
                    { key: 'depth', label: 'Depth', kind: 'thin', tag: 'D' }] },
        wall:   { name: 'Vertical Wall / Rectangular Column', qty: true, fields: [
                    { key: 'length', label: 'Length', kind: 'len', tag: 'L' },
                    { key: 'height', label: 'Height', kind: 'len', tag: 'H' },
                    { key: 'thick', label: 'Thickness', kind: 'thin', tag: 'T' }] },
        pier:   { name: 'Drilled Pier / Circular Column', qty: true, fields: [
                    { key: 'dia', label: 'Diameter', kind: 'dia', tag: 'Dia' },
                    { key: 'depth', label: 'Depth', kind: 'len', tag: 'D' }] }
    };

    var DEFAULTS = { waste: '0', reserve: '0.00', truck: '10.0', start: '07:00', interval: '20', unload: '20', step: '0.25' };

    // Typed values are kept per mode + unit system so switching back restores them.
    var store = {};
    var touched = {};

    function radioValue(name) {
        var el = form.querySelector('input[name="' + name + '"]:checked');
        return el ? el.value : null;
    }
    function storeKey(id) { return radioValue('mode') + '|' + radioValue('units') + '|' + id; }

    /* ---------- Build dimension inputs ---------- */
    function fieldHTML(id, label, unit, placeholder) {
        return '<div class="ft-subfield">' +
            '<label class="ft-label ft-label--small" for="' + id + '">' + label + ' <span class="ft-unit">' + unit + '</span></label>' +
            '<input class="ft-input" id="' + id + '" type="text" inputmode="decimal" placeholder="' + placeholder + '" aria-describedby="' + id + '-err">' +
            '</div>';
    }

    function renderDimensions() {
        var mode = MODES[radioValue('mode')];
        var dec = radioValue('units') === 'dec';
        var html = '';
        mode.fields.forEach(function (f) {
            var base = 'd-' + f.key;
            html += '<div class="ft-field" data-field="' + f.key + '">';
            if (f.kind === 'len' && !dec) {
                html += '<span class="ft-label" id="' + base + '-lbl">' + f.label + '</span>' +
                    '<div class="ft-pair" role="group" aria-labelledby="' + base + '-lbl">' +
                    fieldHTML(base + '-ft', f.label, 'ft', '0') +
                    fieldHTML(base + '-in', f.label, 'in', '0') +
                    '</div>';
            } else if (f.kind === 'len' || (f.kind === 'thin' && dec)) {
                html += fieldHTML(base, f.label, 'ft (decimal)', '0.0');
            } else {
                html += fieldHTML(base, f.label, 'inches', '0');
            }
            html += '<p class="ft-error-text" id="' + base + '-err" aria-live="polite"></p></div>';
        });
        if (mode.qty) {
            html += '<div class="ft-field" data-field="qty">' + fieldHTML('d-qty', 'Quantity', 'count', '1') +
                '<p class="ft-error-text" id="d-qty-err" aria-live="polite"></p></div>';
        }
        if (radioValue('mode') === 'pier') {
            html += '<p class="ft-help">Diameter is entered in inches in both unit modes.</p>';
        }
        $('ft-dimensions').innerHTML = html;

        // restore stored values (quantity defaults to 1)
        $('ft-dimensions').querySelectorAll('input').forEach(function (inp) {
            var k = storeKey(inp.id);
            if (store[k] !== undefined) inp.value = store[k];
            else if (inp.id === 'd-qty') inp.value = '1';
        });
    }

    /* ---------- Validation helpers ---------- */
    function showError(errId, inputs, message) {
        var el = $(errId);
        if (el) el.textContent = message || '';
        inputs.forEach(function (inp) {
            if (!inp) return;
            if (message) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
        });
    }

    // Reads one dimension; returns { ok, feet, display, empty }
    function readDimension(f, dec) {
        var base = 'd-' + f.key;
        if (f.kind === 'len' && !dec) {
            var fi = $(base + '-ft'), ii = $(base + '-in');
            var pf = FT.parseNumber(fi.value, { optional: true });
            var pi = FT.parseNumber(ii.value, { optional: true, below: 12, belowMessage: 'Inches must be less than 12' });
            var anyTouched = touched[fi.id] || touched[ii.id];
            if (pf.empty && pi.empty) {
                showError(base + '-err', [fi, ii], anyTouched ? 'Required' : '');
                return { ok: false, empty: true };
            }
            if (!pf.empty && !pf.ok) { showError(base + '-err', [fi, ii], 'Feet: ' + pf.error); return { ok: false }; }
            if (!pi.empty && !pi.ok) { showError(base + '-err', [fi, ii], 'Inches: ' + pi.error); return { ok: false }; }
            var ft = pf.empty ? 0 : pf.value, inch = pi.empty ? 0 : pi.value;
            var feet = CE.feetInchesToFeet(ft, inch);
            if (!(feet > 0)) { showError(base + '-err', [fi, ii], 'Must be greater than zero'); return { ok: false }; }
            showError(base + '-err', [fi, ii], '');
            return { ok: true, feet: feet, display: FT.formatPlain(ft, 4) + "'-" + FT.formatPlain(inch, 4) + '"' };
        }
        var inp = $(base);
        var p = FT.parseNumber(inp.value, { positive: true });
        if (p.empty) { showError(base + '-err', [inp], touched[inp.id] ? 'Required' : ''); return { ok: false, empty: true }; }
        if (!p.ok) { showError(base + '-err', [inp], p.error); return { ok: false }; }
        showError(base + '-err', [inp], '');
        if (f.kind === 'len' || (f.kind === 'thin' && dec)) return { ok: true, feet: p.value, display: FT.formatPlain(p.value, 4) + ' ft' };
        return { ok: true, feet: CE.inchesToFeet(p.value), display: FT.formatPlain(p.value, 4) + '"' };
    }

    function readQuantity() {
        var inp = $('d-qty');
        var p = FT.parseNumber(inp.value, { integer: true, positive: true });
        if (p.empty) { showError('d-qty-err', [inp], touched[inp.id] ? 'Required' : ''); return { ok: false, empty: true }; }
        if (!p.ok) { showError('d-qty-err', [inp], p.error); return { ok: false }; }
        showError('d-qty-err', [inp], '');
        return { ok: true, value: p.value };
    }

    function readSimple(id, errId, rules) {
        var inp = $(id);
        var p = FT.parseNumber(inp.value, rules);
        if (p.empty) { showError(errId, [inp], 'Required' + (rules.zeroHint ? ' (enter 0 for none)' : '')); return { ok: false }; }
        if (!p.ok) { showError(errId, [inp], p.error); return { ok: false }; }
        showError(errId, [inp], '');
        return { ok: true, value: p.value };
    }

    function readStep() {
        var v = radioValue('step');
        var wrap = $('ft-step-custom-wrap');
        wrap.hidden = v !== 'custom';
        if (v !== 'custom') { showError('ft-step-err', [$('ft-step-custom')], ''); return { ok: true, value: parseFloat(v) }; }
        var inp = $('ft-step-custom');
        var p = FT.parseNumber(inp.value, { positive: true, max: 100 });
        if (p.empty) { showError('ft-step-err', [inp], 'Enter a custom increment'); return { ok: false }; }
        if (!p.ok) { showError('ft-step-err', [inp], p.error); return { ok: false }; }
        showError('ft-step-err', [inp], '');
        return { ok: true, value: p.value };
    }

    /* ---------- Main calculation ---------- */
    var state = null;

    function calculate() {
        var modeKey = radioValue('mode');
        var mode = MODES[modeKey];
        var dec = radioValue('units') === 'dec';

        var dims = {}, dimsOk = true, dimsEmpty = false;
        mode.fields.forEach(function (f) {
            var r = readDimension(f, dec);
            dims[f.key] = r;
            if (!r.ok) { dimsOk = false; if (r.empty) dimsEmpty = true; }
        });
        var qty = { ok: true, value: 1 };
        if (mode.qty) { qty = readQuantity(); if (!qty.ok) dimsOk = false; }

        var waste = readSimple('ft-waste', 'ft-waste-err', { min: 0, max: 100, zeroHint: true });
        var reserve = readSimple('ft-reserve', 'ft-reserve-err', { min: 0, max: 1000, zeroHint: true });
        var step = readStep();
        var truck = readSimple('ft-truck', 'ft-truck-err', { positive: true, max: 100 });
        var allowOk = waste.ok && reserve.ok && step.ok && truck.ok;

        var startMin = FT.parseClock($('ft-start').value);
        showError('ft-start-err', [$('ft-start')], startMin === null ? 'Enter a start time' : '');
        var interval = readSimple('ft-interval', 'ft-interval-err', { positive: true, max: 1440 });
        var unload = readSimple('ft-unload', 'ft-unload-err', { positive: true, max: 1440 });
        var timeOk = startMin !== null && interval.ok && unload.ok;

        state = null;
        if (dimsOk && allowOk) {
            var netCF;
            if (modeKey === 'pier') {
                netCF = CE.cylindricalCF(dims.dia.feet, dims.depth.feet, qty.value);
            } else {
                var a = mode.fields[0].key, b = mode.fields[1].key, c = mode.fields[2].key;
                netCF = CE.rectangularCF(dims[a].feet, dims[b].feet, dims[c].feet, qty.value);
            }
            var order = CE.buildOrder({
                netCF: netCF,
                contingencyPercent: waste.value,
                reserveCY: reserve.value,
                batchIncrementCY: step.value,
                truckCapacityCY: truck.value
            });
            var timeline = null;
            if (timeOk && order.trucks && order.trucks.totalTrucks > 0) {
                timeline = CE.buildTimeline({
                    startMinutes: startMin,
                    arrivalIntervalMin: interval.value,
                    unloadDurationMin: unload.value,
                    loadsCY: CE.truckLoads(order.trucks)
                });
            }
            state = { modeKey: modeKey, mode: mode, dec: dec, dims: dims, qty: qty.value, order: order,
                      timeline: timeline, intervalMin: timeOk ? interval.value : null, unloadMin: timeOk ? unload.value : null,
                      startMin: startMin };
        }
        render(dimsEmpty && !dimsOk);
    }

    /* ---------- Rendering ---------- */
    var n2 = function (x) { return FT.formatNumber(x, 2); };

    function setText(id, text) { var el = $(id); if (el) el.textContent = text; }

    function render(waitingForDims) {
        var has = !!state;
        $('ft-results-empty').hidden = has;
        $('ft-results-body').hidden = !has;
        $('ft-results-empty').querySelector('p').textContent = waitingForDims
            ? 'Enter dimensions to see quantities.'
            : 'Fix the highlighted entries to see quantities.';

        if (has) {
            var o = state.order, t = o.trucks;
            setText('r-order', n2(o.orderCY));
            setText('r-net-cf', n2(o.netCF));
            setText('r-net-cy', n2(o.netCY));
            setText('r-waste-pct', FT.formatPlain(o.contingencyPercent, 2));
            setText('r-waste-cy', n2(o.contingencyCY));
            setText('r-reserve', n2(o.reserveCY));
            setText('r-gross', n2(o.grossCY));
            setText('r-step', o.batchIncrementCY > 0 ? FT.formatPlain(o.batchIncrementCY, 4) + ' CY' : 'exact (no rounding)');
            setText('r-rounding', n2(o.roundingAddedCY));
            setText('r-cap', n2(t.truckCapacityCY));
            setText('r-trucks-total', String(t.totalTrucks));
            setText('r-trucks-full', String(t.fullTruckCount));
            setText('r-trucks-partial', String(t.partialTruckCount));
            setText('r-balance', n2(t.balanceVolumeCY));
            setText('r-trucks-text', truckSentence(t));
        }
        renderTimeline();
        renderQuickbar();
        $('ft-summary').value = has ? buildSummary() : 'Enter dimensions to build a summary.';
    }

    function truckSentence(t) {
        if (t.totalTrucks === 0) return 'No trucks needed.';
        var s = t.totalTrucks + ' truck' + (t.totalTrucks === 1 ? '' : 's') + ': ' + t.fullTruckCount + ' full × ' + n2(t.truckCapacityCY) + ' CY';
        if (t.partialTruckCount) s += ' + 1 partial (balance) of ' + n2(t.balanceVolumeCY) + ' CY';
        else s += ' — no partial truck';
        return s + '.';
    }

    function waitCell(tr) {
        if (tr.waitMin > 1e-9) return 'Waits ' + FT.formatDuration(tr.waitMin);
        if (tr.gapBeforeMin > 1e-9) return 'Gap ' + FT.formatDuration(tr.gapBeforeMin);
        return '—';
    }

    function timelineWarnings(tl) {
        var w = [];
        if (tl.stacking) {
            w.push('Trucks projected to wait: arrival interval (' + FT.formatPlain(state.intervalMin, 2) + ' min) is shorter than unload time (' +
                FT.formatPlain(state.unloadMin, 2) + ' min). Last truck waits about ' + FT.formatDuration(tl.trucks[tl.trucks.length - 1].waitMin) +
                '; total truck waiting about ' + FT.formatDuration(tl.totalWaitMin) + '.');
        }
        if (tl.gaps) {
            w.push('Planned gaps between loads: arrival interval (' + FT.formatPlain(state.intervalMin, 2) + ' min) is longer than unload time (' +
                FT.formatPlain(state.unloadMin, 2) + ' min), leaving about ' + FT.formatDuration(tl.maxGapMin) + ' idle at the placement point between trucks.');
        }
        return w;
    }

    function renderTimeline() {
        var tl = state && state.timeline;
        $('ft-timeline-empty').hidden = !!tl;
        $('ft-timeline-body').hidden = !tl;
        if (!tl) {
            $('ft-timeline-empty').querySelector('p').textContent = state
                ? 'Fix the highlighted timeline entries above to see the planned truck timeline.'
                : 'The timeline appears once the order and trucks are calculated.';
            return;
        }
        setText('t-finish', FT.formatClock(tl.finishMinutes));
        setText('t-span', FT.formatDuration(tl.spanMinutes));

        var warn = $('t-warnings');
        warn.innerHTML = '';
        timelineWarnings(tl).forEach(function (msg) {
            var p = document.createElement('p');
            p.className = 'ft-warning';
            p.textContent = msg;
            warn.appendChild(p);
        });

        var rows = $('t-rows');
        rows.innerHTML = '';
        var t = state.order.trucks;
        var LIMIT = 150;
        tl.trucks.slice(0, LIMIT).forEach(function (tr) {
            var isBalance = t.partialTruckCount && tr.number === tl.trucks.length;
            var row = document.createElement('tr');
            [
                '#' + tr.number,
                n2(tr.volumeCY) + ' CY' + (isBalance ? ' (balance)' : ''),
                FT.formatClock(tr.arrival),
                FT.formatClock(tr.unloadStart) + ' – ' + FT.formatClock(tr.unloadFinish),
                waitCell(tr)
            ].forEach(function (txt, i) {
                var cell = document.createElement(i === 0 ? 'th' : 'td');
                if (i === 0) cell.setAttribute('scope', 'row');
                cell.setAttribute('data-label', ['Truck', 'Load', 'Arrives', 'Unload', 'Wait / gap'][i]);
                cell.textContent = txt;
                row.appendChild(cell);
            });
            rows.appendChild(row);
        });
        if (tl.trucks.length > LIMIT) {
            var more = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = 'Showing the first ' + LIMIT + ' of ' + tl.trucks.length + ' trucks.';
            more.appendChild(td);
            rows.appendChild(more);
        }
    }

    function renderQuickbar() {
        var bar = $('ft-quickbar');
        if (!state) { bar.classList.remove('is-visible'); return; }
        bar.classList.add('is-visible');
        setText('q-order', n2(state.order.orderCY) + ' CY');
        setText('q-trucks', String(state.order.trucks.totalTrucks));
        setText('q-finish', state.timeline ? FT.formatClock(state.timeline.finishMinutes) : '—');
    }

    /* ---------- Field summary (clipboard) ---------- */
    // Only user-entered facts and calculated results. Nothing invented.
    function buildSummary() {
        var o = state.order, t = o.trucks, tl = state.timeline;
        var L = [];
        L.push('BUILDER ASCENT - CONCRETE POUR PLAN');
        var label = $('ft-label').value.trim();
        if (label) L.push('Pour: ' + label + ' [USER INPUT]');
        L.push('');
        L.push('ENTERED BY USER');
        var dimParts = state.mode.fields.map(function (f) { return f.label + ' ' + state.dims[f.key].display; });
        L.push('Element: ' + state.mode.name);
        L.push('Dimensions: ' + dimParts.join(' x ') + (state.mode.qty ? ' | Qty ' + state.qty : '') + ' [USER INPUT]');
        L.push('Contingency: ' + FT.formatPlain(o.contingencyPercent, 2) + '% [USER INPUT]');
        L.push('Reserve: ' + n2(o.reserveCY) + ' CY [USER INPUT]');
        L.push('Batch increment: ' + (o.batchIncrementCY > 0 ? FT.formatPlain(o.batchIncrementCY, 4) + ' CY' : 'exact (none)') + ' [VERIFY SPEC]');
        L.push('Truck capacity: ' + n2(t.truckCapacityCY) + ' CY/truck [VERIFY SPEC]');
        L.push('');
        L.push('CALCULATED');
        L.push('Net volume: ' + n2(o.netCF) + ' CF = ' + n2(o.netCY) + ' CY [CALCULATED]');
        L.push('Contingency: +' + n2(o.contingencyCY) + ' CY [CALCULATED]');
        L.push('Unrounded gross need: ' + n2(o.grossCY) + ' CY [CALCULATED]');
        L.push('PLANNED ORDER QUANTITY: ' + n2(o.orderCY) + ' CY [CALCULATED]');
        L.push('Trucks: ' + t.totalTrucks + ' total = ' + t.fullTruckCount + ' full + ' + t.partialTruckCount + ' partial; balance ' + n2(t.balanceVolumeCY) + ' CY [CALCULATED]');
        if (tl) {
            L.push('');
            L.push('PLANNING ESTIMATE (not a dispatch schedule)');
            L.push('First truck ' + FT.formatClock(tl.startMinutes) + ', planned arrival every ' + FT.formatPlain(state.intervalMin, 2) +
                ' min, est. unload ' + FT.formatPlain(state.unloadMin, 2) + ' min/truck [USER INPUT]');
            L.push('Est. final unload complete: ' + FT.formatClock(tl.finishMinutes) + ' (' + FT.formatDuration(tl.spanMinutes) + ') [ESTIMATE]');
            tl.trucks.slice(0, 60).forEach(function (tr) {
                var w = waitCell(tr);
                L.push('T' + tr.number + ' ' + n2(tr.volumeCY) + ' CY: arrive ' + FT.formatClock(tr.arrival) + ', unload ' +
                    FT.formatClock(tr.unloadStart) + '-' + FT.formatClock(tr.unloadFinish) + (w !== '—' ? ' (' + w.toLowerCase() + ')' : ''));
            });
            if (tl.trucks.length > 60) L.push('...' + (tl.trucks.length - 60) + ' more trucks');
            timelineWarnings(tl).forEach(function (msg) { L.push('Note: ' + msg); });
        }
        var checked = Array.prototype.map.call(form.querySelectorAll('input[name="remind"]:checked'), function (c) { return c.value; });
        if (checked.length) {
            L.push('');
            L.push('Pre-pour reminders marked by user: ' + checked.join(', ') + ' of 6 (coordination reminders, not an inspection certification)');
        }
        L.push('');
        L.push('Planning aid only. Verify quantities, mix and delivery with supplier, plans, specs and project requirements.');
        L.push('Builder Ascent Field Tools - builderascent.com');
        return L.join('\n');
    }

    /* ---------- Events ---------- */
    function onInput(e) {
        var el = e.target;
        if (el && el.id) {
            touched[el.id] = true;
            if (el.closest && el.closest('#ft-dimensions')) store[storeKey(el.id)] = el.value;
        }
        calculate();
    }

    form.addEventListener('input', onInput);
    form.addEventListener('change', function (e) {
        var name = e.target && e.target.name;
        if (name === 'mode' || name === 'units') renderDimensions();
        onInput(e);
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    // Example chips fill their target field (convenience only)
    form.querySelectorAll('.ft-chips').forEach(function (group) {
        group.addEventListener('click', function (e) {
            var btn = e.target.closest('.ft-chip');
            if (!btn) return;
            var target = $(group.getAttribute('data-target'));
            target.value = btn.getAttribute('data-value');
            touched[target.id] = true;
            calculate();
        });
    });

    $('ft-match-interval').addEventListener('click', function () {
        $('ft-interval').value = $('ft-unload').value;
        calculate();
    });

    $('ft-copy').addEventListener('click', function () {
        var status = $('ft-copy-status');
        if (!state) { status.textContent = 'Nothing to copy yet - enter dimensions first.'; return; }
        var text = buildSummary();
        FT.copyText(text).then(function (ok) {
            status.textContent = ok
                ? 'Copied. Paste it into your text, email, Fieldwire, Procore or daily report.'
                : 'Could not copy automatically. Select the text in the preview and copy it.';
        });
    });

    $('ft-reset').addEventListener('click', function () {
        store = {}; touched = {};
        form.querySelector('input[name="mode"][value="slab"]').checked = true;
        form.querySelector('input[name="units"][value="ftin"]').checked = true;
        form.querySelector('input[name="step"][value="' + DEFAULTS.step + '"]').checked = true;
        $('ft-step-custom').value = '';
        $('ft-waste').value = DEFAULTS.waste;
        $('ft-reserve').value = DEFAULTS.reserve;
        $('ft-truck').value = DEFAULTS.truck;
        $('ft-start').value = DEFAULTS.start;
        $('ft-interval').value = DEFAULTS.interval;
        $('ft-unload').value = DEFAULTS.unload;
        $('ft-label').value = '';
        form.querySelectorAll('input[name="remind"]').forEach(function (c) { c.checked = false; });
        $('ft-copy-status').textContent = '';
        renderDimensions();
        calculate();
    });

    // Expose read-only hooks for QA (no effect on behavior)
    window.BAConcreteUI = { calculate: calculate, buildSummary: function () { return state ? buildSummary() : null; }, getState: function () { return state; } };

    renderDimensions();
    calculate();
})();

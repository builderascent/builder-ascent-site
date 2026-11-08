/*
 * Builder Ascent Field Tools - Material Takeoff Engine (v1)
 *
 * Pure calculation functions. No DOM access, no network, no storage.
 * Measured quantity -> waste allowance -> purchase units (rounded UP) -> cost -> tax -> total.
 * Full precision internally; rounding happens only where the order is rounded up and in display code.
 *
 * Exposed as window.BATakeoffEngine (and module.exports when available).
 */
(function (root) {
    'use strict';

    var EPS = 1e-9;

    function isNum(x) { return typeof x === 'number' && isFinite(x); }

    /* ---------- Measure types ---------- */
    // dims: which dimensions the measure uses. CY depth is always entered in inches.
    var MEASURES = {
        EA: { unit: 'EA', name: 'Count', dims: [] },
        LF: { unit: 'LF', name: 'Linear feet', dims: ['L'] },
        SF: { unit: 'SF', name: 'Square feet', dims: ['L', 'W'] },
        CY: { unit: 'CY', name: 'Cubic yards', dims: ['L', 'W', 'D'] }
    };

    /* ---------- Length parsing ----------
     * Plain number            -> feet          "12.5"
     * Feet-inches             -> feet          "12'6", "12' 6\"", "12'-6 1/2\"", "12-6"
     * Inches only (needs ")   -> feet          "6\"", "3 1/2\""
     * Returns { ok, feet, empty, error } and never NaN.
     */
    var NUM = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
    var FRAC = '(\\d+)\\s*\\/\\s*(\\d+)';
    var RE_FEET = new RegExp('^' + NUM + '$');
    var RE_FTIN = new RegExp('^' + NUM + "\\s*'\\s*-?\\s*(?:" + NUM + '?\\s*(?:' + FRAC + ')?\\s*"?)?$');
    var RE_DASH = new RegExp('^(\\d+)\\s*-\\s*' + NUM + '(?:\\s+' + FRAC + ')?\\s*"?$');
    var RE_IN = new RegExp('^(?:' + NUM + '\\s*)?(?:' + FRAC + ')?\\s*"$');

    function fraction(num, den) {
        if (num === undefined || den === undefined) return { ok: true, value: 0 };
        var a = parseInt(num, 10), b = parseInt(den, 10);
        if (!(b > 0)) return { ok: false, error: 'Fraction cannot divide by zero' };
        if (a >= b) return { ok: false, error: 'Use a proper fraction, like 1/2' };
        return { ok: true, value: a / b };
    }

    function parseLength(raw) {
        var s = raw === null || raw === undefined ? '' : String(raw).trim();
        s = s.replace(/[′’‘`]/g, "'").replace(/[″“”]/g, '"').replace(/''/g, '"');
        if (s === '') return { ok: false, empty: true, feet: null, error: 'Required' };
        if (s.charAt(0) === '-') return { ok: false, feet: null, error: 'Cannot be negative' };
        if (s.indexOf(',') !== -1) return { ok: false, feet: null, error: 'Use a period for decimals, no commas' };
        var m, ft = 0, inch = 0, fr, hasIn = false;
        if ((m = RE_FEET.exec(s))) {
            ft = parseFloat(m[1]);
        } else if ((m = RE_FTIN.exec(s)) || (m = RE_DASH.exec(s))) {
            ft = parseFloat(m[1]);
            if (m[2] !== undefined) { inch = parseFloat(m[2]); hasIn = true; }
            fr = fraction(m[3], m[4]);
            if (!fr.ok) return { ok: false, feet: null, error: fr.error };
            if (m[3] !== undefined) hasIn = true;
            inch += fr.value;
            if (hasIn && inch >= 12) return { ok: false, feet: null, error: 'Inches must be less than 12' };
        } else if ((m = RE_IN.exec(s)) && (m[1] !== undefined || m[2] !== undefined)) {
            inch = m[1] !== undefined ? parseFloat(m[1]) : 0;
            fr = fraction(m[2], m[3]);
            if (!fr.ok) return { ok: false, feet: null, error: fr.error };
            inch += fr.value;
        } else {
            return { ok: false, feet: null, error: "Use feet (12.5) or feet-inches (12'6\")" };
        }
        var feet = ft + inch / 12;
        if (!isNum(feet)) return { ok: false, feet: null, error: 'Numbers only' };
        if (feet <= 0) return { ok: false, feet: null, error: 'Must be greater than zero' };
        return { ok: true, feet: feet, error: null };
    }

    /* ---------- Quantities ---------- */

    // Measured quantity in the measure's unit. dims in feet, except depthIn (inches) for CY.
    function measuredQuantity(measure, dims, count) {
        var c = isNum(count) ? count : 1;
        switch (measure) {
            case 'EA': return c;
            case 'LF': return dims.L * c;
            case 'SF': return dims.L * dims.W * c;
            case 'CY': return dims.L * dims.W * (dims.depthIn / 12) * c / 27;
        }
        return NaN;
    }

    function ceilTo(x, step) {
        if (x <= 0) return 0;
        return Math.ceil(x / step - EPS) * step;
    }

    /*
     * One takeoff line.
     * opts: { measure, measured, wastePct, coverage (measure units per purchase unit, optional),
     *         unitCost (per purchase unit, or per measure unit with no coverage; optional) }
     * Order rounding: with coverage -> whole purchase units (rounded up);
     *                 without coverage -> EA/LF/SF whole units (rounded up), CY to 0.01 (rounded up).
     */
    function buildLine(opts) {
        var measured = opts.measured;
        var wastePct = opts.wastePct || 0;
        var wasteQty = measured * wastePct / 100;
        var gross = measured + wasteQty;
        var cov = isNum(opts.coverage) && opts.coverage > 0 ? opts.coverage : null;
        var order, purchaseExact;
        if (cov) {
            purchaseExact = gross / cov;
            order = ceilTo(purchaseExact, 1);
        } else {
            purchaseExact = gross;
            order = opts.measure === 'CY' ? Math.round(ceilTo(gross, 0.01) * 100) / 100 : ceilTo(gross, 1);
        }
        var cost = isNum(opts.unitCost) ? order * opts.unitCost : null;
        return {
            measure: opts.measure,
            measured: measured,
            wastePct: wastePct,
            wasteQty: wasteQty,
            gross: gross,
            coverage: cov,
            purchaseExact: purchaseExact,
            order: order,
            roundingAdded: Math.max(0, order - purchaseExact),
            unitCost: isNum(opts.unitCost) ? opts.unitCost : null,
            cost: cost
        };
    }

    // Totals across priced lines. taxPct applies to the material subtotal.
    function buildTotals(lines, taxPct) {
        var subtotal = 0, priced = 0, unpriced = 0;
        lines.forEach(function (l) {
            if (isNum(l.cost)) { subtotal += l.cost; priced++; } else unpriced++;
        });
        var t = isNum(taxPct) ? taxPct : 0;
        var tax = subtotal * t / 100;
        return { subtotal: subtotal, taxPct: t, tax: tax, total: subtotal + tax, pricedLines: priced, unpricedLines: unpriced };
    }

    var api = {
        EPS: EPS,
        MEASURES: MEASURES,
        parseLength: parseLength,
        measuredQuantity: measuredQuantity,
        ceilTo: ceilTo,
        buildLine: buildLine,
        buildTotals: buildTotals
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BATakeoffEngine = api;
})(typeof window !== 'undefined' ? window : this);

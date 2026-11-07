/*
 * Builder Ascent Field Tools - Concrete Quantity & Pour Planning Engine (v1)
 *
 * Pure calculation functions. No DOM access, no network, no storage.
 * All math keeps full floating-point precision internally; rounding happens
 * only in supplier-increment logic (roundUpToIncrement) and in display code.
 *
 * Exposed as window.BAConcreteEngine (and module.exports when available).
 */
(function (root) {
    'use strict';

    // Tolerance used to absorb binary floating-point noise (e.g. 100.00000000000001)
    // before ceil/floor decisions. Far smaller than any meaningful concrete quantity.
    var EPS = 1e-9;
    var ZERO_CY = 1e-6; // remainders below 0.000001 CY are treated as zero

    function isNum(x) { return typeof x === 'number' && isFinite(x); }

    function clean(x, places) {
        var f = Math.pow(10, places === undefined ? 9 : places);
        return Math.round(x * f) / f;
    }

    /* ---------- Unit conversion ---------- */

    // feet + inches -> decimal feet
    function feetInchesToFeet(feet, inches) {
        return (feet || 0) + (inches || 0) / 12;
    }

    // inches -> decimal feet
    function inchesToFeet(inches) {
        return inches / 12;
    }

    /* ---------- Geometry (cubic feet) ---------- */

    // Rectangular prism: slab, trench/grade beam, wall/rectangular column
    function rectangularCF(lengthFt, widthFt, depthFt, quantity) {
        var q = quantity === undefined ? 1 : quantity;
        return lengthFt * widthFt * depthFt * q;
    }

    // Cylinder: drilled pier / circular column (diameter and depth in feet)
    function cylindricalCF(diameterFt, depthFt, quantity) {
        var q = quantity === undefined ? 1 : quantity;
        var r = diameterFt / 2;
        return Math.PI * r * r * depthFt * q;
    }

    function cubicFeetToCubicYards(cf) {
        return cf / 27;
    }

    /* ---------- Order build-up ---------- */

    // Contingency / waste allowance as a user-entered percentage of net volume
    function contingencyCY(netCY, percent) {
        return netCY * (percent / 100);
    }

    // Round UP to the supplier batch increment. step <= 0 (or missing) means "exact".
    function roundUpToIncrement(volumeCY, stepCY) {
        if (!isNum(stepCY) || stepCY <= 0) return volumeCY;
        if (volumeCY <= 0) return 0;
        var n = Math.ceil(volumeCY / stepCY - EPS);
        return clean(n * stepCY, 9);
    }

    // Split an order into full trucks plus at most one partial (balance) truck.
    // Exact divisibility -> partialTruckCount = 0 and balanceVolumeCY = 0.
    function allocateTrucks(orderCY, truckCapacityCY) {
        if (!isNum(orderCY) || !isNum(truckCapacityCY) || truckCapacityCY <= 0 || orderCY < 0) {
            return null;
        }
        if (orderCY <= ZERO_CY) {
            return { totalTrucks: 0, fullTruckCount: 0, partialTruckCount: 0, balanceVolumeCY: 0, truckCapacityCY: truckCapacityCY };
        }
        var full = Math.floor(orderCY / truckCapacityCY + EPS);
        var remainder = orderCY - full * truckCapacityCY;
        if (remainder < ZERO_CY) remainder = 0;
        var partial = remainder > 0 ? 1 : 0;
        return {
            totalTrucks: full + partial,
            fullTruckCount: full,
            partialTruckCount: partial,
            balanceVolumeCY: partial ? clean(remainder, 9) : 0,
            truckCapacityCY: truckCapacityCY
        };
    }

    // Full order build-up from a net volume in cubic feet.
    function buildOrder(opts) {
        var netCF = opts.netCF;
        var netCY = cubicFeetToCubicYards(netCF);
        var wastePct = opts.contingencyPercent || 0;
        var wasteCY = contingencyCY(netCY, wastePct);
        var reserveCY = opts.reserveCY || 0;
        var grossCY = netCY + wasteCY + reserveCY;
        var step = opts.batchIncrementCY || 0;
        var orderCY = roundUpToIncrement(grossCY, step);
        return {
            netCF: netCF,
            netCY: netCY,
            contingencyPercent: wastePct,
            contingencyCY: wasteCY,
            reserveCY: reserveCY,
            grossCY: grossCY,
            batchIncrementCY: step,
            orderCY: orderCY,
            roundingAddedCY: Math.max(0, orderCY - grossCY),
            trucks: allocateTrucks(orderCY, opts.truckCapacityCY)
        };
    }

    /* ---------- Truck timeline (single active placement point) ---------- */
    //
    // arrival(n)      = start + (n - 1) * arrivalInterval
    // unloadStart(n)  = max(arrival(n), unloadFinish(n - 1))
    // unloadFinish(n) = unloadStart(n) + unloadDuration
    // wait(n)         = unloadStart(n) - arrival(n)               (truck waiting / stacking)
    // gapBefore(n)    = max(0, arrival(n) - unloadFinish(n - 1))  (placement point idle)
    //
    // All times are minutes after midnight of the pour day. Planning estimate only.
    function buildTimeline(opts) {
        var start = opts.startMinutes;
        var interval = opts.arrivalIntervalMin;
        var duration = opts.unloadDurationMin;
        var loads = opts.loadsCY || [];
        var trucks = [];
        var prevFinish = null;
        var totalWait = 0, maxWait = 0, totalGap = 0, maxGap = 0;

        for (var i = 0; i < loads.length; i++) {
            var arrival = start + i * interval;
            var unloadStart = prevFinish === null ? arrival : Math.max(arrival, prevFinish);
            var unloadFinish = unloadStart + duration;
            var wait = unloadStart - arrival;
            var gap = prevFinish === null ? 0 : Math.max(0, arrival - prevFinish);
            totalWait += wait; totalGap += gap;
            if (wait > maxWait) maxWait = wait;
            if (gap > maxGap) maxGap = gap;
            trucks.push({
                number: i + 1,
                volumeCY: loads[i],
                arrival: arrival,
                unloadStart: unloadStart,
                unloadFinish: unloadFinish,
                waitMin: wait,
                gapBeforeMin: gap
            });
            prevFinish = unloadFinish;
        }

        var finish = trucks.length ? trucks[trucks.length - 1].unloadFinish : start;
        return {
            trucks: trucks,
            startMinutes: start,
            finishMinutes: finish,
            spanMinutes: finish - start,
            totalWaitMin: totalWait,
            maxWaitMin: maxWait,
            totalGapMin: totalGap,
            maxGapMin: maxGap,
            stacking: maxWait > EPS,
            gaps: maxGap > EPS
        };
    }

    // Truck-by-truck load volumes for the timeline: full loads then the balance load.
    function truckLoads(allocation) {
        var loads = [];
        if (!allocation) return loads;
        for (var i = 0; i < allocation.fullTruckCount; i++) loads.push(allocation.truckCapacityCY);
        if (allocation.partialTruckCount) loads.push(allocation.balanceVolumeCY);
        return loads;
    }

    var api = {
        EPS: EPS,
        feetInchesToFeet: feetInchesToFeet,
        inchesToFeet: inchesToFeet,
        rectangularCF: rectangularCF,
        cylindricalCF: cylindricalCF,
        cubicFeetToCubicYards: cubicFeetToCubicYards,
        contingencyCY: contingencyCY,
        roundUpToIncrement: roundUpToIncrement,
        allocateTrucks: allocateTrucks,
        buildOrder: buildOrder,
        buildTimeline: buildTimeline,
        truckLoads: truckLoads
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BAConcreteEngine = api;
})(typeof window !== 'undefined' ? window : this);

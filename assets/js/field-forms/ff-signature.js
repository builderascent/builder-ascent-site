/*
 * Builder Ascent Field Forms - signature pad (v1)
 * Finger / stylus / mouse drawing on a canvas (Pointer Events). Strokes are kept as points so the
 * pad redraws crisply after rotation or resize. Exports a small JPEG on a white background.
 * A drawn signature is a mark the person made on this device. It is NOT identity verification.
 * Exposed as window.BAFF.signature
 */
(function (root) {
    'use strict';

    function create(host, opts) {
        opts = opts || {};
        var wrap = document.createElement('div');
        wrap.className = 'ff-sig';
        var canvas = document.createElement('canvas');
        canvas.className = 'ff-sig-canvas';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', opts.label || 'Signature pad. Draw a signature with a finger, stylus or mouse.');
        var line = document.createElement('div');
        line.className = 'ff-sig-line';
        line.setAttribute('aria-hidden', 'true');
        line.textContent = 'Sign above';
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'ff-sig-clear';
        clear.textContent = 'Clear';
        clear.setAttribute('aria-label', 'Clear signature');
        wrap.appendChild(canvas);
        wrap.appendChild(line);
        wrap.appendChild(clear);
        host.appendChild(wrap);

        var ctx = canvas.getContext('2d');
        var strokes = [], current = null, cssW = 0, cssH = 0;

        function size() {
            var r = canvas.getBoundingClientRect();
            if (!r.width) return;
            var dpr = Math.max(1, root.devicePixelRatio || 1);
            cssW = r.width; cssH = r.height;
            canvas.width = Math.round(r.width * dpr);
            canvas.height = Math.round(r.height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            redraw();
        }
        function style(c) { c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111'; c.lineWidth = 2.6; }
        function drawStroke(c, s, sx, sy) {
            if (!s.length) return;
            c.beginPath();
            c.moveTo(s[0][0] * sx, s[0][1] * sy);
            if (s.length === 1) c.lineTo(s[0][0] * sx + 0.1, s[0][1] * sy + 0.1);
            for (var i = 1; i < s.length; i++) c.lineTo(s[i][0] * sx, s[i][1] * sy);
            c.stroke();
        }
        function redraw() {
            ctx.clearRect(0, 0, cssW, cssH);
            style(ctx);
            strokes.forEach(function (s) { drawStroke(ctx, s, cssW, cssH); });
        }
        // points stored normalized 0..1 so they survive resize
        function pt(e) {
            var r = canvas.getBoundingClientRect();
            return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
        }
        function down(e) {
            if (e.button != null && e.button > 0) return;
            e.preventDefault();
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            current = [pt(e)];
            strokes.push(current);
            redraw();
        }
        function move(e) {
            if (!current) return;
            e.preventDefault();
            var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            (evs.length ? evs : [e]).forEach(function (ev) { current.push(pt(ev)); });
            redraw();
        }
        function up() {
            if (!current) return;
            current = null;
            if (opts.onChange) opts.onChange(!api.isEmpty());
        }
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') up(); });
        clear.addEventListener('click', function () { api.clear(); });

        var ro = root.ResizeObserver ? new root.ResizeObserver(size) : null;
        if (ro) ro.observe(canvas); else root.addEventListener('resize', size);
        setTimeout(size, 0);

        var api = {
            el: wrap,
            isEmpty: function () {
                // treat accidental taps as empty: need some ink length
                var len = 0;
                strokes.forEach(function (s) {
                    for (var i = 1; i < s.length; i++) len += Math.hypot((s[i][0] - s[i - 1][0]) * 3, s[i][1] - s[i - 1][1]);
                });
                return len < 0.15;
            },
            clear: function () { strokes = []; redraw(); if (opts.onChange) opts.onChange(false); },
            // JPEG, white background, black ink, fixed 600x200 (3:1) so records stay small
            toJPEG: function () {
                var W = 600, H = 200, c = document.createElement('canvas');
                c.width = W; c.height = H;
                var x = c.getContext('2d');
                x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
                style(x); x.lineWidth = 6;
                // crop to the ink (in on-screen pixels), then scale to fit, keeping proportions
                var pw = cssW || 600, ph = cssH || 200, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
                strokes.forEach(function (s) { s.forEach(function (p) {
                    minX = Math.min(minX, p[0] * pw); maxX = Math.max(maxX, p[0] * pw);
                    minY = Math.min(minY, p[1] * ph); maxY = Math.max(maxY, p[1] * ph);
                }); });
                if (maxX < minX) { minX = 0; minY = 0; maxX = pw; maxY = ph; }
                var m = 8, bw = Math.max(maxX - minX, 40) + 2 * m, bh = Math.max(maxY - minY, 20) + 2 * m;
                var k = Math.min((W - 8) / bw, (H - 8) / bh, 3);
                x.translate(4 + (W - 8 - bw * k) / 2, 4 + (H - 8 - bh * k) / 2);
                x.scale(k, k);
                x.translate(m - minX, m - minY);
                x.lineWidth = 6 / k;
                strokes.forEach(function (s) { drawStroke(x, s, pw, ph); });
                return { dataUrl: c.toDataURL('image/jpeg', 0.82), w: W, h: H };
            },
            destroy: function () { if (ro) ro.disconnect(); else root.removeEventListener('resize', size); wrap.remove(); }
        };
        return api;
    }

    root.BAFF = root.BAFF || {};
    root.BAFF.signature = { create: create };
})(typeof window !== 'undefined' ? window : this);

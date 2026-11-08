/*
 * Builder Ascent Field Forms - PDF writer (v1)
 * Small, dependency-free, client-side PDF generator written for Builder Ascent (MIT-style, in-repo).
 * - True US Letter pages (612 x 792 pt), 0.5 in margins.
 * - Real text using the PDF standard Helvetica fonts (WinAnsiEncoding), so text is selectable/searchable.
 *   Content streams are left uncompressed so any PDF tool can read the text.
 * - Grayscale only (black/white-printer safe). Signature images embedded as JPEG (DCTDecode).
 * - Automatic pagination: running header on pages 2+, repeating table headers, rows split cleanly
 *   at line boundaries, "Page x of y" footers, optional DRAFT watermark.
 * No network, no external service, no raster page images.
 * Exposed as window.BAFF.pdf
 */
(function (root) {
    'use strict';

    // ---- Font metrics (Adobe standard Helvetica AFM widths, per 1000 em) for codes 32..126 ----
    var W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
        667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
        278, 278, 278, 469, 556, 333,
        556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
        334, 260, 334, 584];
    var W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
        722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
        333, 278, 333, 584, 556, 333,
        556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
        389, 280, 389, 584];
    // WinAnsi codes 128..255 that are not ~556 wide
    var W_HIGH = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000, 0xA0: 278, 0xB0: 400, 0xB7: 278, 0xD7: 584 };
    var W_HIGH_BOLD = { 0x80: 556, 0x85: 1000, 0x91: 278, 0x92: 278, 0x93: 500, 0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000, 0xA0: 278, 0xB0: 400, 0xB7: 278, 0xD7: 584 };
    // Unicode -> WinAnsi
    var UNI = { 0x2014: 0x97, 0x2013: 0x96, 0x2022: 0x95, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2026: 0x85, 0x20AC: 0x80, 0x2122: 0x99, 0x00B7: 0xB7 };

    var FONTS = { R: 'F1', B: 'F2', I: 'F3' };

    // Encode any JS string to a WinAnsi "byte string" (each char code 0..255). Unmappable -> nearest ASCII or '?'.
    function encode(str) {
        str = String(str == null ? '' : str);
        if (str.normalize) str = str.normalize('NFC');
        var out = '';
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF) { i++; continue; }              // astral (emoji etc.): not printable in WinAnsi, dropped
            if (c === 0xFE0F || c === 0xFE0E || c === 0x200D) continue;     // emoji variation selectors / joiners
            if (c === 10) { out += '\n'; continue; }
            if (c === 9 || c === 13) { out += ' '; continue; }
            if (c >= 32 && c <= 126) { out += str[i]; continue; }
            if (c >= 160 && c <= 255) { out += String.fromCharCode(c); continue; }
            if (UNI[c]) { out += String.fromCharCode(UNI[c]); continue; }
            var base = str[i].normalize ? str[i].normalize('NFKD').charAt(0) : '';
            var bc = base.charCodeAt(0);
            out += (bc >= 32 && bc <= 126) ? base : '?';
        }
        return out;
    }

    function charWidth(code, font) {
        if (code >= 32 && code <= 126) return (font === 'B' ? W_BOLD : W_REG)[code - 32];
        var t = font === 'B' ? W_HIGH_BOLD : W_HIGH;
        return t[code] || 556;
    }
    function width(enc, font, size) {
        var w = 0;
        for (var i = 0; i < enc.length; i++) w += charWidth(enc.charCodeAt(i), font);
        return w * size / 1000;
    }

    // Wrap an encoded string to lines no wider than maxW. Honors \n. Breaks very long words.
    function wrap(enc, font, size, maxW) {
        var lines = [];
        enc.split('\n').forEach(function (para) {
            var words = para.split(' ');
            var line = '';
            words.forEach(function (word) {
                var cand = line ? line + ' ' + word : word;
                if (width(cand, font, size) <= maxW) { line = cand; return; }
                if (line) lines.push(line);
                // word longer than the line: hard-break it
                while (width(word, font, size) > maxW) {
                    var k = word.length;
                    while (k > 1 && width(word.slice(0, k), font, size) > maxW) k--;
                    lines.push(word.slice(0, k));
                    word = word.slice(k);
                }
                line = word;
            });
            lines.push(line);
        });
        return lines;
    }

    function pdfStr(enc) { return '(' + enc.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
    function n(v) { return (Math.round(v * 100) / 100).toString(); }

    // JPEG size + components from SOF marker
    function jpegInfo(bytes) {
        var i = 2;
        while (i < bytes.length) {
            if (bytes[i] !== 0xFF) { i++; continue; }
            var m = bytes[i + 1];
            if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
                return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], comps: bytes[i + 9] };
            }
            i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
        }
        return null;
    }

    // ----------------------------------------------------------------------------------
    var PAGE_W = 612, PAGE_H = 792, M = 36;
    var CONTENT_W = PAGE_W - 2 * M;
    var BOTTOM = PAGE_H - M - 30;      // content must end above the footer
    var TOP_FIRST = M, TOP_NEXT = M + 30;

    function Doc(opts) {
        this.opts = opts || {};
        this.pages = [];
        this.images = [];          // {name, bytes, w, h, comps}
        this.y = 0;
        this.tableHeader = null;   // function to redraw a table header after a page break
        this.newPage();
    }
    var P = Doc.prototype;

    P.newPage = function () {
        this.page = { ops: [] };
        this.pages.push(this.page);
        this.y = this.pages.length === 1 ? TOP_FIRST : TOP_NEXT;
        if (this.tableHeader) this.tableHeader();
    };
    P.ensure = function (h) { if (this.y + h > BOTTOM) { this.newPage(); return true; } return false; };
    P.room = function () { return BOTTOM - this.y; };

    // low-level drawing (y measured from the top of the page)
    P.op = function (s) { this.page.ops.push(s); };
    P.text = function (x, baseline, enc, font, size, gray) {
        this.op((gray ? n(gray) : '0') + ' g BT /' + FONTS[font || 'R'] + ' ' + n(size) + ' Tf 1 0 0 1 ' + n(x) + ' ' + n(PAGE_H - baseline) + ' Tm ' + pdfStr(enc) + ' Tj ET');
    };
    P.rect = function (x, y, w, h, fill, stroke, lw) {
        var s = 'q ';
        if (fill != null) s += n(fill) + ' g ';
        if (stroke != null) s += n(stroke) + ' G ' + n(lw || 0.5) + ' w ';
        s += n(x) + ' ' + n(PAGE_H - y - h) + ' ' + n(w) + ' ' + n(h) + ' re ' + (fill != null && stroke != null ? 'B' : fill != null ? 'f' : 'S') + ' Q';
        this.op(s);
    };
    P.line = function (x1, y1, x2, y2, lw, gray) {
        this.op('q ' + n(gray || 0) + ' G ' + n(lw || 0.5) + ' w ' + n(x1) + ' ' + n(PAGE_H - y1) + ' m ' + n(x2) + ' ' + n(PAGE_H - y2) + ' l S Q');
    };
    P.addImage = function (bytes) {
        var info = jpegInfo(bytes);
        if (!info) return null;
        var img = { name: 'Im' + (this.images.length + 1), bytes: bytes, w: info.w, h: info.h, comps: info.comps };
        this.images.push(img);
        return img;
    };
    P.drawImage = function (img, x, y, w, h) {
        this.op('q ' + n(w) + ' 0 0 ' + n(h) + ' ' + n(x) + ' ' + n(PAGE_H - y - h) + ' cm /' + img.name + ' Do Q');
    };

    // ---- high-level blocks ----

    // Page-1 title block
    P.titleBlock = function (o) {
        var y = this.y;
        this.text(M, y + 9, encode('BUILDER ASCENT  ·  FIELD FORMS'), 'B', 8, 0.35);
        var status = encode(o.status || '');
        if (status) {
            var sw = width(status, 'B', 8) + 12;
            this.rect(PAGE_W - M - sw, y, sw, 13, null, 0, 0.8);
            this.text(PAGE_W - M - sw + 6, y + 9.5, status, 'B', 8);
        }
        y += 32;
        this.text(M, y, encode(o.title), 'B', 19);
        y += 6;
        this.line(M, y, PAGE_W - M, y, 1.6, 0.25);
        y += 13;
        var self = this;
        (o.meta || []).forEach(function (row) {
            var x = M;
            row.forEach(function (pair) {
                var lab = encode(pair[0] + ': '), val = encode(pair[1] || '');
                self.text(x, y, lab, 'B', 8.5, 0.3);
                var lw = width(lab, 'B', 8.5);
                self.text(x + lw, y, val, 'R', 8.5);
                x += Math.max(lw + width(val, 'R', 8.5) + 18, 170);
            });
            y += 12;
        });
        this.y = y + 4;
    };

    // Section heading with light band. Keeps at least `keep` pt of room for the content that follows.
    P.section = function (title, keep) {
        this.ensure(22 + (keep || 46));
        this.y += 6;
        this.rect(M, this.y, CONTENT_W, 17, 0.88, null);
        this.text(M + 6, this.y + 12, encode(String(title).toUpperCase()), 'B', 9.5);
        this.y += 23;
    };

    P.space = function (h) { this.y += h; };

    // Paragraph (wraps, breaks across pages line by line)
    P.paragraph = function (text, o) {
        o = o || {};
        var size = o.size || 9.5, lead = o.lead || size * 1.32, font = o.font || 'R', indent = o.indent || 0;
        var lines = wrap(encode(text), font, size, CONTENT_W - indent - (o.right || 0));
        for (var i = 0; i < lines.length; i++) {
            this.ensure(lead);
            this.text(M + indent, this.y + size, lines[i], font, size, o.gray);
            this.y += lead;
        }
        this.y += o.after == null ? 3 : o.after;
    };

    // Label + value pairs in N columns (rows never split)
    P.fields = function (pairs, cols) {
        cols = cols || 2;
        var colW = CONTENT_W / cols, pad = 4, self = this;
        // group pairs into rows; a pair may span several columns via p[2]
        var rowsOf = [], cur = [], used = 0;
        pairs.forEach(function (p) {
            var s = Math.min(p[2] || 1, cols);
            if (used + s > cols) { rowsOf.push(cur); cur = []; used = 0; }
            cur.push(p); used += s;
        });
        if (cur.length) rowsOf.push(cur);
        for (var i = 0; i < rowsOf.length; i++) {
            var row = rowsOf[i];
            var cells = row.map(function (p) {
                var span = p[2] || 1;
                return { label: encode(String(p[0]).toUpperCase()), lines: wrap(encode(p[1] == null || p[1] === '' ? '—' : p[1]), 'R', 9.5, colW * span - 2 * pad), span: span };
            });
            var h = 0;
            cells.forEach(function (c) { h = Math.max(h, 10 + c.lines.length * 12.2 + 6); });
            this.ensure(h);
            var x = M;
            cells.forEach(function (c) {
                self.text(x + pad, self.y + 8, c.label, 'B', 6.8, 0.38);
                c.lines.forEach(function (ln, k) { self.text(x + pad, self.y + 19 + k * 12.2, ln, 'R', 9.5); });
                x += colW * c.span;
            });
            this.y += h;
            this.line(M, this.y - 2, PAGE_W - M, this.y - 2, 0.4, 0.75);
        }
        this.y += 4;
    };

    // Bulleted list
    P.bullets = function (items, o) {
        o = o || {};
        var self = this, size = o.size || 9.5, lead = size * 1.32;
        items.forEach(function (it) {
            var lines = wrap(encode(it), 'R', size, CONTENT_W - 14);
            lines.forEach(function (ln, k) {
                self.ensure(lead);
                if (k === 0) self.text(M + 3, self.y + size, encode('•'), 'R', size);
                self.text(M + 13, self.y + size, ln, 'R', size);
                self.y += lead;
            });
        });
        this.y += 3;
    };

    /*
     * Table. columns: [{title, w (fraction of width)}]. rows: array of arrays of cells.
     * Cell = string | { parts: [{t, b}] , image: {img, h}, empty: bool }
     * - Header repeats on each page. Text rows split across pages at line boundaries.
     * - Rows with an image are kept whole.
     */
    P.table = function (columns, rows, o) {
        o = o || {};
        var self = this, size = o.size || 8.8, lead = size * 1.3, pad = 4;
        var widths = columns.map(function (c) { return c.w * CONTENT_W; });
        var heads = columns.map(function (c, i) { return wrap(encode(String(c.title).toUpperCase()), 'B', 7.2, widths[i] - 2 * pad); });
        var headLines = Math.max.apply(null, heads.map(function (h) { return h.length; }));
        var headH = 7 + headLines * 8.6;
        function drawHeader() {
            var x = M;
            self.rect(M, self.y, CONTENT_W, headH, 0.88, 0.55, 0.5);
            columns.forEach(function (c, i) {
                heads[i].forEach(function (ln, k) { self.text(x + pad, self.y + 10.5 + k * 8.6, ln, 'B', 7.2); });
                if (i) self.line(x, self.y, x, self.y + headH, 0.5, 0.55);
                x += widths[i];
            });
            self.y += headH;
        }
        function cellLines(cell, w) {
            var out = [];
            if (cell == null) cell = '';
            if (typeof cell === 'string' || typeof cell === 'number') cell = { parts: [{ t: String(cell) }] };
            (cell.parts || []).forEach(function (p) {
                var f = p.b ? 'B' : (p.i ? 'I' : 'R');
                wrap(encode(p.t), f, size, w - 2 * pad).forEach(function (ln) { out.push({ s: ln, f: f, g: p.g }); });
            });
            return { lines: out, image: cell.image || null };
        }
        this.ensure(headH + lead * 2 + 2 * pad);
        drawHeader();
        this.tableHeader = drawHeader;
        rows.forEach(function (row) {
            var cells = row.map(function (c, i) { return cellLines(c, widths[i]); });
            var maxLines = 0;
            cells.forEach(function (c) { maxLines = Math.max(maxLines, c.lines.length); });
            var hasImage = cells.some(function (c) { return c.image; });
            if (hasImage) {
                // image rows are kept whole; text in other cells starts at the top
                var rowH = lead;
                cells.forEach(function (c) { rowH = Math.max(rowH, (c.image ? c.image.h + 3 : 0) + c.lines.length * lead); });
                rowH += 2 * pad;
                if (rowH > self.room()) self.newPage();
                var ix = M, itop = self.y;
                self.rect(M, itop, CONTENT_W, rowH, null, 0.55, 0.5);
                cells.forEach(function (c, i) {
                    if (i) self.line(ix, itop, ix, itop + rowH, 0.5, 0.55);
                    var cy = itop + pad;
                    if (c.image) {
                        var im = c.image, dw = Math.min(widths[i] - 2 * pad, im.h * im.img.w / im.img.h);
                        self.drawImage(im.img, ix + pad, cy, dw, dw * im.img.h / im.img.w);
                        cy += im.h + 3;
                    }
                    c.lines.forEach(function (ln, k) { self.text(ix + pad, cy + size - 1 + k * lead, ln.s, ln.f, size, ln.g); });
                    ix += widths[i];
                });
                self.y += rowH;
                return;
            }
            var fullH = 2 * pad + Math.max(maxLines, 1) * lead;
            var start = 0;
            // keep small rows together
            if (fullH > self.room() && fullH < 120) self.newPage();
            while (true) {
                var avail = self.room() - 2 * pad;
                var take = Math.max(1, Math.floor(avail / lead));
                if (avail < lead * 2 && start + 2 <= maxLines) { self.newPage(); continue; }
                var end = Math.min(maxLines, start + take);
                var h = 2 * pad + Math.max(end - start, 1) * lead;
                var x = M, top = self.y;
                self.rect(M, top, CONTENT_W, h, null, 0.55, 0.5);
                cells.forEach(function (c, i) {
                    if (i) self.line(x, top, x, top + h, 0.5, 0.55);
                    var cy = top + pad;
                    for (var k = start; k < Math.min(end, c.lines.length); k++) {
                        var ln = c.lines[k];
                        self.text(x + pad, cy + size - 1 + (k - start) * lead, ln.s, ln.f, size, ln.g);
                    }
                    x += widths[i];
                });
                self.y += h;
                if (end >= maxLines) break;
                start = end;
                self.newPage();
            }
        });
        this.tableHeader = null;
        this.y += 6;
    };

    // ---- output ----
    P.output = function () {
        var o = this.opts, total = this.pages.length, self = this;
        // running header, footer, watermark
        this.pages.forEach(function (pg, idx) {
            var pre = [];
            if (o.watermark) {
                var wm = encode(o.watermark), size = 96, w = width(wm, 'B', size), h = size * 0.72, c = Math.SQRT1_2;
                var ox = 306 - c * w / 2 + c * h / 2, oy = 396 - c * w / 2 - c * h / 2;
                pre.push('q 0.9 g BT /F2 ' + size + ' Tf ' + n(c) + ' ' + n(c) + ' ' + n(-c) + ' ' + n(c) + ' ' + n(ox) + ' ' + n(oy) + ' Tm ' + pdfStr(wm) + ' Tj ET Q');
            }
            self.page = pg;
            if (idx > 0 && o.runningHeader) {
                var rh = wrap(encode(o.runningHeader), 'B', 8, CONTENT_W - 70)[0];
                self.text(M, M + 10, rh, 'B', 8, 0.25);
                var pn = encode('Page ' + (idx + 1) + ' of ' + total);
                self.text(PAGE_W - M - width(pn, 'R', 8), M + 10, pn, 'R', 8, 0.25);
                self.line(M, M + 16, PAGE_W - M, M + 16, 0.6, 0.5);
            }
            var fy = PAGE_H - M - 20;
            self.line(M, fy, PAGE_W - M, fy, 0.5, 0.6);
            var f1 = encode('Page ' + (idx + 1) + ' of ' + total + '  ·  ' + (o.footer1 || ''));
            var f2 = encode(o.footer2 || '');
            wrap(f1, 'R', 7, CONTENT_W).slice(0, 1).forEach(function (s) { self.text(M, fy + 9, s, 'R', 7, 0.2); });
            wrap(f2, 'R', 6.6, CONTENT_W).slice(0, 2).forEach(function (s, k) { self.text(M, fy + 18 + k * 8, s, 'R', 6.6, 0.3); });
            pg.ops = pre.concat(pg.ops);
        });

        // ---- serialize ----
        var chunks = [], offsets = [], pos = 0;
        function bytesOf(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF; return b; }
        function push(x) { var b = typeof x === 'string' ? bytesOf(x) : x; chunks.push(b); pos += b.length; }
        var objCount = 0;
        function begin(num) { offsets[num] = pos; push(num + ' 0 obj\n'); }
        // object numbers
        var nImg = this.images.length, nPg = total;
        var CATALOG = 1, PAGES = 2, F1 = 3, F2 = 4, F3 = 5, IMG0 = 6, PG0 = IMG0 + nImg, INFO = PG0 + 2 * nPg;
        objCount = INFO;

        push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
        begin(CATALOG); push('<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n');
        var kids = [];
        for (var p = 0; p < nPg; p++) kids.push((PG0 + 2 * p) + ' 0 R');
        begin(PAGES); push('<< /Type /Pages /Count ' + nPg + ' /Kids [' + kids.join(' ') + '] >>\nendobj\n');
        [['Helvetica', F1], ['Helvetica-Bold', F2], ['Helvetica-Oblique', F3]].forEach(function (f) {
            begin(f[1]); push('<< /Type /Font /Subtype /Type1 /BaseFont /' + f[0] + ' /Encoding /WinAnsiEncoding >>\nendobj\n');
        });
        var xobj = '';
        this.images.forEach(function (img, i) {
            begin(IMG0 + i);
            push('<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h + ' /ColorSpace /' + (img.comps === 1 ? 'DeviceGray' : 'DeviceRGB') +
                ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length + ' >>\nstream\n');
            push(img.bytes);
            push('\nendstream\nendobj\n');
            xobj += '/' + img.name + ' ' + (IMG0 + i) + ' 0 R ';
        });
        this.pages.forEach(function (pg, i) {
            var content = pg.ops.join('\n');
            begin(PG0 + 2 * i);
            push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>' +
                (xobj ? ' /XObject << ' + xobj + '>>' : '') + ' >> /Contents ' + (PG0 + 2 * i + 1) + ' 0 R >>\nendobj\n');
            begin(PG0 + 2 * i + 1);
            push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
        });
        var d = new Date();
        function p2(v) { return (v < 10 ? '0' : '') + v; }
        var pdfDate = 'D:' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
        begin(INFO);
        push('<< /Title ' + pdfStr(encode(o.title || 'Builder Ascent Field Form')) + ' /Subject ' + pdfStr(encode(o.subject || '')) +
            ' /Author ' + pdfStr(encode(o.author || '')) + ' /Creator (Builder Ascent Field Forms) /Producer (Builder Ascent Field Forms PDF writer v1) /CreationDate (' + pdfDate + ') >>\nendobj\n');
        var xref = pos;
        var x = 'xref\n0 ' + (objCount + 1) + '\n0000000000 65535 f \n';
        for (var k = 1; k <= objCount; k++) x += ('0000000000' + offsets[k]).slice(-10) + ' 00000 n \n';
        var idHex = '';
        for (var j = 0; j < 16; j++) idHex += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
        x += 'trailer\n<< /Size ' + (objCount + 1) + ' /Root 1 0 R /Info ' + INFO + ' 0 R /ID [<' + idHex + '> <' + idHex + '>] >>\nstartxref\n' + xref + '\n%%EOF\n';
        push(x);
        var out = new Uint8Array(pos), off = 0;
        chunks.forEach(function (c) { out.set(c, off); off += c.length; });
        return out;
    };

    root.BAFF = root.BAFF || {};
    root.BAFF.pdf = {
        create: function (opts) { return new Doc(opts); },
        encode: encode, width: width, wrap: wrap, jpegInfo: jpegInfo,
        CONTENT_W: CONTENT_W
    };
})(typeof window !== 'undefined' ? window : this);

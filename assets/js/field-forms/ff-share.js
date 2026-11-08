/*
 * Builder Ascent Field Forms - output actions (v1)
 * Download, native share (files), email draft, print. All on the device; nothing is uploaded.
 * A web page cannot attach a file to an email through mailto: - the UI says so.
 * Exposed as window.BAFF.share
 */
(function (root) {
    'use strict';

    function blobOf(bytes) { return new Blob([bytes], { type: 'application/pdf' }); }

    function download(bytes, filename) {
        var url = URL.createObjectURL(blobOf(bytes));
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        return true;
    }

    function fileOf(bytes, filename) {
        try { return new File([bytes], filename, { type: 'application/pdf' }); } catch (e) { return null; }
    }

    function canShareFiles() {
        if (!root.navigator || !navigator.share || !navigator.canShare) return false;
        var f = fileOf(new Uint8Array([37, 80, 68, 70]), 'test.pdf');
        try { return !!(f && navigator.canShare({ files: [f] })); } catch (e) { return false; }
    }

    // Resolves 'shared' | 'cancelled'; rejects on real errors
    function shareFile(bytes, filename, title, text) {
        var f = fileOf(bytes, filename);
        return navigator.share({ files: [f], title: title, text: text }).then(function () { return 'shared'; }, function (err) {
            if (err && err.name === 'AbortError') return 'cancelled';
            throw err;
        });
    }

    function mailtoHref(subject, body) {
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }

    function print() { root.print(); }

    root.BAFF = root.BAFF || {};
    root.BAFF.share = { download: download, canShareFiles: canShareFiles, shareFile: shareFile, mailtoHref: mailtoHref, print: print };
})(typeof window !== 'undefined' ? window : this);

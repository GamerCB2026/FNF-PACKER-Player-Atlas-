/* ==========================================================
   FNF Packer — utilidades generales (DOM, archivos, imágenes)
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const U = {};

    U.$ = (sel, root = document) => root.querySelector(sel);
    U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    U.esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    U.naturalSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

    U.clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    U.round = (v, d = 3) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };

    let _uid = 0;
    U.uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(_uid++).toString(36)}`;

    U.baseName = (path) => String(path).split(/[\\/]/).pop();
    U.dirName = (path) => { const p = String(path).split(/[\\/]/); p.pop(); return p.join('/'); };
    U.stripExt = (name) => String(name).replace(/\.[^.]+$/, '');

    U.sanitizeName = (s, fallback = 'item') => {
        const t = String(s ?? '').trim().replace(/[\\/:*?"<>|]+/g, '_');
        return t || fallback;
    };

    U.readAsDataURL = (blob) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(blob);
    });

    U.readText = async (blob) => {
        const txt = await blob.text();
        return txt.replace(/^\uFEFF/, '');
    };

    U.parseJSON = (txt, label = 'JSON') => {
        try { return JSON.parse(String(txt).replace(/^\uFEFF/, '')); }
        catch (e) { throw new Error(`No se pudo leer ${label}: ${e.message}`); }
    };

    U.loadImage = (src) => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('No se pudo cargar la imagen'));
        im.src = src;
    });

    U.blobToImage = async (blob) => U.loadImage(await U.readAsDataURL(blob));

    U.canvasToImage = (canvas) => U.loadImage(canvas.toDataURL('image/png'));

    U.canvasToBlob = (canvas) => new Promise(r => canvas.toBlob(r, 'image/png'));

    U.makeCanvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    };

    U.downloadBlob = (blob, filename) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    };

    /* Dibuja un fondo de cuadrícula tipo "transparencia" */
    U.drawChecker = (ctx, w, h, size = 10, c1 = '#0d1830', c2 = '#111f3b') => {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = c2;
        for (let y = 0; y < h; y += size) {
            for (let x = ((y / size) % 2) * size; x < w; x += size * 2) ctx.fillRect(x, y, size, size);
        }
        ctx.restore();
    };

    /* Ajusta un canvas al tamaño de su contenedor respetando devicePixelRatio */
    U.fitCanvas = (canvas) => {
        // Usa el área interior del contenedor (sin bordes). Con getBoundingClientRect
        // el canvas medía 2px más que su caja y la hacía crecer en cada frame.
        const box = canvas.parentElement;
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const w = Math.max(50, Math.floor(box.clientWidth));
        const h = Math.max(50, Math.floor(box.clientHeight));
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
        }
        return { w, h, dpr };
    };

    /* Avisos (toasts) */
    U.toast = (msg, type = 'info', ms = 3200) => {
        let host = document.getElementById('toastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toastHost';
            document.body.appendChild(host);
        }
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        host.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
    };

    /* Zona de arrastrar y soltar archivos */
    U.makeDropZone = (zone, onFiles) => {
        ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
            e.preventDefault(); zone.classList.add('is-over');
        }));
        ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
            e.preventDefault(); zone.classList.remove('is-over');
        }));
        zone.addEventListener('drop', e => {
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length) onFiles(files);
        });
    };

    /* Pide un texto con prompt nativo y lo limpia */
    U.ask = (label, def = '') => {
        const v = window.prompt(label, def);
        if (v === null) return null;
        const t = v.trim();
        return t || null;
    };

    F.U = U;
})(window.FNF);

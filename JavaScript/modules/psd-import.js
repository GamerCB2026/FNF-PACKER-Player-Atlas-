/* ==========================================================
   FNF Packer — lector de .psd (Photoshop / ibisPaint / Krita…)
   Usa ag-psd (MIT) guardado en JavaScript/lib/ag-psd.js; se
   carga solo cuando abres un PSD, sin CDN.
   Devuelve la misma estructura que IpvImport:
     { name, width, height, nodes:[{ name, visible, opacity,
       canvas, x, y } | { name, visible, opacity, children }] }
   (los hijos van de abajo hacia arriba).
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const Psd = {};
    const LIB = 'JavaScript/lib/ag-psd.js?v=34.2.0';
    let loading = null;

    Psd.ensureLib = () => {
        if (window.agPsd) return Promise.resolve(window.agPsd);
        if (!loading) loading = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = LIB;
            s.onload = () => window.agPsd ? res(window.agPsd) : rej(new Error('No se pudo iniciar el lector de PSD.'));
            s.onerror = () => { loading = null; rej(new Error('No se pudo cargar JavaScript/lib/ag-psd.js.')); };
            document.head.appendChild(s);
        });
        return loading;
    };

    Psd.isPsd = (buf) => {
        const b = new Uint8Array(buf, 0, 4);
        return b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53; // "8BPS"
    };

    function convert(list) {
        const out = [];
        (list || []).forEach(l => {
            const base = { name: l.name || 'Capa', visible: !l.hidden, opacity: l.opacity === undefined ? 1 : Math.min(1, Math.max(0, +l.opacity)) };
            if (l.children) { out.push(Object.assign(base, { children: convert(l.children) })); return; }
            if (!l.canvas || !l.canvas.width || !l.canvas.height) return;
            const t = F.IpvImport ? F.IpvImport.trim(l.canvas, l.left || 0, l.top || 0) : { canvas: l.canvas, x: l.left || 0, y: l.top || 0 };
            if (t) out.push(Object.assign(base, t));
        });
        return out;
    }

    /** buf: ArrayBuffer del .psd -> Promise<{ name, width, height, nodes }> */
    Psd.parse = async (buf, fileName = 'psd') => {
        if (!Psd.isPsd(buf)) throw new Error('Este archivo no es un PSD válido.');
        const ag = await Psd.ensureLib();
        const psd = ag.readPsd(buf, { skipThumbnail: true, skipCompositeImageData: true, skipLinkedFilesData: true });
        const prune = (list) => list.filter(n => n.children ? (n.children = prune(n.children)).length : !!n.canvas);
        return {
            name: String(fileName).replace(/\.[^.]+$/, ''),
            width: psd.width, height: psd.height,
            nodes: prune(convert(psd.children)),
            source: 'psd'
        };
    };

    F.PsdImport = Psd;
})(window.FNF);

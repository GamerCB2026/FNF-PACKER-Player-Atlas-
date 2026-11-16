/* ==========================================================
   FNF Packer — lector de proyectos .ipv (ibisPaint X)
   Formato descubierto a mano (no hay documentación oficial):
   - El archivo es una lista de bloques big-endian:
       [u32 tag][u32 largo][datos…][i32 -(largo+8)]
   - 0x01000100  info del lienzo (ancho/alto en bytes 8 y 12)
   - 0x01000500  imagen de una capa (id en byte 8) con "RPNG":
       tipo 0 = lienzo completo en un PNG normal
       tipo 4 = recorte: caja (bx,by,bw,bh) + tramos
                (saltar/pintar, u16) en orden OpenGL (de abajo
                hacia arriba) y un PNG con solo los píxeles
                pintados, empaquetados fila tras fila.
   - 0x01000600  documento final: tabla de capas y carpetas
       (0x03000402 capa / 0x03000403 carpeta, 47 bytes):
       id, visible, opacidad, carpeta padre.
   En ibisPaint cada carpeta de la animación es un frame.
   Devuelve la misma estructura que PsdImport:
     { name, width, height, nodes:[{ name, visible, opacity,
       canvas, x, y } | { name, visible, opacity, children }] }
   (los hijos van de abajo hacia arriba).
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const Ipv = {};
    const T_CANVAS = 0x01000100, T_LAYERIMG = 0x01000500, T_DOC = 0x01000600;
    const R_LAYER = 0x03000402, R_FOLDER = 0x03000403;

    Ipv.isIpv = (buf) => {
        const b = new Uint8Array(buf, 0, Math.min(400, buf.byteLength));
        if (b.length < 12 || b[0] !== 1 || b[1] !== 0) return false;
        return new TextDecoder('latin1').decode(b).includes('ibisPaint');
    };

    function findBytes(u8, pat, from, to) {
        const end = Math.min(to ?? u8.length, u8.length) - pat.length;
        outer: for (let i = from || 0; i <= end; i++) {
            for (let j = 0; j < pat.length; j++) if (u8[i + j] !== pat[j]) continue outer;
            return i;
        }
        return -1;
    }
    const RPNG = [0x52, 0x50, 0x4e, 0x47], PNGSIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    /* Parte puramente binaria (sin canvas): bloques, capas y tabla */
    Ipv.parseStructure = (buf) => {
        const dv = new DataView(buf), u8 = new Uint8Array(buf);
        const out = { width: 0, height: 0, images: new Map(), composite: null, records: [], title: '' };
        let off = 0;
        while (off + 12 <= buf.byteLength) {
            const tag = dv.getUint32(off), len = dv.getUint32(off + 4);
            const b0 = off + 8, b1 = b0 + len;
            if (b1 + 4 > buf.byteLength) break;
            if (tag === T_CANVAS && len >= 16 && !out.width) {
                out.width = dv.getUint32(b0 + 8); out.height = dv.getUint32(b0 + 12);
            } else if (tag === T_LAYERIMG && len > 40) {
                const id = dv.getInt32(b0 + 8);
                const r = findBytes(u8, RPNG, b0 + 12, Math.min(b1, b0 + 96));
                if (r >= 0) {
                    const img = readRpng(dv, u8, r, b1);
                    if (img) { img.id = id; out.images.set(id, img); }
                } else if (id === -1) {
                    const p = findBytes(u8, PNGSIG, b0 + 12, Math.min(b1, b0 + 96));
                    if (p >= 0) out.composite = u8.subarray(p, b1);
                }
            } else if (tag === T_DOC) {
                out.records = readRecords(dv, b0, b1);
                const t = readTitle(u8, b0, b1); if (t) out.title = t;
            }
            off = b1 + 4;
        }
        if (!out.width) { out.width = 1000; out.height = 1000; }
        return out;
    };

    function readRpng(dv, u8, r, end) {
        const h = r + 8;
        const type = dv.getUint8(h + 4);
        const W = dv.getUint32(h + 5), H = dv.getUint32(h + 9);
        const bw = dv.getUint32(h + 13), bh = dv.getUint32(h + 17), bx = dv.getUint32(h + 21), by = dv.getUint32(h + 25);
        const hdrLen = dv.getUint32(r + 4);
        let p = h + hdrLen;
        const spanLen = dv.getUint32(p); p += 4;
        const spans = [];
        for (let i = 0; i + 1 < spanLen; i += 2) spans.push(dv.getUint16(p + i));
        p += spanLen;
        const pngLen = dv.getUint32(p); p += 4;
        let png = u8.subarray(p, Math.min(end, p + pngLen));
        if (png[0] !== 0x89) { const q = findBytes(u8, PNGSIG, h, end); if (q < 0) return null; png = u8.subarray(q, end); }
        return { type, W, H, bw, bh, bx, by, spans, png };
    }

    function readRecords(dv, b0, b1) {
        const recs = [];
        for (let i = b0; i + 59 <= b1; i++) {
            const tag = dv.getUint32(i);
            if ((tag !== R_LAYER && tag !== R_FOLDER) || dv.getUint32(i + 4) !== 47 || dv.getInt32(i + 55) !== -55) continue;
            const d = i + 8;
            recs.push({
                folder: tag === R_FOLDER,
                id: dv.getInt32(d),
                visible: dv.getUint8(d + 4) !== 0,
                opacity: clamp01(dv.getFloat32(d + 5)),
                parent: dv.getInt32(d + 31)
            });
            i += 58;
        }
        return recs.filter(r => r.id !== -1);
    }
    const clamp01 = (v) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;

    function readTitle(u8, b0, b1) {
        // [u16 largo][utf8] — el segundo texto del bloque suele ser el título
        try {
            const dv = new DataView(u8.buffer, u8.byteOffset);
            let p = b0 + 4, found = [];
            for (let k = 0; k < 3 && p + 2 < b1; k++) {
                const n = dv.getUint16(p); p += 2;
                if (n > 200 || p + n > b1) break;
                found.push(new TextDecoder('utf-8').decode(u8.subarray(p, p + n))); p += n;
            }
            return found[1] || '';
        } catch (e) { return ''; }
    }

    /* Recoloca los píxeles empaquetados de una capa tipo 4.
       src: RGBA del PNG (pw x ph). Devuelve RGBA bw x bh (de arriba hacia abajo). */
    Ipv.unpackRegion = (src, pw, ph, spans, bw, bh) => {
        const out = new Uint8ClampedArray(bw * bh * 4);
        const total = bw * bh, avail = pw * ph;
        let pos = 0, k = 0;
        for (let i = 0; i < spans.length; i++) {
            const v = spans[i];
            if (i & 1) {
                for (let j = 0; j < v; j++, k++) {
                    const q = pos + j;
                    if (q >= total || k >= avail) continue;
                    const sr = ph - 1 - ((k / pw) | 0), sc = k % pw;
                    const s = (sr * pw + sc) * 4;
                    const gr = (q / bw) | 0, oc = q % bw;
                    const o = ((bh - 1 - gr) * bw + oc) * 4;
                    out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
                }
            }
            pos += v;
        }
        return out;
    };

    /* ---------- Parte de navegador (PNG -> canvas) ---------- */
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    async function decodePng(bytes) {
        const blob = new Blob([bytes], { type: 'image/png' });
        let src;
        if (window.createImageBitmap) src = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(() => createImageBitmap(blob));
        else src = await F.U.blobToImage(blob);
        const c = mk(src.width, src.height);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(src, 0, 0);
        if (src.close) src.close();
        return c;
    }

    /* Recorta lo transparente; devuelve { canvas, x, y } o null si está vacía */
    Ipv.trim = (canvas, ox = 0, oy = 0) => {
        const w = canvas.width, h = canvas.height;
        const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) return null;
        if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return { canvas, x: ox, y: oy };
        const c = mk(x1 - x0 + 1, y1 - y0 + 1);
        c.getContext('2d').drawImage(canvas, -x0, -y0);
        return { canvas: c, x: ox + x0, y: oy + y0 };
    };

    async function layerCanvas(img) {
        const pngC = await decodePng(img.png);
        if (img.type === 0 || !img.spans.length) return Ipv.trim(pngC, 0, 0);
        const src = pngC.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, pngC.width, pngC.height).data;
        const px = Ipv.unpackRegion(src, pngC.width, pngC.height, img.spans, img.bw, img.bh);
        const c = mk(img.bw, img.bh);
        c.getContext('2d').putImageData(new ImageData(px, img.bw, img.bh), 0, 0);
        return Ipv.trim(c, img.bx, img.H - img.by - img.bh);
    }

    /** buf: ArrayBuffer del .ipv -> Promise<{ name, width, height, nodes, preview }> */
    Ipv.parse = async (buf, fileName = 'ibispaint') => {
        if (!Ipv.isIpv(buf)) throw new Error('Este archivo no parece un proyecto de ibisPaint (.ipv).');
        const s = Ipv.parseStructure(buf);
        if (!s.images.size) throw new Error('No se encontraron capas dentro del .ipv.');
        const leaves = new Map();
        for (const [id, img] of s.images) {
            try { leaves.set(id, await layerCanvas(img)); } catch (e) { console.warn('Capa .ipv no leída', id, e); }
        }
        const nodes = [];
        if (s.records.length) {
            const byId = new Map();
            let fi = 0, li = 0;
            s.records.forEach(r => {
                const n = r.folder
                    ? { id: r.id, name: '', visible: r.visible, opacity: r.opacity, children: [] }
                    : { id: r.id, name: `Capa ${++li}`, visible: r.visible, opacity: r.opacity };
                const t = leaves.get(r.id);
                if (!r.folder && t) Object.assign(n, t);
                byId.set(r.id, { n, r });
            });
            // los hijos aparecen antes que su carpeta, de abajo hacia arriba
            s.records.forEach(r => {
                const me = byId.get(r.id).n, par = byId.get(r.parent);
                if (par && par.r.folder && par.n !== me) par.n.children.push(me); else nodes.push(me);
            });
            // primer nivel = frames de animación; subcarpetas internas = grupos/sub-capas
            let gi = 0;
            const rename = (list, depth) => {
                let k = 0;
                list.forEach(n => {
                    if (n.children) {
                        n.name = depth === 0 ? `Frame ${++fi}` : `Grupo ${++gi}`;
                        rename(n.children, depth + 1);
                    } else n.name = `Capa ${++k}`;
                });
            };
            rename(nodes, 0);
        } else {
            [...leaves.keys()].sort((a, b) => a - b).forEach((id, i) => { const t = leaves.get(id); if (t) nodes.push(Object.assign({ id, name: `Capa ${i + 1}`, visible: true, opacity: 1 }, t)); });
        }
        const prune = (list) => list.filter(n => n.children ? (n.children = prune(n.children)).length : !!n.canvas);
        return {
            name: (s.title && !/sin t[ií]tulo|untitled/i.test(s.title) ? s.title : String(fileName).replace(/\.[^.]+$/, '')),
            width: s.width, height: s.height,
            nodes: prune(nodes),
            source: 'ipv'
        };
    };

    F.IpvImport = Ipv;
})(window.FNF);

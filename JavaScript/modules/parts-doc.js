/* ==========================================================
   FNF Packer — documento de "Crear Spritemaps en Partes"
   El documento ES el Animation.json (claves cortas, mismo
   orden que Better Texture Atlas): capas -> keyframes ->
   elementos (SI = instancia de símbolo / ASI = sprite directo).
   Aquí están todas las operaciones de edición, la evaluación
   (incluida la interpolación) y la exportación.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, M, IO, BTA, Packer, Atlas, AtlasRenderer } = F;
    const Doc = {};

    const clone = (o) => JSON.parse(JSON.stringify(o));
    const r2 = (v) => { const n = Math.round(v * 100) / 100; return Object.is(n, -0) ? 0 : n; };
    const r3 = (v) => { const n = Math.round(v * 1000) / 1000; return Object.is(n, -0) ? 0 : n; };

    Doc.EASES = {
        linear: t => t,
        easeIn: t => t * t,
        easeOut: t => 1 - (1 - t) * (1 - t),
        easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    };

    /* ---------------- Creación / importación ---------------- */
    Doc.create = (name = 'personaje') => {
        const doc = {
            anim: {
                AN: { N: name, SN: name, TL: { L: [{ LN: 'Layer_1', FR: [{ N: 'Idle', I: 0, DU: 24, E: [] }] }] } },
                SD: { S: [] },
                MD: { V: 'BTA 1.3.0', FLV: 'FNF Packer', N: name, BGC: '#FFFFFF', W: 1280, H: 720, ASV: 3, FRT: 24 }
            },
            sprites: new Map(),
            source: null,
            atlasDirty: true,
            folder: name
        };
        Doc.attach(doc);
        return doc;
    };

    Doc.fromAtlas = (atlas) => {
        if (!atlas.anim) throw new Error('Este spritemap no tiene Animation.json.');
        const anim = clone(atlas.anim);
        if (anim.SD && !anim.SD.S) anim.SD.S = [];
        if (!anim.SD) anim.SD = { S: [] };
        if (atlas.animRaw && !atlas.animRaw.MD && !atlas.animRaw.metadata && anim.MD && !Object.keys(anim.MD).length) delete anim.MD;
        const sprites = new Map();
        atlas.sprites.forEach((sp, name) => {
            const c = IO.spriteCanvas(sp);
            sprites.set(name, { name, w: c.width, h: c.height, _canvas: c });
        });
        const doc = {
            anim, sprites,
            source: atlas.sheets.length === 1 ? { sheet: atlas.sheets[0] } : null,
            atlasDirty: atlas.sheets.length !== 1,
            folder: anim.AN.N || atlas.name
        };
        Doc.attach(doc);
        if (Doc.labelLayerIndex(doc) < 0) {
            doc.anim.AN.TL.L.unshift({ LN: 'Layer_1', FR: [{ N: 'anim', I: 0, DU: Doc.length(doc), E: [] }] });
        }
        if (atlas.sidecar && atlas.sidecar.tweens) Doc.unbake(doc, atlas.sidecar.tweens);
        return doc;
    };

    /* Prepara el reproductor interno */
    Doc.attach = (doc) => {
        doc.renderer = new AtlasRenderer({ anim: doc.anim, sprites: doc.sprites });
        return doc;
    };
    Doc.refresh = (doc) => doc.renderer.rebuild();

    /* ---------------- Consultas ---------------- */
    Doc.layers = (doc) => doc.anim.AN.TL.L;
    Doc.labelLayerIndex = (doc) => Doc.layers(doc).findIndex(l => (l.FR || []).some(f => f.N));
    Doc.length = (doc) => Math.max(1, AtlasRenderer.timelineLength(doc.anim.AN.TL));
    Doc.labels = (doc) => {
        const li = Doc.labelLayerIndex(doc);
        if (li < 0) return [{ name: 'Todo', start: 0, length: Doc.length(doc) }];
        return Doc.layers(doc)[li].FR.filter(f => f.N).map(f => ({ name: f.N, start: f.I, length: f.DU, frame: f }));
    };
    Doc.symbol = (doc, name) => doc.anim.SD.S.find(s => s.SN === name) || null;

    Doc.frameIndexAt = (layer, f) => (layer.FR || []).findIndex(fr => f >= fr.I && f < fr.I + fr.DU);
    Doc.frameAt = (layer, f) => { const i = Doc.frameIndexAt(layer, f); return i >= 0 ? layer.FR[i] : null; };

    Doc.elData = (el) => el.SI || el.ASI;
    Doc.elKind = (el) => el.SI ? 'SI' : 'ASI';
    Doc.elName = (el) => el.SI ? el.SI.SN : `sprite ${el.ASI.N}`;
    Doc.getM = (el) => M.fromElement(Doc.elData(el));
    Doc.setM = (el, m) => {
        const d = Doc.elData(el);
        if (d.M3D) d.M3D = M.toM3D(m);
        else d.MX = [r3(m[0]), r3(m[1]), r3(m[2]), r3(m[3]), r2(m[4]), r2(m[5])];
    };

    /* Punto de transformación (pivote) en coordenadas locales del elemento */
    Doc.pivotLocal = (doc, el) => {
        if (el.SI) return el.SI.TRP ? { x: +el.SI.TRP.x, y: +el.SI.TRP.y } : Doc.symbolCenter(doc, el.SI.SN);
        const sp = doc.sprites.get(String(el.ASI.N));
        return sp ? { x: sp.w / 2, y: sp.h / 2 } : { x: 0, y: 0 };
    };

    /* Centro del contenido de un símbolo (frame 0) */
    Doc.symbolCenter = (doc, sn) => {
        const tl = doc.renderer.symbols.get(sn);
        if (!tl) return { x: 0, y: 0 };
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        doc.renderer._walkTL(tl, 0, M.identity(), 1, (sp, m) => {
            const c = IO.spriteCanvas(sp);
            [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].forEach(([x, y]) => {
                const p = M.apply(m, x, y); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
            });
        }, 0);
        if (x0 === Infinity) return { x: 0, y: 0 };
        return { x: r2((x0 + x1) / 2), y: r2((y0 + y1) / 2) };
    };

    /* Descomposición estilo Animate: escala, rotación (skewY) y sesgo */
    Doc.decompose = (m) => {
        const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
        const skY = Math.atan2(m[1], m[0]) * 180 / Math.PI;
        const skX = Math.atan2(-m[2], m[3]) * 180 / Math.PI;
        let skew = skX - skY;
        while (skew > 180) skew -= 360; while (skew < -180) skew += 360;
        return { sx, sy, r: skY, skew };
    };
    Doc.composeLinear = (d) => {
        const ry = d.r * Math.PI / 180, rx = (d.r + d.skew) * Math.PI / 180;
        return [d.sx * Math.cos(ry), d.sx * Math.sin(ry), -d.sy * Math.sin(rx), d.sy * Math.cos(rx)];
    };

    /* Propiedades editables de un elemento (pivote en coordenadas del mundo) */
    Doc.props = (doc, el) => {
        const m = Doc.getM(el), p = Doc.pivotLocal(doc, el);
        const w = M.apply(m, p.x, p.y);
        const d = Doc.decompose(m);
        const a = el.SI && el.SI.C && el.SI.C.AM !== undefined ? +el.SI.C.AM : 1;
        return { x: w[0], y: w[1], r: d.r, sx: d.sx, sy: d.sy, skew: d.skew, px: p.x, py: p.y, a };
    };

    /* Aplica propiedades conservando el pivote en (x, y) */
    Doc.applyProps = (doc, el, pr) => {
        const p = Doc.pivotLocal(doc, el);
        const L = Doc.composeLinear(pr);
        const tx = pr.x - (L[0] * p.x + L[2] * p.y), ty = pr.y - (L[1] * p.x + L[3] * p.y);
        Doc.setM(el, [L[0], L[1], L[2], L[3], tx, ty]);
        if (el.SI && pr.a !== undefined) {
            if (pr.a >= 0.9995) { if (el.SI.C && el.SI.C.M === 'CA') delete el.SI.C; }
            else el.SI.C = { M: 'CA', AM: r3(U.clamp(pr.a, 0, 1)) };
        }
    };

    /* Cambia el punto de transformación sin mover visualmente el elemento */
    Doc.setPivot = (el, x, y) => { if (el.SI) el.SI.TRP = { x: r2(x), y: r2(y) }; };

    /* ---------------- Interpolación ---------------- */
    function compatible(a, b) {
        if (!a || !b || a.length !== b.length || !a.length) return false;
        return a.every((e, i) => Doc.elKind(e) === Doc.elKind(b[i]) && (e.SI ? e.SI.SN === b[i].SI.SN : String(e.ASI.N) === String(b[i].ASI.N)));
    }

    Doc.tweenTarget = (layer, fi) => {
        const fr = layer.FR[fi], nx = layer.FR[fi + 1];
        if (!fr || !fr._tw || !nx || nx.I !== fr.I + fr.DU) return null;
        return compatible(fr.E, nx.E) ? nx : null;
    };

    function lerpAngle(a, b, t) { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return a + d * t; }

    function lerpElement(doc, ea, eb, t) {
        const out = clone(ea);
        const A = Doc.props(doc, ea), B = Doc.props(doc, eb);
        if (out.SI && ea.SI.TRP && eb.SI.TRP) out.SI.TRP = { x: A.px + (B.px - A.px) * t, y: A.py + (B.py - A.py) * t };
        const pr = {
            x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t,
            sx: A.sx + (B.sx - A.sx) * t, sy: A.sy + (B.sy - A.sy) * t,
            r: lerpAngle(A.r, B.r, t), skew: lerpAngle(A.skew, B.skew, t),
            a: A.a + (B.a - A.a) * t
        };
        Doc.applyProps(doc, out, pr);
        if (out.SI && out.SI.TRP) out.SI.TRP = { x: r2(out.SI.TRP.x), y: r2(out.SI.TRP.y) };
        return out;
    }

    /* Elementos visibles de una capa en el frame f (interpolados si hay tween) */
    Doc.evalLayer = (doc, li, f) => {
        const layer = Doc.layers(doc)[li];
        const fi = Doc.frameIndexAt(layer, f);
        if (fi < 0) return { frame: null, E: [], local: 0 };
        const fr = layer.FR[fi];
        const nx = Doc.tweenTarget(layer, fi);
        if (!nx || f === fr.I) return { frame: fr, E: fr.E || [], local: f - fr.I, tween: !!nx };
        const t = (Doc.EASES[fr._tw] || Doc.EASES.linear)((f - fr.I) / fr.DU);
        return { frame: fr, E: fr.E.map((e, i) => lerpElement(doc, e, nx.E[i], t)), local: f - fr.I, tween: true };
    };

    /* Recorre todo lo que se dibuja: cb(sprite, matrix, alpha, li, ei) */
    Doc.walk = (doc, f, cb, opts = {}) => {
        const L = Doc.layers(doc);
        for (let li = L.length - 1; li >= 0; li--) {
            if (L[li]._hidden && !opts.includeHidden) continue;
            const ev = Doc.evalLayer(doc, li, f);
            ev.E.forEach((el, ei) => {
                doc.renderer.walkElements([el], ev.local, M.identity(), 1, (sp, m, a) => cb(sp, m, a, li, ei), 0);
            });
        }
    };

    /* ---------------- Operaciones de keyframes ---------------- */
    function splitAt(doc, layer, f, useEval = true, li = -1) {
        const i = Doc.frameIndexAt(layer, f);
        if (i < 0) return;
        const fr = layer.FR[i];
        if (fr.I === f) return;
        const E = useEval && li >= 0 ? clone(Doc.evalLayer(doc, li, f).E) : clone(fr.E || []);
        const nf = { I: f, DU: fr.I + fr.DU - f, E };
        if (fr._tw) nf._tw = fr._tw;
        fr.DU = f - fr.I;
        layer.FR.splice(i + 1, 0, nf);
    }

    /* Asegura un keyframe en la capa li, frame f; lo devuelve */
    Doc.ensureKey = (doc, li, f) => {
        const layer = Doc.layers(doc)[li];
        const i = Doc.frameIndexAt(layer, f);
        if (i >= 0) {
            if (layer.FR[i].I !== f) splitAt(doc, layer, f, true, li);
            return layer.FR[Doc.frameIndexAt(layer, f)];
        }
        // hueco o después del final: crear keyframe copiando el anterior
        let prev = null, next = null;
        layer.FR.forEach(fr => { if (fr.I + fr.DU <= f && (!prev || fr.I > prev.I)) prev = fr; if (fr.I > f && (!next || fr.I < next.I)) next = fr; });
        const end = next ? next.I : Math.max(Doc.length(doc), f + 1);
        const nf = { I: f, DU: Math.max(1, end - f), E: prev ? clone(prev.E || []) : [] };
        layer.FR.push(nf);
        layer.FR.sort((a, b) => a.I - b.I);
        return nf;
    };

    Doc.isKey = (doc, li, f) => !!(Doc.layers(doc)[li].FR || []).find(fr => fr.I === f);

    Doc.removeKey = (doc, li, f) => {
        const layer = Doc.layers(doc)[li];
        const i = layer.FR.findIndex(fr => fr.I === f);
        if (i < 0) return false;
        const prev = layer.FR[i - 1];
        if (prev && prev.I + prev.DU === f) { prev.DU += layer.FR[i].DU; layer.FR.splice(i, 1); }
        else layer.FR[i].E = [];
        return true;
    };

    Doc.blankKey = (doc, li, f) => { const k = Doc.ensureKey(doc, li, f); k.E = []; delete k._tw; return k; };

    Doc.setTween = (doc, li, f, ease) => {
        const fr = Doc.frameAt(Doc.layers(doc)[li], f);
        if (!fr) return false;
        if (ease) fr._tw = ease; else delete fr._tw;
        return true;
    };

    /* ---------------- Operaciones de rango (animaciones) ---------------- */
    function shiftFrom(doc, from, delta) {
        Doc.layers(doc).forEach(l => l.FR.forEach(fr => { if (fr.I >= from) fr.I += delta; }));
    }

    Doc.deleteRange = (doc, a, b) => {
        Doc.layers(doc).forEach((l, li) => {
            splitAt(doc, l, a, false); splitAt(doc, l, b, false);
            l.FR = l.FR.filter(fr => !(fr.I >= a && fr.I < b));
        });
        shiftFrom(doc, b, a - b);
    };

    Doc.duplicateRange = (doc, a, b) => {
        const n = b - a;
        Doc.layers(doc).forEach(l => { splitAt(doc, l, a, false); splitAt(doc, l, b, false); });
        const copies = Doc.layers(doc).map(l => l.FR.filter(fr => fr.I >= a && fr.I < b).map(fr => Object.assign(clone(fr), { I: fr.I + n })));
        shiftFrom(doc, b, n);
        Doc.layers(doc).forEach((l, i) => { l.FR.push(...copies[i]); l.FR.sort((x, y) => x.I - y.I); });
    };

    /* Extiende (n>0) o recorta (n<0) el final de un rango [a,b) */
    Doc.resizeRange = (doc, a, b, n) => {
        if (n < 0) { Doc.deleteRange(doc, Math.max(a + 1, b + n), b); return; }
        Doc.layers(doc).forEach(l => {
            const fr = Doc.frameAt(l, b - 1);
            l.FR.forEach(x => { if (x.I >= b) x.I += n; });
            if (fr) fr.DU += n;
        });
    };

    Doc.addAnimation = (doc, name, length) => {
        const end = Doc.length(doc);
        const li = Doc.labelLayerIndex(doc);
        Doc.layers(doc).forEach((l, i) => {
            if (i === li) return;
            const last = Doc.frameAt(l, end - 1);
            if (last) l.FR.push({ I: end, DU: length, E: clone(Doc.evalLayer(doc, i, end - 1).E) });
        });
        Doc.layers(doc)[li].FR.push({ N: name, I: end, DU: length, E: [] });
    };

    Doc.removeAnimation = (doc, label) => Doc.deleteRange(doc, label.start, label.start + label.length);

    Doc.duplicateAnimation = (doc, label, newName) => {
        Doc.duplicateRange(doc, label.start, label.start + label.length);
        const ll = Doc.layers(doc)[Doc.labelLayerIndex(doc)];
        const copy = ll.FR.find(f => f.I === label.start + label.length && f.N === label.name);
        if (copy) copy.N = newName;
    };

    /* ---------------- Capas ---------------- */
    Doc.addLayer = (doc, name, index = 1) => {
        const layer = { LN: name, FR: [] };
        Doc.layers(doc).splice(index, 0, layer);
        return layer;
    };

    Doc.uniqueLayerName = (doc, base) => {
        const names = new Set(Doc.layers(doc).map(l => l.LN));
        let n = base, i = 2; while (names.has(n)) n = `${base} ${i++}`; return n;
    };

    /* ---------------- Piezas (símbolos con una imagen) ---------------- */
    Doc.nextSpriteName = (doc) => { let i = 0; while (doc.sprites.has(String(i))) i++; return String(i); };

    Doc.uniqueSymbolName = (doc, base) => {
        const names = new Set(doc.anim.SD.S.map(s => s.SN));
        let n = base || 'pieza', i = 2; while (names.has(n)) n = `${base} ${i++}`; return n;
    };

    /** Agrega una imagen como sprite + símbolo (estructura BTA) */
    Doc.addPiece = (doc, name, canvas) => {
        const sn = Doc.uniqueSymbolName(doc, name);
        const sp = Doc.nextSpriteName(doc);
        doc.sprites.set(sp, { name: sp, w: canvas.width, h: canvas.height, _canvas: canvas });
        doc.anim.SD.S.push({ SN: sn, TL: { L: [{ LN: 'Layer 1', FR: [{ I: 0, DU: 1, E: [{ ASI: { MX: [1, 0, 0, 1, 0, 0], N: sp } }] }] }] } });
        doc.atlasDirty = true;
        Doc.refresh(doc);
        return sn;
    };

    Doc.newInstance = (doc, sn, x, y) => {
        const c = Doc.symbolCenter(doc, sn);
        return { SI: { SN: sn, FF: 0, ST: 'G', TRP: { x: c.x, y: c.y }, LP: 'LP', MX: [1, 0, 0, 1, r2(x - c.x), r2(y - c.y)] } };
    };

    Doc.symbolUsage = (doc, sn) => {
        let n = 0;
        Doc.layers(doc).forEach(l => l.FR.forEach(fr => (fr.E || []).forEach(e => { if (e.SI && e.SI.SN === sn) n++; })));
        return n;
    };

    Doc.removePiece = (doc, sn) => {
        Doc.layers(doc).forEach(l => l.FR.forEach(fr => { fr.E = (fr.E || []).filter(e => !(e.SI && e.SI.SN === sn)); }));
        doc.anim.SD.S = doc.anim.SD.S.filter(s => s.SN !== sn);
        doc.atlasDirty = true;
        Doc.refresh(doc);
    };

    Doc.renamePiece = (doc, sn, nn) => {
        const s = Doc.symbol(doc, sn); if (!s) return;
        s.SN = nn;
        Doc.layers(doc).forEach(l => l.FR.forEach(fr => (fr.E || []).forEach(e => { if (e.SI && e.SI.SN === sn) e.SI.SN = nn; })));
        doc.anim.SD.S.forEach(sym => (sym.TL.L || []).forEach(l => (l.FR || []).forEach(fr => (fr.E || []).forEach(e => { if (e.SI && e.SI.SN === sn) e.SI.SN = nn; }))));
        Doc.refresh(doc);
    };

    /* Imagen (canvas) representativa de un símbolo */
    Doc.symbolThumb = (doc, sn, size = 72) => {
        const tl = doc.renderer.symbols.get(sn);
        const items = [];
        if (tl) doc.renderer._walkTL(tl, 0, M.identity(), 1, (sp, m) => items.push({ sp, m }), 0);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        items.forEach(({ sp, m }) => { const c = IO.spriteCanvas(sp); [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].forEach(([x, y]) => { const p = M.apply(m, x, y); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); });
        const cv = U.makeCanvas(size, size);
        if (!items.length) return cv;
        const s = Math.min(size / (x1 - x0), size / (y1 - y0), 1);
        const ctx = cv.getContext('2d');
        const view = [s, 0, 0, s, (size - (x1 - x0) * s) / 2 - x0 * s, (size - (y1 - y0) * s) / 2 - y0 * s];
        items.forEach(({ sp, m }) => { const mm = M.multiply(view, m); ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]); ctx.drawImage(IO.spriteCanvas(sp), 0, 0); });
        return cv;
    };

    /* ---------------- Exportación ---------------- */
    /** Hornea tweens a keyframes de 1 frame (Animate exporta así) */
    Doc.bake = (doc) => {
        const out = clone(doc.anim);
        const tweens = [];
        out.AN.TL.L.forEach((l, li) => {
            const src = Doc.layers(doc)[li];
            const FR = [];
            src.FR.forEach((fr, fi) => {
                const nx = Doc.tweenTarget(src, fi);
                if (!nx || fr.DU < 2) { const c = clone(fr); delete c._tw; FR.push(c); return; }
                tweens.push({ layer: src.LN, layerIndex: li, I: fr.I, DU: fr.DU, e: fr._tw });
                for (let k = 0; k < fr.DU; k++) {
                    const ev = Doc.evalLayer(doc, li, fr.I + k);
                    const c = clone(fr); delete c._tw;
                    if (k > 0) delete c.N;
                    c.I = fr.I + k; c.DU = 1; c.E = clone(ev.E);
                    FR.push(c);
                }
            });
            l.FR = FR;
        });
        return { anim: out, tweens };
    };

    /** Revierte el horneado usando fnf-packer.json */
    Doc.unbake = (doc, tweens) => {
        tweens.forEach(t => {
            const l = Doc.layers(doc)[t.layerIndex];
            if (!l || l.LN !== t.layer) return;
            const fr = l.FR.find(x => x.I === t.I);
            if (!fr) return;
            l.FR = l.FR.filter(x => !(x.I > t.I && x.I < t.I + t.DU));
            fr.DU = t.DU; fr._tw = t.e;
        });
    };

    function usedSprites(anim) {
        const used = new Set();
        const scan = (L) => (L || []).forEach(l => (l.FR || []).forEach(fr => (fr.E || []).forEach(e => { if (e.ASI) used.add(String(e.ASI.N)); })));
        scan(anim.AN.TL.L);
        (anim.SD?.S || []).forEach(s => scan(s.TL?.L));
        return used;
    }

    /**
     * settings: {name, symbol, fps, folder, sti:{enabled, format, x, y}}
     * @returns {Promise<{blob, fileName, animationText, spritemapText, pngBlob}>}
     */
    Doc.exportPack = async (doc, settings) => {
        const { anim, tweens } = Doc.bake(doc);
        if (settings.name) anim.AN.N = settings.name;
        if (settings.symbol) anim.AN.SN = settings.symbol;
        if (settings.sti) {
            if (settings.sti.enabled) {
                const sti = Atlas.buildSTI(anim.AN.SN, settings.sti.format, settings.sti.x, settings.sti.y);
                const AN = {};
                Object.keys(anim.AN).forEach(k => { if (k === 'TL' && !anim.AN.STI) AN.STI = sti; AN[k] = k === 'STI' ? sti : anim.AN[k]; });
                anim.AN = AN;
            } else delete anim.AN.STI;
        }
        if (anim.MD) {
            if (settings.fps) anim.MD.FRT = settings.fps;
            if (anim.MD.N !== undefined && settings.name) anim.MD.N = settings.name;
        }
        const animationText = BTA.stringifyAnimation(anim);

        let spritemapText, pngBlob;
        if (!doc.atlasDirty && doc.source) {
            spritemapText = BTA.stringifySpritemap(doc.source.sheet.json);
            pngBlob = doc.source.sheet.blob;
        } else {
            const used = usedSprites(anim);
            const names = Array.from(doc.sprites.keys()).filter(n => used.has(n)).sort(U.naturalSort);
            const packed = Packer.pack(names.map(n => ({ img: doc.sprites.get(n)._canvas })), { padding: 2, dedupe: false });
            const meta = Object.assign({ app: 'Adobe Animate (Better TA Extension)', version: '24.0.0.305', image: 'spritemap1.png', format: 'RGBA8888', size: {}, resolution: '1' },
                doc.source ? clone(doc.source.sheet.json.meta || {}) : {});
            meta.image = 'spritemap1.png';
            meta.size = { w: packed.canvas.width, h: packed.canvas.height };
            spritemapText = BTA.stringifySpritemap({
                ATLAS: { SPRITES: names.map((n, i) => ({ SPRITE: { name: n, x: packed.rects[i].x, y: packed.rects[i].y, w: packed.rects[i].w, h: packed.rects[i].h, rotated: false } })) },
                meta
            });
            pngBlob = await U.canvasToBlob(packed.canvas);
        }

        const folder = U.sanitizeName(settings.folder || anim.AN.N || 'personaje');
        const zip = new JSZip();
        const dir = zip.folder(folder);
        dir.file('Animation.json', animationText);
        dir.file('spritemap1.json', spritemapText);
        dir.file('spritemap1.png', pngBlob);
        if (tweens.length) dir.file('fnf-packer.json', JSON.stringify({ format: 'fnf-packer-bta', version: 1, tweens }, null, 1));
        const blob = await zip.generateAsync({ type: 'blob' });
        return { blob, fileName: `${folder}.zip`, animationText, spritemapText, pngBlob, tweens };
    };

    Doc.snapshot = (doc) => JSON.stringify({ anim: doc.anim, dirty: doc.atlasDirty });
    Doc.restore = (doc, snap) => { const s = JSON.parse(snap); doc.anim = s.anim; doc.atlasDirty = s.dirty; doc.renderer.atlas.anim = doc.anim; Doc.refresh(doc); };

    F.PartsDoc = Doc;
})(window.FNF);

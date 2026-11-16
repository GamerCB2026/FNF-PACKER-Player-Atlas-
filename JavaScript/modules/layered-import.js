/* ==========================================================
   FNF Packer — .psd / .ipv -> "Crear Spritemaps en Partes"
   Convierte capas y carpetas en el documento de partes:
   - Cada capa visible = una pieza (las capas idénticas se
     reutilizan como la misma pieza).
   - .ipv: las carpetas de primer nivel son frames (como en
     ibisPaint). Las subcarpetas internas son grupos/sub-capas.
   - .psd: las carpetas/grupos son sub-capas. Si una carpeta
     tiene subcarpetas, la carpeta es una animación y cada
     subcarpeta es un frame (las carpetas dentro del frame
     siguen siendo grupos).
   - Capas sueltas (fuera de carpetas) quedan fijas en todos
     los frames (fondo o frente, según su posición).
   - Cada grupo se exporta como símbolo anidado (SD.S + SI).
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const L = {};
    const r2 = (v) => Math.round(v * 100) / 100;

    L.accepts = (file) => /\.(psd|ipv)$/i.test(file && file.name || '');

    L.read = async (file) => {
        const buf = await file.arrayBuffer();
        if (F.PsdImport && F.PsdImport.isPsd(buf)) return F.PsdImport.parse(buf, file.name);
        if (F.IpvImport && F.IpvImport.isIpv(buf)) return F.IpvImport.parse(buf, file.name);
        throw new Error('Formato no reconocido: usa un .psd o un .ipv de ibisPaint.');
    };

    /* Árbol de un frame: hojas y grupos, de abajo hacia arriba */
    function layersFrom(nodes, alpha = 1) {
        const out = [];
        (nodes || []).forEach(n => {
            if (!n.visible && !n.children) return;
            if (n.children) {
                const kids = layersFrom(n.children, alpha * n.opacity);
                if (kids.length) out.push({ type: 'group', name: n.name || 'Grupo', a: alpha * n.opacity, children: kids });
                return;
            }
            if (n.canvas) out.push({ type: 'layer', name: n.name, canvas: n.canvas, x: n.x, y: n.y, a: alpha * n.opacity });
        });
        return out;
    }

    function stampSize(list, W, H) {
        (list || []).forEach(ly => { ly.W = W; ly.H = H; if (ly.children) stampSize(ly.children, W, H); });
    }

    function flattenLeaves(list, out = []) {
        (list || []).forEach(n => n.children ? flattenLeaves(n.children, out) : out.push(n));
        return out;
    }

    function hashCanvas(c) {
        const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
        let h = 2166136261 >>> 0;
        const step = d.length > 4e6 ? 4 * 7 : 4;
        for (let i = 0; i < d.length; i += step) {
            h = Math.imul(h ^ d[i], 16777619); h = Math.imul(h ^ d[i + 1], 16777619);
            h = Math.imul(h ^ d[i + 2], 16777619); h = Math.imul(h ^ d[i + 3], 16777619);
        }
        return `${c.width}x${c.height}:${h >>> 0}`;
    }

    /* Animaciones de un archivo: [{ name, frames:[{ name, layers }] }] + capas sueltas */
    function collect(res) {
        const nodes = res.nodes || [];
        const groups = nodes.filter(n => n.children);
        const firstG = nodes.findIndex(n => n.children);
        const looseBack = [], looseFront = [];
        nodes.forEach((n, i) => { if (!n.children) (groups.length && i > firstG ? looseFront : looseBack).push(n); });
        const anims = [];
        const W = res.width || 0, H = res.height || 0;
        const wrap = (list, a) => { const ly = layersFrom(list, a); stampSize(ly, W, H); return ly; };
        const nested = groups.some(g => g.children.some(c => c.children));
        if (nested) {
            groups.forEach(g => {
                const subs = g.children.filter(c => c.children);
                const frames = subs.length ? subs.map(s => ({ name: s.name, layers: wrap(s.children, g.opacity * s.opacity) }))
                    : [{ name: g.name, layers: wrap(g.children, g.opacity) }];
                anims.push({ name: g.name, frames });
            });
        } else if (groups.length && res.source === 'ipv') {
            // en .ipv las carpetas de primer nivel son frames; las internas ya vienen en wrap()
            anims.push({ name: groups.length > 1 ? 'idle' : (groups[0].name || 'idle'), frames: groups.map(g => ({ name: g.name, layers: wrap(g.children, g.opacity) })) });
        } else if (groups.length) {
            // PSD y similares: las carpetas de un nivel son grupos/sub-capas de un solo pose
            anims.push({ name: 'idle', frames: [{ name: 'idle', layers: wrap(nodes, 1) }] });
            looseBack.length = 0; looseFront.length = 0;
        } else {
            anims.push({ name: 'idle', frames: [{ name: 'idle', layers: wrap(looseBack, 1) }] });
            looseBack.length = 0;
        }
        const back = layersFrom(looseBack), front = layersFrom(looseFront);
        stampSize(back, W, H); stampSize(front, W, H);
        return { anims, back, front };
    }

    /** res: salida de PsdImport/IpvImport -> { doc, stats } */
    L.toDoc = (res) => build([res], false);

    /** Varios archivos: cada uno es una animación "ipv 1", "ipv 2"… (o "psd 1"…),
        reutilizando piezas idénticas entre archivos. */
    L.toDocMulti = (list) => build(list, true);

    function unionSlots(lists) {
        const out = [], seen = new Set();
        lists.forEach(list => (list || []).forEach(it => {
            const group = it.type === 'group';
            const k = (group ? 'g:' : 'l:') + it.name;
            if (seen.has(k)) return;
            seen.add(k);
            if (!group) { out.push({ type: 'layer', name: it.name }); return; }
            const kids = lists.map(l => {
                const f = (l || []).find(x => x.type === 'group' && x.name === it.name);
                return f ? f.children : [];
            });
            out.push({ type: 'group', name: it.name, children: unionSlots(kids) });
        }));
        return out;
    }
    const findItem = (list, slot) => (list || []).find(x => x.name === slot.name && (x.type === 'group') === (slot.type === 'group')) || null;

    function build(list, multi) {
        const Doc = F.PartsDoc;
        const first = list[0] || { name: 'personaje' };
        const base = multi ? (first.name || 'personaje') : first.name;
        const name = (F.U.sanitizeName ? F.U.sanitizeName(base, 'personaje') : base) || 'personaje';
        const doc = Doc.create(name);

        let anims = [], back = [], front = [];
        if (!multi) ({ anims, back, front } = collect(first));
        else {
            const count = {};
            list.forEach(res => {
                const kind = res.source || 'ipv';
                const num = count[kind] = (count[kind] || 0) + 1;
                const c = collect(res);
                // en modo varios archivos las capas sueltas van dentro de cada frame
                c.anims.forEach(an => an.frames.forEach(f => { f.layers = c.back.concat(f.layers, c.front); }));
                c.anims.forEach((an) => anims.push({ name: c.anims.length > 1 ? `${kind} ${num} ${an.name}` : `${kind} ${num}`, frames: an.frames }));
            });
        }

        // piezas (sin repetir imágenes iguales)
        const pieceBy = new Map();
        let pieceCount = 0;
        const pieceFor = (ly) => {
            const key = hashCanvas(ly.canvas);
            if (!pieceBy.has(key)) { pieceBy.set(key, Doc.addPiece(doc, ly.name, ly.canvas)); pieceCount++; }
            return pieceBy.get(key);
        };
        const inst = (ly) => {
            const sn = pieceFor(ly);
            const w = ly.canvas.width, h = ly.canvas.height;
            const si = { SN: sn, FF: 0, ST: 'G', TRP: { x: r2(w / 2), y: r2(h / 2) }, LP: 'LP', MX: [1, 0, 0, 1, r2(ly.x - (ly.W || 0) / 2), r2(ly.y - (ly.H || 0) / 2)] };
            if (ly.a < 0.9995) si.C = { M: 'CA', AM: Math.round(ly.a * 1000) / 1000 };
            return { SI: si };
        };

        const total = anims.reduce((s, a) => s + a.frames.length, 0) || 1;
        const label = { LN: 'Layer_1', FR: [] };
        let t0 = 0;
        anims.forEach(a => { label.FR.push({ N: a.name, I: t0, DU: a.frames.length, E: [], _fps: 24 }); t0 += a.frames.length; });
        const flat = []; anims.forEach(a => a.frames.forEach(f => flat.push(f)));
        const used = new Set(['Layer_1']);
        const uniq = (b) => { let n = b, i = 2; while (used.has(n)) n = `${b} ${i++}`; used.add(n); return n; };

        const sameE = (a, b) => {
            const aa = JSON.parse(JSON.stringify(a || [])), bb = JSON.parse(JSON.stringify(b || []));
            const strip = (E) => E.forEach(e => { if (e.SI && e.SI.FF !== undefined) delete e.SI.FF; });
            strip(aa); strip(bb);
            return JSON.stringify(aa) === JSON.stringify(bb);
        };
        const pushKeys = (layer, perFrame, makeE) => {
            perFrame.forEach((it, i) => {
                const E = makeE(it, i);
                const prev = layer.FR[layer.FR.length - 1];
                if (prev && sameE(prev.E, E) && !label.FR.some(l => l.I === i)) prev.DU++;
                else {
                    (E || []).forEach(e => { if (e.SI) e.SI.FF = i; });
                    layer.FR.push({ I: i, DU: 1, E });
                }
            });
        };

        function buildSlots(tree, lists) {
            return tree.map(slot => {
                const perFrame = lists.map(list => findItem(list, slot));
                if (slot.type === 'group') {
                    const childLists = perFrame.map(it => it ? it.children : []);
                    const childL = buildSlots(slot.children, childLists);
                    const gsn = Doc.uniqueSymbolName(doc, slot.name);
                    doc.anim.SD.S.push({ SN: gsn, TL: { L: childL } });
                    Doc.refresh(doc);
                    const c = Doc.symbolCenter(doc, gsn);
                    const layer = { LN: uniq(slot.name), FR: [], _open: true };
                    pushKeys(layer, perFrame, (it) => {
                        if (!it) return [];
                        const e = Doc.newInstance(doc, gsn, c.x, c.y);
                        if (it.a < 0.9995) e.SI.C = { M: 'CA', AM: Math.round(it.a * 1000) / 1000 };
                        return [e];
                    });
                    return layer;
                }
                const layer = { LN: uniq(slot.name), FR: [] };
                pushKeys(layer, perFrame, (it) => it ? [inst(it)] : []);
                return layer;
            });
        }

        const tree = unionSlots(flat.map(f => f.layers));
        const slotLayers = buildSlots(tree, flat.map(f => f.layers));
        const fixed = (ly) => {
            if (ly.type === 'group') {
                const built = buildSlots(unionSlots([[ly]]), [[ly]])[0];
                built.FR = [{ I: 0, DU: total, E: built.FR[0] ? built.FR[0].E : [] }];
                if (built.FR[0] && built.FR[0].E[0] && built.FR[0].E[0].SI) built.FR[0].E[0].SI.FF = 0;
                return built;
            }
            return { LN: uniq(ly.name), FR: [{ I: 0, DU: total, E: [inst(ly)] }] };
        };
        const backL = back.map(fixed), frontL = front.map(fixed);

        // BTA: la primera capa de la lista se dibuja al frente
        doc.anim.AN.TL.L = [label].concat(frontL.reverse(), slotLayers.reverse(), backL.reverse());
        doc.folder = name;
        doc.atlasDirty = true;
        Doc.refresh(doc);
        const groupCount = (doc.anim.SD.S || []).filter(s => Doc.isGroupSymbol(doc, s.SN)).length;
        return { doc, stats: { pieces: pieceCount, anims: anims.length, frames: total, layers: slotLayers.length + back.length + front.length, groups: groupCount, files: list.length } };
    }

    F.LayeredImport = L;
})(window.FNF);

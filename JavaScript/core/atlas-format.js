/* ==========================================================
   FNF Packer — formato Texture Atlas de Adobe Animate
   - Normaliza Animation.json (claves largas -> cortas)
   - Lee spritemap*.json
   - Construye STI / MD / spritemap igual que la versión 2.0.0
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const A = {};

    const KEY_MAP = {
        ANIMATION: 'AN', SYMBOL_DICTIONARY: 'SD', Symbols: 'S', SYMBOL_name: 'SN',
        TIMELINE: 'TL', LAYERS: 'L', Layer_name: 'LN', Layer_type: 'LT', Clipped_by: 'Clpb',
        Frames: 'FR', index: 'I', duration: 'DU', elements: 'E', name: 'N',
        ATLAS_SPRITE_instance: 'ASI', SYMBOL_Instance: 'SI', Matrix3D: 'M3D',
        firstFrame: 'FF', loop: 'LP', symbolType: 'ST', StageInstance: 'STI',
        metadata: 'MD', framerate: 'FRT', Instance_Name: 'IN', transformationPoint: 'TRP',
        color: 'C', mode: 'M', alphaMultiplier: 'AM', filters: 'F'
    };
    const LOOP_MAP = { loop: 'LP', playonce: 'PO', singleframe: 'SF', 'play once': 'PO', 'single frame': 'SF' };
    const TYPE_MAP = { graphic: 'G', movieclip: 'MC', button: 'B' };

    function m3dObjToArray(o) {
        const k = ['m00', 'm01', 'm02', 'm03', 'm10', 'm11', 'm12', 'm13', 'm20', 'm21', 'm22', 'm23', 'm30', 'm31', 'm32', 'm33'];
        return k.map(x => +(o[x] ?? 0));
    }

    function normalizeNode(node) {
        if (Array.isArray(node)) return node.map(normalizeNode);
        if (!node || typeof node !== 'object') return node;
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            const nk = KEY_MAP[k] || k;
            if (nk === 'M3D' && v && !Array.isArray(v) && typeof v === 'object') { out.M3D = m3dObjToArray(v); continue; }
            if (nk === 'LP' && typeof v === 'string') { out.LP = LOOP_MAP[v.toLowerCase()] || v; continue; }
            if (nk === 'ST' && typeof v === 'string') { out.ST = TYPE_MAP[v.toLowerCase()] || v; continue; }
            out[nk] = normalizeNode(v);
        }
        return out;
    }

    /* Devuelve Animation.json con claves cortas (formato optimizado) */
    A.normalizeAnimation = (json) => {
        const n = normalizeNode(json);
        if (!n.AN) throw new Error('Animation.json no tiene la sección "AN" / "ANIMATION".');
        n.AN.TL = n.AN.TL || { L: [] };
        n.AN.TL.L = n.AN.TL.L || [];
        n.SD = n.SD || { S: [] };
        n.SD.S = n.SD.S || [];
        n.MD = n.MD || {};
        return n;
    };

    /* Lee spritemap*.json -> lista de sprites */
    A.parseSpritemap = (json) => {
        const atlas = json.ATLAS || json.atlas;
        if (!atlas) throw new Error('El spritemap JSON no tiene la sección "ATLAS".');
        const list = atlas.SPRITES || atlas.sprites || [];
        const sprites = list.map(s => {
            const sp = s.SPRITE || s.sprite || s;
            return {
                name: String(sp.name),
                x: +sp.x || 0, y: +sp.y || 0, w: +sp.w || 0, h: +sp.h || 0,
                rotated: !!sp.rotated
            };
        });
        const meta = json.meta || atlas.meta || {};
        return { sprites, meta, image: meta.image || null };
    };

    /* Detecta formato de exportación según STI */
    A.detectFormat = (anim) => {
        const si = anim?.AN?.STI?.SI;
        if (si && si.M3D && !si.MX) return 'p-slice';
        return 'v-slice';
    };

    /* Lee offset del STI (MX o M3D) */
    A.readStiOffset = (anim) => {
        const si = anim?.AN?.STI?.SI;
        if (!si) return { x: 0, y: 0 };
        if (si.MX) return { x: +si.MX[4] || 0, y: +si.MX[5] || 0 };
        if (si.M3D) {
            const m = Array.isArray(si.M3D) ? si.M3D : m3dObjToArray(si.M3D);
            return { x: +m[12] || 0, y: +m[13] || 0 };
        }
        return { x: 0, y: 0 };
    };

    /* STI idéntico a la versión 2.0.0 */
    A.buildSTI = (symN, formatMode, offX, offY) => {
        if (formatMode === 'v-slice') {
            return { "SI": { "SN": symN, "FF": 0, "ST": "G", "TRP": { "x": 0, "y": 0 }, "LP": "PO", "MX": [1.0, 0.0, 0.0, 1.0, offX, offY] } };
        }
        return {
            "SI": {
                "SN": symN, "FF": 0, "ST": "G", "TRP": { "x": 0, "y": 0 }, "LP": "PO",
                "M3D": [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, offX, offY, 0.0, 0.0]
            }
        };
    };

    A.buildMD = (fps) => ({ "V": "BTA 1.2.0", "FRT": fps, "W": 1280, "H": 720, "ASV": 3 });

    A.buildSpritemapJson = (sprites, w, h) => ({
        "ATLAS": {
            "SPRITES": sprites.map(s => ({ "SPRITE": { "name": s.name, "x": s.x, "y": s.y, "w": s.w, "h": s.h, "rotated": false } })),
            "meta": { "app": "Spritemap Convert Web", "version": "22.0.5.191", "image": "spritemap1.png", "format": "RGBA8888", "size": { "w": w, "h": h }, "resolution": "1" }
        }
    });

    /* Agrupa una lista de nombres de animación consecutivos en etiquetas */
    A.buildLabels = (animPerFrame) => {
        const out = [];
        let cur = null, start = 0, dur = 0;
        animPerFrame.forEach((a, i) => {
            if (cur === null) { cur = a; start = i; dur = 1; }
            else if (a === cur) dur++;
            else { out.push({ "N": cur, "I": start, "DU": dur, "E": [] }); cur = a; start = i; dur = 1; }
        });
        if (cur !== null) out.push({ "N": cur, "I": start, "DU": dur, "E": [] });
        return out;
    };

    F.Atlas = A;
})(window.FNF);

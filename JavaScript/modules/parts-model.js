/* ==========================================================
   FNF Packer — modelo de datos de "Crear Spritemaps en Partes"
   Proyecto = partes (imágenes con pivote) + animaciones con
   claves (keyframes) por parte e interpolación entre claves.
   Separado de la interfaz para poder ampliarlo después.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, M } = F;
    const Model = {};

    Model.PROPS = ['x', 'y', 'r', 'sx', 'sy', 'a'];
    Model.DEFAULT_POSE = () => ({ x: 0, y: 0, r: 0, sx: 1, sy: 1, a: 1 });

    Model.EASES = {
        linear: t => t,
        easeIn: t => t * t,
        easeOut: t => 1 - (1 - t) * (1 - t),
        easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
        hold: () => 0
    };

    Model.createProject = () => ({
        parts: [],
        animations: [Model.createAnimation('idle', 24)],
        settings: { charName: 'bf_partes', symName: 'BOYFRIEND CS', fps: 24, format: 'v-slice', offX: 0, offY: 0 }
    });

    Model.createAnimation = (name, length = 24) => ({ id: U.uid('a'), name, length, keys: {} });

    /** img: HTMLImageElement */
    Model.createPart = (name, img, base) => ({
        id: U.uid('p'),
        name,
        img,
        w: img.width,
        h: img.height,
        pivot: { x: Math.round(img.width / 2), y: Math.round(img.height / 2) },
        base: Object.assign(Model.DEFAULT_POSE(), base || {}),
        visible: true
    });

    Model.keysOf = (anim, part) => anim.keys[part.id] || [];

    Model.keyAt = (anim, part, f) => Model.keysOf(anim, part).find(k => k.f === f) || null;

    /* Pose interpolada de una parte en el frame f */
    Model.poseAt = (anim, part, f) => {
        const keys = Model.keysOf(anim, part);
        if (!keys.length) return Object.assign({}, part.base);
        if (f <= keys[0].f) return pick(keys[0]);
        const last = keys[keys.length - 1];
        if (f >= last.f) return pick(last);
        for (let i = 0; i < keys.length - 1; i++) {
            const k0 = keys[i], k1 = keys[i + 1];
            if (f >= k0.f && f < k1.f) {
                const t = (Model.EASES[k0.e] || Model.EASES.linear)((f - k0.f) / (k1.f - k0.f));
                const out = {};
                Model.PROPS.forEach(p => out[p] = k0[p] + (k1[p] - k0[p]) * t);
                return out;
            }
        }
        return pick(last);
    };

    function pick(k) { const o = {}; Model.PROPS.forEach(p => o[p] = k[p]); return o; }

    Model.setKey = (anim, part, f, pose, ease) => {
        const list = anim.keys[part.id] || (anim.keys[part.id] = []);
        let k = list.find(x => x.f === f);
        if (!k) { k = { f, e: ease || 'linear' }; list.push(k); list.sort((a, b) => a.f - b.f); }
        Model.PROPS.forEach(p => { if (pose[p] !== undefined && !Number.isNaN(+pose[p])) k[p] = +pose[p]; });
        if (ease) k.e = ease;
        return k;
    };

    Model.removeKey = (anim, part, f) => {
        const list = anim.keys[part.id];
        if (!list) return false;
        const i = list.findIndex(k => k.f === f);
        if (i < 0) return false;
        list.splice(i, 1);
        if (!list.length) delete anim.keys[part.id];
        return true;
    };

    /* Matriz final de la parte: T(x,y)·R·S·T(-pivote) */
    Model.matrix = (part, pose) => M.multiply(M.compose(pose.x, pose.y, pose.r, pose.sx, pose.sy), M.translate(-part.pivot.x, -part.pivot.y));

    /* Cambia el pivote sin mover visualmente la parte en ninguna clave */
    Model.setPivot = (project, part, nx, ny) => {
        const dx = nx - part.pivot.x, dy = ny - part.pivot.y;
        const fix = (pose) => {
            const m = M.compose(0, 0, pose.r, pose.sx, pose.sy);
            const d = M.apply(m, dx, dy);
            pose.x += d[0]; pose.y += d[1];
        };
        fix(part.base);
        project.animations.forEach(a => (a.keys[part.id] || []).forEach(fix));
        part.pivot.x = nx; part.pivot.y = ny;
    };

    Model.removePart = (project, part) => {
        project.parts = project.parts.filter(p => p !== part);
        project.animations.forEach(a => delete a.keys[part.id]);
    };

    Model.duplicateAnimation = (anim, name) => {
        const copy = Model.createAnimation(name, anim.length);
        Object.entries(anim.keys).forEach(([pid, ks]) => copy.keys[pid] = ks.map(k => Object.assign({}, k)));
        return copy;
    };

    /* Nombres de símbolo únicos por parte */
    Model.symbolNames = (project) => {
        const used = new Set();
        return project.parts.map(p => {
            let base = U.sanitizeName(p.name, 'parte'), n = base, i = 2;
            while (used.has(n)) n = `${base}_${i++}`;
            used.add(n);
            return n;
        });
    };

    /* -------- Serialización (proyecto-partes.json) -------- */
    Model.serialize = (project, { spriteNames = null, embedImages = false } = {}) => {
        const syms = Model.symbolNames(project);
        const r = (v) => U.round(v, 4);
        return {
            format: 'fnf-packer-partes',
            version: 1,
            settings: Object.assign({}, project.settings),
            parts: project.parts.map((p, i) => {
                const o = { name: p.name, symbol: syms[i], w: p.w, h: p.h, pivot: { x: r(p.pivot.x), y: r(p.pivot.y) }, base: roundPose(p.base, r), visible: p.visible };
                if (spriteNames) o.sprite = spriteNames[i];
                if (embedImages) o.data = toDataURL(p.img);
                return o;
            }),
            animations: project.animations.map(a => ({
                name: a.name,
                length: a.length,
                keys: Object.fromEntries(project.parts.map((p, i) => [syms[i], (a.keys[p.id] || []).map(k => Object.assign({ f: k.f, e: k.e }, roundPose(k, r)))]).filter(([, v]) => v.length))
            }))
        };
    };

    function roundPose(p, r) { const o = {}; Model.PROPS.forEach(k => o[k] = r(p[k])); return o; }

    function toDataURL(img) {
        if (img.src && /^data:/.test(img.src)) return img.src;
        const c = U.makeCanvas(img.width, img.height);
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/png');
    }

    /** imageFor(partJson, index) -> Promise<HTMLImageElement> */
    Model.deserialize = async (json, imageFor) => {
        if (!json || json.format !== 'fnf-packer-partes') throw new Error('No es un proyecto de partes válido.');
        const project = Model.createProject();
        project.settings = Object.assign(project.settings, json.settings || {});
        project.animations = [];
        const bySymbol = {};
        for (let i = 0; i < (json.parts || []).length; i++) {
            const pj = json.parts[i];
            const img = await imageFor(pj, i);
            const part = Model.createPart(pj.name, img, pj.base);
            if (pj.pivot) part.pivot = { x: +pj.pivot.x, y: +pj.pivot.y };
            part.visible = pj.visible !== false;
            project.parts.push(part);
            bySymbol[pj.symbol || pj.name] = part;
        }
        (json.animations || []).forEach(aj => {
            const a = Model.createAnimation(aj.name, aj.length || 24);
            Object.entries(aj.keys || {}).forEach(([sym, ks]) => {
                const part = bySymbol[sym];
                if (part) a.keys[part.id] = ks.map(k => Object.assign({}, k)).sort((x, y) => x.f - y.f);
            });
            project.animations.push(a);
        });
        if (!project.animations.length) project.animations.push(Model.createAnimation('idle', 24));
        return project;
    };

    F.PartsModel = Model;
})(window.FNF);

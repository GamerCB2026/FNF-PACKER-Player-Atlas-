/* ==========================================================
   FNF Packer — reproductor de Animation.json (Texture Atlas)
   Dibuja la línea de tiempo principal con símbolos anidados,
   instancias de sprites (ASI) y modos de bucle (LP/PO/SF).
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { M, IO } = F;

    class AtlasRenderer {
        constructor(atlas) {
            this.atlas = atlas;
            this.rebuild();
        }

        rebuild() {
            this.symbols = new Map();
            (this.atlas.anim?.SD?.S || []).forEach(s => this.symbols.set(s.SN, s.TL));
            this.main = this.atlas.anim?.AN?.TL || null;
        }

        static timelineLength(tl) {
            let len = 0;
            (tl?.L || []).forEach(l => (l.FR || []).forEach(fr => { len = Math.max(len, (fr.I || 0) + (fr.DU || 1)); }));
            return len;
        }

        get length() {
            if (this.main) return Math.max(1, AtlasRenderer.timelineLength(this.main));
            return Math.max(1, this.atlas.sprites.size);
        }

        /* Etiquetas (animaciones) de la línea de tiempo principal */
        labels() {
            const out = [];
            (this.main?.L || []).forEach(l => (l.FR || []).forEach(fr => {
                if (fr.N) out.push({ name: fr.N, start: fr.I || 0, length: fr.DU || 1 });
            }));
            out.sort((a, b) => a.start - b.start);
            return out;
        }

        static frameAt(layer, idx) {
            const frs = layer.FR || [];
            for (const fr of frs) {
                const s = fr.I || 0, d = fr.DU || 1;
                if (idx >= s && idx < s + d) return fr;
            }
            return null;
        }

        /* Recorre los elementos visibles del frame: cb(sprite, matrix, alpha) */
        walk(frameIdx, cb) {
            if (!this.main) {
                // Sin Animation.json: mostramos cada sprite como un frame
                const sp = Array.from(this.atlas.sprites.values())[frameIdx];
                if (sp) cb(sp, M.identity(), 1);
                return;
            }
            this._walkTL(this.main, frameIdx, M.identity(), 1, cb, 0);
        }

        _walkTL(tl, idx, parentM, alpha, cb, depth) {
            if (!tl || depth > 32) return;
            const layers = tl.L || [];
            for (let li = layers.length - 1; li >= 0; li--) {
                const layer = layers[li];
                if (layer.LT === 'Clp' || layer.LT === 'Clipper') continue; // capas máscara
                const fr = AtlasRenderer.frameAt(layer, idx);
                if (!fr || !fr.E) continue;
                this.walkElements(fr.E, idx - (fr.I || 0), parentM, alpha, cb, depth);
            }
        }

        /* Recorre una lista de elementos (ASI / SI). local = frames desde el inicio del keyframe */
        walkElements(E, local, parentM, alpha, cb, depth = 0) {
            for (const el of E) {
                if (el.ASI) {
                    const sp = this.atlas.sprites.get(String(el.ASI.N));
                    if (sp) cb(sp, M.multiply(parentM, M.fromElement(el.ASI)), alpha);
                } else if (el.SI) {
                    const si = el.SI;
                    const sub = this.symbols.get(si.SN);
                    if (!sub) continue;
                    const len = Math.max(1, AtlasRenderer.timelineLength(sub));
                    const ff = si.FF || 0;
                    let child;
                    if (si.LP === 'SF') child = ff;
                    else if (si.LP === 'PO') child = Math.min(ff + local, len - 1);
                    else child = (ff + local) % len;
                    let a = alpha;
                    if (si.C && si.C.AM !== undefined && (si.C.M === 'CA' || si.C.M === 'AD' || si.C.M === 'Alpha')) a *= +si.C.AM;
                    this._walkTL(sub, child, M.multiply(parentM, M.fromElement(si)), a, cb, depth + 1);
                }
            }
        }

        draw(ctx, frameIdx, view) {
            this.walk(frameIdx, (sp, m, alpha) => {
                const mm = M.multiply(view, m);
                ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
                ctx.globalAlpha = alpha;
                ctx.drawImage(IO.spriteCanvas(sp), 0, 0);
            });
            ctx.globalAlpha = 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        bounds(frameIdx) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            this.walk(frameIdx, (sp, m) => {
                const c = IO.spriteCanvas(sp);
                [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].forEach(([x, y]) => {
                    const p = M.apply(m, x, y);
                    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
                    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
                });
            });
            if (x0 === Infinity) return null;
            return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }

        unionBounds(start = 0, count = this.length) {
            let b = null;
            for (let i = start; i < start + count; i++) {
                const fb = this.bounds(i);
                if (!fb) continue;
                if (!b) b = Object.assign({}, fb);
                else {
                    const x1 = Math.max(b.x + b.w, fb.x + fb.w), y1 = Math.max(b.y + b.h, fb.y + fb.h);
                    b.x = Math.min(b.x, fb.x); b.y = Math.min(b.y, fb.y);
                    b.w = x1 - b.x; b.h = y1 - b.y;
                }
            }
            return b;
        }

        /* Si el frame es un solo sprite con solo traslación, lo devuelve */
        simpleFrame(frameIdx) {
            const found = [];
            this.walk(frameIdx, (sp, m, a) => found.push({ sp, m, a }));
            if (found.length === 1 && found[0].a === 1 && M.isTranslationOnly(found[0].m)) {
                const { sp, m } = found[0];
                if (Math.abs(m[4] - Math.round(m[4])) < 1e-6 && Math.abs(m[5] - Math.round(m[5])) < 1e-6)
                    return { sprite: sp, x: Math.round(m[4]), y: Math.round(m[5]) };
            }
            return null;
        }

        /* Renderiza un frame a un canvas recortado a los límites dados */
        bakeFrame(frameIdx, b) {
            const c = F.U.makeCanvas(Math.ceil(b.w), Math.ceil(b.h));
            const ctx = c.getContext('2d');
            this.draw(ctx, frameIdx, M.translate(-b.x, -b.y));
            return c;
        }
    }

    F.AtlasRenderer = AtlasRenderer;
})(window.FNF);

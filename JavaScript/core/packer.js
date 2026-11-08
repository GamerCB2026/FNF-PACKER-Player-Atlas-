/* ==========================================================
   FNF Packer — empaquetador de atlas (spritemap1.png)
   Mismo algoritmo por filas que la versión 2.0.0 (padding 2,
   ancho ideal = raíz del área total) + detección de duplicados.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';

    const Packer = {};
    Packer.PADDING = 2;
    Packer.MAX_SIZE = 8192;

    /* Firma por píxeles reales (igual que v2.0.0) */
    function makeSignatureFn() {
        const tmp = document.createElement('canvas');
        const tctx = tmp.getContext('2d');
        return (img) => {
            tmp.width = img.width;
            tmp.height = img.height;
            tctx.clearRect(0, 0, img.width, img.height);
            tctx.drawImage(img, 0, 0);
            return tmp.toDataURL();
        };
    }

    /**
     * Empaqueta imágenes en un solo lienzo.
     * @param {Array<{img:HTMLImageElement|HTMLCanvasElement}>} items
     * @param {{padding?:number, dedupe?:boolean}} opts
     * @returns {{canvas:HTMLCanvasElement, rects:Array<{x,y,w,h,master:number,duplicate:boolean}>, uniqueCount:number}}
     */
    Packer.pack = (items, opts = {}) => {
        const padding = opts.padding ?? Packer.PADDING;
        const dedupe = opts.dedupe !== false;
        const sig = makeSignatureFn();

        const rects = items.map(() => ({ x: 0, y: 0, w: 0, h: 0, master: -1, duplicate: false }));
        const unique = [];
        const sigMap = {};

        items.forEach((it, i) => {
            rects[i].w = it.img.width;
            rects[i].h = it.img.height;
            if (dedupe) {
                const s = sig(it.img);
                if (sigMap[s] !== undefined) {
                    rects[i].duplicate = true;
                    rects[i].master = sigMap[s];
                    return;
                }
                sigMap[s] = i;
            }
            rects[i].master = i;
            unique.push(i);
        });

        let totalArea = 0, maxW = 0;
        unique.forEach(i => {
            const im = items[i].img;
            totalArea += (im.width + padding) * (im.height + padding);
            if (im.width > maxW) maxW = im.width;
        });

        const idealWidth = Math.max(maxW + padding, Math.ceil(Math.sqrt(totalArea)));
        let cx = 0, cy = 0, rowH = 0, finalW = 0;

        unique.forEach(i => {
            const im = items[i].img;
            if (cx + im.width > idealWidth) {
                cx = 0;
                cy += rowH + padding;
                rowH = 0;
            }
            rects[i].x = cx;
            rects[i].y = cy;
            cx += im.width + padding;
            rowH = Math.max(rowH, im.height);
            if (rects[i].x + im.width > finalW) finalW = rects[i].x + im.width;
        });

        const finalH = cy + rowH;
        const canvas = document.createElement('canvas');
        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        unique.forEach(i => ctx.drawImage(items[i].img, rects[i].x, rects[i].y));

        rects.forEach(r => {
            if (r.duplicate) { r.x = rects[r.master].x; r.y = rects[r.master].y; }
        });

        return { canvas, rects, uniqueCount: unique.length };
    };

    F.Packer = Packer;
})(window.FNF);

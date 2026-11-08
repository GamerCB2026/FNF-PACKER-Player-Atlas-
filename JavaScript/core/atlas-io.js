/* ==========================================================
   FNF Packer — carga de spritemaps existentes
   Acepta: archivos sueltos (PNG + spritemap JSON + Animation.json)
   o uno o varios .zip (como los que exporta esta página).
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, Atlas } = F;
    const IO = {};

    /* Convierte File[] (incluyendo zips) en entradas {path, name, blob} */
    async function expandFiles(files) {
        const entries = [];
        for (const f of files) {
            const lower = f.name.toLowerCase();
            if (lower.endsWith('.zip')) {
                if (typeof JSZip === 'undefined') throw new Error('JSZip no está disponible.');
                const zip = await JSZip.loadAsync(f);
                const jobs = [];
                zip.forEach((path, file) => {
                    if (file.dir) return;
                    if (/(^|\/)(__MACOSX|\.)/.test(path)) return;
                    jobs.push(file.async('blob').then(blob => entries.push({ path, name: U.baseName(path), blob })));
                });
                await Promise.all(jobs);
            } else {
                entries.push({ path: f.webkitRelativePath || f.name, name: f.name, blob: f });
            }
        }
        return entries;
    }

    /* Busca el grupo (carpeta) que contiene Animation.json */
    function pickGroup(entries) {
        const animEntries = entries.filter(e => e.name.toLowerCase() === 'animation.json');
        if (animEntries.length === 0) return { dir: null, list: entries };
        const dir = U.dirName(animEntries[0].path);
        const same = entries.filter(e => U.dirName(e.path) === dir);
        return { dir, list: same.length ? same : entries };
    }

    /**
     * Carga un atlas.
     * @returns {Promise<{name:string, anim:object|null, sprites:Map, sheets:Array, partsProject:object|null, raw:object}>}
     */
    IO.loadFromFiles = async (files) => {
        const all = await expandFiles(files);
        if (!all.length) throw new Error('No se recibieron archivos.');
        const { dir, list } = pickGroup(all);

        const missing = [];
        const pngs = list.filter(e => /\.png$/i.test(e.name));
        const jsons = list.filter(e => /\.json$/i.test(e.name));

        let anim = null, animRaw = null, partsProject = null;
        const spritemapJsons = [];

        for (const j of jsons) {
            const lower = j.name.toLowerCase();
            const data = U.parseJSON(await U.readText(j.blob), j.name);
            if (lower === 'animation.json' || data.AN || data.ANIMATION) {
                if (!anim) { animRaw = data; anim = Atlas.normalizeAnimation(data); }
            } else if (data.ATLAS || data.atlas) {
                spritemapJsons.push({ entry: j, data });
            } else if (data.format === 'fnf-packer-bta') {
                partsProject = data;
            }
        }

        if (!spritemapJsons.length) missing.push('spritemap1.json');
        if (!pngs.length) missing.push('spritemap1.png');
        if (missing.length) {
            const err = new Error('Falta: ' + missing.join(' y ') + '. Puedes agregarlo ahora y se juntará con lo que ya elegiste.');
            err.missing = missing;
            throw err;
        }

        spritemapJsons.sort((a, b) => U.naturalSort(a.entry.name, b.entry.name));

        const sprites = new Map();
        const sheets = [];
        for (const sj of spritemapJsons) {
            const parsed = Atlas.parseSpritemap(sj.data);
            const wanted = (parsed.image || U.stripExt(sj.entry.name) + '.png').toLowerCase();
            let png = pngs.find(p => p.name.toLowerCase() === wanted)
                || pngs.find(p => U.stripExt(p.name).toLowerCase() === U.stripExt(sj.entry.name).toLowerCase())
                || (spritemapJsons.length === 1 ? pngs[0] : null);
            if (!png) throw new Error(`No encontré la imagen ${parsed.image || ''} para ${sj.entry.name}.`);
            const img = await U.blobToImage(png.blob);
            const sheet = { name: png.name, jsonName: sj.entry.name, img, sprites: parsed.sprites, blob: png.blob, json: sj.data };
            sheets.push(sheet);
            parsed.sprites.forEach(s => sprites.set(s.name, Object.assign({}, s, { sheet })));
        }

        const folderName = dir ? U.baseName(dir) : (files[0] ? U.stripExt(files[0].name) : 'spritemap');
        return {
            name: anim?.AN?.N || folderName || 'spritemap',
            anim, animRaw, sprites, sheets, partsProject, sidecar: partsProject,
            hasAnimation: !!anim
        };
    };

    /* Recorta un sprite del atlas a un canvas (des-rota si "rotated") */
    IO.spriteCanvas = (sprite) => {
        if (sprite._canvas) return sprite._canvas;
        const img = sprite.sheet.img;
        let c;
        if (!sprite.rotated) {
            c = U.makeCanvas(sprite.w, sprite.h);
            c.getContext('2d').drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
        } else {
            // Animate guarda los sprites rotados 90° en sentido horario
            c = U.makeCanvas(sprite.h, sprite.w);
            const ctx = c.getContext('2d');
            ctx.translate(0, sprite.w);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
        }
        sprite._canvas = c;
        return c;
    };

    F.IO = IO;
})(window.FNF);

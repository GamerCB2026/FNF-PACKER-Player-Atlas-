/* ==========================================================
   FNF Packer — "Agregar Spritemap"
   Carga un spritemap existente, muestra sus partes (sprites),
   símbolos y animaciones, lo reproduce y permite pasarlo al
   Generador (editar / fusionar) o al editor por partes.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, M, IO, Atlas, AtlasRenderer } = F;
    const $ = U.$;

    const state = { atlas: null, renderer: null, labels: [], range: { start: 0, length: 1 }, frame: 0, playing: true, last: 0 };

    let pending = [];
    async function load(files) {
        const all = pending.concat(Array.from(files));
        try {
            const atlas = await IO.loadFromFiles(all);
            pending = [];
            state.atlas = atlas;
            state.renderer = new AtlasRenderer(atlas);
            state.labels = state.renderer.labels();
            state.frame = 0;
            fillUI();
            U.toast(`Spritemap "${atlas.name}" cargado.`, 'ok');
        } catch (err) {
            if (err.missing) { pending = all; U.toast(err.message, 'warn', 7000); return; }
            pending = [];
            console.error(err);
            U.toast(err.message, 'error', 6000);
        }
    }

    function fps() { return +(state.atlas?.anim?.MD?.FRT) || 24; }

    function fillUI() {
        const a = state.atlas, r = state.renderer;
        $('#atlasEmpty').hidden = !!a;
        $('#atlasInfoCard').hidden = !a;
        if (!a) {
            $('#atlasSprites').innerHTML = '';
            $('#atlasSymbols').innerHTML = '';
            $('#atlasLabels').innerHTML = '';
            $('#atlasAnimSelect').innerHTML = '';
            return;
        }
        const sti = Atlas.readStiOffset(a.anim);
        const info = [
            ['Nombre', a.anim?.AN?.N || a.name],
            ['Símbolo', a.anim?.AN?.SN || a.anim?.AN?.STI?.SI?.SN || '—'],
            ['Formato', a.anim ? (Atlas.detectFormat(a.anim) === 'v-slice' ? 'V-Slice (MX)' : 'P-Slice (M3D)') : 'Sin Animation.json'],
            ['FPS', fps()],
            ['Frames', r.length],
            ['Animaciones', state.labels.length],
            ['Sprites', a.sprites.size],
            ['Símbolos', a.anim?.SD?.S?.length || 0],
            ['Offset STI', `${sti.x}, ${sti.y}`],
            ['Imagen', a.sheets.map(s => `${s.name} (${s.img.width}×${s.img.height})`).join(', ')]
        ];
        if (a.anim?.SD?.S?.length) info.push(['Hecho por partes', 'Sí (símbolos por pieza)']);
        $('#atlasInfo').innerHTML = info.map(([k, v]) => `<dt>${U.esc(k)}</dt><dd>${U.esc(v)}</dd>`).join('');
        $('#atlasPartsBtn').hidden = !a.anim;

        // Partes (sprites)
        const grid = $('#atlasSprites');
        grid.innerHTML = '';
        a.sprites.forEach(sp => {
            const c = IO.spriteCanvas(sp);
            const cell = document.createElement('div');
            cell.className = 'thumb';
            cell.innerHTML = `<div class="thumb-img"></div><div class="thumb-cap"><b>${U.esc(sp.name)}</b><span class="mono">${c.width}×${c.height}</span></div>`;
            const img = new Image();
            img.src = c.toDataURL();
            img.alt = sp.name;
            cell.firstChild.appendChild(img);
            grid.appendChild(cell);
        });

        // Símbolos
        const syms = a.anim?.SD?.S || [];
        $('#atlasSymbols').innerHTML = syms.length
            ? syms.map(s => `<li><b>${U.esc(s.SN)}</b><span class="muted">${(s.TL?.L || []).length} capa(s) · ${AtlasRenderer.timelineLength(s.TL)} frame(s)</span></li>`).join('')
            : '<li class="muted">Este Animation.json no usa símbolos internos (cada frame es un sprite).</li>';

        // Animaciones
        $('#atlasLabels').innerHTML = state.labels.length
            ? state.labels.map((l, i) => `<li class="clickable" data-i="${i}"><b>${U.esc(l.name)}</b><span class="muted">frames ${l.start}–${l.start + l.length - 1} · ${l.length} frame(s)</span></li>`).join('')
            : '<li class="muted">Sin etiquetas: se reproduce toda la línea de tiempo.</li>';

        const sel = $('#atlasAnimSelect');
        sel.innerHTML = `<option value="-1">Toda la línea de tiempo</option>` + state.labels.map((l, i) => `<option value="${i}">${U.esc(l.name)}</option>`).join('');
        selectRange(-1);
    }

    function selectRange(i) {
        const r = state.renderer;
        if (!r) return;
        state.range = i >= 0 && state.labels[i] ? { start: state.labels[i].start, length: state.labels[i].length } : { start: 0, length: r.length };
        state.frame = 0;
        state.fitBounds = r.unionBounds(state.range.start, state.range.length);
        $('#atlasAnimSelect').value = String(i);
        const scrub = $('#atlasScrub');
        scrub.max = Math.max(0, state.range.length - 1);
        scrub.value = 0;
    }

    function draw(ts) {
        requestAnimationFrame(draw);
        const canvas = $('#atlasPreview');
        if (!canvas.offsetParent) return;
        const { w, h, dpr } = U.fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        U.drawChecker(ctx, canvas.width, canvas.height, 12 * dpr);
        const r = state.renderer;
        if (!r) return;
        if (state.playing && ts - state.last >= 1000 / fps()) {
            state.frame = (state.frame + 1) % state.range.length;
            state.last = ts;
            $('#atlasScrub').value = state.frame;
        }
        const b = state.fitBounds || { x: 0, y: 0, w: 100, h: 100 };
        const s = Math.min((w - 24) / Math.max(1, b.w), (h - 24) / Math.max(1, b.h), 4);
        const view = [dpr * s, 0, 0, dpr * s, dpr * ((w - b.w * s) / 2 - b.x * s), dpr * ((h - b.h * s) / 2 - b.y * s)];
        ctx.imageSmoothingEnabled = s < 1;
        r.draw(ctx, state.range.start + state.frame, view);
        $('#atlasFrameInfo').textContent = `${state.range.start + state.frame} · ${state.frame + 1}/${state.range.length}`;
    }

    /* Convierte la línea de tiempo en frames editables para el Generador */
    async function toFrames() {
        const r = state.renderer, a = state.atlas;
        const labelAt = (i) => { const l = state.labels.find(l => i >= l.start && i < l.start + l.length); return l ? l.name : 'idle'; };
        const out = [];
        const union = r.unionBounds();
        const ub = union ? { x: Math.floor(union.x), y: Math.floor(union.y) } : { x: 0, y: 0 };
        if (union) { ub.w = Math.ceil(union.x + union.w) - ub.x; ub.h = Math.ceil(union.y + union.h) - ub.y; }
        const cache = new Map();
        for (let i = 0; i < r.length; i++) {
            const simple = r.simpleFrame(i);
            let img, ox = 0, oy = 0, label;
            if (simple) {
                const key = simple.sprite.name;
                if (!cache.has(key)) cache.set(key, await U.canvasToImage(IO.spriteCanvas(simple.sprite)));
                img = cache.get(key);
                ox = simple.x; oy = simple.y;
                label = `${a.name} · ${key}`;
            } else {
                const fb = r.bounds(i);
                if (!fb || !union) continue;
                img = await U.canvasToImage(r.bakeFrame(i, ub));
                ox = ub.x; oy = ub.y;
                label = `${a.name} · frame ${i}`;
            }
            out.push({ img, ox, oy, label, anim: labelAt(i) });
        }
        return out;
    }

    async function sendToGenerator(replace) {
        if (!state.atlas) return;
        const btns = ['#atlasEditBtn', '#atlasMergeBtn'].map(s => $(s));
        btns.forEach(b => b.disabled = true);
        try {
            const frames = await toFrames();
            if (replace) {
                const an = state.atlas.anim;
                const sti = Atlas.readStiOffset(an);
                F.Frames.setSettings({
                    charName: an?.AN?.N || state.atlas.name,
                    symName: an?.AN?.SN || an?.AN?.STI?.SI?.SN,
                    fps: fps(),
                    format: an ? Atlas.detectFormat(an) : undefined,
                    offX: sti.x, offY: sti.y
                });
            }
            F.Frames.importFrames(frames, { replace, anims: state.labels.map(l => l.name) });
            U.toast(`${frames.length} frame(s) ${replace ? 'cargados en' : 'fusionados con'} el Generador.`, 'ok');
            location.hash = '#generador';
        } catch (err) {
            console.error(err);
            U.toast('No se pudo convertir: ' + err.message, 'error');
        } finally {
            btns.forEach(b => b.disabled = false);
        }
    }

    function init() {
        const onFiles = async (files) => { await load(files); };
        $('#atlasInput').addEventListener('change', async e => { await onFiles(e.target.files); e.target.value = ''; });
        $('#atlasFolderInput').addEventListener('change', async e => { await onFiles(e.target.files); e.target.value = ''; });
        U.makeDropZone($('#atlasDrop'), onFiles);
        $('#atlasAnimSelect').addEventListener('change', e => selectRange(+e.target.value));
        $('#atlasScrub').addEventListener('input', e => { state.playing = false; $('#atlasPlay').textContent = '▶'; state.frame = +e.target.value; });
        $('#atlasPlay').addEventListener('click', e => { state.playing = !state.playing; e.currentTarget.textContent = state.playing ? '❚❚' : '▶'; });
        $('#atlasPlay').textContent = '❚❚';
        $('#atlasLabels').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) selectRange(+li.dataset.i); });
        $('#atlasSubtabs').addEventListener('click', e => {
            const b = e.target.closest('.subtab'); if (!b) return;
            U.$$('.subtab', $('#atlasSubtabs')).forEach(x => x.classList.toggle('active', x === b));
            ['sprites', 'symbols', 'labels'].forEach(p => $('#pane-' + p).hidden = p !== b.dataset.pane);
        });
        $('#atlasEditBtn').addEventListener('click', () => sendToGenerator(true));
        $('#atlasMergeBtn').addEventListener('click', () => sendToGenerator(false));
        $('#atlasPartsBtn').addEventListener('click', () => {
            if (!state.atlas?.anim) return;
            try { F.Parts.openFromAtlas(state.atlas); location.hash = '#partes'; }
            catch (err) { console.error(err); U.toast(err.message, 'error', 6000); }
        });
        $('#atlasClearBtn').addEventListener('click', () => { state.atlas = null; state.renderer = null; state.labels = []; fillUI(); });
        fillUI();
        requestAnimationFrame(draw);
    }

    F.Loader = { init, load, state };
})(window.FNF);

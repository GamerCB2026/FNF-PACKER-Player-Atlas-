/* ==========================================================
   FNF Packer — "Crear Spritemaps" (Generador por frames)
   Mantiene la salida de la v2.0.0: cada frame = un sprite con
   nombre de índice, capa "Labels" con animaciones consecutivas
   y capa "Sprites" con una instancia ASI por frame.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, Atlas, Packer } = F;
    const $ = U.$;

    const DEFAULT_ANIMS = ["idle", "confirm", "select", "deselect", "slidein", "slideout", "slidein idle point", "deselect loop start"];

    const state = {
        frames: [],              // {id, img, label, anim, ox, oy}
        anims: DEFAULT_ANIMS.slice(),
        selected: new Set(),
        dragId: null,
        preview: { anim: '__all__', playing: true, idx: 0, last: 0 }
    };

    /* ---------------- Utilidades ---------------- */
    const firstAnim = () => state.anims[0] || 'idle';

    function normalizeFrames() {
        state.frames.forEach(f => { if (!f.anim || !state.anims.includes(f.anim)) f.anim = state.anims.includes('idle') ? 'idle' : firstAnim(); });
    }

    function settings() {
        return {
            charName: $('#charName').value,
            symName: $('#symName').value,
            fps: parseFloat($('#fps').value) || 24,
            format: $('#formatMode').value,
            offX: parseFloat($('#stiX').value) || 0.0,
            offY: parseFloat($('#stiY').value) || 0.0
        };
    }

    function setSettings(s) {
        if (s.charName != null) $('#charName').value = s.charName;
        if (s.symName != null) $('#symName').value = s.symName;
        if (s.fps != null) $('#fps').value = s.fps;
        if (s.format) $('#formatMode').value = s.format;
        if (s.offX != null) $('#stiX').value = s.offX;
        if (s.offY != null) $('#stiY').value = s.offY;
    }

    function setStatus(msg) { $('#status').innerText = msg; }

    /* ---------------- Animaciones ---------------- */
    function renderAnimUI() {
        const counts = {};
        state.frames.forEach(f => counts[f.anim] = (counts[f.anim] || 0) + 1);

        $('#animList').innerHTML = state.anims.map((a, i) => `
            <li data-anim="${U.esc(a)}">
                <span class="anim-name">${U.esc(a)}</span>
                <span class="badge">${counts[a] || 0}</span>
                <button class="mini" data-act="rename" data-i="${i}" title="Renombrar">✎</button>
                <button class="mini mini-danger" data-act="delete" data-i="${i}" title="Eliminar">✕</button>
            </li>`).join('');

        const bulk = $('#bulkAnimSelect');
        const cur = bulk.value || 'idle';
        bulk.innerHTML = state.anims.map(a => `<option value="${U.esc(a)}">${U.esc(a)}</option>`).join('');
        if (state.anims.includes(cur)) bulk.value = cur;

        const pv = $('#genPreviewAnim');
        const used = state.anims.filter(a => counts[a]);
        pv.innerHTML = `<option value="__all__">Todos los frames</option>` + used.map(a => `<option value="${U.esc(a)}">${U.esc(a)}</option>`).join('');
        if (state.preview.anim !== '__all__' && used.includes(state.preview.anim)) pv.value = state.preview.anim;
        else { state.preview.anim = '__all__'; pv.value = '__all__'; }
    }

    function addNewAnimation() {
        const input = $('#newAnimName');
        const name = input.value.trim();
        if (name === "") return U.toast("Escribe un nombre para la animación.", 'warn');
        if (state.anims.includes(name)) return U.toast("Esa animación ya existe en la lista.", 'warn');
        state.anims.push(name);
        input.value = "";
        renderAll();
        setStatus(`Animación "${name}" añadida.`);
    }

    function renameAnim(i) {
        const old = state.anims[i];
        const name = U.ask(`Nuevo nombre para "${old}":`, old);
        if (!name || name === old) return;
        if (state.anims.includes(name)) return U.toast('Ya existe una animación con ese nombre.', 'warn');
        state.anims[i] = name;
        state.frames.forEach(f => { if (f.anim === old) f.anim = name; });
        renderAll();
    }

    function deleteAnim(i) {
        if (state.anims.length <= 1) return U.toast('Debe quedar al menos una animación.', 'warn');
        const name = state.anims[i];
        const using = state.frames.filter(f => f.anim === name).length;
        if (using && !confirm(`"${name}" tiene ${using} frame(s). ¿Eliminar la animación? Esos frames pasarán a "${state.anims.find(a => a !== name)}".`)) return;
        state.anims.splice(i, 1);
        normalizeFrames();
        renderAll();
    }

    /* ---------------- Lista de frames ---------------- */
    function renderFrameList() {
        const list = $('#frameList');
        if (state.frames.length === 0) {
            list.innerHTML = '<div class="empty-list">Todavía no hay frames. Carga tus PNG o usa <a href="#agregar">Agregar Spritemap</a> para editar uno existente.</div>';
            $('#genBtn').disabled = true;
            setStatus('Esperando archivos…');
            updateSelCount();
            return;
        }
        const opts = (sel) => state.anims.map(a => `<option value="${U.esc(a)}" ${sel === a ? 'selected' : ''}>${U.esc(a)}</option>`).join('');
        list.innerHTML = state.frames.map((f, idx) => `
            <div class="frame-item ${state.selected.has(f.id) ? 'is-selected' : ''}" draggable="true" data-id="${f.id}">
                <label class="frame-check"><input type="checkbox" class="frame-cb" data-id="${f.id}" ${state.selected.has(f.id) ? 'checked' : ''}><span class="mono">#${idx}</span></label>
                <div class="frame-thumb" data-act="toggle"><img src="${f.img.src}" alt="" loading="lazy" draggable="false"></div>
                <div class="frame-meta" title="${U.esc(f.label)}">${U.esc(f.label)}<span class="mono">${f.img.width}×${f.img.height}${(f.ox || f.oy) ? ` · (${f.ox}, ${f.oy})` : ''}</span></div>
                <select class="frame-anim-select" data-id="${f.id}">${opts(f.anim)}</select>
                <button type="button" class="remove-frame-btn" data-id="${f.id}" title="Eliminar imagen">✕</button>
            </div>`).join('');
        $('#genBtn').disabled = false;
        setStatus(`Total de imágenes cargadas: ${state.frames.length}`);
        updateSelCount();
    }

    function updateSelCount() {
        const n = state.selected.size;
        $('#selCount').textContent = n ? `${n} seleccionado(s)` : '';
    }

    function renderAll() {
        normalizeFrames();
        renderAnimUI();
        renderFrameList();
        state.preview.idx = 0;
    }

    async function handleFilesLoad(fileList) {
        const files = Array.from(fileList).filter(f => /image\/png|\.png$/i.test(f.type || f.name))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!files.length) return U.toast('Solo se aceptan imágenes PNG.', 'warn');
        setStatus(`Cargando ${files.length} imagen(es)…`);
        for (const file of files) {
            const img = await U.blobToImage(file);
            state.frames.push({ id: U.uid('f'), img, label: file.name, anim: 'idle', ox: 0, oy: 0 });
        }
        renderAll();
        U.toast(`${files.length} imagen(es) agregadas.`, 'ok');
    }

    function selectedIndices() {
        return state.frames.map((f, i) => state.selected.has(f.id) ? i : -1).filter(i => i >= 0);
    }

    function moveSelected(dir) {
        const idxs = selectedIndices();
        if (!idxs.length) return U.toast('Selecciona primero los frames.', 'warn');
        const order = dir < 0 ? idxs : idxs.slice().reverse();
        for (const i of order) {
            const j = i + dir;
            if (j < 0 || j >= state.frames.length || state.selected.has(state.frames[j].id)) continue;
            [state.frames[i], state.frames[j]] = [state.frames[j], state.frames[i]];
        }
        renderFrameList();
    }

    function duplicateSelected() {
        const idxs = selectedIndices();
        if (!idxs.length) return U.toast('Selecciona primero los frames.', 'warn');
        const copies = idxs.map(i => Object.assign({}, state.frames[i], { id: U.uid('f') }));
        const at = idxs[idxs.length - 1] + 1;
        state.frames.splice(at, 0, ...copies);
        renderAll();
    }

    function removeSelected() {
        if (!state.selected.size) return U.toast("Selecciona primero los cuadros.", 'warn');
        state.frames = state.frames.filter(f => !state.selected.has(f.id));
        state.selected.clear();
        renderAll();
    }

    function applyBulk() {
        const val = $('#bulkAnimSelect').value;
        if (!state.selected.size) return U.toast("Selecciona primero los cuadros.", 'warn');
        state.frames.forEach(f => { if (state.selected.has(f.id)) f.anim = val; });
        renderAll();
    }

    function setupListEvents() {
        const list = $('#frameList');
        list.addEventListener('change', e => {
            const id = e.target.dataset.id;
            if (e.target.classList.contains('frame-anim-select')) {
                const f = state.frames.find(x => x.id === id);
                if (f) { f.anim = e.target.value; renderAnimUI(); }
            } else if (e.target.classList.contains('frame-cb')) {
                e.target.checked ? state.selected.add(id) : state.selected.delete(id);
                e.target.closest('.frame-item').classList.toggle('is-selected', e.target.checked);
                updateSelCount();
            }
        });
        list.addEventListener('click', e => {
            const rm = e.target.closest('.remove-frame-btn');
            if (rm) {
                state.frames = state.frames.filter(f => f.id !== rm.dataset.id);
                state.selected.delete(rm.dataset.id);
                renderAll();
                return;
            }
            const th = e.target.closest('[data-act="toggle"]');
            if (th) {
                const cb = th.parentElement.querySelector('.frame-cb');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        list.addEventListener('dragstart', e => {
            const it = e.target.closest('.frame-item');
            if (!it) return;
            state.dragId = it.dataset.id;
            it.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', state.dragId);
        });
        list.addEventListener('dragend', e => {
            const it = e.target.closest('.frame-item');
            if (it) it.classList.remove('is-dragging');
            U.$$('.frame-item.drop-before', list).forEach(x => x.classList.remove('drop-before'));
            state.dragId = null;
        });
        list.addEventListener('dragover', e => {
            if (!state.dragId) return;
            e.preventDefault();
            const it = e.target.closest('.frame-item');
            U.$$('.frame-item.drop-before', list).forEach(x => x.classList.remove('drop-before'));
            if (it && it.dataset.id !== state.dragId) it.classList.add('drop-before');
        });
        list.addEventListener('drop', e => {
            if (!state.dragId) return;
            e.preventDefault();
            const it = e.target.closest('.frame-item');
            const from = state.frames.findIndex(f => f.id === state.dragId);
            if (from < 0) return;
            const [moved] = state.frames.splice(from, 1);
            let to = it ? state.frames.findIndex(f => f.id === it.dataset.id) : state.frames.length;
            if (to < 0) to = state.frames.length;
            state.frames.splice(to, 0, moved);
            state.dragId = null;
            renderFrameList();
        });
    }

    /* ---------------- Vista previa ---------------- */
    function previewFrames() {
        return state.preview.anim === '__all__' ? state.frames : state.frames.filter(f => f.anim === state.preview.anim);
    }

    function drawPreview(ts) {
        requestAnimationFrame(drawPreview);
        const canvas = $('#genPreview');
        if (!canvas.offsetParent) return;
        const { w, h, dpr } = U.fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        U.drawChecker(ctx, canvas.width, canvas.height, 10 * dpr);
        const list = previewFrames();
        const info = $('#genFrameInfo');
        if (!list.length) { info.textContent = '0 / 0'; return; }

        const fps = parseFloat($('#fps').value) || 24;
        if (state.preview.playing && ts - state.preview.last >= 1000 / fps) {
            state.preview.idx = (state.preview.idx + 1) % list.length;
            state.preview.last = ts;
        }
        if (state.preview.idx >= list.length) state.preview.idx = 0;

        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        list.forEach(f => { x0 = Math.min(x0, f.ox); y0 = Math.min(y0, f.oy); x1 = Math.max(x1, f.ox + f.img.width); y1 = Math.max(y1, f.oy + f.img.height); });
        const bw = x1 - x0, bh = y1 - y0;
        const s = Math.min((w - 16) / bw, (h - 16) / bh, 4);
        const f = list[state.preview.idx];
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w - bw * s) / 2 - x0 * s * dpr, dpr * (h - bh * s) / 2 - y0 * s * dpr);
        ctx.imageSmoothingEnabled = s < 1;
        ctx.drawImage(f.img, f.ox, f.oy);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        info.textContent = `${state.preview.idx + 1} / ${list.length}`;
    }

    /* ---------------- Exportación (idéntica a v2.0.0) ---------------- */
    async function buildPack() {
        const s = settings();
        const items = state.frames.map(f => ({ img: f.img }));
        const packed = Packer.pack(items, { padding: 2, dedupe: true });
        const names = state.frames.map((f, i) => i.toString());

        const spriteInstances = state.frames.map((f, i) => ({
            "I": i, "DU": 1,
            "E": [{ "ASI": { "N": names[i], "M3D": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, f.ox || 0, f.oy || 0, 0, 1] } }]
        }));
        const layerFrames = Atlas.buildLabels(state.frames.map(f => f.anim || 'idle'));

        const animationJson = {
            "AN": {
                "N": s.charName,
                "STI": Atlas.buildSTI(s.symName, s.format, s.offX, s.offY),
                "SN": s.symName,
                "TL": { "L": [{ "LN": "Labels", "FR": layerFrames }, { "LN": "Sprites", "FR": spriteInstances }] }
            },
            "MD": Atlas.buildMD(s.fps)
        };
        const spritemapJson = Atlas.buildSpritemapJson(
            state.frames.map((f, i) => ({ name: names[i], x: packed.rects[i].x, y: packed.rects[i].y, w: f.img.width, h: f.img.height })),
            packed.canvas.width, packed.canvas.height);

        return { s, packed, animationJson, spritemapJson };
    }

    async function processAll() {
        if (!state.frames.length) return;
        setStatus("Procesando atlas y JSONs (optimizando imágenes duplicadas)…");
        $('#genBtn').disabled = true;
        try {
            const { s, packed, animationJson, spritemapJson } = await buildPack();
            if (packed.canvas.width > Packer.MAX_SIZE || packed.canvas.height > Packer.MAX_SIZE)
                U.toast(`Atención: el atlas mide ${packed.canvas.width}×${packed.canvas.height}px, algunos dispositivos no cargan más de 8192px.`, 'warn', 6000);

            const zip = new JSZip();
            const folder = zip.folder(s.charName);
            folder.file("Animation.json", JSON.stringify(animationJson, null, 2));
            folder.file("spritemap1.json", JSON.stringify(spritemapJson, null, 2));
            folder.file("spritemap1.png", await U.canvasToBlob(packed.canvas));
            const content = await zip.generateAsync({ type: "blob" });
            const fileName = s.format === 'v-slice' ? `${s.charName}_Vslice_Pack.zip` : `${s.charName}_Pslice_Pack.zip`;
            U.downloadBlob(content, fileName);
            const saved = state.frames.length - packed.uniqueCount;
            setStatus(`¡ZIP generado con éxito! Se mapearon ${state.frames.length} frames y se ahorró el espacio de ${saved} imagen(es) repetida(s) en el PNG.`);
            U.toast(`Descargando ${fileName}`, 'ok');
        } catch (err) {
            console.error(err);
            setStatus('Error al generar: ' + err.message);
            U.toast('Error al generar el pack.', 'error');
        } finally {
            $('#genBtn').disabled = state.frames.length === 0;
        }
    }

    /* ---------------- API pública (usada por "Agregar Spritemap") ---------------- */
    const api = {
        state,
        settings, setSettings,
        /** frames: [{img, label, anim, ox, oy}] */
        importFrames(frames, { replace = false, anims = [] } = {}) {
            if (replace) { state.frames = []; state.selected.clear(); }
            anims.forEach(a => { if (!state.anims.includes(a)) state.anims.push(a); });
            frames.forEach(f => {
                if (!state.anims.includes(f.anim)) state.anims.push(f.anim);
                state.frames.push({ id: U.uid('f'), img: f.img, label: f.label, anim: f.anim, ox: f.ox || 0, oy: f.oy || 0 });
            });
            renderAll();
        },
        buildPack,
        render: renderAll
    };

    function init() {
        $('#addAnimBtn').addEventListener('click', addNewAnimation);
        $('#newAnimName').addEventListener('keydown', e => { if (e.key === 'Enter') addNewAnimation(); });
        $('#animList').addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            const i = +b.dataset.i;
            b.dataset.act === 'rename' ? renameAnim(i) : deleteAnim(i);
        });
        $('#fileInput').addEventListener('change', async e => { await handleFilesLoad(e.target.files); e.target.value = ""; });
        U.makeDropZone($('#framesDrop'), handleFilesLoad);
        $('#selectAllBtn').addEventListener('click', () => { state.frames.forEach(f => state.selected.add(f.id)); renderFrameList(); });
        $('#deselectAllBtn').addEventListener('click', () => { state.selected.clear(); renderFrameList(); });
        $('#applyBulkBtn').addEventListener('click', applyBulk);
        $('#removeSelectedBtn').addEventListener('click', removeSelected);
        $('#moveUpBtn').addEventListener('click', () => moveSelected(-1));
        $('#moveDownBtn').addEventListener('click', () => moveSelected(1));
        $('#duplicateBtn').addEventListener('click', duplicateSelected);
        $('#genBtn').addEventListener('click', processAll);
        $('#genPreviewAnim').addEventListener('change', e => { state.preview.anim = e.target.value; state.preview.idx = 0; });
        $('#genPlay').addEventListener('click', e => {
            state.preview.playing = !state.preview.playing;
            e.currentTarget.textContent = state.preview.playing ? '❚❚' : '▶';
        });
        $('#genPlay').textContent = '❚❚';
        setupListEvents();
        renderAll();
        requestAnimationFrame(drawPreview);
    }

    F.Frames = api;
    F.Frames.init = init;
})(window.FNF);

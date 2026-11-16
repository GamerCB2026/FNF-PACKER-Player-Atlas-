/* ==========================================================
   FNF Packer — "Crear Spritemaps en Partes" (interfaz)
   Pensado primero para celular: lienzo táctil (1 dedo usa la
   herramienta, 2 dedos pellizcan/giran), hojas inferiores y
   línea de tiempo deslizable. En escritorio los paneles van
   en una columna lateral.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, M, IO, Atlas } = F;
    const Doc = F.PartsDoc;
    const $ = U.$;

    const coarse = () => window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
    const TLD = () => coarse() ? { nameW: 92, rowH: 38, headH: 26, fw: 26 } : { nameW: 150, rowH: 26, headH: 24, fw: 18 };

    const st = {
        doc: Doc.create('personaje'),
        animIdx: 0, frame: 0,
        li: -1, ei: -1,
        tool: 'move', gesture: 'view', onion: false,
        view: { x: 0, y: 60, zoom: 1 },
        playing: false, last: 0,
        undo: [], redo: [],
        pointers: new Map(), drag: null, pinch: null,
        clipboard: null, dirty: true,
        hit: new WeakMap(), pending: [], sheet: null,
        scope: null, anc: [], picked: new Set(),
        ctxLost: false, wasHidden: false, lastTap: null
    };
    const doc = () => st.doc;

    /* ---------------- Utilidades ---------------- */
    const labels = () => Doc.labels(doc());
    const curLabel = () => { const L = labels(); return L[Math.min(st.animIdx, L.length - 1)] || { name: '—', start: 0, length: 1 }; };
    const range = () => { const l = curLabel(); return [l.start, l.start + l.length]; };
    const labelLi = () => Doc.labelLayerIndex(doc());
    /* Spritemaps importados a veces guardan etiquetas Y piezas en la misma capa: esa capa se muestra/edita. */
    const labelHasContent = () => { const l = Doc.layers(doc())[labelLi()]; return !!l && (l.FR || []).some(fr => (fr.E || []).length); };
    const hideLabelRow = (i) => i === labelLi() && !labelHasContent();
    const markDirty = () => { st.dirty = true; };

    /* ---- selección de capa (principal o sub-capa de un grupo) ---- */
    const curLayer = () => {
        if (st.li < 0) return null;
        const L = Doc.layerList(doc(), st.scope || null);
        return L[st.li] || null;
    };
    const parentM = () => {
        if (!st.anc || !st.anc.length) return null;
        let m = M.identity(), tl = Doc.layers(doc()), frame = st.frame;
        for (const a of st.anc) {
            const ev = Doc.evalOn(doc(), tl[a.li], frame, { hold: true });
            const el = (ev.E || [])[a.ei] || (ev.E || []).find(e => e.SI && e.SI.SN === a.childSn);
            if (!el) return m;
            const mm = Doc.getM(el);
            if (mm && mm.every(Number.isFinite)) m = M.multiply(m, mm);
            const s = Doc.symbol(doc(), a.childSn);
            const symTL = s && s.TL;
            frame = Doc.graphicFrame(el.SI, ev.local, symTL);
            tl = symTL ? (symTL.L || []) : [];
        }
        return m.every(Number.isFinite) ? m : M.identity();
    };
    const selProps = (el) => Doc.propsIn(doc(), el, parentM());
    const selApply = (el, pr) => Doc.applyPropsIn(doc(), el, pr, parentM());
    const rowKey = (row) => `${row.scope || ''}:${row.anc.map(a => a.li).join('.')}:${row.li}`;
    function layerRows() {
        const rows = [];
        const walk = (L, skipLabel, depth, scope, anc) => {
            L.forEach((l, i) => {
                if (skipLabel && hideLabelRow(i)) return;
                const gsn = Doc.groupSN(doc(), l);
                const row = { li: i, layer: l, depth, scope, anc: anc.slice(), gsn, key: `${scope || ''}:${anc.map(a => a.li).join('.')}:${i}` };
                rows.push(row);
                if (gsn && l._open) {
                    const ev = Doc.evalOn(doc(), l, st.frame, { hold: true });
                    const ei = Math.max(0, (ev.E || []).findIndex(e => e.SI && e.SI.SN === gsn));
                    walk(Doc.layerList(doc(), gsn), false, depth + 1, gsn, anc.concat([{ li: i, ei, childSn: gsn, open: true }]));
                }
            });
        };
        walk(Doc.layers(doc()), true, 0, null, []);
        return rows;
    }
    function selectRow(row, extraPick, additive) {
        if (!row) { st.li = -1; st.ei = -1; st.scope = null; st.anc = []; return; }
        st.li = row.li;
        st.scope = row.scope || null;
        st.anc = row.anc ? row.anc.slice() : [];
        const ev = Doc.evalOn(doc(), row.layer, st.frame);
        st.ei = ev.E.length ? Math.min(Math.max(st.ei, 0), ev.E.length - 1) : -1;
        if (!additive) st.picked = new Set();
        st.picked.add(row.key);
        if (extraPick) extraPick.forEach(k => st.picked.add(k));
        renderLayers(); renderInspector(); renderTimeline(); renderKeybar(); markDirty();
    }
    function selectedRefs() {
        const rows = layerRows();
        const keys = st.picked.size ? st.picked : new Set();
        let list = rows.filter(r => keys.has(r.key));
        if (!list.length && st.li >= 0) {
            const cur = rows.find(r => r.li === st.li && (r.scope || null) === (st.scope || null) && r.anc.length === (st.anc || []).length);
            if (cur) list = [cur];
        }
        return list;
    }

    function checkpoint() {
        st.undo.push(Doc.snapshot(doc()));
        if (st.undo.length > 80) st.undo.shift();
        st.redo = [];
        updateUndoBtns();
    }
    function undo() {
        if (!st.undo.length) return;
        st.redo.push(Doc.snapshot(doc()));
        Doc.restore(doc(), st.undo.pop());
        st.picked = new Set();
        refreshAll();
    }
    function redo() {
        if (!st.redo.length) return;
        st.undo.push(Doc.snapshot(doc()));
        Doc.restore(doc(), st.redo.pop());
        refreshAll();
    }
    function updateUndoBtns() { $('#undoBtn').disabled = !st.undo.length; $('#redoBtn').disabled = !st.redo.length; }

    /* Elemento seleccionado tal como se ve (puede estar interpolado) */
    function selView() {
        const layer = curLayer();
        if (!layer || st.li < 0 || st.ei < 0) return null;
        const ev = Doc.evalOn(doc(), layer, st.frame);
        return ev.E[st.ei] || null;
    }
    /* Elemento seleccionado editable (crea keyframe si hace falta) */
    function selEdit() {
        if (!selView()) return null;
        const layer = curLayer();
        const fr = Doc.ensureKeyOn(doc(), layer, st.frame);
        return fr.E[st.ei] || null;
    }

    function setFrame(f) {
        const [a, b] = range();
        st.frame = U.clamp(Math.round(f), a, b - 1);
        refreshFrame();
    }

    function selectLayer(li, preferEl = true) {
        const rows = layerRows();
        const row = rows.find(r => !r.scope && r.li === li);
        if (row) { if (!preferEl) st.ei = -1; selectRow(row, null, false); }
        else { st.scope = null; st.anc = []; st.li = li; st.ei = preferEl ? st.ei : -1; renderLayers(); renderInspector(); renderTimeline(); markDirty(); }
    }

    /* ---------------- Render general ---------------- */
    function refreshFrame() {
        const [a, b] = range();
        $('#tlFrameInfo').textContent = `${st.frame - a + 1} / ${b - a}`;
        const sc = $('#tlScrub'); sc.min = a; sc.max = b - 1; sc.value = st.frame;
        if (st.li >= 0 && st.ei >= 0 && !selView()) {
            const ev = curLayer() ? Doc.evalOn(doc(), curLayer(), st.frame) : { E: [] };
            st.ei = ev.E.length ? 0 : -1;
        }
        renderInspector(); renderTimeline(); renderKeybar(); markDirty();
    }

    function refreshAll() {
        Doc.refresh(doc());
        const L = labels();
        if (st.animIdx >= L.length) st.animIdx = L.length - 1;
        if (st.scope && !Doc.symbol(doc(), st.scope)) { st.scope = null; st.anc = []; }
        const curL = Doc.layerList(doc(), st.scope || null);
        if (st.li >= curL.length) { st.li = -1; st.ei = -1; st.scope = null; st.anc = []; }
        $('#tlAnimSelect').innerHTML = L.map((l, i) => `<option value="${i}">${U.esc(l.name)} (${l.length})</option>`).join('');
        $('#tlAnimSelect').value = st.animIdx;
        const [a, b] = range();
        if (st.frame < a || st.frame >= b) st.frame = a;
        renderPieces(); renderLayers(); renderAnims(); refreshFrame(); updateUndoBtns(); renderStatus();
    }

    function renderStatus() {
        const d = doc();
        const has = d.anim.SD.S.length > 0 || Doc.layers(d).some(l => l.FR.some(f => (f.E || []).length));
        $('#partsEmpty').hidden = has;
        $('#partsExportBtn').disabled = !has;
        $('#partsStatus').textContent = has
            ? `${d.anim.SD.S.length} pieza(s) · ${Doc.layers(d).length - 1} capa(s) · ${labels().length} animación(es) · ${Doc.length(d)} frames`
            : 'Sin partes todavía.';
    }

    /* ---------------- Piezas ---------------- */
    function renderPieces() {
        const grid = $('#pieceGrid');
        grid.innerHTML = '';
        doc().anim.SD.S.forEach(s => {
            if (Doc.isGroupSymbol(doc(), s.SN)) return;
            const card = document.createElement('div');
            card.className = 'piece';
            card.dataset.sn = s.SN;
            const th = Doc.symbolThumb(doc(), s.SN, 120);
            th.className = 'piece-thumb';
            card.appendChild(th);
            card.insertAdjacentHTML('beforeend', `<div class="piece-cap"><span title="${U.esc(s.SN)}">${U.esc(s.SN)}</span>
                <button class="mini" data-act="ren" aria-label="Renombrar">✎</button><button class="mini mini-danger" data-act="del" aria-label="Eliminar">✕</button></div>`);
            grid.appendChild(card);
        });
        $('#piecesHint').hidden = !doc().anim.SD.S.length;
    }

    async function addPieceFiles(fileList) {
        const layeredAll = Array.from(fileList).filter(f => F.LayeredImport && F.LayeredImport.accepts(f));
        if (layeredAll.length > 1) return openLayeredMany(layeredAll);
        if (layeredAll.length) return openLayered(layeredAll[0]);
        const files = Array.from(fileList).filter(f => /^image\//.test(f.type) || /\.(png|webp|jpe?g|astc)$/i.test(f.name))
            .sort((a, b) => U.naturalSort(a.name, b.name));
        if (!files.length) return U.toast('Elige imágenes PNG o ASTC.', 'warn');
        checkpoint();
        const d = doc();
        const total = Doc.length(d);
        let k = d.anim.SD.S.length;
        for (const file of files) {
            const img = await U.blobToImage(file);
            const cv = U.makeCanvas(img.width, img.height);
            cv.getContext('2d').drawImage(img, 0, 0);
            const sn = Doc.addPiece(d, U.stripExt(file.name), cv);
            const layer = Doc.addLayer(d, Doc.uniqueLayerName(d, sn), labelLi() + 1);
            const x = (k % 4) * 70 - 105, y = -260 + Math.floor(k / 4) * 90;
            layer.FR.push({ I: 0, DU: total, E: [Doc.newInstance(d, sn, x, y)] });
            k++;
        }
        st.li = labelLi() + 1; st.ei = 0;
        refreshAll();
        st.needFit = true; markDirty();
        U.toast(`${files.length} pieza(s) agregadas, cada una en su capa.`, 'ok');
    }

    function piecesEvents() {
        $('#piecesInput').addEventListener('change', async e => { await addPieceFiles(e.target.files); e.target.value = ''; });
        U.makeDropZone($('#piecesDrop'), addPieceFiles);
        U.makeDropZone($('#stageWrap'), addPieceFiles);
        $('#pieceGrid').addEventListener('click', e => {
            const card = e.target.closest('.piece'); if (!card) return;
            const sn = card.dataset.sn;
            const act = e.target.closest('button[data-act]')?.dataset.act;
            if (act === 'ren') {
                const nn = U.ask('Nuevo nombre de la pieza:', sn);
                if (!nn || nn === sn) return;
                if (Doc.symbol(doc(), nn)) return U.toast('Ya existe una pieza con ese nombre.', 'warn');
                checkpoint(); Doc.renamePiece(doc(), sn, nn); refreshAll(); return;
            }
            if (act === 'del') {
                const used = Doc.symbolUsage(doc(), sn);
                if (!confirm(`¿Eliminar la pieza "${sn}"?${used ? ` Se quitará de ${used} keyframe(s).` : ''}`)) return;
                checkpoint(); Doc.removePiece(doc(), sn); refreshAll(); return;
            }
            // poner la pieza en la capa seleccionada (o en una nueva)
            checkpoint();
            const d = doc();
            let layer = curLayer();
            if (!layer || (!st.scope && hideLabelRow(st.li))) {
                st.scope = null; st.anc = [];
                Doc.addLayer(d, Doc.uniqueLayerName(d, sn), labelLi() + 1);
                st.li = labelLi() + 1;
                layer = Doc.layers(d)[st.li];
            }
            const fr = Doc.ensureKeyOn(d, layer, st.frame);
            const c = viewCenterWorld();
            const pm = parentM();
            const loc = pm ? M.apply(M.invert(pm), c[0], c[1]) : c;
            fr.E.push(Doc.newInstance(d, sn, loc[0], loc[1]));
            st.ei = fr.E.length - 1;
            refreshAll();
            closeSheet();
            U.toast(`"${sn}" agregada en la capa ${layer.LN}.`, 'ok');
        });
    }

    /* ---------------- Capas ---------------- */
    function renderLayers() {
        const rows = layerRows();
        const isSel = (r) => r.li === st.li && (r.scope || null) === (st.scope || null) && r.anc.length === (st.anc || []).length;
        $('#layerList').innerHTML = rows.map((r, idx) => {
            const L = Doc.layerList(doc(), r.scope || null);
            const first = r.scope ? 0 : labelLi() + 1;
            const last = L.length - 1;
            const picked = st.picked.has(r.key);
            const twist = r.gsn ? `<button class="mini layer-twisty" data-act="twisty" aria-label="${r.layer._open ? 'Contraer' : 'Expandir'}">${r.layer._open ? '▼' : '▶'}</button>` : `<span class="layer-twisty-ph"></span>`;
            return `
            <li class="layer-row ${isSel(r) ? 'is-selected' : ''} ${picked ? 'is-picked' : ''} ${r.layer._hidden ? 'is-hidden' : ''} ${r.gsn ? 'is-group' : ''} ${r.scope ? 'is-child' : ''}"
                data-key="${U.esc(r.key)}" data-idx="${idx}" style="--d:${r.depth}">
                ${twist}
                <button class="mini layer-pick" data-act="pick" aria-label="Seleccionar para agrupar" aria-pressed="${picked}">${picked ? '☑' : '☐'}</button>
                <span class="layer-name">${r.gsn ? '▣ ' : ''}${U.esc(r.layer.LN)}</span>
                <span class="layer-btns">
                    <button class="mini" data-act="up" aria-label="Subir" ${r.li <= first ? 'disabled' : ''}>▲</button>
                    <button class="mini" data-act="down" aria-label="Bajar" ${r.li >= last ? 'disabled' : ''}>▼</button>
                    <button class="mini" data-act="eye" aria-label="Ocultar en el lienzo">${r.layer._hidden ? '○' : '◉'}</button>
                    <button class="mini" data-act="ren" aria-label="Renombrar">✎</button>
                    <button class="mini mini-danger" data-act="del" aria-label="Eliminar">✕</button>
                </span>
            </li>`;
        }).join('');
    }

    function layersEvents() {
        const rowOf = (el) => {
            const node = el.closest('.layer-row'); if (!node) return null;
            return layerRows()[+node.dataset.idx] || layerRows().find(r => r.key === node.dataset.key);
        };
        $('#layerList').addEventListener('click', e => {
            const node = e.target.closest('.layer-row'); if (!node) return;
            const rows = layerRows();
            const row = rows[+node.dataset.idx] || rows.find(r => r.key === node.dataset.key);
            if (!row) return;
            const L = Doc.layerList(doc(), row.scope || null);
            const act = e.target.closest('button[data-act]')?.dataset.act;
            if (act === 'twisty') { row.layer._open = !row.layer._open; renderLayers(); renderTimeline(); return; }
            if (act === 'pick') {
                if (st.picked.has(row.key)) st.picked.delete(row.key); else st.picked.add(row.key);
                renderLayers(); return;
            }
            if (!act) {
                const additive = e.ctrlKey || e.metaKey || e.shiftKey;
                if (e.shiftKey && st.picked.size) {
                    const keys = [...st.picked];
                    const a = rows.findIndex(r => r.key === keys[keys.length - 1]);
                    const b = rows.indexOf(row);
                    if (a >= 0 && b >= 0) {
                        const [lo, hi] = a < b ? [a, b] : [b, a];
                        const same = rows[lo].scope === row.scope && rows[lo].anc.length === row.anc.length;
                        if (same) { for (let i = lo; i <= hi; i++) if (rows[i].scope === row.scope && rows[i].anc.length === row.anc.length) st.picked.add(rows[i].key); }
                    }
                }
                selectRow(row, null, additive);
                return;
            }
            if (act === 'eye') { row.layer._hidden = !row.layer._hidden; renderLayers(); markDirty(); return; }
            if (act === 'ren') {
                const n = U.ask('Nombre de la capa:', row.layer.LN); if (!n) return;
                checkpoint();
                row.layer.LN = n;
                if (row.gsn && n !== row.gsn) {
                    const dest = Doc.symbol(doc(), n) ? Doc.uniqueSymbolName(doc(), n) : n;
                    Doc.renamePiece(doc(), row.gsn, dest);
                }
                renderLayers(); renderTimeline(); return;
            }
            checkpoint();
            const first = row.scope ? 0 : labelLi() + 1;
            if (act === 'up' && row.li > first) { [L[row.li - 1], L[row.li]] = [L[row.li], L[row.li - 1]]; st.li = row.li - 1; st.scope = row.scope; st.anc = row.anc; }
            else if (act === 'down' && row.li < L.length - 1) { [L[row.li + 1], L[row.li]] = [L[row.li], L[row.li + 1]]; st.li = row.li + 1; st.scope = row.scope; st.anc = row.anc; }
            else if (act === 'del') {
                if (!confirm(`¿Eliminar la capa "${row.layer.LN}"${row.gsn ? ' y su grupo' : ''}?`)) { st.undo.pop(); return; }
                const gsn = row.gsn;
                L.splice(row.li, 1);
                if (gsn && Doc.symbolUsage(doc(), gsn) === 0) doc().anim.SD.S = doc().anim.SD.S.filter(s => s.SN !== gsn);
                st.li = -1; st.ei = -1; st.scope = null; st.anc = []; st.picked = new Set();
            }
            refreshAll();
        });
        $('#layerAdd').addEventListener('click', () => {
            checkpoint();
            const d = doc();
            const parentSn = st.scope || null;
            const L = Doc.layerList(d, parentSn);
            const name = Doc.uniqueLayerName(d, 'Capa', L);
            if (parentSn) {
                const i = st.li >= 0 ? st.li : 0;
                L.splice(i, 0, { LN: name, FR: [] });
                st.li = i;
            } else {
                Doc.addLayer(d, name, labelLi() + 1);
                st.li = labelLi() + 1; st.scope = null; st.anc = [];
            }
            st.ei = -1;
            refreshAll();
        });
        $('#layerGroup').addEventListener('click', () => {
            const refs = selectedRefs();
            if (refs.length < 2) return U.toast('Marca al menos 2 capas del mismo nivel (casilla ☐ o Ctrl+clic) y pulsa Agrupar.', 'warn');
            const scope = refs[0].scope || null;
            if (refs.some(r => (r.scope || null) !== scope || r.anc.length !== refs[0].anc.length))
                return U.toast('Solo se pueden agrupar capas del mismo nivel.', 'warn');
            const name = U.ask('Nombre del grupo:', 'Grupo'); if (!name) return;
            checkpoint();
            try {
                const out = Doc.groupLayers(doc(), refs.map(r => ({ sn: r.scope || null, li: r.li })), name);
                st.scope = scope; st.anc = refs[0].anc.slice(); st.li = out.li; st.ei = 0; st.picked = new Set();
                refreshAll();
                U.toast(`Grupo "${name}" creado con ${refs.length} capas.`, 'ok');
            } catch (err) { st.undo.pop(); U.toast(err.message || String(err), 'warn'); }
        });
        $('#layerUngroup').addEventListener('click', () => {
            const refs = selectedRefs();
            const row = refs.find(r => r.gsn) || refs[0];
            if (!row || !row.gsn) return U.toast('Selecciona un grupo para desagrupar.', 'warn');
            checkpoint();
            try {
                const n = Doc.ungroupLayer(doc(), { sn: row.scope || null, li: row.li });
                st.scope = row.scope; st.anc = row.anc.slice(); st.li = row.li; st.ei = 0; st.picked = new Set();
                refreshAll();
                U.toast(`Grupo desarmado en ${n} capa(s).`, 'ok');
            } catch (err) { st.undo.pop(); U.toast(err.message || String(err), 'warn'); }
        });
    }

    /* ---------------- Inspector ---------------- */
    function renderInspector() {
        const box = $('#inspector');
        const el = selView();
        U.$$('input, select, button', box).forEach(x => x.disabled = !el);
        $('#inspName').textContent = el ? `${(curLayer() || {}).LN || '—'} · ${Doc.elName(el)}` : '—';
        const sel = $('#inspSymbol');
        if (!el) { U.$$('input[type=number]', box).forEach(i => i.value = ''); sel.innerHTML = ''; return; }
        if (el.SI) {
            sel.innerHTML = doc().anim.SD.S.map(s => `<option ${s.SN === el.SI.SN ? 'selected' : ''}>${U.esc(s.SN)}</option>`).join('');
        } else { sel.innerHTML = `<option>sprite ${U.esc(el.ASI.N)}</option>`; sel.disabled = true; }
        const p = selProps(el);
        U.$$('input[data-prop]', box).forEach(inp => {
            if (document.activeElement === inp) return;
            const k = inp.dataset.prop, v = p[k];
            inp.value = ['sx', 'sy', 'a'].includes(k) ? U.round(v, 3) : U.round(v, 2);
            if ((k === 'px' || k === 'py' || k === 'a') && !el.SI) inp.disabled = true;
        });
    }

    function inspectorEvents() {
        const box = $('#inspector');
        let pendingCheckpoint = true;
        box.addEventListener('focusin', () => { pendingCheckpoint = true; });
        box.addEventListener('input', e => {
            const k = e.target.dataset.prop; if (!k) return;
            const v = parseFloat(e.target.value); if (Number.isNaN(v)) return;
            if (pendingCheckpoint) { checkpoint(); pendingCheckpoint = false; }
            const el = selEdit(); if (!el) return;
            if (k === 'px' || k === 'py') {
                const p = Doc.pivotLocal(doc(), el);
                Doc.setPivot(el, k === 'px' ? v : p.x, k === 'py' ? v : p.y);
            } else {
                const pr = selProps(el);
                pr[k] = v;
                selApply(el, pr);
            }
            renderTimeline(); markDirty();
        });
        box.addEventListener('change', e => { pendingCheckpoint = true; if (e.target.dataset.prop) renderInspector(); });
        $('#inspSymbol').addEventListener('change', e => {
            checkpoint();
            const el = selEdit(); if (!el || !el.SI) return;
            el.SI.SN = e.target.value;
            refreshFrame();
        });
        $('#elFlip').addEventListener('click', () => {
            checkpoint();
            const el = selEdit(); if (!el) return;
            const p = Doc.pivotLocal(doc(), el);
            const flip = M.multiply(M.translate(p.x, p.y), M.multiply(M.scale(-1, 1), M.translate(-p.x, -p.y)));
            Doc.setM(el, M.multiply(Doc.getM(el), flip));
            refreshFrame();
        });
        const reorder = (dir) => {
            checkpoint();
            const el = selEdit(); if (!el) return;
            const fr = Doc.frameAt(curLayer(), st.frame);
            const j = st.ei + dir;
            if (j < 0 || j >= fr.E.length) return;
            [fr.E[st.ei], fr.E[j]] = [fr.E[j], fr.E[st.ei]];
            st.ei = j; refreshFrame();
        };
        $('#elUp').addEventListener('click', () => reorder(1));
        $('#elDown').addEventListener('click', () => reorder(-1));
        $('#elDel').addEventListener('click', () => {
            checkpoint();
            const el = selEdit(); if (!el) return;
            const fr = Doc.frameAt(curLayer(), st.frame);
            fr.E.splice(st.ei, 1);
            st.ei = fr.E.length ? 0 : -1;
            refreshFrame();
        });
    }

    /* ---------------- Keyframes ---------------- */
    function renderKeybar() {
        const layer = curLayer();
        const ok = !!layer && (st.scope || !hideLabelRow(st.li));
        ['#keyAdd', '#keyBlank', '#keyDel', '#keyTween'].forEach(s => $(s).disabled = !ok);
        if (!ok) return;
        const fr = Doc.frameAt(layer, st.frame);
        $('#keyDel').disabled = !Doc.isKeyOn(doc(), layer, st.frame);
        $('#keyTween').value = fr && fr._tw ? fr._tw : '';
        $('#keyTween').disabled = !fr;
    }

    function keyEvents() {
        $('#keyAdd').addEventListener('click', () => { const l = curLayer(); if (!l) return; checkpoint(); Doc.ensureKeyOn(doc(), l, st.frame); refreshFrame(); });
        $('#keyBlank').addEventListener('click', () => { const l = curLayer(); if (!l) return; checkpoint(); Doc.blankKeyOn(doc(), l, st.frame); st.ei = -1; refreshFrame(); });
        $('#keyDel').addEventListener('click', () => { const l = curLayer(); if (!l) return; checkpoint(); Doc.removeKeyOn(doc(), l, st.frame); refreshFrame(); });
        $('#keyTween').addEventListener('change', e => {
            const l = curLayer(); if (!l) return;
            checkpoint();
            Doc.setTweenOn(doc(), l, st.frame, e.target.value || null);
            const fi = Doc.frameIndexAt(l, st.frame);
            if (e.target.value && !Doc.tweenTarget(l, fi))
                U.toast('Para interpolar, el siguiente keyframe de la capa debe tener las mismas piezas.', 'warn', 5000);
            refreshFrame();
        });
        $('#poseCopy').addEventListener('click', () => {
            const items = [];
            const lab = labelLi();
            Doc.layers(doc()).forEach((l, li) => { if (li !== lab || labelHasContent()) items.push({ sn: null, li, E: JSON.parse(JSON.stringify(Doc.evalOn(doc(), l, st.frame).E)) }); });
            Doc.forEachGroupLayer(doc(), (l, sn, li) => items.push({ sn, li, E: JSON.parse(JSON.stringify(Doc.evalOn(doc(), l, st.frame).E)) }));
            st.clipboard = items;
            U.toast('Pose copiada (todas las capas y sub-capas).', 'ok');
        });
        $('#posePaste').addEventListener('click', () => {
            if (!st.clipboard) return U.toast('Primero copia una pose.', 'warn');
            checkpoint();
            const items = Array.isArray(st.clipboard) && st.clipboard[0] && st.clipboard[0].E !== undefined && 'sn' in (st.clipboard[0] || {})
                ? st.clipboard
                : null;
            if (items) {
                items.forEach(it => {
                    const L = Doc.layerList(doc(), it.sn);
                    if (!L[it.li] || !it.E) return;
                    const fr = Doc.ensureKeyOn(doc(), L[it.li], st.frame);
                    fr.E = JSON.parse(JSON.stringify(it.E));
                });
            } else {
                // formato anterior (array por índice de capa principal)
                st.clipboard.forEach((E, li) => {
                    if (!E || li >= Doc.layers(doc()).length) return;
                    const fr = Doc.ensureKey(doc(), li, st.frame);
                    fr.E = JSON.parse(JSON.stringify(E));
                });
            }
            refreshFrame();
        });
    }

    /* ---------------- Animaciones ---------------- */
    function renderAnims() {
        $('#animListParts').innerHTML = labels().map((l, i) => `<li class="clickable anim-row ${i === st.animIdx ? 'active' : ''}" data-i="${i}"><b>${U.esc(l.name)}</b><span class="anim-row-tools"><span class="muted">${l.length} fr</span>
            <label class="anim-fps" title="FPS de esta animación"><input type="number" inputmode="numeric" min="1" max="120" step="1" data-act="fps" value="${Doc.animFps(doc(), l)}"> fps</label>
            <button class="mini" data-act="ren" aria-label="Renombrar" title="Renombrar">✎</button></span></li>`).join('');
        $('#animLength').value = curLabel().length;
        $('#pFps').value = Doc.animFps(doc(), curLabel());
    }

    function animEvents() {
        $('#tlAnimSelect').addEventListener('change', e => { st.animIdx = +e.target.value; st.frame = curLabel().start; refreshAll(); });
        $('#animListParts').addEventListener('change', e => {
            const inp = e.target.closest('input[data-act="fps"]'); if (!inp) return;
            const l = labels()[+inp.closest('li[data-i]').dataset.i]; if (!l) return;
            checkpoint(); Doc.setAnimFps(doc(), l, inp.value); refreshAll();
        });
        $('#animListParts').addEventListener('click', e => {
            if (e.target.closest('input, label.anim-fps')) return;
            const li = e.target.closest('li[data-i]'); if (!li) return;
            if (e.target.closest('button[data-act="ren"]')) {
                const l = labels()[+li.dataset.i]; if (!l) return;
                const name = U.ask('Nuevo nombre de la animación:', l.name);
                if (!name || name === l.name) return;
                if (labels().some(x => x.name === name)) return U.toast('Ya existe esa animación.', 'warn');
                checkpoint(); l.frame.N = name; refreshAll(); return;
            }
            st.animIdx = +li.dataset.i; st.frame = curLabel().start; refreshAll();
        });
        $('#animAdd').addEventListener('click', () => {
            const pool = ['Idle', 'Left', 'Down', 'Up', 'Right', 'Hey', 'Confirm', 'Select'];
            const name = U.ask('Nombre de la nueva animación:', pool.find(n => !labels().some(l => l.name === n)) || 'Anim');
            if (!name) return;
            if (labels().some(l => l.name === name)) return U.toast('Ya existe esa animación.', 'warn');
            checkpoint();
            Doc.addAnimation(doc(), name, 6);
            st.animIdx = labels().length - 1; st.frame = curLabel().start;
            refreshAll();
        });
        $('#animRename').addEventListener('click', () => {
            const l = curLabel(); const name = U.ask('Nuevo nombre:', l.name);
            if (!name || name === l.name) return;
            if (labels().some(x => x.name === name)) return U.toast('Ya existe esa animación.', 'warn');
            checkpoint(); l.frame.N = name; refreshAll();
        });
        $('#animDup').addEventListener('click', () => {
            const l = curLabel(); const name = U.ask('Nombre de la copia:', l.name + ' 2');
            if (!name) return;
            checkpoint(); Doc.duplicateAnimation(doc(), l, name); st.animIdx++; st.frame = curLabel().start; refreshAll();
        });
        $('#animDel').addEventListener('click', () => {
            if (labels().length <= 1) return U.toast('Debe quedar al menos una animación.', 'warn');
            const l = curLabel();
            if (!confirm(`¿Eliminar la animación "${l.name}" y sus ${l.length} frames?`)) return;
            checkpoint(); Doc.removeAnimation(doc(), l); st.animIdx = Math.max(0, st.animIdx - 1); st.frame = curLabel().start; refreshAll();
        });
        $('#animLength').addEventListener('change', e => {
            const l = curLabel(); const n = U.clamp(parseInt(e.target.value, 10) || 1, 1, 600);
            if (n === l.length) return;
            checkpoint(); Doc.resizeRange(doc(), l.start, l.start + l.length, n - l.length); refreshAll();
        });
        $('#pFps').addEventListener('change', e => {
            const v = U.clamp(parseFloat(e.target.value) || 24, 1, 120);
            checkpoint(); Doc.setAnimFps(doc(), curLabel(), v); renderAnims();
        });
    }

    /* ---------------- Línea de tiempo ---------------- */
    function rowsOrder() { return layerRows(); }

    function renderTimeline() {
        const T = TLD();
        const cv = $('#tlCanvas'), nm = $('#tlNames');
        const [a, b] = range(), len = b - a;
        const rows = rowsOrder();
        const w = len * T.fw + 24, h = T.headH + Math.max(1, rows.length) * T.rowH + 2;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
        nm.width = T.nameW * dpr; nm.height = h * dpr; nm.style.width = T.nameW + 'px'; nm.style.height = h + 'px';
        const ctx = cv.getContext('2d'), nx = nm.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); nx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#0a1324'; ctx.fillRect(0, 0, w, h);
        nx.fillStyle = '#0c1830'; nx.fillRect(0, 0, T.nameW, h);
        ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
        nx.textBaseline = 'middle';

        ctx.fillStyle = '#0e1a31'; ctx.fillRect(0, 0, w, T.headH);
        for (let f = 0; f < len; f++) if (f % 5 === 0) { ctx.fillStyle = '#6f86ad'; ctx.fillText(String(f + 1), f * T.fw + 3, T.headH / 2); }
        nx.fillStyle = '#7f93b5'; nx.font = '600 10px Inter, sans-serif'; nx.fillText(curLabel().name.toUpperCase().slice(0, 14), 8, T.headH / 2);

        rows.forEach((row, r) => {
            const layer = row.layer;
            const y = T.headH + r * T.rowH;
            const selRow = row.li === st.li && (row.scope || null) === (st.scope || null) && row.anc.length === (st.anc || []).length;
            ctx.fillStyle = selRow ? '#132b52' : (r % 2 ? '#0b162a' : '#0c1830');
            ctx.fillRect(0, y, w, T.rowH);
            nx.fillStyle = selRow ? '#14305a' : '#0c1830'; nx.fillRect(0, y, T.nameW, T.rowH);
            nx.fillStyle = layer._hidden ? '#4f6283' : (selRow ? '#e6f0ff' : '#a5b6d3');
            nx.font = (coarse() ? '12px' : '12px') + ' Inter, sans-serif';
            const indent = 8 + row.depth * 10;
            nx.fillText(clip(nx, (row.gsn ? '▣ ' : '') + layer.LN, T.nameW - indent - 4), indent, y + T.rowH / 2);
            ctx.fillStyle = '#122140';
            for (let f = 0; f <= len; f++) ctx.fillRect(f * T.fw, y, 1, T.rowH);
            layer.FR.forEach((fr, fi) => {
                const s = Math.max(fr.I, a), e = Math.min(fr.I + fr.DU, b);
                if (e <= s) return;
                const x0 = (s - a) * T.fw, x1 = (e - a) * T.fw;
                const full = (fr.E || []).length > 0;
                if (full) { ctx.fillStyle = selRow ? '#1d4a8a' : '#173a6b'; ctx.fillRect(x0 + 1, y + 4, x1 - x0 - 2, T.rowH - 8); }
                if (fr._tw) {
                    ctx.strokeStyle = Doc.tweenTarget(layer, fi) ? '#38c6f4' : '#ff5d73'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x0 + T.fw / 2, y + T.rowH / 2); ctx.lineTo(x1 - 4, y + T.rowH / 2); ctx.stroke();
                }
                if (fr.I >= a && fr.I < b) {
                    const cx = (fr.I - a) * T.fw + T.fw / 2, cy = y + T.rowH / 2, rr = coarse() ? 5 : 4;
                    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
                    if (full) { ctx.fillStyle = fr.I === st.frame && selRow ? '#ffffff' : '#38c6f4'; ctx.fill(); }
                    else { ctx.strokeStyle = '#7f93b5'; ctx.lineWidth = 1.5; ctx.stroke(); }
                }
            });
        });
        if (!rows.length) { ctx.fillStyle = '#5c7299'; ctx.font = '12px Inter, sans-serif'; ctx.fillText('Las capas aparecerán aquí.', 8, T.headH + T.rowH / 2); }
        const sel = selRange();
        if (sel) {
            const sx = (sel[0] - a) * T.fw, sw = (sel[1] - sel[0]) * T.fw;
            ctx.fillStyle = 'rgba(255,196,61,0.18)'; ctx.fillRect(sx, 0, sw, h);
            ctx.fillStyle = '#ffc43d'; ctx.fillRect(sx, 0, sw, 3); ctx.fillRect(sx, 0, 2, h); ctx.fillRect(sx + sw - 2, 0, 2, h);
        }
        const px = (st.frame - a) * T.fw;
        ctx.fillStyle = 'rgba(56,198,244,0.16)'; ctx.fillRect(px, 0, T.fw, h);
        ctx.fillStyle = '#38c6f4'; ctx.fillRect(px + T.fw / 2 - 0.5, 0, 1, h); ctx.fillRect(px, 0, T.fw, 3);
        nx.fillStyle = '#1d3256'; nx.fillRect(T.nameW - 1, 0, 1, h);

        const sc = $('#tlScroll');
        const visW = sc.clientWidth - T.nameW;
        if (!st.tlTouching && (px < sc.scrollLeft || px + T.fw > sc.scrollLeft + visW)) sc.scrollLeft = Math.max(0, px - visW / 2);
        updateSplitBtn();
    }

    function clip(ctx, text, maxW) {
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
    }

    function timelineEvents() {
        const sc = $('#tlScroll');
        // nombres de capa fijos a la izquierda
        const names = document.createElement('canvas');
        names.id = 'tlNames';
        sc.insertBefore(names, sc.firstChild);
        const tap = (e, target) => {
            const T = TLD();
            const r = target.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            const row = Math.floor((y - T.headH) / T.rowH);
            const rows = rowsOrder();
            if (target.id === 'tlCanvas') { const [a, b] = range(); st.frame = U.clamp(a + Math.floor(x / T.fw), a, b - 1); pickRange(st.frame, e.shiftKey); }
            if (y > T.headH && rows[row]) selectRow(rows[row], null, e.ctrlKey || e.metaKey);
            refreshFrame(); renderLayers();
        };
        // tocar = elegir frame/capa; arrastrar = desplazar (funciona igual con dedo o mouse)
        [$('#tlCanvas'), names].forEach(cv => {
            let down = null;
            cv.addEventListener('pointerdown', e => {
                down = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, stp: sc.scrollTop, drag: false };
                st.tlTouching = true;
                cv.setPointerCapture(e.pointerId);
            });
            cv.addEventListener('pointermove', e => {
                if (!down) return;
                const dx = e.clientX - down.x, dy = e.clientY - down.y;
                if (!down.drag && Math.hypot(dx, dy) > 8) down.drag = true;
                if (down.drag) { sc.scrollLeft = down.sl - dx; sc.scrollTop = down.stp - dy; }
            });
            cv.addEventListener('pointerup', e => {
                st.tlTouching = false;
                if (down && !down.drag) tap(e, cv);
                down = null;
            });
            cv.addEventListener('pointercancel', () => { down = null; st.tlTouching = false; });
        });
        $('#tlScrub').addEventListener('input', e => { if (st.playing) togglePlay(); st.frame = +e.target.value; refreshFrame(); });
        $('#tlPrev').addEventListener('click', () => { const [a, b] = range(); setFrame(st.frame > a ? st.frame - 1 : b - 1); });
        $('#tlNext').addEventListener('click', () => { const [a, b] = range(); setFrame(st.frame + 1 < b ? st.frame + 1 : a); });
        $('#tlPlay').addEventListener('click', togglePlay);
    }

    /* ---------------- Selección de rango y "Separar como nueva animación" ---------------- */
    // Escritorio: clic = inicio, Shift+clic = fin. Celular: botón "Rango" y dos toques (inicio y fin).
    function selRange() {
        if (!st.sel) return null;
        const [a, b] = range();
        const s0 = Math.max(a, st.sel[0]), e0 = Math.min(b, st.sel[1]);
        return e0 > s0 ? [s0, e0] : null;
    }
    function pickRange(f, shift) {
        if (st.rangeMode) {
            if (st.rangeStart == null) { st.rangeStart = f; st.sel = [f, f + 1]; U.toast('Ahora toca el fotograma final.', 'info', 2000); }
            else { st.sel = [Math.min(st.rangeStart, f), Math.max(st.rangeStart, f) + 1]; st.rangeStart = null; setRangeMode(false); }
        } else if (shift && st.selAnchor != null) {
            st.sel = [Math.min(st.selAnchor, f), Math.max(st.selAnchor, f) + 1];
        } else { st.selAnchor = f; st.sel = null; }
        updateSplitBtn();
    }
    function setRangeMode(on) {
        st.rangeMode = on; st.rangeStart = null;
        const b = $('#rangeBtn'); if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
        if (on) U.toast('Toca el fotograma inicial y luego el final.', 'info', 2500);
    }
    function updateSplitBtn() {
        const sel = selRange();
        ['#splitAnimBtn', '#splitAnimBtn2'].forEach(id => { const b = $(id); if (b) b.disabled = !sel; });
        const info = $('#splitInfo'); if (info) info.textContent = sel ? `Selección: frames ${sel[0] - range()[0] + 1}–${sel[1] - range()[0]} (${sel[1] - sel[0]})` : 'Sin selección';
    }
    const SPLIT_NAMES = ['idle', 'singLEFT', 'singDOWN', 'singUP', 'singRIGHT', 'singLEFTmiss', 'singDOWNmiss', 'singUPmiss', 'singRIGHTmiss'];
    function openSplitDialog() {
        const sel = selRange();
        if (!sel) return U.toast('Selecciona un rango en la línea de tiempo: clic y Shift+clic (o "Rango" y dos toques).', 'warn', 5000);
        const dlg = $('#splitDlg');
        const free = SPLIT_NAMES.find(n => !labels().some(l => l.name === n)) || 'anim';
        $('#splitName').value = free;
        $('#splitRangeTxt').textContent = `${curLabel().name}: frames ${sel[0] - range()[0] + 1}–${sel[1] - range()[0]} (${sel[1] - sel[0]} frame(s), todas las capas)`;
        $('#splitChips').innerHTML = SPLIT_NAMES.map(n => `<button type="button" class="chip${labels().some(l => l.name === n) ? ' used' : ''}" data-n="${n}">${n}</button>`).join('');
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        setTimeout(() => $('#splitName').select(), 30);
    }
    function closeSplitDialog() { const d = $('#splitDlg'); if (d.close) d.close(); else d.removeAttribute('open'); }
    function doSplit() {
        const sel = selRange(); if (!sel) return closeSplitDialog();
        const name = $('#splitName').value.trim();
        if (!name) return U.toast('Escribe un nombre.', 'warn');
        if (labels().some(l => l.name === name)) return U.toast('Ya existe una animación con ese nombre.', 'warn');
        const copy = $('#splitCopy').checked;
        const [a, b] = range();
        if (!copy && sel[0] === a && sel[1] === b) return U.toast('Seleccionaste toda la animación: usa "Copiar" o renómbrala.', 'warn', 5000);
        checkpoint();
        Doc.separateRange(doc(), sel[0], sel[1], name, copy);
        st.sel = null; st.selAnchor = null;
        closeSplitDialog();
        refreshAll();
        st.animIdx = labels().findIndex(l => l.name === name); st.frame = curLabel().start;
        refreshAll(); updateSplitBtn();
        U.toast(`Animación "${name}" creada${copy ? ' (copia)' : ''}.`, 'ok');
    }
    function splitEvents() {
        const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
        on('#rangeBtn', 'click', () => setRangeMode(!st.rangeMode));
        on('#splitAnimBtn', 'click', openSplitDialog);
        on('#splitAnimBtn2', 'click', openSplitDialog);
        on('#splitCancel', 'click', closeSplitDialog);
        on('#splitOk', 'click', doSplit);
        on('#splitName', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSplit(); } });
        on('#splitChips', 'click', e => { const c = e.target.closest('[data-n]'); if (c) { $('#splitName').value = c.dataset.n; $('#splitName').focus(); } });
        on('#tlAnimSelect', 'change', () => { st.sel = null; updateSplitBtn(); });
        updateSplitBtn();
    }

    function togglePlay() {
        st.playing = !st.playing;
        $('#tlPlay').textContent = st.playing ? '❚❚' : '▶';
        $('#tlPlay').setAttribute('aria-label', st.playing ? 'Pausar' : 'Reproducir');
        st.last = performance.now();
    }

    /* ---------------- Lienzo ---------------- */
    function stageSize() { const r = $('#partsStage').getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; }
    function toWorld(cx, cy) {
        const s = stageSize();
        const z = st.view.zoom || 1;
        return [(cx - s.left - s.w / 2 - st.view.x) / z, (cy - s.top - s.h / 2 - st.view.y) / z];
    }
    function viewCenterWorld() { return [-st.view.x / st.view.zoom, -st.view.y / st.view.zoom]; }

    function collect(frame) {
        const items = [];
        Doc.walk(doc(), frame, (sp, m, a, li, ei, info) => items.push(Object.assign({ sp, m, a, li, ei }, info || {})));
        return items;
    }
    function sameSel(it) {
        if (st.scope) return it.scope === st.scope && it.sli === st.li && it.ei === st.ei;
        return !it.scope && it.li === st.li && it.ei === st.ei;
    }

    /* Backing store del lienzo: CSS del contenedor (no el rect zoomed de la página),
       DPR tope 2, lado máx 4096 y área máx ~16 MP para no romper móviles. */
    function stageBacking(box) {
        const cssW = Math.floor(box.clientWidth || 0), cssH = Math.floor(box.clientHeight || 0);
        if (cssW < 2 || cssH < 2) return null;
        let dpr = window.devicePixelRatio || 1;
        if (dpr > 2) dpr = 2;
        if (dpr < 0.5) dpr = 0.5;
        const MAX_SIDE = 4096, MAX_AREA = 4096 * 4096;
        let bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
        let s = 1;
        if (bw > MAX_SIDE) s = Math.min(s, MAX_SIDE / bw);
        if (bh > MAX_SIDE) s = Math.min(s, MAX_SIDE / bh);
        if (bw * bh * s * s > MAX_AREA) s = Math.min(s, Math.sqrt(MAX_AREA / (bw * bh)));
        if (s < 1) { dpr *= s; bw = Math.max(1, Math.round(cssW * dpr)); bh = Math.max(1, Math.round(cssH * dpr)); }
        return { cssW, cssH, bw, bh, dpr };
    }

    function applyCanvasSize(cv, b) {
        try {
            if (cv.width !== b.bw) cv.width = b.bw;
            if (cv.height !== b.bh) cv.height = b.bh;
            cv.style.width = b.cssW + 'px';
            cv.style.height = b.cssH + 'px';
            return cv.width > 0 && cv.height > 0 && !!cv.getContext('2d');
        } catch (err) { return false; }
    }

    function drawStage(ts) {
        requestAnimationFrame(drawStage);
        const cv = $('#partsStage');
        if (!cv) return;
        if (!cv.offsetParent) { st.wasHidden = true; return; }
        if (st.wasHidden) { st.wasHidden = false; st.dirty = true; }
        const box = cv.parentElement;
        if (!box) return;
        if (st.needFit && box.clientWidth > 60) { st.needFit = false; fitView(); }
        if (st.playing) {
            const fps = Math.max(1, Doc.animFps(doc(), curLabel()) || 24);
            if (ts - st.last >= 1000 / fps) {
                st.last = ts;
                const [a, b] = range();
                let nf = st.frame + 1;
                if (nf >= b) { if ($('#tlLoop').checked) nf = a; else { nf = b - 1; togglePlay(); } }
                st.frame = nf;
                refreshFrame();
            }
        }
        let back = stageBacking(box);
        if (!back) { st.dirty = true; return; }
        if (cv.width !== back.bw || cv.height !== back.bh) {
            if (!applyCanvasSize(cv, back)) {
                back = { cssW: back.cssW, cssH: back.cssH, bw: Math.max(1, back.bw >> 1), bh: Math.max(1, back.bh >> 1), dpr: back.dpr * 0.5 };
                if (!applyCanvasSize(cv, back)) { st.dirty = true; return; }
            }
            st.dirty = true;
        }
        if (!st.dirty && !st.ctxLost) return;
        const ctx = cv.getContext('2d');
        if (!ctx || st.ctxLost) { st.dirty = true; return; }
        const dpr = back.dpr, W = back.cssW, H = back.cssH;
        try {
            U.drawChecker(ctx, cv.width, cv.height, Math.max(8, 16 * dpr), '#0a1426', '#0c1830');
            const z = st.view.zoom;
            const view = [dpr * z, 0, 0, dpr * z, dpr * (W / 2 + st.view.x), dpr * (H / 2 + st.view.y)];
            if (!view.every(Number.isFinite)) { st.dirty = true; return; }
            const o = M.apply(view, 0, 0);
            ctx.strokeStyle = 'rgba(56,198,244,0.22)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, o[1]); ctx.lineTo(cv.width, o[1]); ctx.moveTo(o[0], 0); ctx.lineTo(o[0], cv.height); ctx.stroke();
            ctx.imageSmoothingEnabled = true;
            let waitImg = false;
            const draw = (items, alphaMul) => (items || []).forEach(it => {
                try {
                    const mm = M.multiply(view, it.m);
                    if (!mm.every(Number.isFinite)) return;
                    const raw = it.sp && it.sp.sheet && it.sp.sheet.img;
                    if (raw && raw instanceof HTMLImageElement && !raw.complete) waitImg = true;
                    const img = IO.spriteCanvas(it.sp);
                    if (!img || !img.width) { waitImg = true; return; }
                    ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
                    ctx.globalAlpha = (it.a == null ? 1 : it.a) * alphaMul;
                    ctx.drawImage(img, 0, 0);
                } catch (err) { /* una pieza no debe tumbar el frame */ }
            });
            const [a] = range();
            if (st.onion && st.frame > a) {
                try { draw(collect(st.frame - 1), 0.28); } catch (err) { /* ignore onion */ }
            }
            let items = [];
            try { items = collect(st.frame); } catch (err) { console.warn('FNF Packer: no se pudo armar el frame', err); }
            st.items = items;
            draw(items, 1);
            ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
            const el = selView();
            if (el) {
                try {
                    ctx.strokeStyle = '#38c6f4'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 4 * dpr]);
                    items.filter(sameSel).forEach(it => {
                        const c = IO.spriteCanvas(it.sp), mm = M.multiply(view, it.m);
                        if (!c || !mm.every(Number.isFinite)) return;
                        const pts = [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]].map(([x, y]) => M.apply(mm, x, y));
                        ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.stroke();
                    });
                    ctx.setLineDash([]);
                    const pr = selProps(el);
                    if (pr && Number.isFinite(pr.x) && Number.isFinite(pr.y)) {
                        const q = M.apply(view, pr.x, pr.y);
                        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#06101f'; ctx.lineWidth = 2 * dpr;
                        ctx.beginPath(); ctx.arc(q[0], q[1], 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    }
                } catch (err) { /* gizmo */ }
            }
            const zl = $('#zoomLabel');
            if (zl) zl.textContent = Math.round(z * 100) + '%';
            st.dirty = !!waitImg;
        } catch (err) {
            console.warn('FNF Packer: error al dibujar el lienzo', err);
            st.dirty = true;
        }
    }

    function alphaAt(canvas, x, y) {
        try {
            let data = st.hit.get(canvas);
            if (!data) {
                if (canvas.width * canvas.height > 8e6) return 255;
                data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                st.hit.set(canvas, data);
            }
            return data[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3];
        } catch (err) { return 255; }
    }

    function hitTest(wx, wy) {
        let items = st.items;
        if (!items) { try { items = collect(st.frame); st.items = items; } catch (err) { return null; } }
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            if (!it || !it.m || !it.m.every(Number.isFinite)) continue;
            let c;
            try { c = IO.spriteCanvas(it.sp); } catch (err) { continue; }
            if (!c || !c.width) continue;
            const [lx, ly] = M.apply(M.invert(it.m), wx, wy);
            if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
            if (lx >= 0 && ly >= 0 && lx < c.width && ly < c.height && alphaAt(c, lx, ly) > 20) return it;
        }
        return null;
    }

    function applyHit(hit) {
        const hScope = hit.scope || null, hLi = hScope ? hit.sli : hit.li;
        st.scope = hScope;
        st.anc = hit.anc ? hit.anc.slice() : [];
        st.li = hLi;
        st.ei = hit.ei != null ? hit.ei : 0;
        st.picked = new Set();
    }

    function openGroupAtHit(hit) {
        if (!hit) return false;
        const scope = hit.scope || null;
        const li = scope ? hit.sli : hit.li;
        const L = Doc.layerList(doc(), scope);
        const layer = L[li];
        const gsn = layer && Doc.groupSN(doc(), layer);
        if (!gsn || layer._open) return false;
        layer._open = true;
        try { st.items = collect(st.frame); } catch (err) { }
        return true;
    }

    function startElementDrag(mode, e) {
        const v = selView(); if (!v) return null;
        const p0 = selProps(v);
        const w = toWorld(e.clientX, e.clientY);
        if (!p0 || ![p0.x, p0.y, p0.r, p0.sx, p0.sy].every(Number.isFinite) || !w.every(Number.isFinite)) return null;
        const pm = parentM();
        const m0 = pm ? M.multiply(pm, Doc.getM(v)) : Doc.getM(v);
        if (!m0 || !m0.every(Number.isFinite)) return null;
        return { mode, el: null, p0, m0, w0: w, cx: e.clientX, cy: e.clientY, moved: false,
            a0: Math.atan2(w[1] - p0.y, w[0] - p0.x), d0: Math.hypot(w[0] - p0.x, w[1] - p0.y) || 1 };
    }

    function stageEvents() {
        const cv = $('#partsStage');
        cv.addEventListener('pointerdown', e => {
            cv.setPointerCapture(e.pointerId);
            st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (st.pointers.size === 2) {
                // el primer dedo no debe cambiar la selección ni dejar keyframes vacíos
                if (st.selBefore) { st.li = st.selBefore.li; st.ei = st.selBefore.ei; st.scope = st.selBefore.scope; st.anc = st.selBefore.anc; }
                startPinch(); renderLayers(); renderInspector(); renderTimeline(); return;
            }
            if (st.pointers.size > 2) return;
            st.selBefore = { li: st.li, ei: st.ei, scope: st.scope, anc: st.anc };
            const w = toWorld(e.clientX, e.clientY);
            let hit = e.button === 0 ? hitTest(w[0], w[1]) : null;
            if (!hit && st.tool !== 'move' && selView() && e.button === 0) hit = { li: st.li, ei: st.ei, scope: st.scope, sli: st.li, anc: st.anc };
            if (hit) {
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const tap = st.lastTap;
                const isDbl = tap && (now - tap.t) < 400 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 22;
                st.lastTap = { t: now, x: e.clientX, y: e.clientY };
                if (isDbl && openGroupAtHit(hit)) {
                    hit = hitTest(w[0], w[1]) || hit;
                    renderLayers();
                }
                const hScope = hit.scope || null, hLi = hScope ? hit.sli : hit.li;
                if (hLi !== st.li || hit.ei !== st.ei || hScope !== (st.scope || null)) {
                    applyHit(hit);
                    renderLayers(); renderInspector(); renderTimeline(); renderKeybar();
                }
                if (st.tool === 'pivot' && selView() && !selView().SI) { U.toast('Los sprites sueltos (ASI) no tienen pivote editable.', 'warn'); st.drag = null; return; }
                st.drag = startElementDrag(st.tool, e);
            } else {
                st.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y, moved: false };
            }
            markDirty();
        });
        cv.addEventListener('pointermove', e => {
            if (!st.pointers.has(e.pointerId)) return;
            st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (st.pinch) { movePinch(); return; }
            const d = st.drag; if (!d) return;
            if (d.mode === 'pan') {
                st.view.x = d.vx + (e.clientX - d.sx); st.view.y = d.vy + (e.clientY - d.sy);
                if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
                markDirty(); return;
            }
            const w = toWorld(e.clientX, e.clientY);
            if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return;
            d.moved = true;
            if (!d.el) { checkpoint(); d.el = selEdit(); if (!d.el) { st.drag = null; return; } }
            const pr = Object.assign({}, d.p0);
            if (d.mode === 'move') {
                pr.x = d.p0.x + (w[0] - d.w0[0]); pr.y = d.p0.y + (w[1] - d.w0[1]);
                if (e.shiftKey) { pr.x = Math.round(pr.x / 5) * 5; pr.y = Math.round(pr.y / 5) * 5; }
            } else if (d.mode === 'rotate') {
                let r = d.p0.r + (Math.atan2(w[1] - d.p0.y, w[0] - d.p0.x) - d.a0) * 180 / Math.PI;
                if (e.shiftKey) r = Math.round(r / 15) * 15;
                pr.r = r;
            } else if (d.mode === 'scale') {
                let k = Math.hypot(w[0] - d.p0.x, w[1] - d.p0.y) / d.d0;
                if (e.shiftKey) k = Math.round(k * 10) / 10;
                pr.sx = d.p0.sx * k; pr.sy = d.p0.sy * k;
            } else if (d.mode === 'pivot') {
                const l = M.apply(M.invert(d.m0), w[0], w[1]);
                Doc.setPivot(d.el, l[0], l[1]);
                renderInspector(); markDirty(); return;
            }
            selApply(d.el, pr);
            renderInspector(); markDirty();
        });
        const up = (e) => {
            st.pointers.delete(e.pointerId);
            if (st.pinch && st.pointers.size < 2) { st.pinch = null; st.drag = null; renderTimeline(); return; }
            if (st.drag) {
                if (st.drag.mode === 'pan' && !st.drag.moved && e.type === 'pointerup') { st.ei = -1; renderInspector(); markDirty(); }
                else if (st.drag.mode !== 'pan') { renderTimeline(); renderKeybar(); }
            }
            st.drag = null;
        };
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', up);
        cv.addEventListener('wheel', e => {
            e.preventDefault();
            zoomAt(e.clientX, e.clientY, st.view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        }, { passive: false });

        $('#toolSeg').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
        $('#zoomFit').addEventListener('click', fitView);
        $('#gestureBtn').addEventListener('click', () => {
            st.gesture = st.gesture === 'view' ? 'piece' : 'view';
            $('#gestureBtn').textContent = st.gesture === 'view' ? '2 dedos: Vista' : '2 dedos: Pieza';
            $('#gestureBtn').classList.toggle('btn-on', st.gesture === 'piece');
        });
        $('#onionBtn').addEventListener('click', () => {
            st.onion = !st.onion;
            $('#onionBtn').classList.toggle('btn-on', st.onion);
            $('#onionBtn').setAttribute('aria-pressed', String(st.onion));
            markDirty();
        });
        $('#undoBtn').addEventListener('click', undo);
        $('#redoBtn').addEventListener('click', redo);
        window.addEventListener('resize', () => { markDirty(); renderTimeline(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) markDirty(); });
        document.addEventListener('load', ev => {
            if (ev.target && ev.target.tagName === 'IMG') markDirty();
        }, true);
        if (typeof ResizeObserver !== 'undefined' && cv.parentElement) {
            new ResizeObserver(() => markDirty()).observe(cv.parentElement);
        }
        if (window.visualViewport) {
            const onVV = () => markDirty();
            visualViewport.addEventListener('resize', onVV);
            visualViewport.addEventListener('scroll', onVV);
        }
        const watchDpr = () => {
            try {
                if (st._dprMq && st._dprOn) {
                    if (st._dprMq.removeEventListener) st._dprMq.removeEventListener('change', st._dprOn);
                    else if (st._dprMq.removeListener) st._dprMq.removeListener(st._dprOn);
                }
            } catch (err) { /* ignore */ }
            const dpr = window.devicePixelRatio || 1;
            let mq;
            try { mq = window.matchMedia('(resolution: ' + dpr + 'dppx)'); } catch (err) { return; }
            const onChange = () => { markDirty(); watchDpr(); };
            st._dprMq = mq; st._dprOn = onChange;
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        };
        watchDpr();
        cv.addEventListener('contextlost', ev => {
            try { ev.preventDefault(); } catch (err) { }
            st.ctxLost = true;
            st.hit = new WeakMap();
            markDirty();
        });
        cv.addEventListener('contextrestored', () => {
            st.ctxLost = false;
            st.hit = new WeakMap();
            markDirty();
        });

        document.addEventListener('keydown', e => {
            if (!$('#view-partes').classList.contains('active')) return;
            if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
            const k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
            if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
            if (k === ' ') { e.preventDefault(); togglePlay(); }
            else if (k === 'arrowleft') $('#tlPrev').click();
            else if (k === 'arrowright') $('#tlNext').click();
            else if (k === 'k') $('#keyAdd').click();
            else if (k === 'delete') $('#keyDel').click();
            else if (k === 'v') setTool('move'); else if (k === 'r') setTool('rotate');
            else if (k === 's') setTool('scale'); else if (k === 'p') setTool('pivot');
        });
    }

    function pinchInfo() {
        const [p1, p2] = Array.from(st.pointers.values());
        return { cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, d: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, a: Math.atan2(p2.y - p1.y, p2.x - p1.x) };
    }

    function startPinch() {
        const g = pinchInfo();
        st.drag = null;
        if (st.gesture === 'piece' && selView()) {
            checkpoint();
            const el = selEdit();
            st.pinch = { mode: 'piece', g0: g, el, p0: selProps(el), w0: toWorld(g.cx, g.cy) };
        } else {
            st.pinch = { mode: 'view', g0: g, z0: st.view.zoom, wc: toWorld(g.cx, g.cy) };
        }
    }

    function movePinch() {
        const p = st.pinch, g = pinchInfo();
        const k = g.d / p.g0.d;
        if (p.mode === 'view') {
            const s = stageSize();
            st.view.zoom = U.clamp(p.z0 * k, 0.1, 8);
            st.view.x = g.cx - s.left - s.w / 2 - p.wc[0] * st.view.zoom;
            st.view.y = g.cy - s.top - s.h / 2 - p.wc[1] * st.view.zoom;
        } else {
            const w = toWorld(g.cx, g.cy);
            const pr = Object.assign({}, p.p0);
            pr.x = p.p0.x + (w[0] - p.w0[0]); pr.y = p.p0.y + (w[1] - p.w0[1]);
            pr.r = p.p0.r + (g.a - p.g0.a) * 180 / Math.PI;
            pr.sx = p.p0.sx * k; pr.sy = p.p0.sy * k;
            selApply(p.el, pr);
            renderInspector();
        }
        markDirty();
    }

    function zoomAt(cx, cy, z) {
        const s = stageSize();
        const w = toWorld(cx, cy);
        st.view.zoom = U.clamp(z, 0.1, 8);
        st.view.x = cx - s.left - s.w / 2 - w[0] * st.view.zoom;
        st.view.y = cy - s.top - s.h / 2 - w[1] * st.view.zoom;
        markDirty();
    }

    function setTool(t) {
        st.tool = t;
        U.$$('.seg-btn', $('#toolSeg')).forEach(b => b.classList.toggle('active', b.dataset.tool === t));
        $('#partsStage').dataset.tool = t;
    }

    function fitView() {
        const [a, b] = range();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let f = a; f < b; f += Math.max(1, Math.floor((b - a) / 6))) {
            let items = [];
            try { items = collect(f); } catch (err) { continue; }
            items.forEach(it => {
                if (!it || !it.m || !it.m.every(Number.isFinite)) return;
                let c; try { c = IO.spriteCanvas(it.sp); } catch (err) { return; }
                if (!c || !c.width) return;
                [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].forEach(([x, y]) => {
                    const q = M.apply(it.m, x, y);
                    if (!q.every(Number.isFinite)) return;
                    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
                });
            });
        }
        const s = stageSize();
        if (x0 === Infinity) { st.view = { x: 0, y: 60, zoom: 1 }; markDirty(); return; }
        const z = U.clamp(Math.min((s.w - 40) / (x1 - x0), (s.h - 40) / (y1 - y0)), 0.1, 4);
        st.view.zoom = z; st.view.x = -((x0 + x1) / 2) * z; st.view.y = -((y0 + y1) / 2) * z;
        markDirty();
    }

    /* ---------------- Hojas (paneles) ---------------- */
    function openSheet(name) {
        if (!coarseLayout()) {
            const sh = $(`.sheet[data-sheet="${name}"]`);
            sh.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        st.sheet = st.sheet === name ? null : name;
        U.$$('.sheet').forEach(s => s.classList.toggle('open', s.dataset.sheet === st.sheet));
        U.$$('#peTabbar button').forEach(b => b.classList.toggle('active', b.dataset.open === st.sheet));
        document.body.classList.toggle('sheet-open', !!st.sheet);
    }
    function closeSheet() { if (st.sheet) openSheet(st.sheet); }
    const coarseLayout = () => window.matchMedia('(max-width: 1023px)').matches;

    function sheetEvents() {
        $('#peTabbar').addEventListener('click', e => { const b = e.target.closest('button[data-open]'); if (b) openSheet(b.dataset.open); });
        U.$$('.sheet-close').forEach(b => b.addEventListener('click', closeSheet));
    }

    /* ---------------- Exportar / abrir ---------------- */
    function readSettings() {
        return {
            name: $('#pName').value.trim() || 'personaje',
            symbol: $('#pSymbol').value.trim() || 'personaje',
            folder: $('#pFolder').value.trim() || $('#pName').value.trim() || 'personaje',
            fps: Doc.mainFps(doc()),
            sti: { enabled: $('#pSti').checked, format: $('#pFormat').value, x: parseFloat($('#pStiX').value) || 0, y: parseFloat($('#pStiY').value) || 0 }
        };
    }
    function writeSettings() {
        const AN = doc().anim.AN;
        $('#pName').value = AN.N || 'personaje';
        $('#pSymbol').value = AN.SN || AN.N || 'personaje';
        $('#pFolder').value = doc().folder || AN.N || 'personaje';
        $('#pSti').checked = !!AN.STI;
        $('#pStiRow').hidden = !AN.STI;
        if (AN.STI) {
            const o = Atlas.readStiOffset(doc().anim);
            $('#pStiX').value = o.x; $('#pStiY').value = o.y;
            $('#pFormat').value = Atlas.detectFormat(doc().anim);
        }
    }

    async function exportPack() {
        const btn = $('#partsExportBtn');
        btn.disabled = true;
        try {
            const res = await Doc.exportPack(doc(), readSettings());
            U.downloadBlob(res.blob, res.fileName);
            st.lastExport = res;
            $('#partsStatus').textContent = `¡Listo! ${res.fileName} · ${doc().anim.SD.S.length} pieza(s) · ${Doc.length(doc())} frames${res.tweens.length ? ` · ${res.tweens.length} interpolación(es) horneadas` : ''}.`;
            U.toast(`Descargando ${res.fileName}`, 'ok');
        } catch (err) {
            console.error(err);
            U.toast('Error al exportar: ' + err.message, 'error', 6000);
        } finally { btn.disabled = false; }
    }

    /* .psd / .ipv: capas = partes, carpetas = frames de animación */
    async function openLayered(file) {
        const status = $('#partsStatus');
        try {
            U.toast(`Leyendo ${file.name}…`, 'info');
            if (status) status.textContent = `Leyendo capas de ${file.name}…`;
            const res = await F.LayeredImport.read(file);
            if (!res.nodes.length) throw new Error('El archivo no tiene capas con imagen.');
            const { doc: d, stats } = F.LayeredImport.toDoc(res);
            setDoc(d);
            const msg = `"${file.name}" abierto: ${stats.pieces} pieza(s), ${stats.layers} capa(s)${stats.groups ? `, ${stats.groups} grupo(s)` : ''}, ${stats.anims} animación(es), ${stats.frames} frame(s).`;
            if (status) status.textContent = msg;
            U.toast(msg, 'ok', 5000);
        } catch (err) {
            console.error(err);
            if (status) status.textContent = 'No se pudo abrir: ' + err.message;
            U.toast('No se pudo abrir ' + file.name + ': ' + err.message, 'error', 7000);
        }
    }

    /* Varios .ipv / .psd: cada archivo = una animación (ipv 1, ipv 2…), ordenados por nombre */
    async function openLayeredMany(files) {
        const status = $('#partsStatus');
        const list = Array.from(files).sort((a, b) => U.naturalSort(a.name, b.name));
        try {
            const res = [];
            for (let i = 0; i < list.length; i++) {
                if (status) status.textContent = `Leyendo ${i + 1}/${list.length}: ${list[i].name}…`;
                const r = await F.LayeredImport.read(list[i]);
                if (r.nodes.length) res.push(r); else U.toast(`${list[i].name} no tiene capas con imagen.`, 'warn');
            }
            if (!res.length) throw new Error('Ningún archivo tiene capas con imagen.');
            const { doc: d, stats } = F.LayeredImport.toDocMulti(res);
            setDoc(d);
            const msg = `${stats.files} archivo(s) abiertos: ${stats.anims} animación(es) (${labels().map(l => l.name).join(', ')}), ${stats.pieces} pieza(s)${stats.groups ? `, ${stats.groups} grupo(s)` : ''}, ${stats.frames} frame(s).`;
            if (status) status.textContent = msg;
            U.toast(msg, 'ok', 6000);
        } catch (err) {
            console.error(err);
            if (status) status.textContent = 'No se pudo abrir: ' + err.message;
            U.toast('No se pudieron abrir los archivos: ' + err.message, 'error', 7000);
        }
    }

    async function openFiles(files) {
        const layeredAll = Array.from(files).filter(f => F.LayeredImport && F.LayeredImport.accepts(f));
        if (layeredAll.length > 1) { st.pending = []; return openLayeredMany(layeredAll); }
        if (layeredAll.length) { st.pending = []; return openLayered(layeredAll[0]); }
        const all = st.pending.concat(Array.from(files));
        try {
            const atlas = await IO.loadFromFiles(all);
            st.pending = [];
            if (!atlas.anim) throw new Error('Falta el Animation.json.');
            openFromAtlas(atlas);
        } catch (err) {
            if (err.missing) { st.pending = all; U.toast(err.message, 'warn', 6000); }
            else { st.pending = []; console.error(err); U.toast(err.message, 'error', 6000); }
        }
    }

    function openFromAtlas(atlas) {
        setDoc(Doc.fromAtlas(atlas));
        U.toast(`"${doc().anim.AN.N}" abierto: ${doc().anim.SD.S.length} piezas, ${labels().length} animaciones.`, 'ok');
    }

    function setDoc(d) {
        st.doc = d;
        st.animIdx = 0; st.frame = 0; st.li = -1; st.ei = -1;
        st.scope = null; st.anc = []; st.picked = new Set();
        st.undo = []; st.redo = [];
        st.sel = null; st.selAnchor = null; if (st.rangeMode) setRangeMode(false);
        st.hit = new WeakMap();
        st.ctxLost = false;
        writeSettings();
        refreshAll();
        st.needFit = true;
        markDirty();
    }

    function init() {
        $('#partsExportBtn').addEventListener('click', exportPack);
        $('#peOpenInput').addEventListener('change', async e => { await openFiles(e.target.files); e.target.value = ''; });
        $('#peNewBtn').addEventListener('click', () => {
            if (!confirm('¿Empezar un proyecto nuevo? Se perderán los cambios que no exportaste.')) return;
            setDoc(Doc.create($('#pName').value.trim() || 'personaje'));
        });
        $('#pSti').addEventListener('change', e => { $('#pStiRow').hidden = !e.target.checked; });
        piecesEvents(); layersEvents(); inspectorEvents(); keyEvents(); animEvents();
        timelineEvents(); stageEvents(); sheetEvents(); splitEvents();
        setTool('move');
        writeSettings();
        refreshAll();
        requestAnimationFrame(drawStage);
    }

    F.Parts = { init, state: st, openFromAtlas, openLayered, openLayeredMany, separate: openSplitDialog, setDoc, fitView, refresh: refreshAll, markDirty, openSheet, setFrame, undo, redo };
})(window.FNF);

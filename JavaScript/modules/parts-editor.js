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
        hit: new WeakMap(), pending: [], sheet: null
    };
    const doc = () => st.doc;

    /* ---------------- Utilidades ---------------- */
    const labels = () => Doc.labels(doc());
    const curLabel = () => { const L = labels(); return L[Math.min(st.animIdx, L.length - 1)] || { name: '—', start: 0, length: 1 }; };
    const range = () => { const l = curLabel(); return [l.start, l.start + l.length]; };
    const labelLi = () => Doc.labelLayerIndex(doc());
    const markDirty = () => { st.dirty = true; };

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
        if (st.li < 0 || st.ei < 0) return null;
        const ev = Doc.evalLayer(doc(), st.li, st.frame);
        return ev.E[st.ei] || null;
    }
    /* Elemento seleccionado editable (crea keyframe si hace falta) */
    function selEdit() {
        if (!selView()) return null;
        const fr = Doc.ensureKey(doc(), st.li, st.frame);
        return fr.E[st.ei] || null;
    }

    function setFrame(f) {
        const [a, b] = range();
        st.frame = U.clamp(Math.round(f), a, b - 1);
        refreshFrame();
    }

    function selectLayer(li, preferEl = true) {
        st.li = li;
        const ev = li >= 0 ? Doc.evalLayer(doc(), li, st.frame) : { E: [] };
        st.ei = preferEl && ev.E.length ? Math.min(Math.max(st.ei, 0), ev.E.length - 1) : -1;
        renderLayers(); renderInspector(); renderTimeline(); markDirty();
    }

    /* ---------------- Render general ---------------- */
    function refreshFrame() {
        const [a, b] = range();
        $('#tlFrameInfo').textContent = `${st.frame - a + 1} / ${b - a}`;
        const sc = $('#tlScrub'); sc.min = a; sc.max = b - 1; sc.value = st.frame;
        if (st.li >= 0 && st.ei >= 0 && !selView()) st.ei = Doc.evalLayer(doc(), st.li, st.frame).E.length ? 0 : -1;
        renderInspector(); renderTimeline(); renderKeybar(); markDirty();
    }

    function refreshAll() {
        Doc.refresh(doc());
        const L = labels();
        if (st.animIdx >= L.length) st.animIdx = L.length - 1;
        if (st.li >= Doc.layers(doc()).length) { st.li = -1; st.ei = -1; }
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
        const files = Array.from(fileList).filter(f => /^image\//.test(f.type) || /\.(png|webp|jpe?g)$/i.test(f.name))
            .sort((a, b) => U.naturalSort(a.name, b.name));
        if (!files.length) return U.toast('Elige imágenes PNG.', 'warn');
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
            let li = st.li;
            if (li < 0 || li === labelLi()) {
                Doc.addLayer(d, Doc.uniqueLayerName(d, sn), labelLi() + 1);
                li = labelLi() + 1;
            }
            const fr = Doc.ensureKey(d, li, st.frame);
            const c = viewCenterWorld();
            fr.E.push(Doc.newInstance(d, sn, c[0], c[1]));
            st.li = li; st.ei = fr.E.length - 1;
            refreshAll();
            closeSheet();
            U.toast(`"${sn}" agregada en la capa ${Doc.layers(d)[li].LN}.`, 'ok');
        });
    }

    /* ---------------- Capas ---------------- */
    function renderLayers() {
        const L = Doc.layers(doc()), lab = labelLi();
        $('#layerList').innerHTML = L.map((l, i) => i === lab ? '' : `
            <li class="layer-row ${i === st.li ? 'is-selected' : ''} ${l._hidden ? 'is-hidden' : ''}" data-li="${i}">
                <span class="layer-name">${U.esc(l.LN)}</span>
                <span class="layer-btns">
                    <button class="mini" data-act="up" aria-label="Subir" ${i <= lab + 1 || i === 0 ? 'disabled' : ''}>▲</button>
                    <button class="mini" data-act="down" aria-label="Bajar" ${i === L.length - 1 ? 'disabled' : ''}>▼</button>
                    <button class="mini" data-act="eye" aria-label="Ocultar en el lienzo">${l._hidden ? '○' : '◉'}</button>
                    <button class="mini" data-act="ren" aria-label="Renombrar">✎</button>
                    <button class="mini mini-danger" data-act="del" aria-label="Eliminar">✕</button>
                </span>
            </li>`).join('');
    }

    function layersEvents() {
        $('#layerList').addEventListener('click', e => {
            const row = e.target.closest('.layer-row'); if (!row) return;
            const li = +row.dataset.li, L = Doc.layers(doc());
            const act = e.target.closest('button[data-act]')?.dataset.act;
            if (!act) { selectLayer(li); return; }
            if (act === 'eye') { L[li]._hidden = !L[li]._hidden; renderLayers(); markDirty(); return; }
            if (act === 'ren') {
                const n = U.ask('Nombre de la capa:', L[li].LN); if (!n) return;
                checkpoint(); L[li].LN = n; renderLayers(); renderTimeline(); return;
            }
            checkpoint();
            if (act === 'up' && li > labelLi() + 1) { [L[li - 1], L[li]] = [L[li], L[li - 1]]; st.li = li - 1; }
            else if (act === 'down' && li < L.length - 1) { [L[li + 1], L[li]] = [L[li], L[li + 1]]; st.li = li + 1; }
            else if (act === 'del') {
                if (!confirm(`¿Eliminar la capa "${L[li].LN}"?`)) { st.undo.pop(); return; }
                L.splice(li, 1); st.li = -1; st.ei = -1;
            }
            refreshAll();
        });
        $('#layerAdd').addEventListener('click', () => {
            checkpoint();
            const d = doc();
            Doc.addLayer(d, Doc.uniqueLayerName(d, 'Capa'), labelLi() + 1);
            st.li = labelLi() + 1; st.ei = -1;
            refreshAll();
        });
    }

    /* ---------------- Inspector ---------------- */
    function renderInspector() {
        const box = $('#inspector');
        const el = selView();
        U.$$('input, select, button', box).forEach(x => x.disabled = !el);
        $('#inspName').textContent = el ? `${Doc.layers(doc())[st.li].LN} · ${Doc.elName(el)}` : '—';
        const sel = $('#inspSymbol');
        if (!el) { U.$$('input[type=number]', box).forEach(i => i.value = ''); sel.innerHTML = ''; return; }
        if (el.SI) {
            sel.innerHTML = doc().anim.SD.S.map(s => `<option ${s.SN === el.SI.SN ? 'selected' : ''}>${U.esc(s.SN)}</option>`).join('');
        } else { sel.innerHTML = `<option>sprite ${U.esc(el.ASI.N)}</option>`; sel.disabled = true; }
        const p = Doc.props(doc(), el);
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
                const pr = Doc.props(doc(), el);
                pr[k] = v;
                Doc.applyProps(doc(), el, pr);
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
            const fr = Doc.frameAt(Doc.layers(doc())[st.li], st.frame);
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
            const fr = Doc.frameAt(Doc.layers(doc())[st.li], st.frame);
            fr.E.splice(st.ei, 1);
            st.ei = fr.E.length ? 0 : -1;
            refreshFrame();
        });
    }

    /* ---------------- Keyframes ---------------- */
    function renderKeybar() {
        const ok = st.li >= 0 && st.li !== labelLi();
        ['#keyAdd', '#keyBlank', '#keyDel', '#keyTween'].forEach(s => $(s).disabled = !ok);
        if (!ok) return;
        const layer = Doc.layers(doc())[st.li];
        const fr = Doc.frameAt(layer, st.frame);
        $('#keyDel').disabled = !Doc.isKey(doc(), st.li, st.frame);
        $('#keyTween').value = fr && fr._tw ? fr._tw : '';
        $('#keyTween').disabled = !fr;
    }

    function keyEvents() {
        $('#keyAdd').addEventListener('click', () => { if (st.li < 0) return; checkpoint(); Doc.ensureKey(doc(), st.li, st.frame); refreshFrame(); });
        $('#keyBlank').addEventListener('click', () => { if (st.li < 0) return; checkpoint(); Doc.blankKey(doc(), st.li, st.frame); st.ei = -1; refreshFrame(); });
        $('#keyDel').addEventListener('click', () => { if (st.li < 0) return; checkpoint(); Doc.removeKey(doc(), st.li, st.frame); refreshFrame(); });
        $('#keyTween').addEventListener('change', e => {
            if (st.li < 0) return;
            checkpoint();
            Doc.setTween(doc(), st.li, st.frame, e.target.value || null);
            const fi = Doc.frameIndexAt(Doc.layers(doc())[st.li], st.frame);
            if (e.target.value && !Doc.tweenTarget(Doc.layers(doc())[st.li], fi))
                U.toast('Para interpolar, el siguiente keyframe de la capa debe tener las mismas piezas.', 'warn', 5000);
            refreshFrame();
        });
        $('#poseCopy').addEventListener('click', () => {
            st.clipboard = Doc.layers(doc()).map((l, li) => li === labelLi() ? null : JSON.parse(JSON.stringify(Doc.evalLayer(doc(), li, st.frame).E)));
            U.toast('Pose copiada (todas las capas).', 'ok');
        });
        $('#posePaste').addEventListener('click', () => {
            if (!st.clipboard) return U.toast('Primero copia una pose.', 'warn');
            checkpoint();
            st.clipboard.forEach((E, li) => {
                if (!E || li >= Doc.layers(doc()).length) return;
                const fr = Doc.ensureKey(doc(), li, st.frame);
                fr.E = JSON.parse(JSON.stringify(E));
            });
            refreshFrame();
        });
    }

    /* ---------------- Animaciones ---------------- */
    function renderAnims() {
        $('#animListParts').innerHTML = labels().map((l, i) => `<li class="clickable ${i === st.animIdx ? 'active' : ''}" data-i="${i}"><b>${U.esc(l.name)}</b><span class="muted">${l.length} frames</span></li>`).join('');
        $('#animLength').value = curLabel().length;
        $('#pFps').value = doc().anim.MD?.FRT || 24;
    }

    function animEvents() {
        $('#tlAnimSelect').addEventListener('change', e => { st.animIdx = +e.target.value; st.frame = curLabel().start; refreshAll(); });
        $('#animListParts').addEventListener('click', e => {
            const li = e.target.closest('li[data-i]'); if (!li) return;
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
            checkpoint(); if (!doc().anim.MD) doc().anim.MD = {}; doc().anim.MD.FRT = v;
        });
    }

    /* ---------------- Línea de tiempo ---------------- */
    function rowsOrder() { const lab = labelLi(); return Doc.layers(doc()).map((l, i) => i).filter(i => i !== lab); }

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

        rows.forEach((li, r) => {
            const layer = Doc.layers(doc())[li];
            const y = T.headH + r * T.rowH;
            const selRow = li === st.li;
            ctx.fillStyle = selRow ? '#132b52' : (r % 2 ? '#0b162a' : '#0c1830');
            ctx.fillRect(0, y, w, T.rowH);
            nx.fillStyle = selRow ? '#14305a' : '#0c1830'; nx.fillRect(0, y, T.nameW, T.rowH);
            nx.fillStyle = layer._hidden ? '#4f6283' : (selRow ? '#e6f0ff' : '#a5b6d3');
            nx.font = (coarse() ? '12px' : '12px') + ' Inter, sans-serif';
            nx.fillText(clip(nx, layer.LN, T.nameW - 12), 8, y + T.rowH / 2);
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
        const px = (st.frame - a) * T.fw;
        ctx.fillStyle = 'rgba(56,198,244,0.16)'; ctx.fillRect(px, 0, T.fw, h);
        ctx.fillStyle = '#38c6f4'; ctx.fillRect(px + T.fw / 2 - 0.5, 0, 1, h); ctx.fillRect(px, 0, T.fw, 3);
        nx.fillStyle = '#1d3256'; nx.fillRect(T.nameW - 1, 0, 1, h);

        const sc = $('#tlScroll');
        const visW = sc.clientWidth - T.nameW;
        if (!st.tlTouching && (px < sc.scrollLeft || px + T.fw > sc.scrollLeft + visW)) sc.scrollLeft = Math.max(0, px - visW / 2);
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
            if (target.id === 'tlCanvas') { const [a, b] = range(); st.frame = U.clamp(a + Math.floor(x / T.fw), a, b - 1); }
            if (y > T.headH && rows[row] !== undefined) { st.li = rows[row]; st.ei = 0; }
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
        return [(cx - s.left - s.w / 2 - st.view.x) / st.view.zoom, (cy - s.top - s.h / 2 - st.view.y) / st.view.zoom];
    }
    function viewCenterWorld() { return [-st.view.x / st.view.zoom, -st.view.y / st.view.zoom]; }

    function collect(frame) {
        const items = [];
        Doc.walk(doc(), frame, (sp, m, a, li, ei) => items.push({ sp, m, a, li, ei }));
        return items;
    }

    function drawStage(ts) {
        requestAnimationFrame(drawStage);
        const cv = $('#partsStage');
        if (!cv.offsetParent) return;
        if (st.needFit && cv.parentElement.getBoundingClientRect().width > 60) { st.needFit = false; fitView(); }
        if (st.playing) {
            const fps = doc().anim.MD?.FRT || 24;
            if (ts - st.last >= 1000 / fps) {
                st.last = ts;
                const [a, b] = range();
                let nf = st.frame + 1;
                if (nf >= b) { if ($('#tlLoop').checked) nf = a; else { nf = b - 1; togglePlay(); } }
                st.frame = nf;
                refreshFrame();
            }
        }
        const pw = cv.width, ph = cv.height;
        const r = cv.parentElement.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = Math.max(50, Math.floor(r.width)), H = Math.max(50, Math.floor(r.height));
        if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
        if (!st.dirty && pw === cv.width && ph === cv.height) return;
        st.dirty = false;
        const ctx = cv.getContext('2d');
        U.drawChecker(ctx, cv.width, cv.height, 16 * dpr, '#0a1426', '#0c1830');
        const z = st.view.zoom;
        const view = [dpr * z, 0, 0, dpr * z, dpr * (W / 2 + st.view.x), dpr * (H / 2 + st.view.y)];
        const o = M.apply(view, 0, 0);
        ctx.strokeStyle = 'rgba(56,198,244,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, o[1]); ctx.lineTo(cv.width, o[1]); ctx.moveTo(o[0], 0); ctx.lineTo(o[0], cv.height); ctx.stroke();
        ctx.imageSmoothingEnabled = true;
        const draw = (items, alphaMul) => items.forEach(it => {
            const mm = M.multiply(view, it.m);
            ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
            ctx.globalAlpha = it.a * alphaMul;
            ctx.drawImage(IO.spriteCanvas(it.sp), 0, 0);
        });
        const [a] = range();
        if (st.onion && st.frame > a) draw(collect(st.frame - 1), 0.28);
        const items = collect(st.frame);
        st.items = items;
        draw(items, 1);
        ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
        // selección
        const el = selView();
        if (el) {
            ctx.strokeStyle = '#38c6f4'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 4 * dpr]);
            items.filter(it => it.li === st.li && it.ei === st.ei).forEach(it => {
                const c = IO.spriteCanvas(it.sp), mm = M.multiply(view, it.m);
                const pts = [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]].map(([x, y]) => M.apply(mm, x, y));
                ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.stroke();
            });
            ctx.setLineDash([]);
            const p = Doc.props(doc(), el);
            const q = M.apply(view, p.x, p.y);
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#06101f'; ctx.lineWidth = 2 * dpr;
            ctx.beginPath(); ctx.arc(q[0], q[1], 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        $('#zoomLabel').textContent = Math.round(z * 100) + '%';
    }

    function alphaAt(canvas, x, y) {
        let data = st.hit.get(canvas);
        if (!data) { data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; st.hit.set(canvas, data); }
        return data[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3];
    }

    function hitTest(wx, wy) {
        const items = st.items || collect(st.frame);
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i], c = IO.spriteCanvas(it.sp);
            const [lx, ly] = M.apply(M.invert(it.m), wx, wy);
            if (lx >= 0 && ly >= 0 && lx < c.width && ly < c.height && alphaAt(c, lx, ly) > 20) return it;
        }
        return null;
    }

    function startElementDrag(mode, e) {
        const v = selView(); if (!v) return null;
        const p0 = Doc.props(doc(), v);
        const w = toWorld(e.clientX, e.clientY);
        return { mode, el: null, p0, m0: Doc.getM(v), w0: w, cx: e.clientX, cy: e.clientY, moved: false,
            a0: Math.atan2(w[1] - p0.y, w[0] - p0.x), d0: Math.hypot(w[0] - p0.x, w[1] - p0.y) || 1 };
    }

    function stageEvents() {
        const cv = $('#partsStage');
        cv.addEventListener('pointerdown', e => {
            cv.setPointerCapture(e.pointerId);
            st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (st.pointers.size === 2) {
                // el primer dedo no debe cambiar la selección ni dejar keyframes vacíos
                if (st.selBefore) { st.li = st.selBefore.li; st.ei = st.selBefore.ei; }
                startPinch(); renderLayers(); renderInspector(); renderTimeline(); return;
            }
            if (st.pointers.size > 2) return;
            st.selBefore = { li: st.li, ei: st.ei };
            const w = toWorld(e.clientX, e.clientY);
            let hit = e.button === 0 ? hitTest(w[0], w[1]) : null;
            if (!hit && st.tool !== 'move' && selView() && e.button === 0) hit = { li: st.li, ei: st.ei };
            if (hit) {
                if (hit.li !== st.li || hit.ei !== st.ei) { st.li = hit.li; st.ei = hit.ei; renderLayers(); renderInspector(); renderTimeline(); renderKeybar(); }
                if (st.tool === 'pivot' && !selView().SI) { U.toast('Los sprites sueltos (ASI) no tienen pivote editable.', 'warn'); st.drag = null; return; }
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
            Doc.applyProps(doc(), d.el, pr);
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
            st.pinch = { mode: 'piece', g0: g, el, p0: Doc.props(doc(), el), w0: toWorld(g.cx, g.cy) };
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
            Doc.applyProps(doc(), p.el, pr);
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
            collect(f).forEach(it => { const c = IO.spriteCanvas(it.sp); [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].forEach(([x, y]) => { const q = M.apply(it.m, x, y); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); });
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
            fps: U.clamp(parseFloat($('#pFps').value) || 24, 1, 120),
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

    async function openFiles(files) {
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
        st.undo = []; st.redo = [];
        st.hit = new WeakMap();
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
        timelineEvents(); stageEvents(); sheetEvents();
        setTool('move');
        writeSettings();
        refreshAll();
        requestAnimationFrame(drawStage);
    }

    F.Parts = { init, state: st, openFromAtlas, setDoc, fitView, refresh: refreshAll, markDirty, openSheet, setFrame, undo, redo };
})(window.FNF);

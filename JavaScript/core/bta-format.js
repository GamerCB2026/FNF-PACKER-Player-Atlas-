/* ==========================================================
   FNF Packer — escritor de JSON con el estilo exacto de
   "Better Texture Atlas" (BTA) de Adobe Animate:
   claves cortas, una propiedad por línea, valores compactos.
   Reproduce byte a byte los archivos exportados por BTA.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const BTA = {};
    const J = (v) => JSON.stringify(v);
    const isPrivate = (k) => k.charAt(0) === '_';

    /* entradas "K":valor compacto, separadas por ,\n */
    const entries = (obj) => Object.keys(obj).filter(k => !isPrivate(k) && obj[k] !== undefined).map(k => `${J(k)}:${J(obj[k])}`).join(',\n');

    /* {"SI":{\n...\n}}  /  {"ASI":{\n...\n}} */
    function element(el) {
        const kind = Object.keys(el).find(k => !isPrivate(k));
        return `{${J(kind)}:{\n${entries(el[kind])}\n}}`;
    }

    /* Frame de la línea de tiempo principal */
    function mainFrame(fr) {
        let s = '{\n';
        Object.keys(fr).filter(k => !isPrivate(k) && k !== 'E').forEach(k => { s += `${J(k)}:${J(fr[k])},\n`; });
        const E = fr.E || [];
        if (!E.length) return s + '"E":[]\n}';
        return s + '"E":[\n' + E.map(element).join(',\n') + ']}';
    }

    function mainLayer(l) {
        let s = '{\n';
        Object.keys(l).filter(k => !isPrivate(k) && k !== 'FR').forEach(k => { s += `${J(k)}:${J(l[k])},\n`; });
        return s + '"FR":[\n' + (l.FR || []).map(mainFrame).join(',') + '\n]}';
    }

    /* Frame / capa dentro de un símbolo (SD) */
    function symFrame(fr) {
        const head = Object.keys(fr).filter(k => !isPrivate(k) && k !== 'E').map(k => `${J(k)}:${J(fr[k])}`).join(',\n');
        const E = fr.E || [];
        return `{${head},\n"E":[` + (E.length ? '\n' + E.map(element).join(',\n') : '') + ']}';
    }

    function symLayer(l) {
        const head = Object.keys(l).filter(k => !isPrivate(k) && k !== 'FR').map(k => `${J(k)}:${J(l[k])}`).join(',\n');
        return `{${head},\n"FR":[\n` + (l.FR || []).map(symFrame).join(',') + ']}';
    }

    function symbol(s) {
        let out = '{\n';
        Object.keys(s).filter(k => !isPrivate(k) && k !== 'TL').forEach(k => { out += `${J(k)}:${J(s[k])},\n`; });
        return out + '"TL":{\n"L":[\n' + ((s.TL && s.TL.L) || []).map(symLayer).join(',') + ']}}';
    }

    function sti(st) {
        const kind = Object.keys(st)[0];
        return `{${J(kind)}:{\n${entries(st[kind])}\n}}`;
    }

    /** Animation.json (formato de claves cortas) -> texto estilo BTA */
    BTA.stringifyAnimation = (anim) => {
        const AN = anim.AN;
        let s = '{\n"AN":{\n';
        Object.keys(AN).filter(k => !isPrivate(k)).forEach(k => {
            if (k === 'TL') s += '"TL":{\n"L":[\n' + (AN.TL.L || []).map(mainLayer).join(',') + '\n]}';
            else if (k === 'STI') s += '"STI":' + sti(AN.STI);
            else s += `${J(k)}:${J(AN[k])}`;
            s += ',\n';
        });
        s = s.replace(/,\n$/, '') + '}';
        if (anim.SD && anim.SD.S && anim.SD.S.length) s += ',\n"SD":{\n"S":[\n' + anim.SD.S.map(symbol).join(',') + '\n]}';
        if (anim.MD && Object.keys(anim.MD).length) s += ',\n"MD":{\n' + entries(anim.MD) + '\n}';
        return s + '}';
    };

    /** spritemap1.json -> texto estilo BTA */
    BTA.stringifySpritemap = (sm) => {
        const A = sm.ATLAS;
        let s = '{"ATLAS":{"SPRITES":[\n' + A.SPRITES.map(sp => `{"SPRITE":${J(sp.SPRITE)}}`).join(',\n') + ']}';
        if (sm.meta) s += ',\n"meta":{\n' + entries(sm.meta) + '\n}';
        return s + '\n}';
    };

    F.BTA = BTA;
})(window.FNF);

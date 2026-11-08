/* ==========================================================
   FNF Packer — arranque, menú lateral (3 rayitas) y rutas
   #generador  -> Crear Spritemaps / Generador
   #agregar    -> Crear Spritemaps / Agregar Spritemap
   #partes     -> Crear Spritemaps en Partes
   ========================================================== */
(function (F) {
    'use strict';
    const { U } = F;
    const $ = U.$;
    const ROUTES = ['generador', 'agregar', 'partes'];

    function openDrawer(open) {
        const d = $('#drawer'), s = $('#scrim'), b = $('#menuBtn');
        d.classList.toggle('open', open);
        d.setAttribute('aria-hidden', String(!open));
        b.setAttribute('aria-expanded', String(open));
        b.classList.toggle('is-open', open);
        s.hidden = !open;
        requestAnimationFrame(() => s.classList.toggle('show', open));
    }

    function route() {
        let r = (location.hash || '').replace('#', '');
        if (!ROUTES.includes(r)) r = 'generador';
        U.$$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + r));
        U.$$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === r));
        const group = r === 'partes' ? null : U.$('.nav-item[data-route="generador"]');
        if (group) group.classList.add('active');
        $('#spritemapTabs').hidden = r === 'partes';
        const view = $('#view-' + r);
        $('#crumb').textContent = view.dataset.title;
        document.body.dataset.route = r;
        if (r === 'partes' && F.Parts) { F.Parts.markDirty(); requestAnimationFrame(() => F.Parts.refresh()); }
        openDrawer(false);
        window.scrollTo(0, 0);
    }

    window.addEventListener('DOMContentLoaded', () => {
        $('#menuBtn').addEventListener('click', () => openDrawer(!$('#drawer').classList.contains('open')));
        $('#drawerClose').addEventListener('click', () => openDrawer(false));
        $('#scrim').addEventListener('click', () => openDrawer(false));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') openDrawer(false); });
        window.addEventListener('hashchange', route);
        U.$$('#drawer a[data-route]').forEach(a => a.addEventListener('click', () => openDrawer(false)));

        F.Frames.init();
        F.Loader.init();
        F.Parts.init();
        route();
    });
})(window.FNF);

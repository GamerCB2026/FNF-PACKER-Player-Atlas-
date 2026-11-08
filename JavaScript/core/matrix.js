/* ==========================================================
   FNF Packer — matrices 2D afines [a, b, c, d, tx, ty]
   Compatibles con MX (Animate) y M3D (Matrix3D column-major)
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const M = {};

    M.identity = () => [1, 0, 0, 1, 0, 0];

    /* m1 * m2  (se aplica primero m2 y luego m1) */
    M.multiply = (m1, m2) => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];

    M.translate = (x, y) => [1, 0, 0, 1, x, y];
    M.scale = (sx, sy) => [sx, 0, 0, sy, 0, 0];
    M.rotate = (deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };

    /* T(x,y) · R(rot) · S(sx,sy) */
    M.compose = (x, y, rotDeg, sx, sy) => {
        const r = rotDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        return [sx * c, sx * s, -sy * s, sy * c, x, y];
    };

    M.apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

    M.invert = (m) => {
        const det = m[0] * m[3] - m[1] * m[2];
        if (!det) return M.identity();
        const id = 1 / det;
        return [
            m[3] * id, -m[1] * id, -m[2] * id, m[0] * id,
            (m[2] * m[5] - m[3] * m[4]) * id,
            (m[1] * m[4] - m[0] * m[5]) * id
        ];
    };

    M.fromMX = (mx) => (Array.isArray(mx) && mx.length >= 6) ? [+mx[0], +mx[1], +mx[2], +mx[3], +mx[4], +mx[5]] : M.identity();

    M.fromM3D = (m3d) => {
        if (Array.isArray(m3d) && m3d.length >= 14) return [+m3d[0], +m3d[1], +m3d[4], +m3d[5], +m3d[12], +m3d[13]];
        if (m3d && typeof m3d === 'object') {
            return [+(m3d.m00 ?? 1), +(m3d.m01 ?? 0), +(m3d.m10 ?? 0), +(m3d.m11 ?? 1), +(m3d.m30 ?? 0), +(m3d.m31 ?? 0)];
        }
        return M.identity();
    };

    /* Matriz de un elemento (ASI / SI) del Animation.json */
    M.fromElement = (el) => {
        if (!el) return M.identity();
        if (el.M3D) return M.fromM3D(el.M3D);
        if (el.MX) return M.fromMX(el.MX);
        return M.identity();
    };

    const r6 = (v) => { const n = Math.round(v * 1e6) / 1e6; return Object.is(n, -0) ? 0 : n; };

    M.toM3D = (m) => [r6(m[0]), r6(m[1]), 0, 0, r6(m[2]), r6(m[3]), 0, 0, 0, 0, 1, 0, r6(m[4]), r6(m[5]), 0, 1];
    M.toMX = (m) => m.map(r6);

    M.isTranslationOnly = (m, eps = 1e-6) =>
        Math.abs(m[0] - 1) < eps && Math.abs(m[1]) < eps && Math.abs(m[2]) < eps && Math.abs(m[3] - 1) < eps;

    M.equals = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);

    F.M = M;
})(window.FNF);

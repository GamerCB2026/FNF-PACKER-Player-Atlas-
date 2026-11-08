/* ==========================================================
   FNF Packer — exportación por partes
   spritemap1.png/json: una imagen por parte.
   Animation.json:
     SD.S  -> un símbolo por parte (sprite desplazado por el pivote)
     AN.TL -> capa "Labels" + una capa por parte; cada frame tiene
              una instancia SI del símbolo con su matriz M3D
              (posición / rotación / escala) ya interpolada.
   ========================================================== */
window.FNF = window.FNF || {};
(function (F) {
    'use strict';
    const { U, M, Atlas, Packer } = F;
    const Model = F.PartsModel;

    const PartsExport = {};

    PartsExport.build = (project) => {
        const s = project.settings;
        if (!project.parts.length) throw new Error('No hay partes para exportar.');
        const syms = Model.symbolNames(project);
        const spriteNames = project.parts.map((p, i) => i.toString());

        // 1) Atlas con una imagen por parte
        const packed = Packer.pack(project.parts.map(p => ({ img: p.img })), { padding: 2, dedupe: true });
        const spritemapJson = Atlas.buildSpritemapJson(
            project.parts.map((p, i) => ({ name: spriteNames[i], x: packed.rects[i].x, y: packed.rects[i].y, w: p.w, h: p.h })),
            packed.canvas.width, packed.canvas.height);

        // 2) Símbolos por parte (registro en el pivote)
        const symbols = project.parts.map((p, i) => ({
            "SN": syms[i],
            "TL": { "L": [{ "LN": "Layer_1", "FR": [{ "I": 0, "DU": 1, "E": [{ "ASI": { "N": spriteNames[i], "M3D": M.toM3D(M.translate(-p.pivot.x, -p.pivot.y)) } }] }] }] }
        }));

        // 3) Línea de tiempo principal
        const labels = [];
        let cursor = 0;
        project.animations.forEach(a => { labels.push({ "N": a.name, "I": cursor, "DU": a.length, "E": [] }); cursor += a.length; });

        const partLayers = project.parts.map((p, pi) => {
            const frames = [];
            let start = 0;
            project.animations.forEach(a => {
                let prev = null;
                for (let f = 0; f < a.length; f++) {
                    const pose = Model.poseAt(a, p, f);
                    const g = start + f;
                    let elements = [];
                    if (pose.a > 0.0001) {
                        const si = {
                            "SN": syms[pi], "IN": "", "ST": "G", "FF": 0, "LP": "SF",
                            "TRP": { "x": 0, "y": 0 },
                            "M3D": M.toM3D(M.compose(pose.x, pose.y, pose.r, pose.sx, pose.sy))
                        };
                        if (pose.a < 0.9999) si.C = { "M": "CA", "AM": U.round(pose.a, 4) };
                        elements = [{ "SI": si }];
                    }
                    const sig = JSON.stringify(elements);
                    if (prev && prev.sig === sig) prev.fr.DU++;
                    else {
                        const fr = { "I": g, "DU": 1, "E": elements };
                        frames.push(fr);
                        prev = { sig, fr };
                    }
                }
                start += a.length;
            });
            return { "LN": syms[pi], "FR": frames };
        });

        const animationJson = {
            "AN": {
                "N": s.charName,
                "STI": Atlas.buildSTI(s.symName, s.format, s.offX, s.offY),
                "SN": s.symName,
                "TL": { "L": [{ "LN": "Labels", "FR": labels }].concat(partLayers) }
            },
            "SD": { "S": symbols },
            "MD": Atlas.buildMD(s.fps)
        };

        const projectJson = Model.serialize(project, { spriteNames });
        return { packed, animationJson, spritemapJson, projectJson, totalFrames: cursor };
    };

    PartsExport.zip = async (project) => {
        const out = PartsExport.build(project);
        const s = project.settings;
        const zip = new JSZip();
        const folder = zip.folder(s.charName);
        folder.file("Animation.json", JSON.stringify(out.animationJson, null, 2));
        folder.file("spritemap1.json", JSON.stringify(out.spritemapJson, null, 2));
        folder.file("spritemap1.png", await U.canvasToBlob(out.packed.canvas));
        folder.file("proyecto-partes.json", JSON.stringify(out.projectJson, null, 2));
        const blob = await zip.generateAsync({ type: 'blob' });
        const name = `${s.charName}_Partes_${s.format === 'v-slice' ? 'Vslice' : 'Pslice'}_Pack.zip`;
        return { blob, name, out };
    };

    F.PartsExport = PartsExport;
})(window.FNF);

let framesData = [];
let anims = ["idle", "confirm", "select", "deselect", "slidein", "slideout", "slidein idle point", "deselect loop start"];

window.onload = () => {
    updateAnimSelectors();
    setupEventListeners();
};

// Configura los escuchas de eventos (removiendo el onclick del HTML)
function setupEventListeners() {
    document.getElementById('addAnimBtn').addEventListener('click', addNewAnimation);
    document.getElementById('fileInput').addEventListener('change', handleFilesLoad);
    document.getElementById('selectAllBtn').addEventListener('click', () => toggleAll(true));
    document.getElementById('deselectAllBtn').addEventListener('click', () => toggleAll(false));
    document.getElementById('applyBulkBtn').addEventListener('click', applyBulk);
    document.getElementById('genBtn').addEventListener('click', processAll);
}

function updateAnimSelectors() {
    const bulkSelect = document.getElementById('bulkAnimSelect');
    const currentBulkVal = bulkSelect.value;
    bulkSelect.innerHTML = anims.map(a => `<option value="${a}">${a}</option>`).join('');
    if (anims.includes(currentBulkVal)) bulkSelect.value = currentBulkVal;

    framesData.forEach((_, i) => {
        const indSelect = document.getElementById(`anim_${i}`);
        if (indSelect) {
            const currentVal = indSelect.value;
            indSelect.innerHTML = anims.map(a => `<option value="${a}">${a}</option>`).join('');
            if (anims.includes(currentVal)) {
                indSelect.value = currentVal;
            }
        }
    });
}

function addNewAnimation() {
    const input = document.getElementById('newAnimName');
    const name = input.value.trim();
    
    if (name === "") return alert("Por favor escribe un nombre para la animación.");
    if (anims.includes(name)) return alert("Esa animación ya existe en la lista.");

    anims.push(name);
    updateAnimSelectors();
    input.value = "";
    document.getElementById('status').innerText = `Animación "${name}" añadida.`;
}

async function handleFilesLoad(e) {
    const list = document.getElementById('frameList');
    
    // Si es la primera vez que cargamos archivos, quitamos el texto de marcador de posición
    if (framesData.length === 0) {
        list.innerHTML = '';
    } else {
        // Si ya hay archivos, removemos cualquier mensaje de texto suelto que haya quedado
        const placeholder = list.querySelector('p');
        if (placeholder) placeholder.remove();
    }

    // Convertimos los nuevos archivos cargados en un Array y los ordenamos de forma natural
    const newFiles = Array.from(e.target.files).sort((a, b) => 
        a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    
    // Guardamos el índice donde nos quedamos antes para continuar la numeración consecutiva
    const startIdx = framesData.length;

    for (let i = 0; i < newFiles.length; i++) {
        const currentGlobalIdx = startIdx + i;
        
        // Procesamos la imagen actual
        const img = await new Promise(r => { 
            const reader = new FileReader(); 
            reader.onload = ev => { 
                const im = new Image(); 
                im.onload = () => r(im); 
                im.src = ev.target.result; 
            }; 
            reader.readAsDataURL(newFiles[i]); 
        });

        // Guardamos la imagen en nuestro array acumulativo sin perder las anteriores
        framesData.push({ img, name: currentGlobalIdx.toString(), file: newFiles[i] });
        
        // Creamos y agregamos el nuevo elemento visual a la lista existente
        const div = document.createElement('div');
        div.className = 'frame-item';
        div.innerHTML = `
            <input type="checkbox" class="frame-cb" data-idx="${currentGlobalIdx}">
            <img src="${img.src}">
            <span style="font-family:monospace; width:60px;">[${currentGlobalIdx}]</span>
            <select id="anim_${currentGlobalIdx}">
                ${anims.map(a => `<option value="${a}" ${currentGlobalIdx === 0 && a === 'idle' ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
        `;
        list.appendChild(div);
    }

    // Habilitamos el botón de generación y actualizamos el estado
    document.getElementById('genBtn').disabled = false;
    document.getElementById('status').innerText = `Total de imágenes cargadas: ${framesData.length}`;
    
    // Resetear el input file para que permita volver a cargar el mismo archivo si es necesario
    e.target.value = "";
}

function toggleAll(val) {
    document.querySelectorAll('.frame-cb').forEach(cb => cb.checked = val);
}

// Corrección para aplicar la animación en bloque
function applyBulk() {
    const val = document.getElementById('bulkAnimSelect').value;
    const selected = document.querySelectorAll('.frame-cb:checked');
    if(selected.length === 0) return alert("Selecciona primero los cuadros.");
    selected.forEach(cb => {
        const selectElement = document.getElementById(`anim_${cb.dataset.idx}`);
        if(selectElement) {
            selectElement.value = val;
        }
    });
}

async function processAll() {
    const status = document.getElementById('status');
    status.innerText = "Procesando Atlas y JSONs (Optimizando imágenes duplicadas)...";
    
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const padding = 2;

    // --- GENERAR FIRMA ÚNICA BASADA EN PÍXELES REALES ---
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    const getImagePixelSignature = (img) => {
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.clearRect(0, 0, img.width, img.height);
        tempCtx.drawImage(img, 0, 0);
        return tempCanvas.toDataURL();
    };

    // --- DETECCIÓN E IDENTIFICACIÓN DE IMÁGENES DUPLICADAS ---
    const uniqueFrames = [];
    const pixelToUniqueFrameMap = {}; // Firma de Píxeles -> Frame Original

    framesData.forEach((f) => {
        const pixelSignature = getImagePixelSignature(f.img);
        
        if (pixelToUniqueFrameMap[pixelSignature]) {
            // Es un duplicado. Apunta al frame original (master) para heredar sus coordenadas
            f.isDuplicate = true;
            f.masterFrame = pixelToUniqueFrameMap[pixelSignature];
        } else {
            // Es una imagen única nueva
            f.isDuplicate = false;
            f.masterFrame = f;
            f.x = 0; 
            f.y = 0;
            pixelToUniqueFrameMap[pixelSignature] = f;
            uniqueFrames.push(f); // Solo las únicas se dibujan en el PNG
        }
    });

    // --- ALGORITMO DE EMPAQUETADO (Solo calcula posiciones para frames únicos) ---
    let totalArea = 0;
    let maxFrameW = 0;
    let maxFrameH = 0;

    uniqueFrames.forEach(f => {
        totalArea += (f.img.width + padding) * (f.img.height + padding);
        if (f.img.width > maxFrameW) maxFrameW = f.img.width;
        if (f.img.height > maxFrameH) maxFrameH = f.img.height;
    });

    let idealWidth = Math.max(maxFrameW + padding, Math.ceil(Math.sqrt(totalArea)));
    
    let currentX = 0;
    let currentY = 0;
    let rowH = 0;
    let finalWidth = 0;

    uniqueFrames.forEach(f => {
        if (currentX + f.img.width > idealWidth) {
            currentX = 0;
            currentY += rowH + padding;
            rowH = 0;
        }
        f.x = currentX;
        f.y = currentY;
        currentX += f.img.width + padding;
        rowH = Math.max(rowH, f.img.height);
        
        if (f.x + f.img.width > finalWidth) {
            finalWidth = f.x + f.img.width;
        }
    });

    let finalHeight = currentY + rowH;

    // Redimensionamos el lienzo e imprimimos solo las imágenes únicas
    c.width = finalWidth;
    c.height = finalHeight;

    ctx.clearRect(0, 0, c.width, c.height);
    uniqueFrames.forEach(f => ctx.drawImage(f.img, f.x, f.y));

    // --- PROCESAMIENTO SECUENCIAL RESPETANDO EL ORDEN DE LA LISTA (0, 1, 2, 3...) ---
    const charN = document.getElementById('charName').value;
    const symN = document.getElementById('symName').value;
    
    const layerFrames = [];
    const spriteInstances = [];
    
    let currentAnimName = null;
    let currentAnimStartIdx = 0;
    let currentAnimDuration = 0;

    framesData.forEach((f, i) => {
        const selectElement = document.getElementById(`anim_${i}`);
        const assignedAnim = selectElement ? selectElement.value : "idle";

        // 1. Añadimos el registro a la línea de tiempo de Sprites secuencialmente
        spriteInstances.push({ 
            "I": i, 
            "DU": 1, 
            "E": [{ 
                "ASI": { 
                    "N": f.name, 
                    "M3D": [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] 
                } 
            }] 
        });

        // 2. Agrupamos de forma consecutiva para la sección "Labels"
        if (currentAnimName === null) {
            // Primera animación encontrada en la imagen 0
            currentAnimName = assignedAnim;
            currentAnimStartIdx = i;
            currentAnimDuration = 1;
        } else if (assignedAnim === currentAnimName) {
            // Sigue siendo la misma animación consecutiva
            currentAnimDuration++;
        } else {
            // La animación cambió, guardamos el bloque anterior
            layerFrames.push({
                "N": currentAnimName,
                "I": currentAnimStartIdx,
                "DU": currentAnimDuration,
                "E": []
            });
            // Iniciamos el nuevo bloque de animación consecutiva
            currentAnimName = assignedAnim;
            currentAnimStartIdx = i;
            currentAnimDuration = 1;
        }
    });

    // Guardamos el último bloque de animación después de salir del bucle
    if (currentAnimName !== null) {
        layerFrames.push({
            "N": currentAnimName,
            "I": currentAnimStartIdx,
            "DU": currentAnimDuration,
            "E": []
        });
    }

    const userFps = parseFloat(document.getElementById('fps').value) || 24;
    const animationJson = {
        "AN": {
            "N": charN,
            "STI": { "SI": { "SN": symN, "FF": 0, "ST": "G", "TRP": {"x":0,"y":0}, "LP": "PO", "MX": [1,0,0,1, parseFloat(document.getElementById('stiX').value), parseFloat(document.getElementById('stiY').value)] }},
            "SN": symN,
            "TL": {
                "L": [
                    { "LN": "Labels", "FR": layerFrames },
                    { "LN": "Sprites", "FR": spriteInstances }
                ]
            }
        },
        "MD": { "V": "BTA 1.2.0", "FRT": userFps, "W": 1280, "H": 720, "ASV": 3 }
    };

    // spritemap1.json mapea todos los frames secuencialmente
    const spritemapJson = {
        "ATLAS": {
            "SPRITES": framesData.map(f => ({ 
                "SPRITE": { 
                    "name": f.name, 
                    "x": f.masterFrame.x, 
                    "y": f.masterFrame.y, 
                    "w": f.img.width, 
                    "h": f.img.height, 
                    "rotated": false 
                } 
            })),
            "meta": { 
                "app": "Spritemap Convert Web", 
                "version": "22.0.5.191", 
                "image": "spritemap1.png", 
                "format": "RGBA8888", 
                "size": {"w":c.width,"h":c.height}, 
                "resolution": "1" 
            }
        }
    };

    const zip = new JSZip();
    const folder = zip.folder(charN);
    folder.file("Animation.json", JSON.stringify(animationJson, null, 2));
    folder.file("spritemap1.json", JSON.stringify(spritemapJson, null, 2));
    const imgBlob = await new Promise(r => c.toBlob(r));
    folder.file("spritemap1.png", imgBlob);

    const content = await zip.generateAsync({type:"blob"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${charN}_Vslice_Pack.zip`;
    link.click();
    
    const savedFrames = framesData.length - uniqueFrames.length;
    status.innerText = `¡ZIP generado con éxito! Se mapearon todos los frames y se ahorró el espacio de ${savedFrames} imágenes en el PNG.`;
}

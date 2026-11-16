# FNF-PACKER-Player-Atlas-
Crea tus personajes jugables de FNF En esta página de forma fácil y sencilla

Herramientas:

Gemini y GamerCB

# Utilidad*

Crear personajes de forma sencilla tan sencilla que con unos clicks ya tienes tu personaje como sprites normales sin necesidad de adobe animated tanto para celular como PC funcional con V Slice y P Slice

# Paginas*

TU MOD FNF: https://sites.google.com/view/fnftumod-gamercb/p%C3%A1gina-principal?authuser=1

FNF Chart Convert: https://gamercb2026.github.io/Chart-Convert-V-Slice.github.io/

FNF Stage Convert: https://gamercb2026.github.io/Convert-Stage-Psych-A-V-slice-V1/

BY: GamerCB

# Novedades v3.0.1

En **Crear Spritemaps en Partes**:
- **Separar como nueva animación:** selecciona un rango en la línea de tiempo (clic en el primer frame y Shift+clic en el último; en el celular, botón **Rango** y dos toques). Luego **Separar…** (barra de claves) o **Separar como nueva animación** (hoja Animaciones). Elige el nombre (sugerencias: idle, singLEFT, singDOWN, singUP, singRIGHT y sus variantes miss). Por defecto los frames se mueven; marca **Copiar** para dejarlos también en la animación original. Cada frame incluye todas las capas.
- **Varios .ipv / .psd a la vez:** elige o arrastra varios archivos. Se ordenan por nombre y cada uno es una animación: `ipv 1`, `ipv 2`… (o `psd 1`…). Las piezas idénticas se reutilizan entre archivos.
- **Renombrar y FPS por animación:** en la lista de Animaciones cada una tiene ✎ para renombrarla y su propio campo de FPS (24 por defecto). La vista previa usa los FPS de cada animación. Al exportar, `Animation.json` lleva el FPS más usado (el de la vista previa se guarda en `fnf-packer.json` para recuperarlo al volver a abrir el spritemap). No se exporta un `animaciones-fps.json` suelto: en V-Slice no se usa.
- **PNG y ASTC:** en todos los cargadores (Generador, Agregar Spritemap, Partes, zips y carpetas) puedes usar `.astc` en lugar de `.png`. Si el json pide `spritemap1.png` y solo está `spritemap1.astc` (o al revés), se usa el que haya. El ASTC se decodifica a RGBA en el navegador (2D LDR, cualquier tamaño de bloque). La exportación sigue siendo PNG.
- **Sub-capas / grupos:** en Capas marca 2 o más capas (casilla ☐, o Ctrl+clic / Shift+clic) y pulsa **Agrupar**. El grupo se mueve, escala y rota como una sola pieza; con **▶** lo expandes para editar las capas de adentro (sangría). **Desagrupar** las suelta otra vez. Al exportar, el grupo es un símbolo anidado de Adobe Animate (`SD.S` + instancia `SI`), compatible con V-Slice / FlxAnimate. En un **.psd** las carpetas/grupos entran como sub-capas; en un **.ipv** las carpetas de primer nivel siguen siendo frames y solo las subcarpetas internas se vuelven grupos.

# Novedades v3.0.0


- Interfaz nueva en tema oscuro azul, con menú lateral (3 rayitas).
- **Crear Spritemaps**: el generador de siempre (misma salida V-Slice / P-Slice), ahora con vista previa animada, reordenar frames arrastrando, duplicar, renombrar y eliminar animaciones.
- **Agregar Spritemap**: carga un spritemap existente (PNG + spritemap1.json + Animation.json o el .zip), muestra sus partes, símbolos y animaciones con vista previa, y permite editarlo o fusionarlo con otro y volver a exportarlo.
- **Crear Spritemaps en Partes**: sube las partes del cuerpo, colócalas en el lienzo, anímalas con claves (posición, rotación, escala, opacidad) y exporta un Animation.json con un símbolo por parte.

Estructura: `index.html`, `Style/style.css`, `JavaScript/core/*` (formato, empaquetado, lectura y reproductor del atlas), `JavaScript/modules/*` (cada sección) y `JavaScript/app.js` (menú y rutas). Sin compilación: funciona directo en GitHub Pages.

## Celular y formato Adobe Animate

- Pensada primero para celular: botones de 44px, hojas inferiores (Piezas, Capas, Propiedades, Animaciones, Exportar), gestos táctiles en el lienzo (1 dedo usa la herramienta, 2 dedos pellizcan para zoom o, en modo "Pieza", escalan y giran la pieza), línea de tiempo que se desliza con el dedo, deshacer/rehacer y botones en lugar de doble clic o teclado.
- **Crear Spritemaps en Partes** ahora trabaja directamente con el formato de Adobe Animate / Better Texture Atlas: capas, keyframes, símbolos por pieza (`SD`), instancias `SI` con `TRP`, `LP`, `MX`. Un spritemap hecho en Animate se abre, se edita y se vuelve a exportar idéntico.
- Interpolación entre keyframes (lineal, suave, acelerar, frenar): se exporta horneada a frames de 1, como lo hace Animate, y se guarda en `fnf-packer.json` para seguir editándola.
- **Agregar Spritemap** reproduce sprites rotados (`rotated: true`) y símbolos anidados, y permite elegir los archivos por separado.
- Vista previa de la pantalla de inicio corregida en celular: ya no crece sin parar; tiene altura contenida y cabe en pantalla (vertical y horizontal).

## Abrir PSD o IPV en "Crear Spritemaps en Partes"

En **Abrir spritemap por partes, PSD o IPV…** (o arrastrando el archivo al lienzo) ahora puedes abrir:

- **.psd** (Photoshop, ibisPaint, Krita…), leído con `ag-psd` guardado en `JavaScript/lib/ag-psd.js`, sin internet.
- **.ipv** (proyecto de ibisPaint X), leído con un lector propio (`JavaScript/modules/ipv-import.js`).

Cómo se convierte:
- Cada capa visible es una **pieza**. Las capas idénticas se reutilizan como la misma pieza.
- En **.ipv**, cada **carpeta de primer nivel** es un **frame** (como en ibisPaint). Las subcarpetas internas son **grupos/sub-capas**.
- En **.psd**, las carpetas/grupos de un nivel son **sub-capas** de un solo pose. Si una carpeta tiene subcarpetas, la carpeta es una **animación con su nombre** (por ejemplo `idle`, `singLEFT`) y cada subcarpeta es un frame; las carpetas dentro del frame siguen siendo grupos.
- Las capas fuera de carpetas quedan fijas en todos los frames (fondo o frente), salvo en un PSD de un solo pose (ahí van junto a los grupos).
- Las capas ocultas no se ponen en la línea de tiempo.

Después se anima y se exporta igual que cualquier proyecto por partes.

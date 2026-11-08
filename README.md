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

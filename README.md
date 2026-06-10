# Zurich Padel Cup

Aplicacion web simple para gestionar un torneo de padel de oficina con dos grupos de 4 equipos.

## Como usarla

1. Abre `index.html` en el navegador.
2. Agrega o elimina equipos desde la pestaña Configuracion. Cada equipo tiene pareja A y pareja B.
3. Pulsa Generar partidos para crear el calendario por grupos.
4. Carga resultados en la pestaña Resultados. Cada cruce se juega dos veces, una por pareja.
5. Revisa Ranking y Ronda final para ver clasificados y cruces.

Los datos se guardan automaticamente en el navegador. Tambien puedes exportar e importar un archivo JSON desde los botones de la esquina superior derecha.

Para usar el logo oficial, coloca el archivo como `assets/zurich-logo.svg`. Si Zurich Sans no esta instalada en el equipo, agrega los archivos de fuente y define `@font-face` en `styles.css`.

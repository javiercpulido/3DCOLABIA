# TECTOS·3D — Ruta futura

Ideas aprobadas pendientes de implementar, en orden de prioridad flexible.

## Edición de componentes anidados (estilo SketchUp) + alcance de instancia/biblioteca

Al pulsar **dos veces** sobre un componente (p. ej. una puerta) se **entra a editarlo**:
el resto del modelo donde está incorporado se vuelve **transparente** para poder
editar el elemento viendo algo del contexto.

- Si dentro se pulsa **dos veces** sobre un elemento **anidado** (p. ej. la manilla),
  se entra un nivel más: la **puerta también se vuelve transparente**, pero **menos**
  que el resto del modelo (está a un solo nivel de anidamiento), y la **manilla se
  sigue viendo perfectamente**.
- La transparencia del contexto escala con el **nivel de anidamiento**: cuanto más
  «fuera» está un elemento del que se edita, más transparente.
- **Alcance de la edición** (elección del usuario al editar una instancia):
  - **Toda la biblioteca / todas las instancias**: el cambio afecta a **todos los
    elementos BIM** que usan ese componente (como editar una familia de Revit).
  - **Solo esta instancia**: el cambio afecta únicamente a la instancia editada
    (se «desvincula» de la biblioteca para esa colocación).
- Encaja con el marco local del componente (v6.45) y con la colocación por
  transformación aparte (IfcLocalPlacement / IfcMappedItem): editar la geometría
  en su marco local propaga a todas las instancias; editar solo una instancia crea
  una variante local.

## Grosor de las líneas láser (control aparte en el menú del láser)

Ya existe el motor de ancho en pantalla por shader (`fatLine`, v6.49) usado para
el **grosor visual de aristas**. Falta aplicarlo a las **líneas del láser** con su
propio control en el **menú del láser** (independiente del grosor de aristas). Dos
matices técnicos: las líneas del láser se reconstruyen cada frame (rebuild del
`fatLine` en `updateLasers`, en modo «segmentos» = pares, no polilínea) y usan
planos de recorte (clipping), que habría que llevar al shader de `fatLine` o
aceptar sin recorte para sus propias líneas.

## Booleanas — completar el set

- **Restar** e **Intersecar** (ya está **Unir**, v6.47), con el mismo patrón no
  destructivo (cuerpo nuevo, originales conservados).
- **Coser / engrosar superficies** (lámina → sólido) para poder boolear con ellas.
- **Pregunta de fusión al crear** una superficie que se solapa con piezas
  existentes: «¿unir con una o varias piezas?» (el sitio natural es la barra
  flotante «Crear superficie», v6.46).
- Opcional: fase de **simplificación de malla** tras el CSG (el BSP multiplica
  triángulos en las intersecciones).

## Superficies

- Suavizado de mínima energía (laplaciano) más fino en membranas muy alabeadas
  (mejorado en v6.40; margen para pulir el interior).

## Grosores y estilos

- **Grosores y estilos preconfigurados tipo portfolio** (plumillas con nombre).

## Convergencia de lápices (del Plan Maestro)

- Converger a un lápiz inteligente único + «Formas exactas», sin quitar nada hasta
  que el unificado cubra el 100 %.

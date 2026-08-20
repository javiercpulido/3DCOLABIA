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

## Redondear (fillet) — redondeo de ARISTAS 3D

Hecho el **fillet de líneas** (v6.50): arco tangente de radio r en las esquinas de
líneas unidas (⛓), con radio en vivo (casilla + flechas + deslizador), fantasma
azul, ✓ por esquina y «Aplicar a todas».

**Fase A — redondeo de ARISTAS 3D (media caña / bisel), no destructivo (v6.54):**
hecho. Con la herramienta ⌒ activa se **toca una arista viva** de una pieza (se
detectan por pares de triángulos con normales que forman ángulo, `computeFeatEdges`);
aparece un **fantasma** azul (redondeo) o naranja (bisel) tangente a las dos caras;
el radio se ajusta **arrastrando el Pencil** arriba/abajo o con la casilla + ▲▼ /
deslizador; el botón **«Confirmar arista»** lo materializa como **superficie no
destructiva** (`kind:'fillet3d'`, guardada en el proyecto). Botón **Redondeo/Bisel**
para cambiar de perfil. La arista original de la pieza no se toca (media caña
apoyada encima), así el diff de GlobalId del BIM sigue intacto.

Pendiente (**Fase B**, verdadero redondeo de malla): recortar/coser la media caña
al sólido (booleana) para un borde redondeado real; **esferas de empalme** en las
esquinas donde concurren varias aristas; control de **segmentos** del arco; selección
de un **conjunto de caras** para redondear todas sus aristas de golpe; e **invertir**
(quitar material como bisel cóncavo). Encaja con el motor de superficies + booleanas.

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

**Fase A (v6.57) — hecha**: separación **Trazo** (mano alzada: pegado · libre ·
calco láser · nota) vs **Forma** (exacta: recta · Poli 3D), cada botón muta al
icono de su última opción; y **Continuo** como conmutador global en el dock
(funde el candado «seguir dibujando» + «unir en continuidad» en uno, estilo
SketchUp). Sin cambios de comportamiento en las herramientas.

**Fase B (v6.58) — hecha**: formas exactas de TOQUE en el menú Forma —
**circunferencia** (arrastre centro→radio, radio en vivo y radio exacto por
casilla al quedar seleccionada), **elipse** (arrastre centro→esquina, semiejes
según los ejes del plano) y **arco por 3 puntos** (1º arrastre = cuerda con
inferencia de ejes; 2º arrastre = curvar, el arco pasa por el lápiz; sin
flecha → recta). Plano de la forma: papel activo → su plano; cara tocada →
plano tangente; si no, plano de vista. Todas con OSNAP en centro y arrastre,
tiradores ya existentes (centro/radio · p0/pm/p1) y glifos OSNAP automáticos
(centro ⊙ + cuadrantes ◇). El gesto «mantén ≈1 s» se conserva en paralelo.
Pendiente menor: tiradores de la elipse y casilla numérica para arco/elipse.

**Rectángulo (v6.59) — hecho**: forma exacta de 2 esquinas en el menú Forma;
arrastre esquina→esquina opuesta con imán (OSNAP, láser y aristas) en ambas
esquinas; se crea como contorno cerrado (4 líneas) que **Descomponer** separa.
Pendiente menor: tiradores por esquina y casilla ancho×alto.

## Descomponer (v6.59) — hecho

Botón **Descomponer** en la barra de selección, ahora para dos casos:
- **Forma/trazo** con varias líneas → líneas **independientes** seleccionables
  por separado (ya existía para trazos; el rectángulo encaja aquí).
- **Pieza/sólido** → sus **caras** como superficies independientes en el panel
  (agrupa triángulos por adyacencia + normales similares, ~25°: pared del
  cilindro + tapas, etc.). No destructivo: la pieza se **oculta** y el deshacer
  la restaura; las caras se guardan y recuperan en el proyecto.
Pendiente: selección de superficies/caras por toque en 3D (hoy se gestionan en
el panel de superficies: ver/ocultar, bloquear, borrar).

**Fase C — pendiente**: converger a un lápiz inteligente único + «Formas
exactas», sin quitar nada hasta que el unificado cubra el 100 %.

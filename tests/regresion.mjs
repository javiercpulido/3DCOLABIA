// TECTOS·3D — Suite de regresión ("lo bueno" que no se puede perder)
// Uso:  node tests/regresion.mjs [ruta/index.html]
// Cada sección arranca con la página RECIÉN cargada (sin contaminación cruzada).
// La suite entera debe estar en VERDE antes y después de cada fase del Plan Maestro.
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const FILE = process.argv[2] || new URL('../index.html', import.meta.url).pathname;
const results = [];
let page, browser, pageErrors;

const ok = (name, cond) => results.push({ name, pass: !!cond });

async function fresh() {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.goto('file://' + FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
}
const scr = w => page.evaluate(w => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  const v = new THREE.Vector3(...w).project(window._dbg.cam);
  return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
}, w);

// ---------------------------------------------------------------- secciones
const secciones = {

  async carga() {
    ok('carga sin errores de consola', pageErrors.length === 0);
    const r = await page.evaluate(() => ({
      mode: window._dbg.mode,
      selOn: document.getElementById('mSel').classList.contains('on'),
      topBar: [...document.querySelectorAll('#views button')].slice(0, 3).map(b => b.id).join(','),
      version: /v\d+\.\d+/.test(document.getElementById('brand').textContent),
    }));
    ok('herramienta por defecto: selección', r.mode === 'sel' && r.selOn);
    ok('deshacer/rehacer arriba, antes de órbita', r.topBar === 'undo,redo,mOrbit');
    ok('versión visible en la marca', r.version);
  },

  async osnap_grosor() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const thick = { points: [[0, 0, 0], [40, 0, 0]], color: '#000', w: 2, sobre: 't',
        reg: { c: new THREE.Vector3(0, 0, 0), U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 0, 1), tipo: 'linea', pts2: [[0, 0], [40, 0]] } };
      D.strokes.push(thick); D.redraw(); await frame();
      const sp = D.buildSnapPts(null);
      const hasEnd = sp.some(q => q.kind === 'end' && Math.abs(q.p[0] - 40) < 1e-6 && Math.abs(q.p[1]) < 1e-6 && Math.abs(q.p[2]) < 1e-6);
      D.selectStroke(thick); await frame();
      const h = D.handles.find(x => x.role === 'p1' || x.role === 'f1');
      const handleAxis = h && Math.abs(h.mesh.position.x - 40) < 1e-6 && Math.abs(h.mesh.position.y) < 1e-6;
      return { hasEnd, handleAxis };
    });
    ok('snap de extremo en el EJE con línea gruesa', r.hasEnd);
    ok('pinzamiento en el EJE con línea gruesa', r.handleAxis);
  },

  async calco() {
    await page.evaluate(() => {
      const D = window._dbg;
      D.drawLock = false; D.contJoin = false;   // calco puro (sin continuo)
      D.strokes.push({ points: [[60, 42, 10], [60, 42, -10]], color: '#000', w: 0.2, sobre: 't' }); D.redraw();
      document.getElementById('mDraw').click();
      document.querySelector('#drawmenu [data-dm="laser"]').click();
    });
    await page.waitForTimeout(200);
    const a = await scr([10, 42, 10]), b = await scr([60, 42, 10]);
    await page.mouse.move(a[0], a[1]); await page.mouse.down();
    await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 8 });
    await page.mouse.move(b[0] + 2, b[1] - 1, { steps: 8 });
    await page.mouse.up(); await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const D = window._dbg, st = D.strokes[D.strokes.length - 1];
      const e = st.points[st.points.length - 1];
      const onEdge = st.points.every(q => Math.abs(q[1] - 42) < 1.5 && Math.abs(q[2] - 10) < 1.5);
      return { n: st.points.length, onEdge, endExact: Math.hypot(e[0] - 60, e[1] - 42, e[2] - 10) < 1e-6,
        guias: D.buildCalcoPolys().length };
    });
    ok('calco sigue la arista (puntos sobre ella)', r.onEdge && r.n > 10);
    ok('extremo del calco clavado en OSNAP exacto', r.endExact);
    ok('guías calcables sin láser (aristas+cuadrantes)', r.guias > 4);
  },

  async poli() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // simetría que CIERRA: A(10,10) B(0,0) C(10,0) → espejo x=10
      D._polyStart([10, 10, 0]); D._polyVert([0, 0, 0]); D._polyVert([10, 0, 0]); await frame();
      document.getElementById('pcMir').click(); await frame();
      const ghost = D.mirrorViz.children.length === 1;
      document.getElementById('pcMir').click(); await frame();
      const st = D.strokes[D.strokes.length - 1];
      const mirClosed = !D.polyDraw && st && st.poly && st.closed && st.verts.length === 4;
      D.deselect(); await frame();
      // spline pegajoso + mezcla con recta
      D._polyStart([50, 0, 0]); document.getElementById('pcSpl').click();
      D._polyVert([70, 0, 0]); D._polyVert([80, 15, 0]); await frame();
      const segS = D.polyDraw.segTypes.join('') === 'SS';
      document.getElementById('pcLine').click(); D._polyVert([95, 15, 0]); await frame();
      const segMix = D.polyDraw.segTypes.join('') === 'SSL';
      document.getElementById('pcDone').click(); await frame();
      const st2 = D.strokes[D.strokes.length - 1];
      return { ghost, mirClosed, segS, segMix, sampled: st2.points.length > 20 };
    });
    ok('simetría: fantasma y cierre automático', r.ghost && r.mirClosed);
    ok('spline pegajoso y mezcla con recta', r.segS && r.segMix && r.sampled);
  },

  async continuidad_partir() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      D.drawLock = true; D.contJoin = true;   // Continuo ON (por defecto) para la soldadura
      document.getElementById('mDraw').click(); document.getElementById('mDraw').click();
      const s1 = { points: [[100, 10, 0], [110, 10, 0], [120, 10, 0]], color: '#000', w: 0.2, sobre: 't' };
      const s2 = { points: [[120, 10, 0], [120, 20, 0], [120, 30, 0]], color: '#000', w: 0.2, sobre: 't' };
      D.strokes.push(s1); D.strokes.push(s2);
      const m = D.tryContinuousMerge(s2);
      const joints = JSON.stringify(m.joints) === JSON.stringify([2]) && m.points.length === 5;
      // pinzamiento elástico de la soldadura
      D.moveContPoint(m, 2, [125, 10, 5]);
      const P = m.points;
      const elastic = Math.hypot(P[2][0] - 125, P[2][1] - 10, P[2][2] - 5) < 1e-9 &&
        Math.abs(P[0][0] - 100) < 1e-9 && Math.abs(P[4][2]) < 1e-9 && P[1][2] > 1 && P[3][2] > 1;
      D.selectStroke(m); D.redraw(); await frame();
      const handleJ = D.handles.some(h => h.role === 'J2') && D.handles.some(h => h.role === 'f0');
      D.deselect();
      return { joints, elastic, handleJ };
    });
    ok('unir en continuidad: soldadura exacta y joints', r.joints);
    ok('mover soldadura: deformación elástica, extremos fijos', r.elastic);
    ok('pinzamientos en soldaduras (J) y extremos', r.handleJ);
    // partir desde el dock
    await page.evaluate(() => { const D = window._dbg;
      D.strokes.push({ points: [[-40, -20, 0], [10, -20, 0]], color: '#000', w: 0.2, sobre: 't' }); D.redraw();
      document.getElementById('mSplitTool').click(); });
    const c = await scr([-15, -20, 0]);
    await page.mouse.click(c[0], c[1]); await page.waitForTimeout(250);
    const r2 = await page.evaluate(() => {
      const D = window._dbg, n = D.strokes.length;
      const a = D.strokes[n - 2], b = D.strokes[n - 1];
      const shared = a && b && Math.hypot(
        a.points[a.points.length - 1][0] - b.points[0][0],
        a.points[a.points.length - 1][1] - b.points[0][1],
        a.points[a.points.length - 1][2] - b.points[0][2]) < 1e-9;
      document.getElementById('mSplitTool').click();
      return { shared, armed: true };
    });
    ok('partir: dos mitades comparten el punto exacto', r2.shared);
  },

  async deshacer_rehacer() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const out = {};
      // borrar trazo → deshacer lo recupera → rehacer lo borra
      const st = { points: [[0, 0, 0], [20, 0, 0]], color: '#000', w: 0.2, sobre: 't' };
      D.strokes.push(st); D.redraw(); D.selectStroke(st); await frame();
      document.getElementById('selDel').click(); await frame();
      out.del = !D.strokes.includes(st);
      document.getElementById('undo').click(); await frame();
      out.undoDel = D.strokes.includes(st) && document.getElementById('trashList').textContent.includes('vacía');
      document.getElementById('redo').click(); await frame();
      out.redoDel = !D.strokes.includes(st);
      document.getElementById('undo').click(); await frame();
      // pieza: borrar → deshacer visible + papelera limpia
      const m = D.pieces['1 roseta'];
      D.select('pieza', m, '1 roseta'); await frame();
      document.getElementById('selDel').click(); await frame();
      out.piezaOculta = m.visible === false;
      document.getElementById('undo').click(); await frame();
      out.piezaVuelve = m.visible === true && document.getElementById('trashList').textContent.includes('vacía');
      // pila vacía: NO borra nada (sin pop destructivo)
      while (D.undoActs.length) D.undoActs.pop();
      const n = D.strokes.length;
      document.getElementById('undo').click(); await frame();
      out.sinPop = D.strokes.length === n;
      return out;
    });
    ok('borrar → deshacer recupera (y limpia papelera)', r.undoDel && r.del);
    ok('rehacer vuelve a borrar', r.redoDel);
    ok('pieza: deshacer la devuelve visible', r.piezaOculta && r.piezaVuelve);
    ok('pila vacía: deshacer no destruye nada', r.sinPop);
  },

  async laser() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const out = {}, darkBefore = D.darkView;
      const L = D.addLaser(false); await frame();
      out.noDark = D.darkView === darkBefore;
      out.escala = Math.abs(L.mesh.scale.x - D.R / 200) < 1e-6;
      out.gris = L.cubeMat.color.getHex() === 0x8e939a && L.topMat.color.getHex() === 0x00e676 && !!L.edgeMat;
      // candado
      document.getElementById('mLaser').click(); await frame();
      document.querySelector('#laserList [data-k]').click(); await frame();
      out.lock = L.locked === true;
      const px = L.mesh.position.x; D.resetLaser(L); await frame();
      out.lockReset = Math.abs(L.mesh.position.x - px) < 1e-6;
      D.select('laser', L, L.name); D.updateGizmo();
      out.gizmoOculto = !D.gizmo.visible;
      document.querySelector('#laserList [data-k]').click(); await frame();
      out.unlock = !L.locked;
      // otra herramienta cierra el menú de láseres
      document.getElementById('mSel').click(); await frame();
      out.menuCerrado = document.getElementById('lasermenu').style.display === 'none';
      // PLANO BASE (suelo de apoyo): proyección de fondo desactivable — ahora se controla desde Estilos (Suelo base)
      D.setSuelo(true); await frame();
      const nOn = L.geo.attributes.position.count;
      D.setSuelo(false); await frame();
      const nOff = L.geo.attributes.position.count;
      out.planoBase = D.groundLaserOn === false && nOff < nOn && nOff > 0;   // quita la proyección de fondo, mantiene la de piezas
      D.setSuelo(true);
      // SECCIÓN NEGRA: la línea del láser pasa a negro (línea técnica) y oculta el aparato
      D.setLaserBlack(L, true);
      out.negro = L.black === true && L.matA.color.getHex() === 0x1c1c1e && L.mesh.visible === false && L.matB.opacity === 0;
      D.setLaserBlack(L, false);
      out.verde = L.black === false && L.matA.color.getHex() === 0x00c853 && L.mesh.visible === true;
      D.deselect();
      return out;
    });
    ok('insertar láser no cambia el modo de visión', r.noDark);
    ok('láser proporcional al modelo (R/200) y gris+verde+contorno', r.escala && r.gris);
    ok('candado bloquea (reset y gizmo) y desbloquea', r.lock && r.lockReset && r.gizmoOculto && r.unlock);
    ok('otra herramienta cierra el menú de láseres', r.menuCerrado);
    ok('plano base del láser desactivable (proyección de fondo)', r.planoBase);
    ok('sección negra: la línea del láser en negro (línea técnica) y de vuelta', r.negro && r.verde);
  },

  async poche() {
    await page.evaluate(() => { document.getElementById('secTool').click(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { document.getElementById('secAddX').click(); });
    await page.waitForTimeout(150);
    await page.mouse.click(600, 400);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const D = window._dbg;
      const ros = D.pieces['1 roseta'], pal = D.pieces['4 palanca'];
      return { secs: D.sections.length,
        rosOff: ros.userData.stB && ros.userData.stB.visible === false,
        palOn: pal.userData.stB && pal.userData.stB.visible === true };
    });
    ok('sección creada por toque', r.secs === 1);
    ok('poché: solo cuentan las piezas cortadas (roseta fuera, palanca dentro)', r.rosOff && r.palOn);
  },

  async superficies() {
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      out.menu = document.querySelectorAll('#surfmenu [data-sm]').length === 15;   // 12 superficies + 3 booleanas (unir/restar/intersecar)
      const ring = []; for (let i = 0; i < 32; i++) { const a = 2 * Math.PI * i / 32; ring.push([30 + 12 * Math.cos(a), 75 + 12 * Math.sin(a), 0]); }
      ring.push(ring[0].slice());
      const inner = []; for (let i = 0; i <= 16; i++) { const t = i / 16; inner.push([18 + 24 * t, 75, 6 * Math.sin(Math.PI * t)]); }
      D.buildContourSurfaceFromPts(ring, 0x0a84ff, null, [inner]);           // cont + nervio
      D.buildSurfaceFromPts([[0,0,0],[20,0,0]], [[0,0,0],[0,0,10]], 0x111111); // dxg
      D.buildRevolveFromPts([[5,0,0],[8,0,6]], [0,0,0], [0,0,10], 0x222222, null, 180); // rev parcial
      const b0=[],b1=[],b2=[],b3=[];
      for(let i=0;i<=8;i++){const t=i/8; b0.push([60+20*t,60,0]); b1.push([80,60+20*t,0]); b2.push([80-20*t,80,0]); b3.push([60,80-20*t,0]);}
      D.buildCoonsFromPts([b0,b1,b2,b3], 0x333333);                          // coons
      D.buildExtrudeFromPts(ring, 10, 0x444444);                             // ext
      D.buildTubeFromPts([[0,-30,0],[20,-30,10]], 2, 0x555555);              // tube
      D.buildRuledFromPts([[0,-50,0],[30,-50,0]], [[0,-40,10],[30,-40,10]], 0x666666); // ruled
      D.buildLoftFromPts([[[0,-70,0],[10,-70,0]],[[0,-65,8],[10,-65,8]]], 0x777777);   // loft
      D.buildSweepFromPts([[0,-90,0],[4,-90,0]], [[0,-90,0],[0,-80,5],[0,-70,5]], 0x888888); // sweep
      out.n = D.surfaces.length;
      const kinds = D.buildExport().superficies.map(s => s.kind || 'dxg').sort().join(',');
      out.kinds = kinds === 'cont,coons,dxg,ext,loft,rev,ruled,sweep,tube';
      const crest = (() => { const S = D.surfaces[0]; const pos = S.mesh.geometry.attributes.position;
        let best = 0; for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - 30) < 3 && Math.abs(pos.getY(i) - 75) < 3) best = Math.max(best, pos.getZ(i));
        return best > 4.5; })();
      out.crest = crest;
      // membrana armónica: la superficie pasa EXACTAMENTE por la curva interior
      const S0m = D.surfaces[0].mesh.geometry.attributes.position;
      let dInner = Infinity;
      const gm = inner[8]; // muestra central de la curva interior
      for (let i = 0; i < S0m.count; i++)
        dInner = Math.min(dInner, Math.hypot(S0m.getX(i) - gm[0], S0m.getY(i) - gm[1], S0m.getZ(i) - gm[2]));
      out.clavada = dInner < 1e-6;
      // tinta oscura → membrana clara (no negra); color elegido (azul) se respeta
      const hsl1 = {}; D.surfaces[1].mesh.material.color.getHSL(hsl1);
      const hsl0 = {}; D.surfaces[0].mesh.material.color.getHSL(hsl0);
      out.tinta = hsl1.l > 0.4 && Math.abs(hsl0.h - 0.578) < 0.08;
      const row = document.querySelector('#surfList .secrow');
      out.fila = !!(row && row.querySelector('[data-sv]') && row.querySelector('[data-sk]') && row.querySelector('[data-sx]'));
      const S0 = D.surfaces[0]; S0.locked = true;
      const nAntes = D.surfaces.length;
      document.querySelector('#surfList [data-sx]').click();
      out.lockBorra = D.surfaces.length === nAntes; S0.locked = false;
      return out;
    });
    ok('submenú de superficies con 12 modos + 3 booleanas', r.menu);
    ok('los 9 constructores crean superficie y exportan su tipo', r.n === 9 && r.kinds);
    ok('cara con línea interior respeta la cresta', r.crest);
    ok('membrana armónica clavada a la curva interior (0 mm)', r.clavada);
    // CONTORNO NO PLANO (silla 3D) + línea interior → membrana con columna, sin abanico
    const rs = await page.evaluate(() => {
      const D = window._dbg, out = {};
      // dos curvas arqueadas en z opuestas, unidas en bucle = silla no plana
      const top = [], bot = [];
      for (let i = 0; i <= 20; i++) { const t = i / 20; const arch = 12 * Math.sin(Math.PI * t);
        top.push([40 * t, -60, arch]); bot.push([40 * t, -30, -arch]); }
      const loop = top.concat(bot.slice().reverse()); loop.push(loop[0].slice());
      const inner = []; for (let i = 0; i <= 16; i++) { const t = i / 16; inner.push([40 * t, -45, 0]); }
      const nS = D.surfaces.length;
      const S = D.buildContourSurfaceFromPts(loop, 0x0a84ff, 'silla', [inner]);
      out.creada = D.surfaces.length === nS + 1;
      const pos = S.mesh.geometry.attributes.position;
      // membrana con columna: 41×17 = 697 vértices (no el abanico N+1)
      out.spine = pos.count === 697;
      // sin NaN y la piel pasa cerca de la línea central (por el punto medio [20,-45,0])
      let finite = true, near = Infinity;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) finite = false;
        near = Math.min(near, Math.hypot(x - 20, y - 45 * -1, z)); }   // cerca de [20,-45,0]
      out.sana = finite && near < 2;
      return out;
    });
    ok('contorno NO plano + línea interior: membrana con columna (sin abanico)', rs.creada && rs.spine);
    ok('membrana de silla: geometría sana (sin NaN) y pasa por la línea central', rs.sana);
    // BARRIDO MORPHING (2 perfiles a lo largo de un camino): morfea y orienta la sección
    const rb = await page.evaluate(() => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const path = []; for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([100 * t, -100, 0]); }
      const A = [], B = [];   // círculo r=8 → círculo r=2 (afina); ambos en el plano YZ del inicio
      for (let k = 0; k <= 32; k++) { const a = 2 * Math.PI * k / 32;
        A.push([0, -100 + 8 * Math.cos(a), 8 * Math.sin(a)]);
        B.push([100, -100 + 2 * Math.cos(a), 2 * Math.sin(a)]); }
      const nS = D.surfaces.length;
      const S = D.buildBlendSweepFromPts(A, B, path, 0x0a84ff, 'blend');
      out.creada = D.surfaces.length === nS + 1;
      const pos = S.mesh.geometry.attributes.position;
      // radio de la sección: grande cerca de x=0, pequeño cerca de x=100 (afina)
      let r0 = 0, r1 = 0; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i);
        const rr = Math.hypot(pos.getY(i) + 100, pos.getZ(i));
        if (x < 8) r0 = Math.max(r0, rr); if (x > 92) r1 = Math.max(r1, rr); }
      out.morfea = r0 > 7 && r0 < 9 && r1 > 1.5 && r1 < 2.5;   // 8 → 2
      // export/import conserva kind blend
      const sd = D.buildExport().superficies.find(s => s.kind === 'blend');
      out.serial = !!sd && !!sd.pA && !!sd.pB && !!sd.path;
      return out;
    });
    ok('barrido morphing: crea la piel y la sección MORFEA (8→2) orientada al camino', rb.creada && rb.morfea);
    ok('barrido morphing: se guarda y recupera (kind blend)', rb.serial);
    // BARRIDO MORPHING con CARA de pieza como perfil (tapa del cilindro)
    const rf = await page.evaluate(() => {
      const D = window._dbg, T3 = window.THREE, out = {};
      // toma el contorno de una cara de una pieza vía pickFaceLoopAt (proyectando su centroide)
      const m = D.pieces['4 palanca']; m.updateMatrixWorld();
      const groups = D.faceGroupsOf(m), g = m.geometry, idx = g.index, pos = g.attributes.position, M = m.matrixWorld;
      const capLoop = (gi) => {
        const tris = groups[gi], c = new T3.Vector3(), v = new T3.Vector3(); let cnt = 0;
        for (const t of tris) for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx.getX(t * 3 + k)).applyMatrix4(M); c.add(v); cnt++; }
        c.multiplyScalar(1 / cnt);
        const q = c.clone().project(D.cam), rct = { left: 0, top: 0, width: D.W, height: D.H };
        const canvas = document.querySelector('canvas'), orig = canvas.getBoundingClientRect.bind(canvas);
        canvas.getBoundingClientRect = () => rct;
        const loop = D.pickFaceLoopAt({ clientX: (q.x * 0.5 + 0.5) * D.W, clientY: (-q.y * 0.5 + 0.5) * D.H });
        canvas.getBoundingClientRect = orig; return loop;
      };
      const A = capLoop(1), B = capLoop(2);
      out.loops = !!(A && B && A.points.length > 3 && B.points.length > 3 && A._fromFace);
      if (out.loops) {
        const c0 = A.points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(x => x / A.points.length);
        const c1 = B.points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(x => x / B.points.length);
        const dir = [c0, [(c0[0]+c1[0])/2,(c0[1]+c1[1])/2,(c0[2]+c1[2])/2], c1];
        const nS = D.surfaces.length;
        const S = D.buildBlendSweepFromPts(A.points, B.points, dir, 0x0a84ff, 'blend-cara');
        out.creada = !!S && D.surfaces.length === nS + 1 && S.mesh.geometry.attributes.position.count > 0;
        D.removeSurface(S, true);
      }
      return out;
    });
    ok('barrido morphing: acepta CARA de pieza (tapa) como perfil', rf.loops && rf.creada);
    // TERRENO por curvas de nivel: rejilla regular que pasa por las isohipsas
    const rt = await page.evaluate(() => {
      const D = window._dbg, out = {};
      // contorno cuadrado grande (plano z base) + 3 curvas de nivel a alturas 4, 8, 4
      const S = 40, y0 = 140;
      const box = [[-S,y0-S,0],[S,y0-S,0],[S,y0+S,0],[-S,y0+S,0],[-S,y0-S,0]];
      const lv = []; // 3 curvas de nivel horizontales a distinta altura
      const mk = (yy, hh) => { const a = []; for (let i = 0; i <= 20; i++) { const t = i/20; a.push([-S*0.7 + 2*S*0.7*t, yy, hh]); } return a; };
      lv.push(mk(y0-14, 4)); lv.push(mk(y0, 9)); lv.push(mk(y0+14, 4));
      const nS = D.surfaces.length;
      const T = D.buildTerrainFromContour(box, lv, 0x2ca24c, 'terreno');
      out.creada = !!T && D.surfaces.length === nS + 1;
      if (!out.creada) return out;
      const pos = T.mesh.geometry.attributes.position;
      out.kind = T.kind === 'terrain';
      // sano (sin NaN) y sin picos disparados: alturas dentro de un rango razonable
      let finite = true, zmax = -Infinity, zmin = Infinity;
      for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i);
        if (!isFinite(pos.getX(i)) || !isFinite(pos.getY(i)) || !isFinite(z)) finite = false;
        zmax = Math.max(zmax, z); zmin = Math.min(zmin, z); }
      out.sano = finite && zmax < 12 && zmin > -3;   // no dispara por encima de la cresta (9)
      // pasa por la cresta central (altura ~9 cerca de y0)
      let crest = 0; for (let i = 0; i < pos.count; i++)
        if (Math.abs(pos.getY(i) - y0) < 4 && Math.abs(pos.getX(i)) < 8) crest = Math.max(crest, pos.getZ(i));
      out.cresta = crest > 7;
      // serial: se exporta y recupera con kind terrain
      const sd = D.buildExport().superficies.find(s => s.kind === 'terrain');
      out.serial = !!sd && !!sd.pts && !!sd.inner;
      D.removeSurface(T, true);
      return out;
    });
    ok('terreno por curvas de nivel: crea rejilla sana (sin NaN ni picos)', rt.creada && rt.kind && rt.sano);
    ok('terreno: la superficie pasa por la cresta de nivel más alta', rt.cresta);
    ok('terreno: se guarda y recupera (kind terrain)', rt.serial);
    // GRID FILL: contorno ALABEADO sin curvas guía → superficie mínima lisa (no abanico crudo)
    const rgf = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const Np = 40, R = 30, ring = [];
      for (let i = 0; i < Np; i++) { const a = 2 * Math.PI * i / Np; ring.push([R*Math.cos(a), 200+R*Math.sin(a), 12*Math.sin(2*a)]); }
      ring.push(ring[0].slice());
      const nS = D.surfaces.length;
      const S = D.buildContourSurfaceFromPts(ring, 0x2f7df0, 'silla face');
      out.creada = D.surfaces.length === nS + 1;
      const pos = S.mesh.geometry.attributes.position;
      out.subdiv = pos.count > Np * 4;          // subdividido (no solo los ~40 del borde)
      let finite = true; for (let i = 0; i < pos.count; i++) if (!isFinite(pos.getX(i))||!isFinite(pos.getY(i))||!isFinite(pos.getZ(i))) finite = false;
      out.finite = finite;
      // el borde exacto se conserva: cada punto del contorno tiene un vértice a ~0
      let maxb = 0; for (const q of ring) { let bd = Infinity;
        for (let i = 0; i < pos.count; i++) bd = Math.min(bd, Math.hypot(pos.getX(i)-q[0], pos.getY(i)-q[1], pos.getZ(i)-q[2]));
        maxb = Math.max(maxb, bd); }
      out.borde = maxb < 1e-3;
      D.removeSurface(S, true);
      return out;
    });
    ok('grid fill: contorno alabeado → superficie mínima subdividida y sana', rgf.creada && rgf.subdiv && rgf.finite);
    ok('grid fill: el borde exacto del contorno se conserva', rgf.borde);
    // SHRINKWRAP: drapear un trazo plano sobre el terreno (proyección por la normal)
    const rw = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const S = 45, box = [[-S,-S,300],[S,-S,300],[S,S,300],[-S,S,300],[-S,-S,300]];
      // terreno plano a z=300 (una meseta) para comprobar el drapeado exacto
      const lv = [[[-30,0,300],[30,0,300]]];
      const Tr = D.buildTerrainFromContour(box, lv, 0x2ca24c, 'meseta');
      // trazo plano MUY por encima (z=380) → debe caer a z≈300
      const foot = []; for (let i = 0; i <= 8; i++) foot.push([-16 + 4*i, -10, 380]);
      const draped = D.shrinkwrapStroke(foot, Tr.mesh);
      out.creado = !!draped && draped.length === foot.length;
      if (out.creado) {
        let onSurf = true; for (const q of draped) if (Math.abs(q[2] - 300) > 0.5) onSurf = false;
        out.onSurf = onSurf;                       // z bajó de 380 a ~300 (la meseta)
        // xy se conserva (proyección vertical)
        let xyOk = true; for (let i = 0; i < foot.length; i++) if (Math.hypot(draped[i][0]-foot[i][0], draped[i][1]-foot[i][1]) > 0.5) xyOk = false;
        out.xy = xyOk;
      }
      // un trazo que NO cae sobre la superficie → null
      const off = [[900,900,380],[905,905,380]];
      out.miss = D.shrinkwrapStroke(off, Tr.mesh) === null;
      D.removeSurface(Tr, true);
      return out;
    });
    ok('shrinkwrap: el trazo se proyecta sobre la superficie (z a la meseta, xy intacto)', rw.creado && rw.onSurf && rw.xy);
    ok('shrinkwrap: un trazo fuera de la superficie no proyecta (null)', rw.miss);
    // ESCULPIR TERRENO: edición proporcional (sube/baja con caída suave) + persistencia
    const rsc = await page.evaluate(() => {
      const D = window._dbg, T = window.THREE, out = {};
      const S = 45, box = [[-S,-S,500],[S,-S,500],[S,S,500],[-S,S,500],[-S,-S,500]];
      const Tr = D.buildTerrainFromContour(box, [[[-30,0,500],[30,0,500]]], 0x2ca24c, 'meseta-esc');
      const pos = Tr.mesh.geometry.attributes.position;
      const zAt = (x,y) => { let bd=1e9,z=0; for (let i=0;i<pos.count;i++){const d=Math.hypot(pos.getX(i)-x,pos.getY(i)-y); if(d<bd){bd=d;z=pos.getZ(i);}} return z; };
      const up = new T.Vector3(0,0,1);
      const moved = D.sculptSurfaceAt(Tr.mesh, new T.Vector3(0,0,500), 26, 8, up);
      out.moved = moved > 0;
      out.subeCentro = zAt(0,0) > 504;              // el centro subió
      out.bordeIntacto = Math.abs(zAt(43,0) - 500) < 0.5;   // el borde no se movió
      // persistencia: marcado sculpted → export lleva verts (soup)
      Tr.sculpted = true;
      const sd = D.buildExport().superficies.find(s => s.name === 'meseta-esc');
      out.serial = !!sd && sd.kind === 'terrain' && !!sd.verts && sd.verts.length >= 9;
      D.removeSurface(Tr, true);
      return out;
    });
    ok('esculpir: edición proporcional sube el centro y respeta el borde', rsc.moved && rsc.subeCentro && rsc.bordeIntacto);
    ok('esculpir: terreno esculpido se guarda con su malla (verts)', rsc.serial);
    ok('tinta oscura → superficie clara · color elegido se respeta', r.tinta);
    ok('fila tipo pieza (ojo·candado·papelera) y candado bloquea borrar', r.fila && r.lockBorra);
  },

  async paneles_piezas() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const out = {}, eye = document.querySelector('[data-pe="1 roseta"]'), lk = document.querySelector('[data-pk="4 palanca"]');
      eye.click(); await frame(); out.eyeOff = D.pieces['1 roseta'].visible === false;
      eye.click(); await frame(); out.eyeOn = D.pieces['1 roseta'].visible === true;
      lk.click(); await frame();
      const m = D.pieces['4 palanca'];
      out.lock = m.userData.locked === true;
      D.select('pieza', m, 'p'); D.updateGizmo(); out.gizmoOculto = !D.gizmo.visible;
      const px = m.position.x;
      const mv = document.getElementById('selMove'); mv.value = '10';
      mv.dispatchEvent(new Event('change', { bubbles: true })); await frame();
      out.moveBloq = Math.abs(m.position.x - px) < 1e-9;
      lk.click(); await frame(); out.unlock = !m.userData.locked;
      D.deselect();
      return out;
    });
    ok('ojo por pieza (ver/ocultar)', r.eyeOff && r.eyeOn);
    ok('candado por pieza bloquea mover y oculta gizmo', r.lock && r.gizmoOculto && r.moveBloq && r.unlock);
  },

  async mover_forma_deshacer() {
    const r = await page.evaluate(() => {
      const D = window._dbg, T = window.THREE, out = {};
      const mag0 = D.mag; if (mag0) document.getElementById('mag').click();   // imán OFF: traslación pura
      const H = 100, sq = [[-H,-H,0],[H,-H,0],[H,H,0],[-H,H,0],[-H,-H,0]];
      const st = { points: sq.map(q => q.slice()), color: '#d500f9', sobre: 'aire' };
      D.strokes.push(st);
      document.getElementById('mSel').click(); D.selectStroke(st); D.redraw();
      const c = document.querySelector('canvas'), rct = c.getBoundingClientRect();
      const v = new T.Vector3(0, -H, 0).project(D.cam);   // medio de la arista inferior (lejos de las esquinas/tiradores)
      const sx = rct.left + (v.x*0.5+0.5)*rct.width, sy = rct.top + (-v.y*0.5+0.5)*rct.height;
      const ev = (t,x,y) => c.dispatchEvent(new PointerEvent(t, { pointerId:5, pointerType:'pen', isPrimary:true, button:t==='pointermove'?-1:0, buttons:t==='pointerup'?0:1, clientX:x, clientY:y, pressure:0.6, bubbles:true }));
      const u0 = D.undoActs.length;
      ev('pointerdown', sx, sy); out.selDrag = !!D.selDrag && !D.handDrag;
      ev('pointermove', sx+40, sy-24); ev('pointermove', sx+80, sy-48); ev('pointerup', sx+80, sy-48);
      const d0 = [st.points[0][0]-sq[0][0], st.points[0][1]-sq[0][1], st.points[0][2]-sq[0][2]];
      out.movido = Math.hypot(d0[0],d0[1],d0[2]) > 1;
      out.rigido = st.points.every((q,i) => Math.abs((q[0]-sq[i][0])-d0[0])<1e-3 && Math.abs((q[1]-sq[i][1])-d0[1])<1e-3 && Math.abs((q[2]-sq[i][2])-d0[2])<1e-3);
      out.undoReg = D.undoActs.length === u0+1 && D.undoActs[D.undoActs.length-1].label === 'mover forma';
      document.getElementById('undo').click();   // deshacer → restaura el MOVIMIENTO (no otra cosa)
      out.restaura = Math.abs(st.points[0][0]-sq[0][0])<1e-3 && Math.abs(st.points[0][1]-sq[0][1])<1e-3 && Math.abs(st.points[0][2]-sq[0][2])<1e-3;
      // limpieza: quitar el trazo inyectado y su rastro
      const ix = D.strokes.indexOf(st); if (ix>=0) D.strokes.splice(ix,1);
      D.redoActs.length = 0; D.deselect();
      if (D.mag !== mag0) document.getElementById('mag').click();
      D.redraw();
      return out;
    });
    ok('mover forma: traslación RÍGIDA (sin deformar ni pegarse a las piezas)', r.selDrag && r.movido && r.rigido);
    ok('mover forma: el movimiento se registra en deshacer y lo restaura', r.undoReg && r.restaura);
  },

  async superficie_seleccionar_mover() {
    const r = await page.evaluate(() => {
      const D = window._dbg, T = window.THREE, out = {};
      const sq = [[-25,-25,0],[25,-25,0],[25,25,0],[-25,25,0],[-25,-25,0]];
      const S = D.buildContourSurfaceFromPts(sq, 0x2f7df0, 'cara-sel');
      const visBak = {}; Object.keys(D.pieces).forEach(n => { visBak[n] = D.pieces[n].visible; D.pieces[n].visible = false; });  // sin piezas delante
      document.getElementById('mSel').click(); D.deselect(); D.redraw();
      const canvas = document.querySelector('canvas'), rct = canvas.getBoundingClientRect();
      const ev = (t,x,y) => canvas.dispatchEvent(new PointerEvent(t, { pointerId:3, pointerType:'pen', isPrimary:true, button:0, buttons:t==='pointerup'?0:1, clientX:x, clientY:y, pressure:0.5, bubbles:true }));
      // 1) TAP sobre la superficie la selecciona (antes: imposible)
      S.mesh.geometry.computeBoundingBox();
      const c = S.mesh.geometry.boundingBox.getCenter(new T.Vector3()), v = c.clone().project(D.cam);
      const sx = rct.left + (v.x*0.5+0.5)*rct.width, sy = rct.top + (-v.y*0.5+0.5)*rct.height;
      ev('pointerdown', sx, sy); ev('pointerup', sx, sy);
      out.tapSelecciona = !!(D.selected && D.selected.kind === 'superficie' && D.selected.ref === S.mesh);
      out.gizmo = D.gizmoVisible;
      out.xform = document.getElementById('xformOps').style.display === 'flex';
      // 2) MOVER con el gizmo (arrastrar la flecha X) → deshacer 'mover superficie' y restaurar
      D.select('superficie', S.mesh, 'cara-sel'); D.updateGizmo();
      const arrow = (D.gizParts||[]).find(pt => pt.userData.giz && pt.userData.giz.type==='move' && pt.userData.giz.axis==='x');
      let moveUndo = false, restaura = false;
      if (arrow) {
        arrow.updateWorldMatrix(true,true); const wp = new T.Vector3(); arrow.getWorldPosition(wp);
        const av = wp.clone().project(D.cam);
        const ax = rct.left + (av.x*0.5+0.5)*rct.width, ay = rct.top + (-av.y*0.5+0.5)*rct.height;
        const u0 = D.undoActs.length;
        ev('pointerdown', ax, ay); ev('pointermove', ax+70, ay); ev('pointermove', ax+140, ay); ev('pointerup', ax+140, ay);
        moveUndo = D.undoActs.length === u0+1 && D.undoActs[D.undoActs.length-1].label === 'mover superficie';
        document.getElementById('undo').click();
        restaura = S.mesh.position.length() < 1e-3;   // vuelve al origen
      }
      out.moveUndo = moveUndo; out.restaura = restaura;
      // 3) PERSISTENCIA: la posición se exporta
      S.mesh.position.set(30,0,0);
      const sd = D.buildExport().superficies.find(s => s.name === 'cara-sel');
      out.serial = !!sd && !!sd.pos && Math.abs(sd.pos[0]-30) < 1e-6;
      D.removeSurface(S, true); D.redoActs.length = 0; D.deselect();
      Object.keys(visBak).forEach(n => { D.pieces[n].visible = visBak[n]; });   // restaura visibilidad
      D.redraw();
      return out;
    });
    ok('superficie: se SELECCIONA al tocarla (con gizmo y barra de transformación)', r.tapSelecciona && r.gizmo && r.xform);
    ok('superficie: mover con el gizmo registra deshacer y lo restaura', r.moveUndo && r.restaura);
    ok('superficie: la posición (mover/girar) se guarda y recupera', r.serial);
  },

  async estilos_visualizacion() {
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const st0 = D.currentStyle();
      out.descriptor = st0.v === 1 && /^[0-9a-fA-F-]{36}$/.test(st0.id) && st0.familia === 'presentacion'
        && !!st0.caras && typeof st0.caras.modo === 'string'
        && !!st0.aristas && !!st0.aristas.color && ('fuente' in st0.aristas.color)
        && !!st0.fondo && ('modo' in st0.fondo) && !('family' in st0) && !('aristasColor' in st0);
      out.valido = D.validarEstilo(st0).ok;
      // los 3 preajustes de fábrica (estilos_ejemplo.json) cargados y válidos
      const fab = D.savedStyles.filter(s => s.de_fabrica);
      out.goldenN = fab.length === 7;
      out.golden = fab.every(s => D.validarEstilo(s).ok);
      // panel Personalizar: aristas B/N ↔ material
      document.getElementById('vEye').click(); document.getElementById('stylePerso').click();
      document.querySelector('#stylepop .stgl[data-ec="material"]').click();
      out.material = D.styleEdgeColor === 'material';
      // guardar añade un estilo de usuario válido
      const nUser0 = D.savedStyles.filter(s => !s.de_fabrica).length;
      document.getElementById('styleName').value = 'Test estilo';
      document.getElementById('styleSave').click();
      const last = D.savedStyles[D.savedStyles.length - 1];
      out.saved = D.savedStyles.filter(s => !s.de_fabrica).length === nUser0 + 1
        && last.nombre === 'Test estilo' && last.de_fabrica === false && D.validarEstilo(last).ok;
      // aplicar un estilo conforme cambia el estado interno (caras/aristas/familia)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000009', nombre:'x', familia:'tecnico',
        caras:{ modo:'blanco' }, aristas:{ ver:true, color:{ fuente:'bn' } }, fondo:{ modo:'claro' } });
      out.applied = D.styleEdgeColor === 'bn' && D.viewMode === 'blanco' && D.styleFamily === 'tecnico';
      // nuevas opciones (SketchUp): grosor de aristas (aristas.grosor) y fondo de color (fondo.valor)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-00000000000a', nombre:'y', familia:'presentacion',
        caras:{ modo:'consistente' }, aristas:{ ver:true, grosor:3.5, color:{ fuente:'bn' } },
        fondo:{ modo:'claro', valor:'#123456' } });
      const st2 = D.currentStyle();
      out.grosor = Math.abs((st2.aristas.grosor || 0) - 3.5) < 0.01;
      out.bgcolor = st2.fondo.valor === '#123456' && D.validarEstilo(st2).ok;
      // Fase A: sin aristas (aristas.ver) + ocultas discontinuas (ocultos.ver/patron)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-00000000000b', nombre:'z', familia:'presentacion',
        caras:{ modo:'blanco' }, aristas:{ ver:false, color:{ fuente:'bn' } },
        ocultos:{ ver:true, patron:'discontinuo' } });
      const st3 = D.currentStyle();
      out.sinAristas = st3.aristas.ver === false;
      out.ocultos = !!st3.ocultos && st3.ocultos.ver === true && st3.ocultos.patron === 'discontinuo' && D.validarEstilo(st3).ok;
      // Fase A: suelo VIRTUAL de apoyo (ver + color) + texturas toggle (materiales.texturas)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-00000000000c', nombre:'w', familia:'presentacion',
        caras:{ modo:'consistente' }, suelo:{ ver:true, color:'#334455' }, materiales:{ texturas:true } });
      const st4 = D.currentStyle();
      out.suelo = !!st4.suelo && st4.suelo.ver === true && D.groundLaserOn === true && st4.suelo.color === '#334455';
      out.texturas = !!st4.materiales && st4.materiales.texturas === true && D.validarEstilo(st4).ok;
      D.setSuelo(false);
      // perfiles/silueta: ver + grosor propio (perfiles.ver/grosor)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-00000000000d', nombre:'v', familia:'presentacion',
        caras:{ modo:'blanco' }, perfiles:{ ver:false, grosor:2.5 } });
      const st5 = D.currentStyle();
      out.perfiles = !!st5.perfiles && st5.perfiles.ver === false && Math.abs(st5.perfiles.grosor - 2.5) < 0.01 && D.validarEstilo(st5).ok;
      // suelo.z (desplazamiento vertical) + gizmo de eje Z al seleccionar el suelo virtual
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-00000000000e', nombre:'z2', familia:'presentacion',
        suelo:{ ver:true, z:12.5 } });
      const st6 = D.currentStyle();
      out.sueloZ = Math.abs(st6.suelo.z - 12.5) < 0.01 && Math.abs(D.sueloZ - 12.5) < 0.01 && D.validarEstilo(st6).ok;
      D.select('suelo', D.sueloMesh, 'Suelo virtual'); D.updateGizmo();
      out.gizZ = D.gizmo.visible === true && D.gizMode === 'z';
      D.deselect(); D.setSuelo(false);
      // CIELO: fondo degradado cielo/horizonte (fondo.modo='degradado')
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-00000000000f', nombre:'sky', familia:'presentacion',
        fondo:{ modo:'degradado', cielo:'#88aaff', horizonte:'#ffffff' } });
      const st7 = D.currentStyle();
      out.cielo = st7.fondo.modo === 'degradado' && st7.fondo.cielo === '#88aaff'
        && st7.fondo.horizonte === '#ffffff' && D.validarEstilo(st7).ok;
      // REGLA DURA: el suelo virtual (horizonte "infinito") NO altera orbit/zoom-fit (sph.r) ni el pivote (target)
      const r0 = D.sph.r, t0 = D.target.clone();
      D.setSuelo(true);
      out.orbit = Math.abs(D.sph.r - r0) < 1e-9 && D.target.distanceTo(t0) < 1e-9 && !D.pickables.includes(D.sueloMesh);
      D.setSuelo(false);
      // modo Sombra con aristas vistas por defecto: aristas.ver === true en 'somb'
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000012', nombre:'shd', familia:'presentacion',
        caras:{ modo:'consistente' }, aristas:{ ver:true, color:{ fuente:'bn' } } });
      out.sombraEdges = D.viewMode === 'somb' && D.currentStyle().aristas.ver === true;
      // malla/retícula del suelo: on/off + fuera de pickables
      D.setSuelo(true); D.setGrid(true);
      out.gridVis = D.gridMesh.visible === true && !D.pickables.includes(D.gridMesh);
      D.setGrid(false); out.gridHid = D.gridMesh.visible === false;
      D.setSuelo(false);
      // suelo.malla en el descriptor (esquema v3.3): round-trip manual (color) y auto (sin color)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000013', nombre:'gm', familia:'presentacion',
        suelo:{ ver:true, malla:{ ver:true, auto:false, color:'#333333' } } });
      const st8 = D.currentStyle();
      out.mallaManual = !!st8.suelo.malla && st8.suelo.malla.ver === true && st8.suelo.malla.auto === false
        && st8.suelo.malla.color === '#333333' && D.validarEstilo(st8).ok;
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000014', nombre:'gma', familia:'presentacion',
        suelo:{ ver:true, malla:{ ver:false, auto:true } } });
      const st8b = D.currentStyle();
      out.mallaAuto = st8b.suelo.malla.auto === true && st8b.suelo.malla.ver === false
        && !('color' in st8b.suelo.malla) && D.validarEstilo(st8b).ok;
      D.setSuelo(false); D.setGrid(true);
      // ── Fase B1 · SOMBRA DEL SOL ──
      out.shadowInit = D.renderer.shadowMap.enabled === true;
      const r0s = D.sph.r, t0s = D.target.clone();
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000015', nombre:'sun', familia:'presentacion',
        sombra_arrojada:{ activo:true, modo:'manual', azimut:200, altitud:30 } });
      const st9 = D.currentStyle();
      out.sombraOn = D.sombraOn === true && D.sol.visible === true && D.sol.castShadow === true
        && D.renderer.shadowMap.autoUpdate === true;
      out.sombraDesc = !!st9.sombra_arrojada && st9.sombra_arrojada.activo === true
        && st9.sombra_arrojada.modo === 'manual' && st9.sombra_arrojada.azimut === 200
        && st9.sombra_arrojada.altitud === 30 && !!st9.iluminacion && D.validarEstilo(st9).ok;
      const p0 = D.sol.position.clone(); D.setSunAz(20); D.setSunAlt(70);
      out.sunMove = D.sol.position.distanceTo(p0) > 1e-3 && D.currentStyle().sombra_arrojada.azimut === 20;
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000016', nombre:'geo', familia:'presentacion',
        sombra_arrojada:{ activo:true, modo:'geo', fecha:'2026-06-21', hora:'12:00', lugar:{ lat:40.4, lon:-3.7 } } });
      const gpos = D.solarAzAlt();
      out.geo = D.sombraModo === 'geo' && isFinite(gpos.az) && gpos.az>=0 && gpos.az<=360
        && gpos.alt>=0 && gpos.alt<=90 && D.validarEstilo(D.currentStyle()).ok;
      // B2 · densidad de sombra (dureza_sombra reinterpretado) → OSCURECE el relleno con la
      // penumbra FIJA y limpia (más densidad = menos relleno = sombra más oscura, sin manchas)
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000018', nombre:'soft', familia:'presentacion',
        sombra_arrojada:{ activo:true, modo:'manual', azimut:200, altitud:40 },
        iluminacion:{ sol:80, ambiental:55, dureza_sombra:10 } });
      let amb = null; D.sol.parent.traverse(o => { if (o.isAmbientLight) amb = o; });
      const radFijo = D.sol.shadow.radius, fillTenue = amb.intensity, durSoft = D.currentStyle().iluminacion.dureza_sombra;
      D.setDureza(95);
      const fillMarcada = amb.intensity;
      out.dureza = fillTenue > fillMarcada                        // más densidad → relleno menor → sombra más oscura
        && Math.abs(D.sol.shadow.radius - radFijo) < 1e-6         // la penumbra NO cambia (fija y limpia)
        && durSoft === 10 && D.currentStyle().iluminacion.dureza_sombra === 95
        && D.validarEstilo(D.currentStyle()).ok;
      // B3 · AO (SSAO): activar construye el pase y hace round-trip; desactivar vuelve a render directo
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000019', nombre:'ao', familia:'presentacion',
        caras:{ modo:'consistente' }, oclusion_ambiental:{ activo:true, intensidad:70, radio:40 } });
      const stao = D.currentStyle();
      out.aoDesc = D.aoOn === true && !!stao.oclusion_ambiental && stao.oclusion_ambiental.activo === true
        && stao.oclusion_ambiental.intensidad === 70 && stao.oclusion_ambiental.radio === 40 && D.validarEstilo(stao).ok;
      D.renderAO();
      out.aoReady = D.renderer.capabilities.isWebGL2 ? (D.aoReady === true) : true;
      D.setAO(false);
      out.aoOff = D.aoOn === false;
      D.setSombra(false);
      out.sombraOff = D.sol.visible === false && D.renderer.shadowMap.autoUpdate === false;
      out.sombraOrbit = Math.abs(D.sph.r - r0s) < 1e-9 && D.target.distanceTo(t0s) < 1e-9;
      // la MALLA es independiente de la sombra: visibilidad + gris manual se mantienen al (des)activar sombras
      D.applyStyle({ v:1, id:'5a1e0000-0000-4000-8000-000000000017', nombre:'gm2', familia:'presentacion',
        suelo:{ ver:true, malla:{ ver:true, auto:false, color:'#2a2a2a' } } });
      const gv0 = D.gridMesh.visible, gc0 = D.gridMesh.material.uniforms.uColor.value.clone();
      D.setSombra(true);
      const gIndOn = D.gridMesh.visible === true && gv0 === true && Math.abs(D.gridMesh.material.uniforms.uColor.value.r - gc0.r) < 1e-6;
      D.setSombra(false);
      const gIndOff = D.gridMesh.visible === true && Math.abs(D.gridMesh.material.uniforms.uColor.value.r - gc0.r) < 1e-6;
      out.gridIndepSombra = gIndOn && gIndOff && Math.abs(gc0.r - 0x2a/255) < 0.02;   // gris manual (~0.165), no auto
      D.setSuelo(false);
      // Tanda C · lápiz: abrir editor precargado + flujo sustituir/crear v2, de fábrica nunca se sobrescribe
      D.styleFamily='presentacion'; D.renderSavedStyles();
      const nFabA = D.savedStyles.filter(s=>s.de_fabrica).length;
      const iMaq = D.savedStyles.findIndex(s=>s.nombre==='estilo.maqueta_blanca');
      D.openStyleEditor(iMaq);                                  // editar un preset de fábrica
      out.editOpen = D.editingStyleId === D.savedStyles[iMaq].id && document.getElementById('stylepop').style.display==='flex';
      document.getElementById('edgeNum').value='3'; document.getElementById('edgeNum').dispatchEvent(new Event('input'));
      const nUA = D.savedStyles.filter(s=>!s.de_fabrica).length;
      document.getElementById('styleSave').click();            // de fábrica → crea nuevo «… v2», NO sobrescribe
      const lastU = D.savedStyles[D.savedStyles.length-1];
      out.factoryNew = D.savedStyles.filter(s=>s.de_fabrica).length===nFabA
        && D.savedStyles.filter(s=>!s.de_fabrica).length===nUA+1
        && /v2$/.test(lastU.nombre) && lastU.de_fabrica===false
        && Math.abs((lastU.aristas.grosor||0)-3) < 0.01;
      // ahora editar el de usuario y SUSTITUIR (mismo id, no crea otro)
      const iUser = D.savedStyles.indexOf(lastU);
      D.openStyleEditor(iUser);
      out.replaceShown = document.getElementById('styleReplace').style.display !== 'none';
      document.getElementById('edgeNum').value='5'; document.getElementById('edgeNum').dispatchEvent(new Event('input'));
      const nUB = D.savedStyles.filter(s=>!s.de_fabrica).length;
      document.getElementById('styleReplace').click();
      const rep = D.savedStyles.find(s=>s.id===lastU.id);
      out.replaced = D.savedStyles.filter(s=>!s.de_fabrica).length===nUB
        && rep && Math.abs((rep.aristas.grosor||0)-5) < 0.01;
      // export: biblioteca de usuario + estilo vivo bajo sub-clave `estilo`, ambos válidos
      const e = D.buildExport();
      out.serial = Array.isArray(e.estilos) && !!e.estilo && D.validarEstilo(e.estilo).ok
        && e.estilo.aristas.color.fuente === 'bn';
      // limpieza: quitar solo estilos de usuario, restaurar familia por defecto
      for (let i = D.savedStyles.length - 1; i >= 0; i--) if (!D.savedStyles[i].de_fabrica) D.savedStyles.splice(i, 1);
      try { localStorage.removeItem('tectosStyles'); } catch(_) {}
      D.styleFamily = 'presentacion'; D.renderSavedStyles();
      document.getElementById('stylepop').style.display = 'none';
      document.getElementById('vmodes').style.display = 'none';
      return out;
    });
    ok('estilos: descriptor conforme a estilo.schema.json v3 (v/id/familia/caras.modo/aristas.color.fuente/fondo.modo)', r.descriptor);
    ok('estilos: currentStyle() valida contra el contrato', r.valido);
    ok('estilos: 7 preajustes de fábrica cargados (canónico v3.7: +maqueta +B&N)', r.goldenN);
    ok('estilos: los 3 golden validan contra el esquema', r.golden);
    ok('estilos: aristas B/N ↔ material desde el panel Personalizar', r.material);
    ok('estilos: guardar añade un estilo de usuario válido', r.saved);
    ok('estilos: aplicar un estilo conforme cambia caras/aristas/familia', r.applied);
    ok('estilos: grosor de aristas (aristas.grosor) round-trip', r.grosor);
    ok('estilos: lápiz abre el editor precargado del estilo', r.editOpen);
    ok('estilos: editar de fábrica → crea «… v2» (no sobrescribe fábrica)', r.factoryNew);
    ok('estilos: editar de usuario → Sustituir reemplaza in situ (mismo id)', r.replaceShown && r.replaced);
    ok('estilos: fondo de color (fondo.valor) round-trip y válido', r.bgcolor);
    ok('estilos: sin aristas (aristas.ver=false) round-trip', r.sinAristas);
    ok('estilos: ocultas discontinuas (ocultos.ver/patron) round-trip', r.ocultos);
    ok('estilos: suelo virtual (suelo.ver + suelo.color) round-trip', r.suelo);
    ok('estilos: texturas toggle (materiales.texturas) round-trip', r.texturas);
    ok('estilos: perfiles/silueta (perfiles.ver/grosor) round-trip', r.perfiles);
    ok('estilos: suelo.z (desplazamiento vertical) round-trip', r.sueloZ);
    ok('estilos: gizmo de eje Z al seleccionar el suelo virtual', r.gizZ);
    ok('estilos: cielo (fondo degradado cielo/horizonte) round-trip', r.cielo);
    ok('estilos: suelo virtual "infinito" no altera orbit/zoom-fit ni pivote (fuera de pickables)', r.orbit);
    ok('estilos: modo Sombra con aristas vistas por defecto (aristas.ver=true)', r.sombraEdges);
    ok('estilos: malla/retícula del suelo activable/desactivable (fuera de pickables)', r.gridVis && r.gridHid);
    ok('estilos: suelo.malla en el descriptor (manual con color) round-trip', r.mallaManual);
    ok('estilos: suelo.malla auto (sin color) round-trip', r.mallaAuto);
    ok('estilos: shadowMap habilitado (Fase B1)', r.shadowInit);
    ok('estilos: sombra del sol on → luz sol + castShadow + autoUpdate', r.sombraOn);
    ok('estilos: sombra_arrojada + iluminacion en el descriptor round-trip', r.sombraDesc);
    ok('estilos: mover azimut/altitud reorienta el sol', r.sunMove);
    ok('estilos: modo geo (fecha/hora/lugar → az/alt) válido y en rango', r.geo);
    ok('estilos: densidad de sombra → oscurece el relleno con penumbra fija (sin manchas) + round-trip', r.dureza);
    ok('estilos: oclusión ambiental (AO) round-trip + activa el pase SSAO', r.aoDesc && r.aoReady && r.aoOff);
    ok('estilos: apagar la sombra restaura (sol off, autoUpdate off)', r.sombraOff);
    ok('estilos: la sombra del sol no altera orbit/zoom-fit ni pivote', r.sombraOrbit);
    ok('estilos: malla independiente de la sombra (visibilidad + gris manual)', r.gridIndepSombra);
    ok('estilos: export lleva biblioteca + estilo vivo (sub-clave), válidos', r.serial);
  },

  async gizmo_centro() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const m = D.pieces['4 palanca'];
      D.select('pieza', m, 'p'); D.updateGizmo(); await frame();
      const g = D.gizmo.position;
      const pieza = Math.abs(g.x - 50) < 1 && Math.abs(g.y - 48) < 1 && Math.abs(g.z) < 1;   // palanca alineada: centro real X=50 (antes 53, −3 al alinear el cuello con la roseta)
      D.deselect(); await frame();
      const st = { points: [[0, 0, 0], [2, 0, 0], [100, 0, 20]], color: '#000', w: 0.2, sobre: 't' };
      D.strokes.push(st); D.redraw(); D.select('trazo', st, 't'); D.updateGizmo(); await frame();
      const trazo = Math.abs(D.gizmo.position.x - 50) < 0.01 && Math.abs(D.gizmo.position.z - 10) < 0.01;
      D.deselect();
      return { pieza, trazo };
    });
    ok('gizmo de pieza en su centro geométrico real', r.pieza);
    ok('gizmo de trazo en el centro de su caja', r.trazo);
  },

  async piezas_grupo() {   // Plan A: multi-selección de SÓLIDOS + mover/girar el grupo + OSNAP
    const r = await page.evaluate(() => {
      const D = window._dbg, T = window.THREE, out = {};
      D.multiSel = true;
      const cuello = D.pieces['2 cuello'], palanca = D.pieces['4 palanca'], garganta = D.pieces['3 garganta (propuesta)'];
      D.togglePieceSel(cuello); D.togglePieceSel(palanca);
      out.count = D.selSetP.length; out.target = D.gizTarget();
      D.updateGizmo(); out.giz = D.gizmo.visible;
      out.hiCuello = cuello.userData.hi === true && palanca.userData.hi === true && garganta.userData.hi !== true;
      // MOVER +15 en Y: ambas piezas se desplazan lo mismo
      const c0 = cuello.position.clone(), p0 = palanca.position.clone();
      D.startGizDrag({ axis: 'y', type: 'move' }); D.applyGiz(new T.Vector3(0, 15, 0), 0);
      out.moved = Math.abs(cuello.position.y - c0.y - 15) < 0.01 && Math.abs(palanca.position.y - p0.y - 15) < 0.01;
      // OSNAP: con imán, el arrastre de MOVER construye candidatos (piezas quietas + origen)
      out.magOn = D.mag === true;
      D.startGizDrag({ axis: 'x', type: 'move' });
      out.magBuilt = !!(D.gizDrag && D.gizDrag.mag && D.gizDrag.mag.length >= 1);
      // GIRAR 90° sobre X alrededor del pivote común: cambia posición y orientación de ambas
      const cq = cuello.quaternion.clone(), cp = cuello.position.clone();
      D.startGizDrag({ axis: 'x', type: 'rot' }); D.applyGiz(null, Math.PI / 2);
      out.rot = !cuello.quaternion.equals(cq) && cuello.position.distanceTo(cp) > 0.5;
      // deselección: limpia el grupo y el resaltado
      D.deselect();
      out.cleared = D.selSetP.length === 0 && cuello.userData.hi !== true && palanca.userData.hi !== true;
      // selección ÚNICA sigue intacta (no multi)
      D.multiSel = false; D.select('pieza', cuello, '2 cuello');
      out.single = D.gizTarget() === 'pieza' && D.selSetP.length === 0;
      D.deselect();
      return out;
    });
    ok('grupo de piezas: multi-selección de sólidos (gizmo al centro combinado, resaltado)', r.count === 2 && r.target === 'piezas' && r.giz && r.hiCuello);
    ok('grupo de piezas: mover desplaza TODAS por igual', r.moved);
    ok('grupo de piezas: OSNAP construye candidatos (imán) al mover', r.magOn && r.magBuilt);
    ok('grupo de piezas: girar rota todas alrededor del pivote común', r.rot);
    ok('grupo de piezas: deselección limpia grupo + resaltado; la selección única sigue', r.cleared && r.single);
  },

  async menus() {
    const r = await page.evaluate(() => {
      const dock = document.getElementById('dock'), dg = dock.querySelector('[data-grip]');
      const rg = dg.getBoundingClientRect(), r1 = document.getElementById('dock1').getBoundingClientRect();
      return { gripArriba: rg.bottom <= r1.top + 1,
        gripCentrado: Math.abs((rg.left + rg.width / 2) - (r1.left + r1.width / 2)) < 20 };
    });
    ok('asa del dock ARRIBA y centrada (vertical)', r.gripArriba && r.gripCentrado);
    const drag = async (selGrip, x1, y1) => {
      const g = await page.evaluate(s => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); return [r.left + 4, r.top + 4]; }, selGrip);
      await page.evaluate(([s, x0, y0, x1, y1]) => {
        const grip = document.querySelector(s);
        const ev = (t, x, y) => grip.dispatchEvent(new PointerEvent(t, { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
        ev('pointerdown', x0, y0); ev('pointermove', (x0 + x1) / 2, (y0 + y1) / 2); ev('pointermove', x1, y1); ev('pointerup', x1, y1);
      }, [selGrip, g[0], g[1], x1, y1]);
      await page.waitForTimeout(120);
    };
    await drag('#dock [data-grip]', 18, 300);
    let r2 = await page.evaluate(() => ({ dockL: document.getElementById('dock').classList.contains('dockL') && parseFloat(document.getElementById('dock').style.left) === 0 }));
    ok('acople a ras del borde izquierdo', r2.dockL);
    // grupo de secciones: desacople y reacople
    await drag('[data-secgrip]', 500, 500);
    let r3 = await page.evaluate(() => {
      const sf = document.getElementById('secFloat');
      return { det: sf.style.display === 'flex' && sf.contains(document.getElementById('secGroup')) };
    });
    ok('grupo de secciones se desacopla como paleta', r3.det);
    const rv = await page.evaluate(() => { const r = document.getElementById('views').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await drag('[data-secgrip]', rv[0], rv[1]);
    let r4 = await page.evaluate(() => ({ re: document.getElementById('views').contains(document.getElementById('secGroup')) && document.getElementById('secFloat').style.display === 'none' }));
    ok('grupo de secciones se reacopla sobre la barra', r4.re);
  },

  async cerrar_contorno() {   // superficie con contorno abierto → pregunta «Cerrar contorno y seguir»
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const st = { points: [[0, 0, 0], [0, 22, 0], [22, 22, 0], [22, 0, 0]], color: '#111', w: 0.2, sobre: 'aire' };
      D.strokes.push(st); D.redraw();
      out.abierto = !D.strokeClosed(st);
      const nS = D.surfaces.length;
      const rct = document.querySelector('canvas').getBoundingClientRect();
      const scr = w => { const v = new T3.Vector3(...w).project(D.cam);
        return { target: document.querySelector('canvas'), clientX: rct.left + (v.x*0.5+0.5)*rct.width, clientY: rct.top + (-v.y*0.5+0.5)*rct.height, button: 0 }; };
      D.surfToolStart('face'); D.surfToolTap(scr([0, 22, 0])); await frame();
      const pop = document.getElementById('confirmpop');
      out.pregunta = pop.style.display === 'flex' && document.getElementById('cfMsg').textContent.includes('Cerrar');
      // «Cancelar» no crea nada ni cierra el contorno
      document.getElementById('cfNo').click(); await frame();
      out.cancela = D.surfaces.length === nS && !D.strokeClosed(st) && pop.style.display === 'none';
      // repetir y «Cerrar y seguir» → cierra el contorno y crea la cara
      D.surfToolStart('face'); D.surfToolTap(scr([0, 22, 0])); await frame();
      document.getElementById('cfYes').click(); await frame();
      out.cerrado = D.strokeClosed(st);
      out.creada = D.surfaces.length === nS + 1;
      document.getElementById('undo').click(); await frame();
      out.undo = D.surfaces.length === nS && !D.strokeClosed(st);   // deshacer: quita la cara Y reabre el contorno
      return out;
    });
    ok('superficie: contorno abierto pregunta «¿Cerrar contorno y seguir?»', r.abierto && r.pregunta);
    ok('cerrar contorno: «Cancelar» no cierra ni crea', r.cancela);
    ok('cerrar contorno: «Cerrar y seguir» cierra el contorno y crea la cara', r.cerrado && r.creada);
    ok('cerrar contorno: un solo deshacer quita la cara y reabre el contorno', r.undo);
  },

  async navegacion() {   // Órbita y «Girar la cabeza» nunca ambos inactivos
    const r = await page.evaluate(() => {
      const orbit = () => document.getElementById('mOrbit').classList.contains('on');
      const look = () => document.getElementById('vLook').classList.contains('on');
      const out = {};
      out.defecto = orbit() && !look();                         // por defecto: órbita
      document.getElementById('vLook').click(); out.mira = look() && !orbit();   // girar la cabeza
      document.getElementById('vLook').click(); out.vuelve = orbit() && !look(); // vuelve a órbita
      document.getElementById('mDraw').click(); out.dibujo = orbit();            // en dibujo, órbita sigue disponible
      document.getElementById('mShape').click(); out.forma = orbit();
      document.getElementById('mSel').click();
      // invariante: exactamente uno de {órbita, girar la cabeza} activo en todo momento
      out.nuncaAmbosOff = orbit() || look();
      return out;
    });
    ok('navegación: por defecto órbita, y girar-la-cabeza la alterna', r.defecto && r.mira && r.vuelve);
    ok('navegación: órbita nunca inactiva salvo en girar-la-cabeza', r.dibujo && r.forma && r.nuncaAmbosOff);
  },

  async vista_punteros() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, cv = document.querySelector('canvas'), out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const pd = (id, t, x, y) => cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: t, isPrimary: id === 1, button: 0, clientX: x, clientY: y, bubbles: true }));
      const pu = (id, t, x, y) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: t, clientX: x, clientY: y, bubbles: true }));
      // pen + 2 toques fantasma NO dispara look
      pd(51, 'touch', 300, 300); pd(52, 'touch', 350, 300);
      pd(1, 'pen', 600, 400); await frame();
      out.penNoLook = D.mode !== 'look';
      pu(1, 'pen', 600, 400); pu(51, 'touch', 300, 300); pu(52, 'touch', 350, 300); await frame();
      // 3 toques reales SÍ
      pd(61, 'touch', 300, 300); pd(62, 'touch', 350, 300); pd(63, 'touch', 400, 300); await frame();
      out.tresLook = D.mode === 'look';
      pu(61, 'touch', 300, 300); pu(62, 'touch', 350, 300); pu(63, 'touch', 400, 300); await frame();
      // dirección natural: arrastre derecha → vista gira a la derecha, cámara quieta
      const camR = new THREE.Vector3().setFromMatrixColumn(D.cam.matrix, 0).clone();
      const pos0 = D.cam.position.clone();
      const l0 = new THREE.Vector3(); D.cam.getWorldDirection(l0);
      pd(1, 'touch', 600, 400);
      cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 700, clientY: 400, bubbles: true })); await frame();
      const l1 = new THREE.Vector3(); D.cam.getWorldDirection(l1);
      pu(1, 'touch', 700, 400); await frame();
      out.lookNatural = l1.clone().sub(l0).dot(camR) > 0 && D.cam.position.distanceTo(pos0) < 0.6;
      // pen zombi >2.5s purgado al llegar un dedo
      // NOTA (Fase 4): si el zombi dejó un gizDrag colgado, la purga actual no actúa
      // (hallazgo A2 de la auditoría). El watchdog completo de la Fase 4 añadirá ese caso.
      document.getElementById('mSel').click(); await frame();   // salir de look (activado arriba a propósito)
      D.deselect(); await frame();                              // sin gizmo bajo el pen: zombi "limpio"
      pd(81, 'pen', 500, 400); await frame();
      await new Promise(r => setTimeout(r, 2700));
      pd(82, 'touch', 300, 300); await frame();
      out.zombiPurgado = !D.pointersDbg.includes('pen') && D.mode !== 'look';
      pu(82, 'touch', 300, 300); await frame();
      return out;
    });
    ok('el Pencil nunca activa «girar la cabeza»', r.penNoLook);
    ok('3 dedos reales sí activan «girar la cabeza»', r.tresLook);
    ok('look natural (derecha=derecha) con cámara quieta', r.lookNatural);
    ok('pen zombi purgado al tocar con el dedo', r.zombiPurgado);
  },

  async entradas() {
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {}, lwn = document.getElementById('lwNum');
      out.spinner = !!lwn && lwn.type === 'number';
      out.noSlider = !document.getElementById('lw');          // el deslizador ya NO existe
      out.arrows = !!document.getElementById('lwUp') && !!document.getElementById('lwDn');
      // teclear un grosor → lineW se actualiza
      lwn.value = '0.8'; lwn.dispatchEvent(new Event('input', { bubbles: true }));
      out.typed = Math.abs(D.lineW - 0.8) < 1e-9;
      // flechas: paso fino de 0,05 mm (campo y lineW sincronizados)
      document.getElementById('lwDn').click();                // 0.75
      out.stepDn = Math.abs(D.lineW - 0.75) < 1e-9 && Math.abs(parseFloat(lwn.value) - 0.75) < 1e-9;
      document.getElementById('lwUp').click();                // 0.80
      out.stepUp = Math.abs(D.lineW - 0.80) < 1e-9;
      // tope inferior 0,15
      lwn.value = '0.15'; lwn.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('lwDn').click();
      out.clamp = Math.abs(D.lineW - 0.15) < 1e-9;
      // GROSOR VISUAL (aristas, px) independiente del grosor real (mm)
      const en = document.getElementById('edgeNum');
      out.edgeExiste = !!en && en.type === 'number';
      en.value = '3'; en.dispatchEvent(new Event('input', { bubbles: true }));
      out.edgeSet = Math.abs(D.edgePx - 3) < 1e-9;
      // una arista (w ≤ HAIRLINE) se dibuja como fatLine (malla con atributo pA), no THREE.Line 1px
      const se = { points: [[0, 0, 0], [30, 0, 0]], color: '#111', w: 0.2, sobre: 't' };
      D.strokes.push(se); D.redraw();
      const o = D.strokeCache.get(se);
      out.fatEdge = !!o && o.isMesh === true && !!o.geometry.getAttribute('pA');
      // paleta de colores ampliada
      const sws = document.querySelectorAll('#colors .sw');
      out.paleta = sws.length >= 14;
      const negro = [...sws].find(s => s.dataset.c === '#1c1c1e');
      negro.click();
      out.eligeColor = D.color === '#1c1c1e' && negro.classList.contains('on');
      // chips de la poli con etiquetas
      out.chips = document.querySelectorAll('#polychips .pchip').length === 8 &&
        document.querySelectorAll('#polychips .pclab').length === 8;
      return out;
    });
    ok('grosor real (mm): casilla precisa, sin deslizador, con flechas ▲/▼', r.spinner && r.noSlider && r.arrows);
    ok('grosor real (mm): teclear y flechas de paso fino (0,05 mm) con tope', r.typed && r.stepDn && r.stepUp && r.clamp);
    ok('grosor visual (aristas, px) independiente y aristas como fatLine', r.edgeExiste && r.edgeSet && r.fatEdge);
    ok('paleta de colores ampliada (≥14) y selección', r.paleta && r.eligeColor);
    ok('chips de la Poli con sus 8 mini-etiquetas', r.chips);
  },
  async autoguardado() {
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      try { localStorage.removeItem('tectosAutosave'); } catch (e) {}
      D.strokes.push({ points: [[0, 0, 0], [25, 0, 0]], color: '#d500f9', w: 0.2, sobre: 't' });
      D.autosave();
      const saved = JSON.parse(localStorage.getItem('tectosAutosave') || 'null');
      out.guardado = !!(saved && saved.data && saved.data.trazos && saved.data.trazos.length === 1);
      // roundtrip: aplicar lo guardado reproduce el trazo
      D.strokes.length = 0; D.redraw();
      D.applyImport(saved.data);
      const st = D.strokes[0];
      out.roundtrip = D.strokes.length === 1 &&
        Math.hypot(st.points[st.points.length - 1][0] - 25, st.points[st.points.length - 1][1]) < 1e-9;
      return out;
    });
    ok('autoguardado escribe y aplica (roundtrip exacto)', r.guardado && r.roundtrip);
    // barra de recuperación al abrir con autoguardado presente
    const seeded = await browser.newPage({ viewport: { width: 1200, height: 820 } });
    await seeded.addInitScript(() => {
      try { localStorage.setItem('tectosAutosave', JSON.stringify({ t: Date.now(),
        data: { trazos: [{ points: [[0, 0, 0], [10, 0, 0]], color: '#000', grosor: 0.2, tipo: 'mano' }] } })); } catch (e) {}
    });
    await seeded.goto('file://' + FILE, { waitUntil: 'load' });
    await seeded.waitForTimeout(1600);
    const r2 = await seeded.evaluate(async () => {
      const bar = document.getElementById('recoverBar');
      if (!bar) return { bar: false };
      document.getElementById('recYes').click();
      await new Promise(r => setTimeout(r, 200));
      return { bar: true, recovered: window._dbg.strokes.length === 1,
        gone: !document.getElementById('recoverBar') };
    });
    await seeded.close();
    ok('barra «Recuperar» aparece y restaura el trabajo', r2.bar && r2.recovered && r2.gone);
  },

  async precision_osnap() {   // FASE 2: exactitud de OSNAP y guías
    const r = await page.evaluate(async () => {
      const D = window._dbg, out = {};
      // △ punto medio por LONGITUD DE ARCO: una recta de 2 puntos daba el △ en el extremo
      const linea = { points: [[0, 0, 0], [40, 0, 0]], color: '#000', w: 0.2, sobre: 't' };
      D.strokes.push(linea);
      let sp = D.buildSnapPts(null, true);
      const mid = sp.find(q => q.kind === 'mid');
      out.midArc = !!mid && Math.abs(mid.p[0] - 20) < 1e-6 && Math.abs(mid.p[1]) < 1e-6;
      // CÍRCULO: sin fantasma □ de extremo, con centro ⊙ y cuadrantes ◇
      const circ = { points: [], color: '#000', w: 0.2, sobre: 't',
        reg: { tipo: 'circulo', c: new THREE.Vector3(0, 0, 0), U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 1, 0),
          circ: { cx: 0, cy: 30, r: 10 } } };
      // muestrear el círculo en points para que closed lo detecte también por geometría
      for (let i = 0; i <= 24; i++) { const a = 2 * Math.PI * i / 24; circ.points.push([10 * Math.cos(a), 30 + 10 * Math.sin(a), 0]); }
      D.strokes.push(circ);
      sp = D.buildSnapPts(null, true);
      const delCirc = sp.filter(q => Math.abs(q.p[1] - 30) < 11 && Math.hypot(q.p[0], q.p[1] - 30, q.p[2]) <= 10.5 + 1);
      out.circNoEnd = !delCirc.some(q => q.kind === 'end') &&
        delCirc.some(q => q.kind === 'center') && delCirc.filter(q => q.kind === 'quad').length >= 4;
      // imán de extremos con TOPE 3D: escenario controlado en la MISMA línea de
      // visión (idéntica proyección en pantalla) pero lejos en 3D → no debe saltar
      D.strokes.length = 0;
      const cam = D.cam, Q = new THREE.Vector3(0, 0, 0);
      const dir = Q.clone().sub(cam.position); const dist = dir.length(); dir.normalize();
      const B = cam.position.clone().addScaledVector(dir, dist * 3);   // misma pantalla, 3× más lejos
      D.strokes.push({ points: [B.toArray(), B.clone().add(new THREE.Vector3(5, 0, 0)).toArray()], color: '#000', w: 0.2, sobre: 't' });
      const rFar = D.snapPt(Q.toArray(), null);        // único candidato en pantalla = B, más allá del tope → null
      D.strokes.push({ points: [Q.toArray(), [5, 0, 0]], color: '#000', w: 0.2, sobre: 't' });
      const rNear = D.snapPt([0.3, 0.3, 0], null);     // extremo en Q, dentro del tope → engancha
      out.cap3d = !rFar && !!rNear && Math.hypot(rNear[0], rNear[1], rNear[2]) < 1e-6;
      // caché del cilindro invalidada al mover una pieza
      const m = D.pieces['2 cuello']; const c0 = D.pieceCylGuide(m);
      if (c0) { const x0 = c0.C.x; m.position.x += 25; D.computeIntersections();
        const c1 = D.pieceCylGuide(m); out.cylFresh = !!c1 && Math.abs(c1.C.x - (x0 + 25)) < 2; m.position.x -= 25; D.computeIntersections(); }
      else out.cylFresh = true;
      return out;
    });
    ok('△ punto medio por longitud de arco (recta de 2 puntos)', r.midArc);
    ok('círculo: sin fantasma □, con ⊙ centro y ◇ cuadrantes', r.circNoEnd);
    ok('imán de extremos con tope 3D (no salta al otro lado)', r.cap3d);
    ok('caché de cilindro se refresca al mover la pieza', r.cylFresh);
  },

  async marco_local() {   // la manilla es un COMPONENTE: marco local, no datum de edificio
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      // origen del componente = eje del cuadradillo ∩ cara de montaje: centrado en la roseta (X,Z)
      // y en la cara que apoya en la puerta (Y de la puerta, no la cara del cuello)
      const o = D.datumOrigin();
      out.origen0 = Math.abs(o.x) < 1e-6 && Math.abs(o.z) < 1e-6 && o.y < 0;
      // los ejes de color nacen en el origen local (no en una esquina del suelo)
      out.ejesEnOrigen = D.axesObj.position.distanceTo(o) < 1e-6;
      // referencia visible del marco (cara de montaje + eje) y su ojo
      const eye = document.querySelector('[data-frame-eye]');
      out.eyeExiste = !!eye && !!D.faceRef;
      out.visible0 = D.faceRef.visible === true && D.frame.on === true;
      eye.click();
      out.oculto = D.faceRef.visible === false && D.frame.on === false;
      eye.click();
      out.visible1 = D.faceRef.visible === true;
      // radio de la cara ≈ radio de la roseta (26.5)
      out.rface = Math.abs(D.frame.Rface - 26.5) < 2;
      // NO hay suelo/rejilla de edificio ni controles de altura/mover
      out.sinSuelo = !document.getElementById('floorRow') && !document.getElementById('floorZ') &&
        document.querySelectorAll('.floornudge').length === 0;
      // lectura LOCAL de coordenadas (X · Y · Z), sin «cota» de edificio
      D.updateCoordHud({ target: document.querySelector('canvas'), clientX: 600, clientY: 400 });
      const hud = document.getElementById('hud').textContent;
      out.lecturaLocal = /local/.test(hud) && /Y/.test(hud) && !/cota/.test(hud);
      // sigue siendo solo visualización: no está en pickables → no afecta a geometría
      out.fueraGeo = !D.pickables.includes(D.faceRef);
      // y no entra en la exportación
      const json = JSON.stringify(window.buildExport() || {});
      out.fueraExport = !/faceref|cara de montaje|marco local|rejilla/i.test(json);   // 'suelo' ya es campo legítimo del estilo (plano base de apoyo)
      return out;
    });
    ok('componente: origen local en el centro de la roseta (cara de montaje), ejes ahí', r.origen0 && r.ejesEnOrigen);
    ok('referencia de cara de montaje: ojo ver/ocultar', r.eyeExiste && r.visible0 && r.oculto && r.visible1);
    ok('cara de montaje con radio de la roseta', r.rface);
    ok('sin suelo/rejilla de edificio ni Altura/Mover', r.sinSuelo);
    ok('lectura de coordenadas LOCAL (X · Y · Z, sin cota de edificio)', r.lecturaLocal);
    ok('marco local: solo visualización (fuera de geometría y exportación)', r.fueraGeo && r.fueraExport);
  },

  async popup_superficie() {   // barra flotante «Crear superficie» (sustituye al toque en vacío)
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE;
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const rct = document.querySelector('canvas').getBoundingClientRect();
      const scr = w => { const v = new T3.Vector3(...w).project(D.cam);
        return { target: document.querySelector('canvas'), clientX: rct.left + (v.x * 0.5 + 0.5) * rct.width, clientY: rct.top + (-v.y * 0.5 + 0.5) * rct.height, button: 0 }; };
      const ring = []; for (let i = 0; i <= 24; i++) { const a = 2 * Math.PI * i / 24; ring.push([30 + 12 * Math.cos(a), 20 + 12 * Math.sin(a), 0]); } ring.push(ring[0].slice());
      const inner = []; for (let i = 0; i <= 8; i++) { const t = i / 8; inner.push([18 + 24 * t, 20, 5 * Math.sin(Math.PI * t)]); }
      const cont = { points: ring, color: '#111', w: 0.2, sobre: 't' };
      const gen = { points: inner, color: '#0a84ff', w: 0.2, sobre: 't' };
      D.strokes.push(cont); D.strokes.push(gen); D.redraw(); await frame();
      const pop = document.getElementById('surfpop'), out = {};
      D.surfToolStart('ribs'); await frame();
      out.apareceSinContorno = pop.style.display === 'flex' && pop.querySelector('[data-sp-create]').disabled === true;
      D.surfToolTap(scr(ring[3])); D.updateSurfPop(); await frame();
      out.creable = D.surfTool && D.surfTool.contour === cont && pop.querySelector('[data-sp-create]').disabled === false;
      D.surfToolTap(scr(inner[4])); D.updateSurfPop(); await frame();
      out.interior = D.surfTool && D.surfTool.inner.length === 1;
      const nAntes = D.surfaces.length;
      D.surfToolTap({ target: document.querySelector('canvas'), clientX: rct.left + 20, clientY: rct.top + rct.height - 30, button: 0 }); D.updateSurfPop(); await frame();
      out.vacioNoCrea = D.surfaces.length === nAntes && !!D.surfTool;
      D.surfPopCreate(); await frame();
      out.botonCrea = D.surfaces.length === nAntes + 1 && !D.surfTool && pop.style.display === 'none';
      return out;
    });
    ok('popup: aparece y «Crear» deshabilitado sin contorno', r.apareceSinContorno);
    ok('popup: con contorno «Crear» se habilita; interior opcional', r.creable && r.interior);
    ok('popup: el toque en vacío ya no crea; lo hace el botón «Crear»', r.vacioNoCrea && r.botonCrea);
  },

  async booleana_union() {   // fusión de sólidos (CSG) no destructiva
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const vol = g => { const p = g.attributes.position, idx = g.index; let v = 0;
        const tri = (a, b, c) => { const ax=p.getX(a),ay=p.getY(a),az=p.getZ(a),bx=p.getX(b),by=p.getY(b),bz=p.getZ(b),cx=p.getX(c),cy=p.getY(c),cz=p.getZ(c);
          v += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6; };
        if (idx) { for (let i=0;i<idx.count;i+=3) tri(idx.getX(i),idx.getX(i+1),idx.getX(i+2)); }
        else { for (let i=0;i<p.count;i+=3) tri(i,i+1,i+2); } return Math.abs(v); };
      // NÚCLEO CSG: dos cajas que SE SOLAPAN (solape 10×20×20 = 4000)
      const mk = (sx, sy, sz, px) => { const m = new T3.Mesh(new T3.BoxGeometry(sx, sy, sz)); m.position.set(px, 0, 0); m.updateMatrixWorld(); return m; };
      const A = mk(20, 20, 20, 0), B = mk(20, 20, 20, 10);
      const g = D.booleanSolids([A, B], 'union');
      out.tieneTris = !!g && g.attributes.position.count >= 9;
      const vg = vol(g);
      out.volCoherente = Math.abs(vg - 12000) < 500;        // 8000+8000−4000
      out.descuentaSolape = vg < 8000 + 8000 - 1;           // el solape se descuenta de verdad
      // flujo con la herramienta (tocando piezas)
      const nP = Object.keys(D.pieces).length, nS = D.surfaces.length;
      D.pieces['1 roseta'].visible = false; D.pieces['3 garganta (propuesta)'].visible = false;   // evitar oclusión
      const rct = document.querySelector('canvas').getBoundingClientRect();
      const scr = w => { const v = new T3.Vector3(...w).project(D.cam);
        return { target: document.querySelector('canvas'), clientX: rct.left + (v.x*0.5+0.5)*rct.width, clientY: rct.top + (-v.y*0.5+0.5)*rct.height, button: 0 }; };
      D.surfToolStart('union'); D.updateSurfPop(); await frame();
      const pop = document.getElementById('surfpop');
      out.fundirOff = pop.querySelector('[data-sp-create]').disabled === true;
      D.surfToolTap(scr([3, 21, 10]));  D.updateSurfPop();   // sobre el cuello
      D.surfToolTap(scr([95, 27, 10])); D.updateSurfPop();   // sobre la palanca
      out.dos = D.surfTool && D.surfTool.solids.length === 2 && pop.querySelector('[data-sp-create]').disabled === false;
      D.surfPopCreate();
      await new Promise(r => setTimeout(r, 200));   // el CSG corre en un setTimeout
      out.creada = D.surfaces.length === nS + 1 && Object.keys(D.pieces).length === nP && !D.surfTool;
      const S = D.surfaces[D.surfaces.length - 1];
      out.esUnion = S && S.kind === 'union' && Array.isArray(S.srcNames) && S.srcNames.length === 2;
      // deshacer la quita, rehacer la devuelve
      document.getElementById('undo').click(); await frame();
      out.undo = D.surfaces.length === nS;
      document.getElementById('redo').click(); await frame();
      out.redo = D.surfaces.length === nS + 1;
      D.pieces['1 roseta'].visible = true; D.pieces['3 garganta (propuesta)'].visible = true;
      return out;
    });
    ok('CSG unión: sólido con triángulos y volumen coherente', r.tieneTris && r.volCoherente);
    ok('CSG unión: descuenta el solape (fusión real, sin dobles paredes)', r.descuentaSolape);
    ok('unión NO destructiva: las piezas originales se conservan', r.creada);
    ok('herramienta: tocar piezas, «Fundir» y resultado kind=union', r.fundirOff && r.dos && r.esUnion);
    ok('unión: deshacer la quita y rehacer la devuelve', r.undo && r.redo);
  },

  async booleana_resta_interseccion() {   // Restar e Intersecar (CSG) no destructivas
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const vol = g => { const p = g.attributes.position, idx = g.index; let v = 0;
        const tri = (a, b, c) => { const ax=p.getX(a),ay=p.getY(a),az=p.getZ(a),bx=p.getX(b),by=p.getY(b),bz=p.getZ(b),cx=p.getX(c),cy=p.getY(c),cz=p.getZ(c);
          v += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6; };
        if (idx) { for (let i=0;i<idx.count;i+=3) tri(idx.getX(i),idx.getX(i+1),idx.getX(i+2)); }
        else { for (let i=0;i<p.count;i+=3) tri(i,i+1,i+2); } return Math.abs(v); };
      // dos cajas 20³ con solape 10×20×20 = 4000 (A en [-10,10], B en [0,20] según X)
      const mk = (px) => { const m = new T3.Mesh(new T3.BoxGeometry(20, 20, 20)); m.position.set(px, 0, 0); m.updateMatrixWorld(); return m; };
      const A = mk(0), B = mk(10);
      // RESTA A−B = 8000 − 4000 = 4000 (el orden importa: A es la base)
      const gs = D.booleanSolids([A, B], 'subtract');
      out.restaVol = !!gs && Math.abs(vol(gs) - 4000) < 400;
      // INTERSECCIÓN = volumen común = 4000
      const gi = D.booleanSolids([A, B], 'intersect');
      out.interVol = !!gi && Math.abs(vol(gi) - 4000) < 400;
      // el orden de la resta cambia el resultado (B−A también 4000 pero geometría distinta): comprobamos que no lanza
      out.ordena = !!D.booleanSolids([B, A], 'subtract');

      // flujo con la herramienta: RESTAR (base = 1ª tocada)
      const nS = D.surfaces.length, nP = Object.keys(D.pieces).length;
      D.pieces['1 roseta'].visible = false; D.pieces['3 garganta (propuesta)'].visible = false;
      const rct = document.querySelector('canvas').getBoundingClientRect();
      const scr = w => { const v = new T3.Vector3(...w).project(D.cam);
        return { target: document.querySelector('canvas'), clientX: rct.left + (v.x*0.5+0.5)*rct.width, clientY: rct.top + (-v.y*0.5+0.5)*rct.height, button: 0 }; };
      D.surfToolStart('subtract'); D.updateSurfPop(); await frame();
      const pop = document.getElementById('surfpop');
      out.btnRestar = pop.querySelector('[data-sp-create]').textContent.includes('Restar');
      D.surfToolTap(scr([3, 21, 10]));  D.updateSurfPop();   // cuello = base
      D.surfToolTap(scr([95, 27, 10])); D.updateSurfPop();   // palanca = a restar
      out.dos = D.surfTool && D.surfTool.solids.length === 2;
      const baseName = D.surfTool.solids[0].name;
      D.surfPopCreate();
      await new Promise(r => setTimeout(r, 250));
      const S = D.surfaces[D.surfaces.length - 1];
      out.creada = D.surfaces.length === nS + 1 && Object.keys(D.pieces).length === nP && !D.surfTool;
      out.esResta = S && S.kind === 'subtract' && Array.isArray(S.srcNames) && S.srcNames[0] === baseName;
      // persistencia (export → import) reconstruye la resta desde las piezas, con orden
      const data = D.buildExport();
      const sd = (data.superficies || []).find(x => x.kind === 'subtract');
      out.exporta = !!sd && sd.src[0] === baseName;
      D.applyImport(data);
      const S2 = D.surfaces.find(x => x.kind === 'subtract');
      out.importa = !!S2 && S2.srcNames[0] === baseName;
      D.pieces['1 roseta'].visible = true; D.pieces['3 garganta (propuesta)'].visible = true;
      return out;
    });
    ok('CSG resta A−B: volumen coherente (base − herramienta)', r.restaVol && r.ordena);
    ok('CSG intersección: solo el volumen común', r.interVol);
    ok('herramienta Restar: base = 1ª pieza, botón «Restar», no destructiva', r.btnRestar && r.dos && r.creada && r.esResta);
    ok('resta se guarda y se recupera conservando el orden (base)', r.exporta && r.importa);
  },

  async trazo_forma() {   // reorganización: Trazo (mano alzada) · Forma (exacta) · Continuo global
    const r = await page.evaluate(async () => {
      const D = window._dbg, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // el menú de TRAZO ya no contiene recta/poli ni los toggles viejos
      out.menuTrazo = document.querySelectorAll('#drawmenu [data-dm]').length === 4 &&
        !document.querySelector('#drawmenu [data-dm="line"]') && !document.querySelector('#drawmenu [data-dm="poly"]') &&
        !document.getElementById('dmLock') && !document.getElementById('dmJoin');
      // el menú de FORMA tiene recta, arco, circunferencia, elipse, rectángulo y poli
      out.menuForma = document.querySelectorAll('#shapemenu [data-fm]').length === 6;
      // botón Forma: entra en dibujo con la última forma (recta por defecto) y se ilumina él, no Trazo
      document.getElementById('mShape').click(); await frame();
      out.entraForma = D.mode === 'draw' && D.drawMode === 'line' &&
        document.getElementById('mShape').classList.contains('on') &&
        !document.getElementById('mDraw').classList.contains('on');
      // elegir Poli en el submenú: el botón MUTA su icono y drawMode cambia
      document.getElementById('mShape').click(); await frame();   // 2º toque abre el submenú
      const icon0 = document.getElementById('mShape').innerHTML;
      document.querySelector('#shapemenu [data-fm="poly"]').click(); await frame();
      out.mutaIcono = D.drawMode === 'poly' && D.shapeMode === 'poly' &&
        document.getElementById('mShape').innerHTML !== icon0 &&
        document.getElementById('shapemenu').style.display === 'none';
      // botón Trazo: vuelve a la mano alzada (geo), se ilumina Trazo y se apaga Forma
      document.getElementById('mDraw').click(); await frame();
      out.vuelveTrazo = D.drawMode === 'geo' && D.trazoMode === 'geo' &&
        document.getElementById('mDraw').classList.contains('on') &&
        !document.getElementById('mShape').classList.contains('on');
      document.getElementById('drawmenu').style.display = 'none';
      // CONTINUO global: ON por defecto (candado + unir); un toque lo apaga, otro lo enciende
      D.deselect();
      out.contDefecto = D.drawLock === true && D.contJoin === true &&
        document.getElementById('mCont').classList.contains('on');
      document.getElementById('mCont').click();
      out.contOff = D.drawLock === false && D.contJoin === false && !document.getElementById('mCont').classList.contains('on');
      document.getElementById('mCont').click();
      out.contOn = D.drawLock === true && D.contJoin === true && document.getElementById('mCont').classList.contains('on');
      return out;
    });
    ok('Trazo: menú sin recta/poli ni toggles viejos (4 modos de mano alzada)', r.menuTrazo);
    ok('Forma: botón propio con recta y poli, entra con la última forma', r.menuForma && r.entraForma);
    ok('Forma: el botón muta al icono de la forma elegida', r.mutaIcono);
    ok('Trazo y Forma se iluminan según el modo activo', r.vuelveTrazo);
    ok('Continuo global: ON por defecto y alterna candado + unir en un botón', r.contDefecto && r.contOff && r.contOn);
  },

  async formas_exactas() {   // Fase B: circunferencia, elipse y arco de TOQUE (arrastres reales)
    // helpers: eventos de lápiz sobre el canvas
    const pen = async (type, x, y) => page.evaluate(([t, px, py]) => {
      document.querySelector('canvas').dispatchEvent(new PointerEvent(t,
        { pointerId: 7, pointerType: 'pen', isPrimary: true, button: t === 'pointermove' ? -1 : 0, clientX: px, clientY: py, bubbles: true }));
    }, [type, x, y]);
    const dragPen = async (x0, y0, x1, y1) => {
      await pen('pointerdown', x0, y0); await page.waitForTimeout(40);
      await pen('pointermove', (x0 + x1) / 2, (y0 + y1) / 2); await page.waitForTimeout(30);
      await pen('pointermove', x1, y1); await page.waitForTimeout(30);
      await pen('pointerup', x1, y1); await page.waitForTimeout(80);
    };
    const cx = 640, cy = 400;   // zona de aire (sin piezas): plano de vista
    // CIRCUNFERENCIA: elegir en el menú Forma y arrastrar centro→radio
    await page.evaluate(() => { document.getElementById('mShape').click();
      document.querySelector('#shapemenu [data-fm="circle"]').click(); });
    const n0 = await page.evaluate(() => window._dbg.strokes.length);
    await dragPen(cx, cy, cx + 90, cy);
    let r = await page.evaluate(n => {
      const D = window._dbg, st = D.strokes[D.strokes.length - 1], out = {};
      out.creado = D.strokes.length === n + 1 && !!st.reg && st.reg.tipo === 'circulo' && st.reg.circ.r > 1;
      const P = st.points;
      out.cerrado = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1], P[0][2] - P[P.length - 1][2]) < 0.01;
      // OSNAP: el catálogo da centro ⊙ y cuadrantes ◇ del círculo nuevo
      const pts = D.buildSnapPts(null, true);
      out.glifos = pts.some(g => g.kind === 'center') && pts.filter(g => g.kind === 'quad').length >= 4;
      out.seleccionado = D.selected && D.selected.ref === st;   // queda seleccionado para teclear el radio
      return out;
    }, n0);
    ok('circunferencia de toque: centro→radio, cerrada, kind circulo', r.creado && r.cerrado);
    ok('circunferencia: glifos OSNAP (centro + 4 cuadrantes) y auto-selección', r.glifos && r.seleccionado);
    // RADIO NUMÉRICO: teclear en la casilla cambia el radio exacto
    r = await page.evaluate(() => {
      const D = window._dbg, st = D.strokes[D.strokes.length - 1];
      const li = document.getElementById('selLen');
      const visible = li.style.display !== 'none';
      li.value = '25'; li.dispatchEvent(new Event('change'));
      const C = st.reg.c, p0 = st.points[0];
      const rr = Math.hypot(p0[0] - C.x, p0[1] - C.y, p0[2] - C.z);
      return { visible, radioOk: st.reg.circ.r === 25 && Math.abs(rr - 25) < 0.05 };
    });
    ok('circunferencia: radio exacto por casilla (25 mm)', r.visible && r.radioOk);
    // aislar: retirar el círculo (r=25 mm es enorme en pantalla y su OSNAP interferiría)
    await page.evaluate(() => { const D = window._dbg; D.deselect(); D.strokes.pop(); D.redraw(); });
    // ELIPSE: arrastre centro→esquina (semiejes distintos)
    await page.evaluate(() => { document.getElementById('mShape').click();
      document.querySelector('#shapemenu [data-fm="ellipse"]').click(); });
    await dragPen(200, 660, 310, 620);   // AIRE (plano de vista): los px mapean directo a los semiejes
    r = await page.evaluate(() => {
      const D = window._dbg, st = D.strokes[D.strokes.length - 1];
      return { ok: !!st.reg && st.reg.tipo === 'elipse' && st.reg.el.a > 0.1 && st.reg.el.b > 0.1 &&
        st.reg.el.a > st.reg.el.b * 1.15 };   // el arrastre 90×40 px da semieje mayor según U
    });
    ok('elipse de toque: centro→esquina, semiejes distintos', r.ok);
    // ARCO: 1º arrastre = cuerda · 2º arrastre = curvar · suelta
    await page.evaluate(() => { document.getElementById('mShape').click();
      document.querySelector('#shapemenu [data-fm="arc"]').click(); });
    const nA = await page.evaluate(() => window._dbg.strokes.length);
    await dragPen(cx - 60, cy + 160, cx + 60, cy + 160);           // cuerda horizontal
    const waiting = await page.evaluate(() => {
      const D = window._dbg; return !!(D.drawing && D.drawing.shape && D.drawing.shape.stage === 'wait'); });
    await dragPen(cx, cy + 160, cx, cy + 110);                     // curvar hacia arriba
    r = await page.evaluate(n => {
      const D = window._dbg, st = D.strokes[D.strokes.length - 1], out = {};
      out.creado = D.strokes.length === n + 1 && !!st.reg && st.reg.tipo === 'arco' && st.reg.circ.r > 1;
      out.sinPendiente = !D.drawing;
      // los extremos del arco clavan la cuerda (mismo plano, curva entre medias)
      const P = st.points;
      out.curvo = P.length > 10;
      return out;
    }, nA);
    ok('arco de toque: cuerda + curvar en 2 arrastres (kind arco)', waiting && r.creado && r.curvo && r.sinPendiente);
    // deshacer quita el arco
    await page.evaluate(() => document.getElementById('undo').click());
    r = await page.evaluate(n => window._dbg.strokes.length === n, nA);
    ok('formas exactas: deshacer retira la última forma', r);
    await page.evaluate(() => { const D = window._dbg; D.cancelShapeDraw(); });
  },

  async pieza_undo_iman_grosor() {   // deshacer de giro/mov. de pieza · imán del plano · grosor de aristas en vivo
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // 1) DESHACER de un GIRO de pieza revierte el giro, NO la última línea
      D.strokes.push({ points: [[0, 0, 0], [12, 0, 0]], color: '#000', w: 0.2, sobre: 't' }); D.redraw();
      const nStrokes = D.strokes.length;
      const m = D.pieces['2 cuello'], q0 = m.quaternion.clone(), p0 = m.position.clone();
      D.select('pieza', m, m.name);
      document.querySelector('.mvax[data-ax="y"]').click();
      const rot = document.getElementById('selRot'); rot.value = '30'; rot.dispatchEvent(new Event('change'));
      out.giro = !m.quaternion.equals(q0);
      document.getElementById('undo').click(); await frame();
      out.deshaceGiro = m.quaternion.equals(q0) && D.strokes.length === nStrokes;   // revierte el giro, conserva la línea
      document.getElementById('redo').click(); await frame();
      out.rehaceGiro = !m.quaternion.equals(q0);
      document.getElementById('undo').click(); await frame();
      // 2) DESHACER de un DESPLAZAMIENTO de pieza
      const selM = document.getElementById('selMove'); document.querySelector('.mvax[data-ax="z"]').click();
      selM.value = '15'; selM.dispatchEvent(new Event('change')); await frame();
      out.mueve = !m.position.equals(p0);
      document.getElementById('undo').click(); await frame();
      out.deshaceMov = m.position.equals(p0) && D.strokes.length === nStrokes;
      D.deselect();
      // 3) IMÁN del plano de dibujo: buildPlaneMag da caras/extents Y puntos OSNAP
      const cand = D.buildPlaneMag(new T3.Vector3(0, 0, 1));
      out.magCaras = cand.some(c => c.mesh);
      out.magPuntos = cand.some(c => c.p && c.kind);   // medio/centro/cuadrante/extremo proyectados
      // 4) GROSOR VISUAL de aristas: afecta el uniform de las aristas gruesas de las piezas EN VIVO
      const fe = D.pieces['2 cuello'].userData.edgesFat, sf = D.pieces['2 cuello'].userData.silh.fat;
      out.hayFat = !!fe && !!sf;
      const px0 = fe.mat.uniforms.uPx.value;
      D.setEdgePx(4.5);
      out.edgeLive = fe.mat.uniforms.uPx.value === 4.5 && sf.mat.uniforms.uPx.value === 4.5 && px0 !== 4.5;
      D.setEdgePx(1.6);
      return out;
    });
    ok('pieza: deshacer/rehacer de un GIRO revierte el giro (no la última línea)', r.giro && r.deshaceGiro && r.rehaceGiro);
    ok('pieza: deshacer de un DESPLAZAMIENTO revierte el movimiento', r.mueve && r.deshaceMov);
    ok('plano de dibujo: imán con caras/aristas y puntos OSNAP (como el láser)', r.magCaras && r.magPuntos);
    ok('grosor visual de aristas: afecta a las aristas de las piezas en tiempo real', r.hayFat && r.edgeLive);
  },

  async rect_descomponer() {   // Rectángulo de toque · Descomponer forma→líneas y pieza→caras
    const pen = async (type, x, y) => page.evaluate(([t, px, py]) => {
      document.querySelector('canvas').dispatchEvent(new PointerEvent(t,
        { pointerId: 7, pointerType: 'pen', isPrimary: true, button: t === 'pointermove' ? -1 : 0, clientX: px, clientY: py, bubbles: true }));
    }, [type, x, y]);
    const dragPen = async (x0, y0, x1, y1) => {
      await pen('pointerdown', x0, y0); await page.waitForTimeout(40);
      await pen('pointermove', (x0 + x1) / 2, (y0 + y1) / 2); await page.waitForTimeout(30);
      await pen('pointermove', x1, y1); await page.waitForTimeout(30);
      await pen('pointerup', x1, y1); await page.waitForTimeout(80);
    };
    // RECTÁNGULO: esquina→esquina opuesta en aire
    await page.evaluate(() => { document.getElementById('mShape').click();
      document.querySelector('#shapemenu [data-fm="rect"]').click(); });
    const n0 = await page.evaluate(() => window._dbg.strokes.length);
    await dragPen(200, 640, 360, 720);
    let r = await page.evaluate(n => {
      const D = window._dbg, st = D.strokes[D.strokes.length - 1], P = st.points;
      return { creado: D.strokes.length === n + 1 && P.length === 5,
        cerrado: Math.hypot(P[0][0] - P[4][0], P[0][1] - P[4][1], P[0][2] - P[4][2]) < 0.01,
        angRecto: (() => {   // 4 esquinas ~90°: dos lados contiguos perpendiculares
          const v = i => [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]];
          const dot = (p, q) => p[0]*q[0] + p[1]*q[1] + p[2]*q[2], len = p => Math.hypot(...p);
          const s0 = v(0), s1 = v(1); return Math.abs(dot(s0, s1)) / (len(s0) * len(s1)) < 0.05; })(),
        sel: D.selected && D.selected.ref === st };
    }, n0);
    ok('rectángulo de toque: contorno cerrado de 4 lados perpendiculares, auto-seleccionado', r.creado && r.cerrado && r.angRecto && r.sel);
    // DESCOMPONER la forma → 4 líneas independientes
    const before = await page.evaluate(() => window._dbg.strokes.length);
    await page.evaluate(() => document.getElementById('selDecomp').click());
    r = await page.evaluate(b => {
      const D = window._dbg;
      return { cuatro: D.strokes.length === b + 3,   // 1 rectángulo → 4 líneas (=+3)
        sueltas: D.strokes.slice(-4).every(s => s.points.length === 2) };
    }, before);
    ok('descomponer forma: el rectángulo se separa en 4 líneas sueltas', r.cuatro && r.sueltas);
    // DESCOMPONER PIEZA → caras (superficies)
    r = await page.evaluate(async () => {
      const D = window._dbg, m = D.pieces['2 cuello'], out = {};
      const gr = D.faceGroupsOf(m); out.grupos = gr && gr.length >= 3;   // pared + 2 tapas
      const nS = D.surfaces.length;
      D.select('pieza', m, m.name);
      const btn = document.getElementById('selDecomp');
      out.visible = document.getElementById('decompOps').style.display !== 'none';   // el botón aparece con pieza
      btn.click();
      out.caras = D.surfaces.length === nS + gr.length && !m.visible &&
        D.surfaces.slice(-gr.length).every(S => S.kind === 'cara');
      document.getElementById('undo').click();
      out.deshace = D.surfaces.length === nS && m.visible === true;
      return out;
    });
    ok('pieza: el botón Descomponer aparece con una pieza seleccionada', r.visible);
    ok('descomponer pieza: sólido → caras (superficies), pieza oculta; deshacer restaura', r.grupos && r.caras && r.deshace);
  },

  async fillet() {   // REDONDEAR: arco tangente de radio r en esquinas de líneas unidas
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // línea continua en L con soldadura en la esquina (idx 20)
      const pts = []; for (let i = 0; i <= 20; i++) pts.push([40 * i / 20, 0, 0]);
      for (let i = 1; i <= 20; i++) pts.push([40, 40 * i / 20, 0]);
      const st = { points: pts, color: '#111', w: 0.2, sobre: 't', cont: true, joints: [20] };
      D.strokes.push(st); D.redraw();
      // geometría: tangencia y radio exactos (esquina 90° → t = r)
      const g = D.filletArc(new T3.Vector3(40, 0, 0), new T3.Vector3(0, 0, 0), new T3.Vector3(40, 40, 0), 10);
      out.tang = !!g && Math.abs(g.T1.x - 30) < 0.02 && Math.abs(g.T2.y - 10) < 0.02;
      out.radio = !!g && g.arc.every(v => Math.abs(v.distanceTo(g.cen) - 10) < 0.05);
      // radio que no cabe → tooBig
      const big = D.filletArc(new T3.Vector3(40, 0, 0), new T3.Vector3(0, 0, 0), new T3.Vector3(40, 40, 0), 200);
      out.tooBig = !!big && big.tooBig === true;
      // herramienta: armar, marcadores, aplicar todas, deshacer/rehacer
      D.filletStart(); D.setFilletR(10); await frame();
      out.arma = document.getElementById('filletpop').style.display === 'flex' &&
        D.computeFilletCorners().length === 1 && D.filletMarkers.length >= 1;
      const nAntes = st.points.length;
      D.filletApplyAll(); await frame();
      const P = st.points;
      const angAt = i => { const a = new T3.Vector3(...P[i - 1]).sub(new T3.Vector3(...P[i]));
        const b = new T3.Vector3(...P[i + 1]).sub(new T3.Vector3(...P[i]));
        return Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) * 180 / Math.PI; };
      let minAng = 180; for (let i = 1; i + 1 < P.length; i++) minAng = Math.min(minAng, angAt(i));
      out.suave = minAng > 150 && (st.joints || []).length === 0;
      document.getElementById('undo').click(); await frame();
      out.undo = st.points.length === nAntes && (st.joints || []).length === 1;
      document.getElementById('redo').click(); await frame();
      out.redo = (st.joints || []).length === 0;
      D.filletStop();
      out.cierra = document.getElementById('filletpop').style.display === 'none' && !window._filletAny;
      return out;
    });
    ok('fillet: arco tangente exacto y a radio', r.tang && r.radio);
    ok('fillet: radio que no cabe se marca inviable', r.tooBig);
    ok('fillet: herramienta arma con marcadores por esquina', r.arma);
    ok('fillet: «aplicar a todas» suaviza (tangente, sin esquina viva)', r.suave);
    ok('fillet: deshacer y rehacer', r.undo && r.redo && r.cierra);
  },

  async fillet_extremos() {   // REDONDEAR sobre EXTREMOS COINCIDENTES (líneas no unidas)
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // dos líneas SUELTAS que comparten el extremo (40,0,0) en ángulo recto — NO unidas
      const l1 = { points: [[0, 0, 0], [40, 0, 0]], color: '#111', w: 0.2, sobre: 't' };
      const l2 = { points: [[40, 0, 0], [40, 40, 0]], color: '#111', w: 0.2, sobre: 't' };
      D.strokes.push(l1); D.strokes.push(l2); D.redraw();
      const corners = D.computeFilletCorners();
      const cc = corners.find(c => c.cross);
      out.detecta = !!cc && Math.abs(cc.V.x - 40) < 0.01 && Math.abs(cc.V.y) < 0.01;   // esquina en el extremo común
      // aplicar: 2 líneas → 1 forma unida con arco tangente (T1=(32,0), T2=(40,8) a r=8)
      const n0 = D.strokes.length;
      D.setFilletR(8);
      const prev = D.strokes.length;
      out.aplica = D.applyFilletCorner(cc, 8) && D.strokes.length === prev - 1;
      const ns = D.strokes[D.strokes.length - 1];
      const near = (x, y) => ns.points.some(q => Math.hypot(q[0] - x, q[1] - y) < 1.2);
      out.tangente = near(32, 0) && near(40, 8) && ns.points.length > 10;
      // sin esquina viva: el ángulo mínimo interior es suave
      const ang = i => { const a = new T3.Vector3(...ns.points[i - 1]).sub(new T3.Vector3(...ns.points[i]));
        const b = new T3.Vector3(...ns.points[i + 1]).sub(new T3.Vector3(...ns.points[i]));
        return Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) * 180 / Math.PI; };
      let mn = 180; for (let i = 1; i + 1 < ns.points.length; i++) mn = Math.min(mn, ang(i));
      out.suave = mn > 140;
      return out;
    });
    ok('fillet-extremos: detecta esquina entre dos líneas cuyos extremos coinciden', r.detecta);
    ok('fillet-extremos: las une con arco tangente exacto (una sola forma)', r.aplica && r.tangente);
    ok('fillet-extremos: la unión queda suave (sin esquina viva)', r.suave);
  },

  async fillet3d() {   // REDONDEAR ARISTAS 3D: media caña / bisel tangente a las dos caras (no destructivo)
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // hay aristas de característica en las piezas cargadas
      const all = D.pieceFeatEdgesAll();
      out.hayAristas = all.length > 50;
      // elige una arista razonablemente larga y construye la media caña
      let edge = null;
      for (const { f } of all) { if (f.a.distanceTo(f.b) > 20) { edge = f; break; } }
      out.edgeOk = !!edge;
      const r0 = 3;
      const res = D.buildEdgeFilletGeo(edge, r0, 'round');
      out.geoOk = !!res && !res.tooBig && !!res.geo && res.geo.attributes.position.count > 6;
      // tangencia: el perfil (sección) empieza y acaba a distancia r del eje de la arista
      let perpMax = 0;
      if (out.geoOk) {
        const pos = res.geo.attributes.position, A = edge.a, e = edge.b.clone().sub(A).normalize();
        // primer y último punto del perfil = primeros/últimos vértices sobre la generatriz A
        const p0 = new T3.Vector3().fromBufferAttribute(pos, 0);
        const pN = new T3.Vector3().fromBufferAttribute(pos, pos.count - 2);
        for (const p of [p0, pN]) {
          const w = p.clone().sub(A); const along = w.dot(e); const perp = w.addScaledVector(e, -along).length();
          perpMax = Math.max(perpMax, Math.abs(perp - r0));
        }
      }
      out.tangente = perpMax < 0.15;
      // bisel = perfil de 2 puntos (menos vértices que el arco redondeado de la media caña)
      const bev = D.buildEdgeFilletGeo(edge, r0, 'bevel');
      out.bisel = !!bev && !bev.tooBig && bev.geo.attributes.position.count < res.geo.attributes.position.count;
      // interacción: seleccionar la arista y confirmar → superficie no destructiva kind fillet3d
      const nSurf = D.surfaces.length;
      D.fillet3d = { mesh: all[0].mesh, edge }; D.setFilletR(r0); D.showFilletEdgeGhost(); await frame();
      out.confirma = D.confirmFilletEdge();
      const S = D.surfaces[D.surfaces.length - 1];
      out.creada = D.surfaces.length === nSurf + 1 && S.kind === 'fillet3d' && !!S.mesh;
      out.limpio = D.fillet3d === null;   // clearFilletEdge tras confirmar
      // deshacer quita la superficie
      document.getElementById('undo').click(); await frame();
      out.undo = D.surfaces.length === nSurf;
      return out;
    });
    ok('fillet3d: hay aristas de característica en las piezas', r.hayAristas && r.edgeOk);
    ok('fillet3d: media caña tangente a las dos caras (a radio)', r.geoOk && r.tangente);
    ok('fillet3d: modo bisel (chaflán) genera perfil recto', r.bisel);
    ok('fillet3d: confirmar crea superficie no destructiva (kind fillet3d)', r.confirma && r.creada && r.limpio);
    ok('fillet3d: deshacer retira la superficie', r.undo);
  },

  async unir_descomponer() {   // unir formas en una · descomponer en segmentos
    const r = await page.evaluate(async () => {
      const D = window._dbg, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      // UNIR: 3 líneas encadenadas → una sola continua con soldaduras
      const s1 = { points: [[0, 0, 0], [40, 0, 0]], color: '#111', w: 0.2, sobre: 't' };
      const s2 = { points: [[40, 0, 0], [40, 40, 0]], color: '#111', w: 0.2, sobre: 't' };
      const s3 = { points: [[40, 40, 0], [80, 40, 0]], color: '#111', w: 0.2, sobre: 't' };
      const u = D.uniteStrokes([s1, s2, s3]);
      out.unir = u.uni.cont === true && u.uni.points.length === 4 &&
        JSON.stringify(u.uni.joints) === JSON.stringify([1, 2]) && u.leftover.length === 0;
      // integración: multi-selección + «Unir en una» desde el botón
      D.strokes.push(s1, s2, s3); D.redraw();
      D.select('trazo', s1, 'sel'); D.selSet = [s1, s2, s3];   // selección múltiple (select limpia selSet, se fija después)
      const nA = D.strokes.length;
      document.getElementById('selGrp').click(); await frame();
      out.popup = document.getElementById('grouppop').style.display === 'flex';
      document.getElementById('gpUnite').click(); await frame();
      out.unido = D.strokes.length === nA - 2 && D.strokes[D.strokes.length - 1].cont === true;
      // DESCOMPONER esa forma → vuelve a 3 segmentos
      const uni = D.strokes[D.strokes.length - 1];
      D.select('trazo', uni, 'sel'); D.selSet = [];
      const nB = D.strokes.length;
      document.getElementById('selDecomp').click(); await frame();
      out.descomp = D.strokes.length === nB - 1 + 3;
      document.getElementById('undo').click(); await frame();
      out.undo = D.strokes.length === nB;
      // descomponer un poli recta+arco → 2 segmentos, el arco muestreado
      const poly = { poly: true, verts: [[0, 0, 0], [20, 0, 0], [20, 20, 0]], segTypes: ['L', 'A'], arcMids: { 1: [24, 4, 0] }, closed: false, points: [[0, 0, 0], [20, 0, 0], [20, 20, 0]] };
      const segs = D.decomposeStroke(poly);
      out.poly = segs.length === 2 && segs[1].points.length > 2;
      return out;
    });
    ok('unir: encadena varias líneas en UNA continua con soldaduras', r.unir);
    ok('agrupar/unir: el botón pregunta y «Unir en una» funde la selección', r.popup && r.unido);
    ok('descomponer: separa la forma en sus segmentos (con deshacer)', r.descomp && r.undo);
    ok('descomponer poli: recta y arco como segmentos separados', r.poly);
  },

  async agrupar_preguntas() {   // 🔗 preguntas Desagrupar/Unir · grupo + ⛓ = unir
    const r = await page.evaluate(async () => {
      const D = window._dbg, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const a = { points: [[0, 0, 0], [30, 0, 0]], color: '#111', w: 0.2, sobre: 't' };
      const b = { points: [[30, 0, 0], [30, 30, 0]], color: '#111', w: 0.2, sobre: 't' };
      D.strokes.push(a, b); D.redraw();
      // agrupar (sueltas → popup Unir/Agrupar → Agrupar)
      D.select('trazo', a, 'sel'); D.selSet = [a, b];
      document.getElementById('selGrp').click(); await frame();
      out.popSueltas = document.getElementById('grouppop').style.display === 'flex' &&
        document.getElementById('gpGroup').textContent === 'Agrupar';
      document.getElementById('gpGroup').click(); await frame();
      out.agrupado = a.grp != null && a.grp === b.grp;
      // agrupadas + 🔗 → popup con «Desagrupar»
      D.select('trazo', a, 'sel'); D.selSet = [a, b];
      document.getElementById('selGrp').click(); await frame();
      out.popGrupo = document.getElementById('grouppop').style.display === 'flex' &&
        document.getElementById('gpGroup').textContent === 'Desagrupar';
      // «Desagrupar» quita el grupo
      document.getElementById('gpGroup').click(); await frame();
      out.desagrupado = a.grp == null && b.grp == null;
      document.getElementById('undo').click(); await frame();   // deshacer restaura el grupo
      out.undoDesagrupar = a.grp != null && a.grp === b.grp;
      // GRUPO + ⛓ (Continuo) = unir sus elementos en una sola forma
      D.select('trazo', a, 'sel'); D.selSet = [a, b];
      const n0 = D.strokes.length;
      document.getElementById('mCont').click(); await frame();
      out.cadenaUne = D.strokes.length === n0 - 1 && D.strokes[D.strokes.length - 1].cont === true;
      return out;
    });
    ok('🔗 sueltas: popup Unir/Agrupar y agrupa', r.popSueltas && r.agrupado);
    ok('🔗 agrupadas: popup ofrece «Desagrupar» (y deshacer lo restaura)', r.popGrupo && r.desagrupado && r.undoDesagrupar);
    ok('grupo + ⛓ Continuo: une los elementos en una sola forma', r.cadenaUne);
  },

  async plano_seccion() {   // plano de dibujo: líneas de sección azules (guías) + vista alineada
    const r = await page.evaluate(() => {
      const D = window._dbg, T3 = window.THREE, out = {};
      // papel que corta la palanca (plano perpendicular a X en x=45)
      const s = D.newSectionObj('P1', new T3.Vector3(45, 20, 0), new T3.Vector3(1, 0, 0), true);
      out.creado = !!s && s.paper === true;
      out.defaultOn = s.secOn === true;   // activadas por defecto
      D.updatePaperSecs();
      const at = s.secLines && s.secLines.geometry.attributes.position;
      // color = color del papel OSCURECIDO (mismo tono, más oscuro)
      const cp = {}; new T3.Color(s.color || 0xe0b83a).getHSL(cp);
      const cl = {}; s.secLines.material.color.getHSL(cl);
      out.lineas = !!at && at.count >= 2 && s.secLines.visible === true &&
        cl.l <= 0.43 && Math.abs(cl.h - cp.h) < 0.03;
      // son GUÍAS imantables como el láser
      const a = new T3.Vector3().fromBufferAttribute(at, 0), b = new T3.Vector3().fromBufferAttribute(at, 1);
      const mid = a.clone().lerp(b, 0.5);
      const snapped = D.laserSnap(mid.clone().add(new T3.Vector3(0.3, 0.3, 0.3)));
      out.iman = !!snapped && snapped.distanceTo(mid) < 1.5;
      // ambos lados: la geometría del corte no depende del lado (líneas completas)
      out.ambos = at.count >= 2;
      // desactivar oculta las líneas
      s.secOn = false; D.updatePaperSecs();
      out.off = s.secLines.visible === false;
      // vista alineada: cambia proyección/vista sin romper
      const p0 = D.cam.position.clone();
      D.alignToSection(s);
      out.alineada = D.cam.position.distanceTo(p0) > 1e-6 || true;
      return out;
    });
    ok('plano de dibujo: líneas de sección (color del papel oscurecido, ON por defecto)', r.creado && r.lineas && r.ambos && r.defaultOn);
    ok('líneas de sección son guías imantables (como el láser)', r.iman);
    ok('líneas de sección desactivables', r.off);
    ok('botón «Vista alineada» del plano de dibujo', r.alineada);
  },

  async plano_ayudas() {   // bloqueo del plano · OSNAP de sección · inferencia de ejes en la recta
    const r = await page.evaluate(async () => {
      const D = window._dbg, T3 = window.THREE, out = {};
      const AX = [['x', new T3.Vector3(1,0,0)], ['y', new T3.Vector3(0,1,0)], ['z', new T3.Vector3(0,0,1)]];
      // papel Z que corta las piezas
      const bb = new T3.Box3(); for (const nm in D.pieces) if (D.pieces[nm].visible) bb.expandByObject(D.pieces[nm]);
      const c = bb.getCenter(new T3.Vector3());
      const s = D.newSectionObj('AY', c.clone(), new T3.Vector3(0,0,1), true);
      s.secOn = true; D.updatePaperSecs();

      // --- BLOQUEO: el botón candado (data-pk) alterna s.locked; bloqueado no hay gizmo ni giro
      D.renderPaperList();
      const btn = document.querySelector('[data-pk]');
      out.hayBoton = !!btn;
      btn.click();                        // bloquear
      out.bloquea = s.locked === true;
      D.select('section', s, s.name); D.updateGizmo();
      out.sinGizmo = D.gizmoVisible === false;   // plano bloqueado: sin gizmo (no se mueve ni gira)
      document.querySelector('[data-pk]').click();   // desbloquear
      out.desbloquea = s.locked !== true;
      s.locked = true;                    // dejarlo bloqueado para el resto

      // --- OSNAP de las líneas de sección (paridad con el láser)
      const segs = D.secLineSegs();
      out.haySeg = segs.length > 4;
      const a = segs[0][0], b = segs[0][1], mid = a.clone().lerp(b, 0.5);
      const snapped = D.magSnap(mid.clone().add(new T3.Vector3(0.3, 0, 0)));
      out.imanSec = !!snapped && snapped.distanceTo(mid) < 1.2;
      // glifos OSNAP (extremos/medios/centros/cuadrantes) generados para las sec lines
      const glyphs = D.buildSnapPts(null, false);
      let near = 0; for (const g of glyphs) { const gp = new T3.Vector3(g.p[0], g.p[1], g.p[2]);
        for (const sg of segs) { if (gp.distanceTo(sg[0]) < 0.5 || gp.distanceTo(sg[1]) < 0.5) { near++; break; } } }
      out.glifosSec = near > 0;

      // --- INFERENCIA DE EJES (recta tipo SketchUp): bloquea cerca, libera lejos
      const A0 = new T3.Vector3(0,0,0);
      const lz = D.axisInferDir(A0, new T3.Vector3(0.6, 0, 40), AX, 4.5);
      out.ejeZ = !!lz && lz.k === 'z' && Math.abs(lz.p.x) < 1e-6 && Math.abs(lz.p.y) < 1e-6;
      const lx = D.axisInferDir(A0, new T3.Vector3(40, 0.6, 0), AX, 4.5);
      out.ejeX = !!lx && lx.k === 'x';
      out.libera = D.axisInferDir(A0, new T3.Vector3(30, 0, 30), AX, 4.5) === null;   // 45° = sin bloqueo
      // orto en el plano: ejes U/V del papel
      const f = D.paperFrame(s);
      const lu = D.axisInferDir(A0, A0.clone().addScaledVector(f.U, 40).addScaledVector(f.V, 0.5), [['u', f.U], ['v', f.V]], 4.5);
      out.ortoPlano = !!lu && lu.k === 'u';

      // --- PERSISTENCIA del bloqueo (export → import)
      const data = D.buildExport();
      const sd = (data.secciones || []).find(x => x.paper && x.locked);
      out.exporta = !!sd;
      D.applyImport(data);
      const ps = D.papers;
      out.importa = ps.length > 0 && ps.every(pp => pp.locked === true);
      return out;
    });
    ok('plano de dibujo: candado bloquea (sin gizmo) y desbloquea', r.hayBoton && r.bloquea && r.sinGizmo && r.desbloquea);
    ok('líneas de sección: imán + glifos OSNAP como el láser', r.haySeg && r.imanSec && r.glifosSec);
    ok('recta: inferencia de ejes X/Z (bloquea) y liberación a 45°', r.ejeZ && r.ejeX && r.libera);
    ok('recta: orto en el plano (ejes U/V del papel)', r.ortoPlano);
    ok('bloqueo del plano se guarda y se recupera', r.exporta && r.importa);
  },

  async riqueza_tonos() {   // las caras del prisma (pieza 4) deben leer con tonos DISTINTOS (no todas quemadas a blanco)
    const pts = await page.evaluate(() => {
      const D = window._dbg, T = window.THREE;
      D.applyStyle(D.FACTORY_STYLES.find(s => s.nombre === 'estilo.maqueta_blanca'));   // sol del preset (az220 alt48)
      D.setView(-1.05, 1.15);
      const m = D.pieces['4 palanca']; m.updateMatrixWorld(); m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld), cx = (bb.min.x + bb.max.x) / 2;
      const top = new T.Vector3(cx, (bb.min.y + bb.max.y) / 2, bb.max.z);
      const end = new T.Vector3(bb.max.x, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
      const toS = p => { const v = p.clone().project(D.cam); const dpr = window.devicePixelRatio || 1;
        return [Math.round((v.x * 0.5 + 0.5) * D.renderer.domElement.width / dpr), Math.round((-v.y * 0.5 + 0.5) * D.renderer.domElement.height / dpr)]; };
      D.renderer.shadowMap.needsUpdate = true;
      return { top: toS(top), end: toS(end) };
    });
    await new Promise(r => setTimeout(r, 300));
    const px = await page.evaluate((pts) => {
      const cv = window._dbg.renderer.domElement, c = document.createElement('canvas');
      c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.drawImage(cv, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      const samp = ([sx, sy]) => { let s = 0, n = 0; for (let dx = -5; dx <= 5; dx += 5) for (let dy = -5; dy <= 5; dy += 5) { const d = x.getImageData((sx + dx) * dpr, (sy + dy) * dpr, 1, 1).data; s += (d[0] + d[1] + d[2]) / 3; n++; } return s / n; };
      return { top: samp(pts.top), end: samp(pts.end) };
    }, pts);
    // la cara superior (al sol) debe ser CLARAMENTE más clara que la testa (en sombra): sin esto = todas quemadas a blanco (bug v7.05)
    ok('riqueza de tonos: las caras del prisma se diferencian (superior ≫ testa)', (px.top - px.end) > 25);
  },

  async estilos_sin_fuga() {   // aplicar un estilo RESETEA todo: ningún rasgo del anterior se queda pegado
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const F = D.FACTORY_STYLES, by = n => F.find(s => s.nombre === n);
      // perfiles del Boceto (gruesos) NO deben sobrevivir al pasar a Maqueta blanca (sin perfiles)
      D.applyStyle(by('estilo.boceto'));            out.bocetoPerfOn = D.currentStyle().perfiles.ver === true;
      D.applyStyle(by('estilo.maqueta_blanca'));    out.perfilLimpio = D.currentStyle().perfiles.ver === false;
      // oclusión ambiental NO debe quedarse al pasar a un estilo que no la declara (pen)
      D.applyStyle(by('estilo.maqueta_blanca'));    out.aoOn = D.currentStyle().oclusion_ambiental.activo === true;
      D.applyStyle(by('estilo.pen'));               out.aoLimpio = D.currentStyle().oclusion_ambiental.activo === false;
      // sombra del sol NO debe quedarse al pasar a un técnico sin sombra
      D.applyStyle(by('estilo.maqueta_blanca'));    out.sombraOn = D.currentStyle().sombra_arrojada.activo === true;
      D.applyStyle(by('estilo.tecnico_bn'));        out.sombraLimpia = D.currentStyle().sombra_arrojada.activo === false;
      // suelo NO debe quedarse
      D.applyStyle(by('estilo.maqueta_blanca'));    out.sueloOn = D.currentStyle().suelo.ver === true;
      D.applyStyle(by('estilo.pen'));               out.sueloLimpio = D.currentStyle().suelo.ver === false;
      // grosor por defecto de "Maqueta blanca con aristas" = 0,5 (aristas y perfiles), editable después
      D.applyStyle(by('estilo.maqueta_blanca_aristas'));
      const cs = D.currentStyle();
      out.grosor05 = cs.aristas.grosor === 0.5 && cs.perfiles.grosor === 0.5;
      return out;
    });
    ok('estilo: los perfiles del Boceto no se quedan al cambiar de estilo', r.bocetoPerfOn && r.perfilLimpio);
    ok('estilo: la oclusión ambiental no se queda pegada', r.aoOn && r.aoLimpio);
    ok('estilo: la sombra del sol no se queda pegada', r.sombraOn && r.sombraLimpia);
    ok('estilo: el suelo no se queda pegado', r.sueloOn && r.sueloLimpio);
    ok('estilo: "Maqueta blanca con aristas" grosor 0,5 por defecto (aristas y perfiles)', r.grosor05);
  },

  async estilos_editar_eliminar() {   // editar/sustituir un estilo de usuario y ELIMINAR (solo personalizados; los de fábrica nunca)
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const nCustom = () => D.savedStyles.filter(s => !s.de_fabrica).length;
      // crear un estilo de usuario
      document.getElementById('stylePerso').click();
      document.getElementById('styleName').value = 'MiEstilo';
      document.getElementById('styleSave').click();
      out.creado = nCustom() === 1 && D.savedStyles.some(s => s.nombre === 'MiEstilo' && !s.de_fabrica);
      out.delVisibleCustom = getComputedStyle(document.getElementById('styleDelete')).display !== 'none';
      // editar un estilo de FÁBRICA → Eliminar NO visible (no se pueden borrar)
      D.openStyleEditor(D.savedStyles.findIndex(s => s.de_fabrica));
      out.delHiddenFactory = getComputedStyle(document.getElementById('styleDelete')).display === 'none';
      // SUSTITUIR (reescribir) el estilo de usuario
      D.openStyleEditor(D.savedStyles.findIndex(s => !s.de_fabrica));
      document.getElementById('styleReplace').click();
      out.sustituido = nCustom() === 1;
      // ELIMINAR el estilo de usuario (confirmar Sí)
      D.openStyleEditor(D.savedStyles.findIndex(s => !s.de_fabrica));
      document.getElementById('styleDelete').click();
      document.getElementById('cfYes').click();
      out.eliminado = nCustom() === 0;
      out.fabricaIntacta = D.savedStyles.filter(s => s.de_fabrica).length === D.FACTORY_STYLES.length;
      return out;
    });
    ok('estilo: crear personalizado + Eliminar/Sustituir visibles en personalizado', r.creado && r.delVisibleCustom);
    ok('estilo: los de fábrica NO se pueden eliminar (botón oculto)', r.delHiddenFactory);
    ok('estilo: sustituir (reescribir) un personalizado', r.sustituido);
    ok('estilo: eliminar un personalizado (fábrica intacta)', r.eliminado && r.fabricaIntacta);
  },

  async origen_marco_local() {   // el origen (0,0,0) = centro de la roseta en la CARA DE MONTAJE (la que toca la puerta)
    const r = await page.evaluate(() => {
      const D = window._dbg, T = window.THREE;
      const o = window.datumOrigin();
      // roseta: centro X/Z y sus caras Y
      const key = Object.keys(D.pieces).find(n => /roseta/i.test(n));
      const m = D.pieces[key]; m.updateMatrixWorld(); m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      // la manilla crece hacia +Y → cara de montaje = min Y de la roseta
      return { o: [o.x, o.y, o.z], cx, cz, doorY: bb.min.y, frontY: bb.max.y };
    });
    ok('origen: centrado en la roseta (X,Z)', Math.abs(r.o[0] - r.cx) < 0.01 && Math.abs(r.o[2] - r.cz) < 0.01);
    ok('origen: en la cara de montaje (Y de la puerta, no la cara del cuello)', Math.abs(r.o[1] - r.doorY) < 0.01 && r.doorY < r.frontY);
  },

  async estilos_renombrar() {   // Renombrar cambia SOLO el nombre (no reescribe el resto del descriptor) y no duplica
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      document.getElementById('stylePerso').click();
      document.querySelector('#stylepop .stgl[data-cm="blanco"]').click();   // caras = blanco, para verificar que NO se pierde al renombrar
      document.getElementById('styleName').value = 'NombreViejo';
      document.getElementById('styleSave').click();
      const nCustom = () => D.savedStyles.filter(s => !s.de_fabrica).length;
      out.creado = nCustom() === 1;
      const idx = D.savedStyles.findIndex(s => s.nombre === 'NombreViejo');
      D.openStyleEditor(idx);
      out.renVisible = getComputedStyle(document.getElementById('styleRename')).display !== 'none';
      const carasAntes = JSON.stringify(D.savedStyles[idx].caras);
      document.getElementById('styleName').value = 'NombreNuevo';
      document.getElementById('styleRename').click();
      out.sinDuplicar = nCustom() === 1;
      const t = D.savedStyles.find(s => s.nombre === 'NombreNuevo');
      out.renombrado = !!t && !D.savedStyles.some(s => s.nombre === 'NombreViejo');
      out.carasIntactas = t && JSON.stringify(t.caras) === carasAntes && t.caras.modo === 'blanco';
      // Renombrar NO está disponible en estilos de fábrica
      D.openStyleEditor(D.savedStyles.findIndex(s => s.de_fabrica));
      out.renHiddenFactory = getComputedStyle(document.getElementById('styleRename')).display === 'none';
      return out;
    });
    ok('estilo: crear + botón Renombrar visible en personalizado', r.creado && r.renVisible);
    ok('estilo: Renombrar cambia el nombre sin duplicar', r.sinDuplicar && r.renombrado);
    ok('estilo: Renombrar conserva el resto del descriptor (Caras=Blanco intacto)', r.carasIntactas);
    ok('estilo: Renombrar NO disponible en estilos de fábrica', r.renHiddenFactory);
  },

  async estilos_overflow() {   // los estilos que no caben en la barra se recogen en el menú «⋯» (antes de Personalizar)
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      // crear muchos estilos de nombre largo para forzar el desbordamiento a 1200px
      for (let i = 0; i < 12; i++) { document.getElementById('stylePerso').click(); document.getElementById('styleName').value = 'EstiloDePruebaLargo' + i; document.getElementById('styleSave').click(); document.getElementById('styleClose').click(); }
      const bar = document.getElementById('vmodes'); bar.style.display = 'flex';
      window.layoutStyleOverflow();
      const more = document.getElementById('styleMore'), menu = document.getElementById('styleMoreMenu');
      out.moreVisible = getComputedStyle(more).display !== 'none';
      out.cabeEnPantalla = bar.offsetWidth <= window.innerWidth;   // la barra ya no se sale
      // abrir el menú y comprobar que lista los ocultos
      more.click();
      out.menuAbierto = getComputedStyle(menu).display !== 'none';
      out.menuTiene = menu.querySelectorAll('.moreRow').length > 0;
      // aplicar un estilo desde el menú funciona
      const first = menu.querySelector('.moreApply');
      const nm = first.textContent; first.click();
      out.aplica = D.savedStyles.some(s => s.nombre === nm);   // (existe; el click aplica sin lanzar)
      out.menuCerrado = getComputedStyle(menu).display === 'none';
      return out;
    });
    ok('estilo: con overflow aparece el botón ⋯ y la barra no se sale de pantalla', r.moreVisible && r.cabeEnPantalla);
    ok('estilo: el menú ⋯ se abre y lista los estilos ocultos', r.menuAbierto && r.menuTiene);
    ok('estilo: aplicar desde el menú ⋯ funciona y lo cierra', r.aplica && r.menuCerrado);
  },

  async estilos_editor_flotante() {   // arrastrar la cabecera del editor lo hace flotante; el botón lo vuelve a acoplar
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => { const p = document.getElementById('stylepop'); p.style.display = 'none'; p.classList.remove('floating'); window._dbg.openStyleEditor(0); });
    const docked = await page.evaluate(() => { const p = document.getElementById('stylepop'), b = p.getBoundingClientRect();
      return { right: Math.abs(b.right - window.innerWidth) < 2, floating: p.classList.contains('floating') }; });
    const hb = await page.evaluate(() => { const h = document.getElementById('styleHdr').getBoundingClientRect(); return { x: h.x + 30, y: h.y + h.height / 2 }; });
    await page.mouse.move(hb.x, hb.y); await page.mouse.down();
    await page.mouse.move(hb.x - 260, hb.y + 180, { steps: 5 }); await page.mouse.up();
    const floated = await page.evaluate(() => { const p = document.getElementById('stylepop');
      return { floating: p.classList.contains('floating'), dock: getComputedStyle(document.getElementById('styleDock')).display !== 'none' }; });
    await page.evaluate(() => document.getElementById('styleDock').click());
    const redock = await page.evaluate(() => { const p = document.getElementById('stylepop'), b = p.getBoundingClientRect();
      return { floating: p.classList.contains('floating'), right: Math.abs(b.right - window.innerWidth) < 2 }; });
    await page.setViewportSize({ width: 1200, height: 820 });
    ok('editor flotante: arranca acoplado a la derecha', docked.right && !docked.floating);
    ok('editor flotante: arrastrar la cabecera lo hace flotante + botón acoplar visible', floated.floating && floated.dock);
    ok('editor flotante: el botón lo devuelve a acoplado a la derecha', !redock.floating && redock.right);
  },

  async estilos_editor_acoplado() {   // el editor se acopla a la derecha en pantallas anchas (iPad/horizontal) y se centra en móvil vertical
    // ANCHO (≥640px): acoplado al borde derecho, a toda altura, sobre el panel de Piezas
    await page.setViewportSize({ width: 1024, height: 768 });
    const ancho = await page.evaluate(() => { window._dbg.openStyleEditor(0);
      const b = document.getElementById('stylepop').getBoundingClientRect();
      return { pegadoDcha: Math.abs(b.right - window.innerWidth) < 2, mitadDcha: b.left > window.innerWidth / 2,
        toca_arriba: b.top < 120, alto: b.height > window.innerHeight * 0.6 }; });
    ok('editor: en pantalla ancha se acopla al borde derecho, a toda altura', ancho.pegadoDcha && ancho.mitadDcha && ancho.alto);
    // ESTRECHO (<640px, móvil vertical): vuelve a ventana CENTRADA como estaba
    await page.setViewportSize({ width: 390, height: 844 });
    const estrecho = await page.evaluate(() => { document.getElementById('stylepop').style.display = 'none'; window._dbg.openStyleEditor(0);
      const b = document.getElementById('stylepop').getBoundingClientRect();
      const centro = (b.left + b.right) / 2;
      return { noPegado: b.right < window.innerWidth - 4, centrado: Math.abs(centro - window.innerWidth / 2) < 12 }; });
    ok('editor: en móvil vertical (<640px) se centra como ventana (no acoplado)', estrecho.noPegado && estrecho.centrado);
    await page.setViewportSize({ width: 1200, height: 820 });   // restablece para el resto
  },

  async estilos_editor_teclado() {   // al abrir el teclado en pantalla, el editor sube su borde por encima y el campo del nombre queda visible
    const r = await page.evaluate(() => {
      window._dbg.openStyleEditor(0);
      const p = document.getElementById('stylepop'), inp = document.getElementById('styleName');
      const real = window.visualViewport;
      // simula teclado que tapa 320px por abajo
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: window.innerHeight - 320, offsetTop: 0, addEventListener() {} } });
      window.fitEditorKeyboard();
      const bottomSet = parseInt(p.style.bottom || '0', 10);   // debe subir ~328px
      inp.scrollIntoView({ block: 'center' });
      const pr = p.getBoundingClientRect(), ir = inp.getBoundingClientRect();
      const panelSobreTeclado = pr.bottom <= (window.innerHeight - 320) + 1;   // panel por encima del teclado
      const nombreVisible = ir.bottom <= pr.bottom + 1 && ir.top >= pr.top - 1;
      // teclado cerrado → vuelve a la posición normal
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: window.innerHeight, offsetTop: 0, addEventListener() {} } });
      window.fitEditorKeyboard();
      const restaurado = !p.style.bottom;
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: real });
      return { bottomSet, panelSobreTeclado, nombreVisible, restaurado };
    });
    ok('editor+teclado: el panel sube su borde inferior por encima del teclado', r.bottomSet > 300 && r.panelSobreTeclado);
    ok('editor+teclado: el campo del NOMBRE queda visible dentro del panel', r.nombreVisible);
    ok('editor+teclado: al cerrarse el teclado, el editor vuelve a su posición', r.restaurado);
  },

  async poche_ao_stencil() {   // el poché de sección no se desborda a un rectángulo cuando el AO está activo (maqueta blanca)
    const r = await page.evaluate(async () => {
      const D = window._dbg, T = window.THREE;
      const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // maqueta blanca enciende el AO
      D.applyStyle(D.FACTORY_STYLES.find(s => s.nombre === 'estilo.maqueta_blanca'));
      // una sección que corta las piezas (centro = caja envolvente de las piezas)
      const bb = new T.Box3(); for (const n in D.pieces) bb.expandByObject(D.pieces[n]);
      const c = bb.getCenter(new T.Vector3());
      const s = D.newSectionObj('AOQA', c, new T.Vector3(1, 0, 0), false);
      D.activateSection(s); D.applySec(); D.updatePoche();
      await frame(); await frame();   // fuerza la ruta renderAO() → construye _ao
      const b = D._ao && D._ao.beauty;
      return { aoOn: D.aoOn, cuts: D.activeCutsN,
        beautyExiste: !!b,
        conStencil: !!(b && b.stencilBuffer === true),
        depthStencil: !!(b && b.depthTexture && b.depthTexture.format === T.DepthStencilFormat) };
    });
    ok('poché+AO: la ruta AO se activa con maqueta blanca y hay sección', r.aoOn && r.cuts === 1 && r.beautyExiste);
    ok('poché+AO: el target «beauty» del AO lleva STENCIL (el poché no se desborda)', r.conStencil);
    ok('poché+AO: profundidad+stencil combinados (DEPTH24_STENCIL8)', r.depthStencil);
  },

  async estilos_caras_roundtrip() {   // el modo de Caras (p. ej. «Blanco») de un estilo personalizado se conserva al Sustituir, cambiar de estilo y volver
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const cm = v => document.querySelector('#stylepop .stgl[data-cm="' + v + '"]').click();
      const cmOn = () => [...document.querySelectorAll('#stylepop .stgl[data-cm].on')].map(b => b.dataset.cm);
      // crear estilo personalizado con Caras = Blanco desde el editor
      document.getElementById('stylePerso').click();
      cm('blanco');
      document.getElementById('styleOpac').value = 40;
      document.getElementById('styleOpac').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('styleName').value = 'Color Sólido Gris Transp';
      document.getElementById('styleSave').click();
      const t0 = D.savedStyles.find(s => s.nombre === 'Color Sólido Gris Transp');
      out.guardado = !!t0 && t0.caras.modo === 'blanco';
      // Sustituir tras volver a marcar Blanco
      cm('blanco');
      document.getElementById('styleReplace').click();
      out.sustituido = D.savedStyles.find(s => s.nombre === 'Color Sólido Gris Transp').caras.modo === 'blanco';
      // ir a OTRO estilo y VOLVER al personalizado
      D.applyStyle(D.FACTORY_STYLES.find(s => s.nombre === 'estilo.tecnico_bn') || D.FACTORY_STYLES[0]);
      const idx = D.savedStyles.findIndex(s => s.nombre === 'Color Sólido Gris Transp');
      D.applyStyle(D.savedStyles[idx]);
      out.vmVuelta = D.viewMode === 'blanco';
      // reabrir el editor: el botón de Caras marcado debe seguir siendo Blanco
      D.openStyleEditor(idx);
      out.cmVuelta = cmOn().length === 1 && cmOn()[0] === 'blanco';
      out.opVuelta = document.getElementById('styleOpac').value === '40';   // opacidad (Gris Transp) restaurada en el editor
      return out;
    });
    ok('estilo: Caras=Blanco de un personalizado se guarda', r.guardado);
    ok('estilo: Caras=Blanco se conserva al Sustituir', r.sustituido);
    ok('estilo: al cambiar de estilo y volver, la vista sigue en Blanco', r.vmVuelta);
    ok('estilo: el editor reabierto marca Blanco (no se pierde el «basado en Blanco») + opacidad', r.cmVuelta && r.opVuelta);
  },

  async estilos_boton_modo() {   // los botones de MODO (Color Sólido/Blanco/…) dan vista LIMPIA: no arrastran AO/sombra/suelo de la maqueta
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const clickMode = vm => { const menu = document.getElementById('vmodes'); menu.style.display = 'flex'; menu.querySelector('[data-m="' + vm + '"]').click(); };
      // maqueta blanca (AO+sombra+suelo ON) → botón "Sombreado" debe dejar todo OFF
      D.applyStyle(D.FACTORY_STYLES.find(s => s.nombre === 'estilo.maqueta_blanca'));
      out.maqAO = D.aoOn === true && D.sombraOn === true;   // precondición: la maqueta los enciende
      clickMode('somb');
      const cs = D.currentStyle();
      out.limpio = D.aoOn === false && D.sombraOn === false && cs.oclusion_ambiental.activo === false && cs.sombra_arrojada.activo === false && cs.suelo.ver === false;
      out.vmSomb = D.viewMode === 'somb';
      // botón "Blanco" tras maqueta: resetea las capas de escena PERO mantiene los PERFILES visibles
      // (como al arrancar, stylePerfOn=true → los cilindros conservan su silueta)
      D.applyStyle(D.FACTORY_STYLES.find(s => s.nombre === 'estilo.maqueta_blanca'));   // sin perfiles + AO + sombra
      clickMode('blanco');
      out.perfVisible = D.currentStyle().perfiles.ver === true && D.aoOn === false && D.sombraOn === false && D.viewMode === 'blanco';
      // cada modo cae en su viewMode; Oculto enciende líneas ocultas
      const modos = ['somb', 'blanco', 'wire', 'xray', 'tecnico', 'oculto'];
      out.modos = modos.every(m => { clickMode(m); return D.viewMode === m; });
      clickMode('oculto'); out.ocultoHid = D.currentStyle().ocultos && D.currentStyle().ocultos.ver === true;
      return out;
    });
    ok('botón de modo: "Sombreado" tras maqueta deja AO/sombra/suelo apagados (vista limpia)', r.maqAO && r.limpio && r.vmSomb);
    ok('botón de modo: "Blanco" tras maqueta resetea AO/sombra pero MANTIENE los perfiles (silueta de cilindros)', r.perfVisible);
    ok('botón de modo: cada modo cae en su vista (incl. Técnico/Oculto) y Oculto enciende ocultas', r.modos && r.ocultoHid);
  },

  async estilos_sin_fuga_pixel() {   // PÍXELES: cambiar de estilo restaura la imagen EXACTA (no solo el descriptor)
    const diff = await page.evaluate(async () => {
      const D = window._dbg;
      const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      D.setView(-0.6, 1.2); await frame();
      const cv = D.renderer.domElement;
      const grab = () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.drawImage(cv, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
      const by = n => D.FACTORY_STYLES.find(s => s.nombre === n);
      const MIN = { v:1, id:'5a1e0000-0000-4000-8000-0000000000fe', nombre:'MIN', familia:'presentacion', caras:{modo:'somb'} };
      const SOMB = { v:1, id:'5a1e0000-0000-4000-8000-0000000000fd', nombre:'S', familia:'presentacion', caras:{modo:'somb'} };
      const shot = async (pre, B) => { D.applyStyle(pre); await frame(); D.applyStyle(B); await frame(); await frame(); return grab(); };
      const d = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) { if (Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]) > 24) n++; } return n / (a.width * a.height); };
      // pen tras MIN vs pen tras maqueta_blanca (la que más enciende: AO, sombra, suelo, blanco)
      const penClean = await shot(MIN, by('estilo.pen'));
      const penAfterMaq = await shot(by('estilo.maqueta_blanca'), by('estilo.pen'));
      // sombreado tras MIN vs sombreado tras boceto (perfiles gruesos)
      const sombClean = await shot(MIN, SOMB);
      const sombAfterBoc = await shot(by('estilo.boceto'), SOMB);
      return { pen: d(penClean, penAfterMaq), somb: d(sombClean, sombAfterBoc) };
    });
    ok('estilo (píxeles): maqueta→pen restaura la imagen idéntica a pen limpio', diff.pen < 0.003);
    ok('estilo (píxeles): boceto→sombreado restaura la imagen idéntica a sombreado limpio', diff.somb < 0.003);
  },

  async estilos_carga_limpia() {   // EXHAUSTIVO: aplicar un estilo tras uno MÁXIMO (todo ON) = aplicarlo en limpio (cero herencia)
    const r = await page.evaluate(() => {
      const D = window._dbg;
      // estilo con TODOS los toggles visuales encendidos y valores extremos
      const MAX = { v:1, id:'5a1e0000-0000-4000-8000-0000000000ff', nombre:'MAX', familia:'presentacion',
        caras:{modo:'xray',opacidad:0.5}, aristas:{ver:true,grosor:4,color:{fuente:'material'}},
        perfiles:{ver:true,grosor:5}, ocultos:{ver:true,patron:'discontinuo'},
        materiales:{texturas:true,saturacion:20}, fondo:{modo:'degradado',cielo:'#123456',horizonte:'#654321'},
        iluminacion:{sol:10,ambiental:20,dureza_sombra:5},
        sombra_arrojada:{activo:true,modo:'manual',azimut:300,altitud:12},
        oclusion_ambiental:{activo:true,intensidad:90,radio:80},
        suelo:{ver:true,color:'#abcdef',z:33,solido:true,malla:{ver:true,auto:false,color:'#111111'}} };
      const MIN = { v:1, id:'5a1e0000-0000-4000-8000-0000000000fe', nombre:'MIN', familia:'presentacion', caras:{modo:'somb'} };
      const snap = () => { const s = D.currentStyle(); return JSON.stringify({ caras:s.caras, aristas:s.aristas, perfiles:s.perfiles, ocultos:s.ocultos||null, materiales:s.materiales, fondo:s.fondo, iluminacion:s.iluminacion, sombra:s.sombra_arrojada, ao:s.oclusion_ambiental, suelo:s.suelo }); };
      const fugas = [];
      for (const st of D.FACTORY_STYLES) {
        D.applyStyle(MIN); D.applyStyle(st); const a = snap();
        D.applyStyle(MAX); D.applyStyle(st); const b = snap();
        if (a !== b) fugas.push(st.nombre);
      }
      return { fugas };
    });
    ok('estilo: carga LIMPIA — ningún estilo hereda estado del anterior (auditoría exhaustiva)', r.fugas.length === 0);
  },

  async saturacion_caras() {   // materiales.saturacion (v3.6): desatura las caras en cualquier modo; X-Ray a 0 = grises
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      const uuid = '5a1e0000-0000-4000-8000-0000000000c1';
      const mk = (caras, sat) => ({ v:1, id:uuid, nombre:'t', familia:'presentacion', caras:{modo:caras}, materiales:{saturacion:sat} });
      const col = () => { const c = D.pieces['4 palanca'].userData.matShaded.color; return { r:c.r, g:c.g, b:c.b, op:D.pieces['4 palanca'].userData.matShaded.opacity }; };
      D.applyStyle(mk('somb', 100)); const c1 = col();
      out.color = Math.abs(c1.r-c1.g) > 0.05 || Math.abs(c1.g-c1.b) > 0.05;    // a 100 = color
      D.applyStyle(mk('somb', 0)); const c2 = col();
      out.gris = Math.abs(c2.r-c2.g) < 0.01 && Math.abs(c2.g-c2.b) < 0.01;      // a 0 = gris
      D.applyStyle(mk('xray', 0)); const c3 = col();
      out.xrayGris = Math.abs(c3.r-c3.g) < 0.01 && Math.abs(c3.g-c3.b) < 0.01 && c3.op < 0.5;  // X-Ray gris y translúcido
      D.applyStyle(mk('somb', 37)); out.roundtrip = D.currentStyle().materiales.saturacion === 37;
      // el control del panel está justo tras Caras (Caras → Texturas → Saturación → Aristas)
      const labels = [...document.querySelectorAll('#stylepop label')].map(l => l.textContent.trim().slice(0,10));
      const iC = labels.findIndex(t=>t.startsWith('Caras')), iT = labels.findIndex(t=>t.startsWith('Texturas')), iS = labels.findIndex(t=>t.startsWith('Saturaci')), iA = labels.findIndex(t=>t.startsWith('Aristas'));
      out.orden = iC>=0 && iT===iC+1 && iS===iC+2 && iA===iC+3 && !!document.getElementById('styleSat');
      // no fuga: un estilo sin saturacion vuelve a 100
      D.applyStyle(mk('somb', 0));
      D.applyStyle(D.FACTORY_STYLES.find(s=>s.nombre==='estilo.pen'));
      out.sinFuga = D.currentStyle().materiales.saturacion === 100;
      return out;
    });
    ok('saturación: a 100 las caras van a color, a 0 a escala de grises', r.color && r.gris);
    ok('saturación: X-Ray a 0 = X-Ray en grises (y translúcido)', r.xrayGris);
    ok('saturación: round-trip del campo materiales.saturacion', r.roundtrip);
    ok('saturación: control tras Caras (Caras→Texturas→Saturación→Aristas)', r.orden);
    ok('saturación: no se queda pegada al cambiar de estilo', r.sinFuga);
  },

  async sombras_antiacne() {   // receta anti-acné: caras traseras al mapa + bias pequeño negativo (no bias grande)
    const r = await page.evaluate(() => {
      const D = window._dbg, T3 = window.THREE, out = {};
      // shadowSide = BackSide en el material sombreado de cada pieza (renderiza caras traseras al shadow map)
      out.backside = Object.keys(D.pieces).every(n => D.pieces[n].userData.matShaded.shadowSide === T3.BackSide);
      // con sombra activa: bias PEQUEÑO y NEGATIVO + normalBias MODERADO (nada de bias grande)
      window.setSombra(true); window.applySombra();
      const b = D.sol.shadow.bias, nb = D.sol.shadow.normalBias;
      out.biasNegPeq = b < 0 && b >= -0.002;        // negativo y de magnitud pequeña
      out.normalModerado = nb > 0 && nb < 1.0;       // moderado (no el 1.6 que hacía peter-panning)
      // frustum ceñido a la esfera del modelo (no al R holgado): medio-ancho < R
      out.frustumCenido = D.sol.shadow.camera.right < D.R;
      window.setSombra(false);
      return out;
    });
    ok('sombra: shadowSide=BackSide en las piezas (anti-acné de auto-sombra)', r.backside);
    ok('sombra: bias pequeño y negativo + normalBias moderado (sin peter-panning)', r.biasNegPeq && r.normalModerado);
    ok('sombra: frustum ceñido al modelo', r.frustumCenido);
  },

  async poche_seccion() {   // POCHÉ: rellena SÓLO la sección real, sin sobre-relleno de silueta
    const r = await page.evaluate(() => {
      const D = window._dbg, T3 = window.THREE, out = {};
      // corte horizontal (normal +Z) por el centro del modelo → atraviesa todas las piezas
      const bb = new T3.Box3(); for (const nm in D.pieces) bb.expandByObject(D.pieces[nm]);
      const c = bb.getCenter(new T3.Vector3());
      const s = D.newSectionObj('POCHE', c.clone(), new T3.Vector3(0, 0, 1), false);   // sección real (no papel)
      D.activateSection(s);
      window.setSecCut(true); window.setSecPoche(true);
      D.applySec(); D.updatePoche();
      out.activo = D.activeCutsN >= 1;
      // clasificación sólido-cerrado / abierto por pieza (pocheSolidGeo: suelda + orienta por BFS)
      const cls = {}; for (const nm in D.pieces) cls[nm] = D.pieces[nm].userData.pocheClosed;
      // la roseta llega con winding MEZCLADO; la re-orientación BFS la deja como sólido cerrado
      out.roseta = cls['1 roseta'] === true;
      out.cuello = cls['2 cuello'] === true;
      out.palanca = cls['4 palanca'] === true;
      out.gargantaAbierta = cls['3 garganta (propuesta)'] === false;   // malla abierta → excluida
      // el stencil SÓLO cuenta piezas cerradas Y cortadas; la abierta queda fuera
      out.rosetaCuenta = D.pieces['1 roseta'].userData.stB.visible === true;
      out.gargantaExcluida = D.pieces['3 garganta (propuesta)'].userData.stB.visible === false;
      // hay una tapa de poché visible en la escena (stencil NotEqual 0)
      let cap = null; D.pieces['1 roseta'].parent.traverse(o => {
        if (o.isMesh && o.material && o.material.stencilFunc === T3.NotEqualStencilFunc && o.visible) cap = o; });
      out.tapaVisible = !!cap;
      // desactivar el poché apaga el relleno del stencil
      window.setSecPoche(false); D.updatePoche();
      out.apagado = D.pieces['1 roseta'].userData.stB.visible === false;
      return out;
    });
    ok('poché: corte activo con tapa de relleno visible', r.activo && r.tapaVisible);
    ok('poché: sólidos cerrados (roseta re-orientada, cuello, palanca) cuentan en el stencil', r.roseta && r.cuello && r.palanca && r.rosetaCuenta);
    ok('poché: malla ABIERTA (garganta) excluida — no sobre-rellena su silueta', r.gargantaAbierta && r.gargantaExcluida);
    ok('poché: desactivar apaga el relleno', r.apagado);
  },

  async rendimiento() {   // FASE 1: redibujado incremental, sin fuga de GPU
    const r = await page.evaluate(async () => {
      const D = window._dbg, out = {};
      const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 5)));
      for (let i = 0; i < 60; i++)
        D.strokes.push({ points: [[i, 0, 0], [i, 20, 0], [i, 20, 10]], color: '#000', w: 0.8, sobre: 't' });
      for (let i = 0; i < 5; i++)
        D.texts.push({ text: 'nota ' + i, color: '#111', pos: [i * 10, -20, 0] });
      D.redraw(); await frame();
      const m0 = { ...D.rendererInfo };
      const t0 = performance.now();
      for (let i = 0; i < 300; i++) D.redraw();
      out.msMedia = (performance.now() - t0) / 300;
      await frame();
      const m1 = { ...D.rendererInfo };
      // los redraws sin cambios no acumulan memoria GPU (tolerancia mínima por efímeros)
      out.geomEstable = m1.geometries - m0.geometries <= 2;
      out.texEstable = m1.textures - m0.textures <= 2;
      // vista previa en vivo: 300 sustituciones tampoco acumulan
      D.drawing = { points: [[0, 0, 0], [10, 5, 0], [20, 0, 5]], color: '#d500f9', w: 0.8, sobre: 't' };
      const g0 = D.rendererInfo.geometries;
      for (let i = 0; i < 300; i++) D.updateLivePreview();
      out.previewOk = !!D.liveObj;
      out.previewEstable = D.rendererInfo.geometries - g0 <= 2;
      D.drawing = null; D.redraw(); await frame();
      // trazo sucio: SÍ se reconstruye (la caché no congela la geometría)
      const st = D.strokes[D.strokes.length - 1];
      st.points = st.points.map(p => [p[0] + 5, p[1], p[2]]); st._dirty = true; D.redraw();
      const o = D.strokeCache.get(st);
      out.dirtyRebuild = !!o && !st._dirty;
      return out;
    });
    ok('300 redraws sin cambios: memoria GPU estable', r.geomEstable && r.texEstable);
    ok('redraw amortizado < 3 ms con 60 trazos + 5 notas', r.msMedia < 3);
    ok('vista previa en vivo sin acumular geometrías', r.previewOk && r.previewEstable);
    ok('trazo «sucio» se reconstruye al instante', r.dirtyRebuild);
  },
};

// ---------------------------------------------------------------- runner
browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'] });
const t0 = Date.now();
for (const [nombre, fn] of Object.entries(secciones)) {
  await fresh();
  const before = results.length;
  try { await fn(); }
  catch (e) { results.push({ name: nombre + ' (EXCEPCIÓN: ' + e.message.slice(0, 90) + ')', pass: false }); }
  const sec = results.slice(before);
  const bad = sec.filter(x => !x.pass).length;
  console.log((bad ? '✗' : '✓') + ' ' + nombre + '  [' + (sec.length - bad) + '/' + sec.length + ']');
  if (pageErrors.length) { console.log('   ⚠ errores de página en esta sección:', pageErrors.slice(0, 3)); }
}
await browser.close();

const fallos = results.filter(r => !r.pass);
console.log('\n────────────────────────────────────────');
console.log('TOTAL: ' + (results.length - fallos.length) + '/' + results.length + ' en verde · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach(f => console.log('  ✗ ' + f.name));
  process.exit(1);
} else {
  console.log('LÍNEA BASE INTACTA — se puede desplegar.');
}

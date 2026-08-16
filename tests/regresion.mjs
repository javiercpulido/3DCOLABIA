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
      version: /v6\.\d+/.test(document.getElementById('brand').textContent),
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
      document.getElementById('mDraw').click(); document.getElementById('dmJoin').click();
      document.getElementById('mDraw').click();
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
      D.deselect();
      return out;
    });
    ok('insertar láser no cambia el modo de visión', r.noDark);
    ok('láser proporcional al modelo (R/200) y gris+verde+contorno', r.escala && r.gris);
    ok('candado bloquea (reset y gizmo) y desbloquea', r.lock && r.lockReset && r.gizmoOculto && r.unlock);
    ok('otra herramienta cierra el menú de láseres', r.menuCerrado);
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
      out.menu = document.querySelectorAll('#surfmenu [data-sm]').length === 10;
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
    ok('submenú de superficies con 10 modos', r.menu);
    ok('los 9 constructores crean superficie y exportan su tipo', r.n === 9 && r.kinds);
    ok('cara con línea interior respeta la cresta', r.crest);
    ok('membrana armónica clavada a la curva interior (0 mm)', r.clavada);
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

  async gizmo_centro() {
    const r = await page.evaluate(async () => {
      const D = window._dbg, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 15)));
      const m = D.pieces['4 palanca'];
      D.select('pieza', m, 'p'); D.updateGizmo(); await frame();
      const g = D.gizmo.position;
      const pieza = Math.abs(g.x - 53) < 1 && Math.abs(g.y - 48) < 1 && Math.abs(g.z) < 1;
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
      // chips de la poli con etiquetas
      out.chips = document.querySelectorAll('#polychips .pchip').length === 8 &&
        document.querySelectorAll('#polychips .pclab').length === 8;
      return out;
    });
    ok('grosor: casilla numérica precisa, sin deslizador, con flechas ▲/▼', r.spinner && r.noSlider && r.arrows);
    ok('grosor: teclear y flechas de paso fino (0,05 mm) con tope', r.typed && r.stepDn && r.stepUp && r.clamp);
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

  async suelo() {   // el suelo (rejilla) como capa de fondo controlable
    const r = await page.evaluate(() => {
      const D = window._dbg, out = {};
      // ojo: ocultar / mostrar
      const eye = document.querySelector('[data-floor-eye]');
      out.eyeExiste = !!eye;
      eye.click();
      out.oculto = D.grid.visible === false && D.gridDark.visible === false && D.floor.on === false;
      eye.click();
      out.visible = D.floor.on === true;
      // altura: subir 3 pasos (+15 mm)
      const z0 = D.floor.z;
      document.getElementById('floorUp').click();
      document.getElementById('floorUp').click();
      document.getElementById('floorUp').click();
      out.sube = Math.abs(D.floor.z - (z0 + 15)) < 1e-6 && Math.abs(D.grid.position.z - (z0 + 15)) < 1e-6;
      // campo numérico de altura (relativa a la posición por defecto)
      const fz = document.getElementById('floorZ');
      fz.value = '40'; fz.dispatchEvent(new Event('input', { bubbles: true }));
      out.campo = Math.abs(D.floor.z - (D.floor.z0 + 40)) < 1e-6;
      // mover en planta
      const x0 = D.floor.x;
      document.querySelector('.floornudge[data-fn="x1"]').click();
      out.mueve = Math.abs(D.floor.x - (x0 + 10)) < 1e-6 && Math.abs(D.grid.position.x - (x0 + 10)) < 1e-6;
      // centrar restablece
      document.getElementById('floorReset').click();
      out.centra = Math.abs(D.floor.z - D.floor.z0) < 1e-6;
      // NO afecta a geometría: la rejilla no está en pickables
      out.fueraGeo = !D.pickables.includes(D.grid) && !D.pickables.includes(D.gridDark);
      // NO entra en la exportación (ni piezas, ni superficies, ni trazos)
      const ex = D.buildExport ? window.buildExport() : null;
      const json = JSON.stringify(ex || {});
      out.fueraExport = !/rejilla|gridhelper|"suelo"/i.test(json);
      // DATUM: esquina 0,0 en el suelo, ejes ahí, y sigue al suelo (cota 0)
      const o0 = D.datumOrigin();
      out.datumCorner = Math.abs(o0.x - (D.floor.x - 150)) < 1e-6 && Math.abs(o0.y - (D.floor.y - 150)) < 1e-6 && Math.abs(o0.z - D.floor.z) < 1e-6;
      out.axesEnDatum = Math.abs(D.axesObj.position.x - o0.x) < 1e-6 && Math.abs(D.axesObj.position.z - o0.z) < 1e-6;
      document.getElementById('floorUp').click();   // subir cota 0 → el datum sube con el suelo
      out.datumSigue = Math.abs(D.datumOrigin().z - (o0.z + 5)) < 1e-6 && Math.abs(D.axesObj.position.z - (o0.z + 5)) < 1e-6;
      document.getElementById('floorReset').click();
      // lectura relativa al datum (cota): el hud usa X/Y/cota
      D.updateCoordHud({ target: document.querySelector('canvas'), clientX: 600, clientY: 400 });
      out.lectura = /cota/.test(document.getElementById('hud').textContent);
      return out;
    });
    ok('suelo: ojo oculta y muestra la rejilla', r.eyeExiste && r.oculto && r.visible);
    ok('suelo: altura por flechas y por casilla', r.sube && r.campo);
    ok('suelo: desplazamiento en planta y «Centrar»', r.mueve && r.centra);
    ok('suelo: capa de fondo (fuera de geometría y de la exportación)', r.fueraGeo && r.fueraExport);
    ok('datum: esquina 0,0 en el suelo, ejes ahí, cota 0 sigue al suelo', r.datumCorner && r.axesEnDatum && r.datumSigue);
    ok('datum: lectura de coordenadas relativa (X · Y · cota)', r.lectura);
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

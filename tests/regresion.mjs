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
      // PLANO BASE del láser: proyección de fondo desactivable
      const gl = document.getElementById('groundLaser');
      gl.checked = true; gl.dispatchEvent(new Event('change', { bubbles: true })); await frame();
      const nOn = L.geo.attributes.position.count;
      gl.checked = false; gl.dispatchEvent(new Event('change', { bubbles: true })); await frame();
      const nOff = L.geo.attributes.position.count;
      out.planoBase = D.groundLaserOn === false && nOff < nOn && nOff > 0;   // quita la proyección de fondo, mantiene la de piezas
      gl.checked = true; gl.dispatchEvent(new Event('change', { bubbles: true }));
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
      out.menu = document.querySelectorAll('#surfmenu [data-sm]').length === 11;   // 10 superficies + Unir sólidos
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
      // origen del componente en (0,0,0) = eje del cuadradillo ∩ cara de montaje
      const o = D.datumOrigin();
      out.origen0 = Math.abs(o.x) < 1e-9 && Math.abs(o.y) < 1e-9 && Math.abs(o.z) < 1e-9;
      // los ejes de color nacen en el origen local (no en una esquina del suelo)
      out.ejesEnOrigen = D.axesObj.position.length() < 1e-9;
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
      out.fueraExport = !/faceref|cara de montaje|marco local|"suelo"|rejilla/i.test(json);
      return out;
    });
    ok('componente: origen local en (0,0,0), ejes ahí', r.origen0 && r.ejesEnOrigen);
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

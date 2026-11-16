// =====================================================================
// Layouts 3D separados: PPS (injetoras de plástico) e Fornos (torre + espera)
//
// Mesmo jeito de usar da planta do galpão: arrastar gira, botão direito move,
// roda dá zoom, clique na máquina abre a ficha. As posições ficam em LAYOUTS
// (x = esquerda/direita, z = fundo/frente, em metros) — ajustar quando o
// croqui do PPS e a posição de cada forno de espera forem confirmados.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { esc } from './ui.js';

export const LAYOUTS = {
  pps: {
    titulo: 'PPS', piso: [44, 26], camera: [[20, 26, 34], [0, 0, 1]],
    itens: [
      ['VTIP 01', -15, -6], ['VTIP 02', -5, -6], ['VTIP 03', 5, -6], ['VTIP 04', 15, -6],
      ['VTIP 05', -10, 6], ['VTIP 06', 0, 6], ['VTIP 07', 10, 6],
    ],
  },
  fornos: {
    titulo: 'Fornos', piso: [56, 34], camera: [[22, 30, 40], [0, 2, 0]],
    itens: [
      ['VTFT 01', -18, -10], ['VTFT 02', 0, -10], ['VTFT 03', 18, -10],
      ['VTFE 01', -20, 3], ['VTFE 02', -10, 3], ['VTFE 03', 0, 3], ['VTFE 04', 10, 3], ['VTFE 05', 20, 3],
      ['VTFE 06', -20, 11], ['VTFE 07', -10, 11], ['VTFE 08', 0, 11], ['VTFE 09', 10, 11], ['VTFE 10', 20, 11],
    ],
  },
};

const COR = { bx: '#ff5a36', at: '#f0a93b', ok: '#4cc38a', ag: '#5aa2ff', na: '#7b848e' };

export async function criarCena3D(el, { layout, modelos = {}, ficha = null }) {
  const L = LAYOUTS[layout];
  el.classList.add('p3d');
  el.innerHTML = `<div class="p3d-carregando">Montando o layout…</div>
    <div class="p3d-barra"><button type="button" data-geral>Visão geral</button><button type="button" data-topo>De cima</button></div>
    <aside class="p3d-ficha" data-ficha hidden></aside>
    <div class="p3d-dica">Arraste para girar · role para zoom · toque numa máquina</div>`;
  const $ = (s) => el.querySelector(s);

  const R = new THREE.WebGLRenderer({ antialias: true });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.08;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  el.prepend(R.domElement);
  const lin = (c) => new THREE.Color(c).convertSRGBToLinear();
  const S = new THREE.Scene(); S.background = lin(0x17191c); S.fog = new THREE.Fog(lin(0x17191c), 70, 160);
  const C = new THREE.PerspectiveCamera(40, 1, .3, 400);
  const O = new OrbitControls(C, R.domElement);
  O.enableDamping = true; O.dampingFactor = .08; O.maxPolarAngle = 1.42; O.minDistance = 4; O.maxDistance = 110;
  const tamanho = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; R.setSize(w, h, false); C.aspect = w / h; C.updateProjectionMatrix(); };
  const ro = new ResizeObserver(tamanho); ro.observe(el); tamanho();
  const lixo = []; const guarda = (o) => (lixo.push(o), o);

  S.add(new THREE.HemisphereLight(lin(0xdfe6f5), lin(0x2a2622), .55));
  const sol = new THREE.DirectionalLight(lin(0xfff1dc), 1.3); sol.position.set(-20, 45, 28); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 5, far: 120 }); sol.shadow.bias = -.0004;
  S.add(sol);

  const MC = {};
  const mat = (cor, o = {}) => { const k = cor + JSON.stringify(o); if (MC[k]) return MC[k]; const p = Object.assign({ roughness: .55, metalness: .12 }, o); p.color = lin(cor); if (p.emissive != null) p.emissive = lin(p.emissive); return (MC[k] = guarda(new THREE.MeshStandardMaterial(p))); };
  const m = {
    branco: mat(0xdcded8, { roughness: .45 }), cinza: mat(0xa3a7ad, { metalness: .25 }), esc: mat(0x55595f), preto: mat(0x1b1c1f, { roughness: .7 }),
    azul: mat(0x1d4ea8, { roughness: .38 }), azulRomi: mat(0x2c6db5, { roughness: .4 }), amarelo: mat(0xf2bf1d, { roughness: .42 }),
    forno: mat(0x22335f), vermelho: mat(0xc4473a), cromo: mat(0xd2d6db, { metalness: .9, roughness: .18 }), vidro: mat(0x161c22, { roughness: .1, metalness: .6 }),
    tela: mat(0x0d2233, { emissive: 0x2a8ad8, emissiveIntensity: .9 }), brasa: guarda(new THREE.MeshBasicMaterial({ color: lin(0xff5a1f), toneMapped: false })),
  };
  const GC = {};
  const gBox = (w, h, d) => { const k = `b${w}|${h}|${d}`; return GC[k] || (GC[k] = guarda(new THREE.BoxGeometry(w, h, d))); };
  const gCyl = (r1, r2, h) => { const k = `c${r1}|${r2}|${h}`; return GC[k] || (GC[k] = guarda(new THREE.CylinderGeometry(r1, r2, h, 22))); };
  const add = (p, geo, mt, x, y, z) => { const o = new THREE.Mesh(geo, mt); o.castShadow = o.receiveShadow = true; o.position.set(x, y, z); p.add(o); return o; };
  const box = (p, w, h, d, mt, x, y, z) => add(p, gBox(w, h, d), mt, x, y + h / 2, z);
  const cyl = (p, r, h, mt, x, y, z, r2 = r) => add(p, gCyl(r, r2, h), mt, x, y + h / 2, z);
  const hcyl = (p, r, len, mt, x, y, z) => { const o = add(p, gCyl(r, r, len), mt, x, y, z); o.rotation.z = Math.PI / 2; return o; };

  // piso com faixas de corredor
  const [PW, PD] = L.piso;
  const chao = new THREE.Mesh(guarda(new THREE.PlaneGeometry(PW, PD)), mat(0x7f8381, { roughness: .85 })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; S.add(chao);
  const fora = new THREE.Mesh(guarda(new THREE.PlaneGeometry(300, 300)), mat(0x2a2d31, { roughness: .95 })); fora.rotation.x = -Math.PI / 2; fora.position.y = -.02; S.add(fora);
  const faixa = (w, d, x, z) => { const o = new THREE.Mesh(gBox(w, .02, d), m.amarelo); o.position.set(x, .012, z); S.add(o); };
  faixa(PW, .2, 0, -PD / 2 + .2); faixa(PW, .2, 0, PD / 2 - .2); faixa(.2, PD, -PW / 2 + .2, 0); faixa(.2, PD, PW / 2 - .2, 0);
  if (layout === 'pps') faixa(PW - 2, .16, 0, 0);
  if (layout === 'fornos') faixa(PW - 2, .16, 0, -3.6);

  // ---------- modelos ----------
  function injetoraPlastico(modelo) {
    const g = new THREE.Group(); const grande = /750/.test(modelo), romi = /ROMI/i.test(modelo);
    const s = grande ? 1.35 : romi ? .85 : 1; const Lm = 7 * s, W = 1.7 * s, H = 1.9 * s;
    const corpo = romi ? m.azulRomi : /Haitian/i.test(modelo) ? m.azul : m.branco;
    box(g, Lm + .5, .06, W + .4, m.esc, 0, 0, 0);
    box(g, Lm, .55 * s, W * .9, m.esc, 0, .06, 0);
    box(g, Lm * .5, H - .6 * s, W, corpo, Lm * .2, .6 * s, 0);                       // fechamento
    box(g, Lm * .3, (H - .6 * s) * .6, .04, m.vidro, Lm * .2, .6 * s + .15, W / 2 + .02); // porta de proteção
    box(g, Lm * .42, .7 * s, W * .55, m.cinza, -Lm * .26, .6 * s, 0);                 // unidade de injeção
    hcyl(g, .18 * s, Lm * .3, m.cromo, -Lm * .14, .6 * s + .95 * s, 0);               // canhão
    cyl(g, .12 * s, .5 * s, m.esc, -Lm * .3, .6 * s + .7 * s, 0);                     // funil (base)
    cyl(g, .5 * s, .8 * s, m.cinza, -Lm * .3, .6 * s + 1.2 * s, 0, .14 * s);          // funil
    box(g, .8, 1.7, .5, m.branco, Lm * .02, 0, W / 2 + .5); box(g, .56, .38, .03, m.tela, Lm * .02, 1.2, W / 2 + .76); // painel do operador
    return { g, r: Lm / 2 + 1, topo: H + 1.3 * s };
  }
  function fornoTorre(n) {
    const g = new THREE.Group();
    box(g, 6.4, .3, 5.2, m.esc, 0, 0, 0); box(g, 5.6, 3.6, 4.4, m.cinza, 0, .3, .2);
    for (let i = 0; i < 4; i++) box(g, 1.25, 2.4, .05, m.amarelo, -2.05 + i * 1.37, .9, 2.43);
    box(g, 3, 6.4, 3, m.cinza, -.6, 4, -.6);
    for (let k = 0; k < 4; k++) box(g, 3.06, .1, 3.06, m.esc, -.6, 4.8 + k * 1.5, -.6);
    box(g, 6.2, .16, 3.2, m.amarelo, .2, 4.02, 1.3);
    hcyl(g, .75, 1.2, m.branco, 3.35, 2.3, .6); cyl(g, .55, 2.6, m.cromo, -.6, 10.4, -.6);
    box(g, .6, .9, .3, m.branco, 2.3, .9, 2.75); box(g, .2, .2, .03, m.vermelho, 2.3, 1.45, 2.91);
    return { g, r: 4.6, topo: 13.6 };
  }
  function fornoEspera(modelo) {
    const g = new THREE.Group(); const dos = /Dosador/i.test(modelo);
    box(g, 2.6, .12, 2.2, m.esc, 0, 0, 0);
    box(g, 2.3, dos ? 1.5 : 1.05, 1.9, m.forno, 0, .12, 0);                              // câmara
    box(g, 2.36, .14, 1.96, m.esc, 0, dos ? 1.62 : 1.17, 0);                            // tampa
    if (dos) { box(g, .5, .9, .5, m.cinza, .6, 1.76, 0); hcyl(g, .12, 1.3, m.cromo, 1.3, 2.4, 0); box(g, .7, 1.2, .5, m.branco, -1.6, 0, .6); }
    else { const b = new THREE.Mesh(gBox(.9, .04, .7), m.brasa); b.position.set(-.45, 1.25, 0); g.add(b); box(g, .6, 1.5, .4, m.branco, 1.55, 0, .5); }
    box(g, .3, .2, .03, m.tela, dos ? -1.6 : 1.55, dos ? .9 : 1.15, dos ? .86 : .71);
    return { g, r: 1.9, topo: dos ? 2.9 : 1.9 };
  }

  // ---------- etiquetas ----------
  const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  try { await Promise.race([document.fonts?.ready, new Promise((ok) => setTimeout(ok, 2000))]); } catch { /* fonte reserva */ }
  const anelMt = Object.fromEntries(Object.entries(COR).map(([k, c]) => [k, guarda(new THREE.MeshBasicMaterial({ color: lin(c), transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }))]));
  const equips = [], pick = [];
  L.itens.forEach(([nome, x, z]) => {
    const modelo = modelos[nome] || '';
    const info = nome.startsWith('VTIP') ? injetoraPlastico(modelo) : nome.startsWith('VTFT') ? fornoTorre(nome.slice(-1)) : fornoEspera(modelo);
    info.g.position.set(x, 0, z); S.add(info.g);
    const anel = new THREE.Mesh(guarda(new THREE.RingGeometry(info.r, info.r + .3, 56)), anelMt.na); anel.rotation.x = -Math.PI / 2; anel.position.set(x, .03, z); S.add(anel);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const t = guarda(new THREE.CanvasTexture(canvas)); t.encoding = THREE.sRGBEncoding;
    const et = new THREE.Sprite(guarda(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }))); et.scale.set(3.6, .9, 1); et.renderOrder = 10;
    et.position.set(x, info.topo + .8, z); S.add(et);
    const eq = { nome, x, z, r: info.r, anel, et, canvas, st: 'na', dado: null };
    equips.push(eq); info.g.traverse((o) => { if (o.isMesh) { o.userData.eq = eq; pick.push(o); } });
  });
  function etiqueta(eq) {
    const x = eq.canvas.getContext('2d'); x.clearRect(0, 0, 512, 128); const cor = COR[eq.st];
    rr(x, 4, 4, 504, 120, 18); x.fillStyle = 'rgba(16,17,20,.92)'; x.fill(); x.save(); x.clip(); x.fillStyle = cor; x.fillRect(4, 4, 16, 120); x.restore();
    x.textBaseline = 'middle'; x.font = '600 60px "Barlow Condensed","Arial Narrow",sans-serif'; x.fillStyle = '#eceef0'; x.textAlign = 'left'; x.fillText(eq.nome, 40, 68);
    if (eq.dado?.rotulo) { x.textAlign = 'right'; x.font = '700 58px "Barlow Condensed","Arial Narrow",sans-serif'; x.fillStyle = cor; x.fillText(eq.dado.rotulo, 490, 68); }
    eq.et.material.map.needsUpdate = true;
  }
  function atualizar(lista) {
    const mapa = new Map((lista || []).map((d) => [d.nome, d]));
    equips.forEach((eq) => { eq.dado = mapa.get(eq.nome) || null; eq.st = eq.dado?.st3d || 'na'; eq.anel.material = anelMt[eq.st]; etiqueta(eq); });
    if (sel) mostrarFicha(sel);
  }

  // ---------- câmera, seleção e ficha ----------
  let alvo = null; const voar = (p, t) => { alvo = { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t) }; };
  C.position.set(...L.camera[0]); O.target.set(...L.camera[1]);
  $('[data-geral]').onclick = () => voar(...L.camera);
  $('[data-topo]').onclick = () => voar([0, 60, .1], [0, 0, 0]);
  let sel = null;
  const selAnel = new THREE.Mesh(guarda(new THREE.RingGeometry(1, 1.12, 64)), guarda(new THREE.MeshBasicMaterial({ color: lin(0xffc20e), side: THREE.DoubleSide, transparent: true, depthWrite: false })));
  selAnel.rotation.x = -Math.PI / 2; selAnel.position.y = .05; selAnel.visible = false; S.add(selAnel);
  function mostrarFicha(eq) {
    const f = $('[data-ficha]'); sel = eq;
    if (!eq) { f.hidden = true; selAnel.visible = false; return; }
    selAnel.visible = true; selAnel.position.set(eq.x, .05, eq.z); selAnel.scale.setScalar(eq.r + .5);
    f.innerHTML = `<button type="button" class="p3d-fechar" data-fechar aria-label="Fechar">×</button>${ficha ? ficha(eq.nome) : `<h3>${esc(eq.nome)}</h3>`}`;
    f.hidden = false; f.querySelector('[data-fechar]').onclick = () => mostrarFicha(null);
  }
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let desce = null;
  const acertar = (e) => { const r = R.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ptr, C); return ray.intersectObjects(pick, false)[0]?.object.userData.eq || null; };
  const onDown = (e) => { desce = [e.clientX, e.clientY]; };
  const onUp = (e) => { if (!desce || Math.hypot(e.clientX - desce[0], e.clientY - desce[1]) > 6) return; mostrarFicha(acertar(e)); };
  const onMove = (e) => { if (e.buttons) return; R.domElement.style.cursor = acertar(e) ? 'pointer' : 'grab'; };
  R.domElement.addEventListener('pointerdown', onDown); R.domElement.addEventListener('pointerup', onUp); R.domElement.addEventListener('pointermove', onMove);

  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const relogio = new THREE.Clock(); let raf = 0, vivo = true;
  function loop() {
    if (!vivo) return; if (!el.isConnected) { destruir(); return; }
    raf = requestAnimationFrame(loop);
    if (alvo) { C.position.lerp(alvo.p, .08); O.target.lerp(alvo.t, .08); if (C.position.distanceTo(alvo.p) < .2) alvo = null; }
    if (!reduz) { const t = relogio.getElapsedTime(), pul = 1 + .05 * Math.sin(t * 4); equips.forEach((eq) => eq.anel.scale.setScalar(eq.st === 'bx' ? pul : 1)); selAnel.material.opacity = .6 + .4 * Math.sin(t * 3); }
    O.update(); R.render(S, C);
  }
  function destruir() {
    if (!vivo) return; vivo = false; cancelAnimationFrame(raf); ro.disconnect(); O.dispose();
    lixo.forEach((o) => { try { o.dispose(); } catch { /* ok */ } }); R.dispose(); R.forceContextLoss(); R.domElement.remove();
  }
  $('.p3d-carregando')?.remove();
  loop();
  const abrir = (nome) => { const eq = equips.find((q) => q.nome === nome); if (eq) { mostrarFicha(eq); voar([eq.x + 9, 11, eq.z + 14], [eq.x, 1, eq.z]); } };
  return { atualizar, abrir, destruir, el };
}

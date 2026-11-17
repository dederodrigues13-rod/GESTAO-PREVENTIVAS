// =====================================================================
// Planta 3D do galpão — GESTÃO DE PREVENTIVAS
//
// Mesma cena do Gestão de Fluidos (planta3d.js de lá). Aqui a cor, o
// sinaleiro e a etiqueta de cada máquina mostram a situação da preventiva:
//   bx = atrasada · at = este mês / próximos dias · ag = aguardando gestor
//   ok = em dia · na = fora do cronograma (VTPR, VTTE, Polaris...: sem etiqueta)
// O conteúdo da ficha (painel ao clicar) vem de fora: opção "ficha".
// FORNO_ESPERA: em qual célula fica cada forno de espera (preencher quando
// confirmado; os vazios aparecem só no layout "Fornos").
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANTA, CORREDOR_APOS } from './planta.js';
import { esc } from './ui.js';
const situacao = (d) => d.st3d || 'na';
const statusPreventiva = () => ({ st: 'emdia' });
const quando = () => '';
export const FORNO_ESPERA = {}; // ex.: { '07': 'VTFE 07' }

// ---------- o que existe em cada célula ----------
// inj: [marca, toneladas]  ·  polaris: tem Polaris  ·  robo: robô no chão  ·  roboTopo: robô em cima da injetora
const INJ = {
  '02': ['LK', 800], '03': ['LK', 800], '04': ['LK', 800], '05': ['LK', 800], '06': ['LK', 800],
  '07': ['LK', 2000], '08': ['HT', 2000], '09': ['HT', 2000], '10': ['HT', 850], '11': ['HT', 850],
  '12': ['HT', 2000], '13': ['LK', 400],
};
const COM_POLARIS = new Set(['07', '08', '09', '12']);
const SEM_ROBO = new Set(['02']);
const ROBO_TOPO = new Set(['07', '08', '09', '10', '11', '12', '13']);
export const EQUIPAMENTOS = Object.fromEntries(Object.entries(INJ).map(([n, [marca, ton]]) => [n, {
  marca, ton, polaris: COM_POLARIS.has(n), robo: !SEM_ROBO.has(n), roboTopo: ROBO_TOPO.has(n),
}]));

const COR = { bx: '#ff5a36', at: '#f0a93b', ok: '#4cc38a', ag: '#5aa2ff', na: '#7b848e', off: '#4b535d' };
// "Polaris 7", "VTIA07", "VTPR-13" e "VTIA 07" viram todos o mesmo formato
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/([A-Z])(\d)/g, '$1 $2').replace(/\s+/g, ' ').trim().replace(/\d+$/, (n) => n.padStart(2, '0'));

export async function criarPlanta3D(el, { tv = false, aoAbrir = null, aoParar = null, ficha = null } = {}) {
  el.classList.add('p3d');
  el.innerHTML = `
    <div class="p3d-carregando">Montando o galpão…</div>
    ${tv ? `<div class="p3d-legenda" aria-live="polite"><small>Agora mostrando</small><b data-tit>Visão geral</b><span data-sub></span><div class="p3d-prog"><i data-prog></i></div></div>`
      : `<div class="p3d-barra">
          <select data-cel aria-label="Ir para célula"><option value="">Ir para célula…</option></select>
          <button type="button" data-geral>Visão geral</button>
          <button type="button" data-topo>De cima</button>
          <button type="button" data-girar aria-pressed="false">Girar</button>
          <button type="button" data-tour aria-pressed="false">▶ Tour</button>
        </div>
        <aside class="p3d-ficha" data-ficha hidden></aside>
        <div class="p3d-dica">Arraste para girar · botão direito para mover · role para zoom · clique numa máquina</div>`}`;
  const $ = (s) => el.querySelector(s);

  // ---------- renderizador ----------
  // Na TV o computador costuma ser fraco: sem antialias (a resolução extra já suaviza), sombra calculada
  // uma vez só (o cenário é parado) e resolução que baixa sozinha se a tela não acompanhar (ver "qualidade").
  const R = new THREE.WebGLRenderer({ antialias: !tv, powerPreference: 'high-performance' });
  const NIVEIS = tv ? [1.25, 1, .8, .65] : [Math.min(window.devicePixelRatio || 1, 1.75)];
  let nivel = 0;
  R.setPixelRatio(NIVEIS[0]);
  R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.08;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  if (tv) { R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = true; }
  el.prepend(R.domElement);
  const lin = (c) => new THREE.Color(c).convertSRGBToLinear();
  const S = new THREE.Scene(); S.background = lin(0x17191c); S.fog = new THREE.Fog(lin(0x17191c), 130, 300);
  const C = new THREE.PerspectiveCamera(40, 1, 0.3, 700);
  const O = new OrbitControls(C, R.domElement);
  O.enableDamping = true; O.dampingFactor = .08; O.maxPolarAngle = 1.42; O.minDistance = 4; O.maxDistance = 230; O.screenSpacePanning = false;
  const tamanho = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; R.setSize(w, h, false); C.aspect = w / h; C.updateProjectionMatrix(); };
  const ro = new ResizeObserver(tamanho); ro.observe(el); tamanho();

  const descartar = []; // tudo que precisa ser liberado ao sair
  const guarda = (o) => (descartar.push(o), o);

  // reflexo de galpão: caixa cinza com faixas de luminária no teto
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 14, 40), new THREE.MeshBasicMaterial({ color: lin(0x3a3c40), side: THREE.BackSide })));
    const luz = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.4) });
    for (let x = -15; x <= 15; x += 7.5) for (let z = -15; z <= 15; z += 10) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, .1, 5), luz); l.position.set(x, 6.9, z); env.add(l); }
    const pm = new THREE.PMREMGenerator(R); S.environment = guarda(pm.fromScene(env, .04).texture); pm.dispose();
    env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
  S.add(new THREE.HemisphereLight(lin(0xdfe6f5), lin(0x2a2622), .28));
  const sol = new THREE.DirectionalLight(lin(0xfff1dc), 1.25); sol.position.set(-42, 95, 55); sol.castShadow = true;
  sol.shadow.mapSize.set(tv ? 2048 : 4096, tv ? 2048 : 4096);
  Object.assign(sol.shadow.camera, { left: -72, right: 72, top: 66, bottom: -66, near: 20, far: 230 }); sol.shadow.bias = -.0004; sol.shadow.normalBias = .03;
  S.add(sol);

  // ---------- materiais, geometrias e texturas ----------
  const MC = {};
  function mat(cor, o = {}) {
    const k = cor + JSON.stringify(o); if (MC[k]) return MC[k];
    const p = Object.assign({ roughness: .6, metalness: .1 }, o); p.color = lin(cor); if (p.emissive != null) p.emissive = lin(p.emissive);
    return (MC[k] = guarda(new THREE.MeshStandardMaterial(p)));
  }
  function textura(w, h, desenho, repete) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; desenho(c.getContext('2d'), w, h);
    const t = guarda(new THREE.CanvasTexture(c)); t.encoding = THREE.sRGBEncoding; t.anisotropy = R.capabilities.getMaxAnisotropy();
    if (repete) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  const texRisco = textura(128, 32, (x, w, h) => { x.fillStyle = '#f2bf1d'; x.fillRect(0, 0, w, h); x.fillStyle = '#16171a'; for (let i = -2; i < 6; i++) { x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + 16, h); x.lineTo(i * 32 + 16 + h, 0); x.lineTo(i * 32 + h, 0); x.fill(); } }, true);
  const texMalha = textura(128, 128, (x, w, h) => { x.strokeStyle = '#202226'; x.lineWidth = 3; for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } }, true);
  const texPiso = textura(1024, 1024, (x, w, h) => {
    x.fillStyle = '#868987'; x.fillRect(0, 0, w, h);
    // riscos e marcas de pneu/carrinho, como no piso das células
    for (let i = 0; i < 260; i++) {
      const sx = Math.random() * w, sy = Math.random() * h, c = 40 + Math.random() * 220, a = Math.random() * Math.PI * 2;
      x.strokeStyle = `rgba(45,42,38,${.06 + Math.random() * .12})`; x.lineWidth = .8 + Math.random() * 1.6;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * c * .5 + (Math.random() - .5) * 60, sy + Math.sin(a) * c * .5 + (Math.random() - .5) * 60, sx + Math.cos(a) * c, sy + Math.sin(a) * c); x.stroke();
    }
    for (let i = 0; i < 26000; i++) { const v = Math.random(); x.fillStyle = v < .5 ? `rgba(255,255,255,${.03 + Math.random() * .05})` : `rgba(0,0,0,${.04 + Math.random() * .08})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    for (let i = 0; i < 9; i++) { const gx = Math.random() * w, gy = Math.random() * h, r = 40 + Math.random() * 120; const g = x.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, 'rgba(20,18,15,.18)'); g.addColorStop(1, 'rgba(20,18,15,0)'); x.fillStyle = g; x.fillRect(gx - r, gy - r, r * 2, r * 2); }
    x.strokeStyle = 'rgba(30,31,34,.85)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, w - 3, h - 3); x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
  }, true);

  const m = {
    lkBranco: mat(0xdcded8, { roughness: .45 }), lkBranco2: mat(0xc6c9c3, { roughness: .5 }), amarelo: mat(0xf2bf1d, { roughness: .42 }),
    htAzul: mat(0x1d4ea8, { roughness: .38, metalness: .15 }), htBranco: mat(0xdadee2, { roughness: .45 }),
    aco: mat(0xa3a7ad, { metalness: .22, roughness: .48 }), acoEsc: mat(0x55595f, { metalness: .2, roughness: .55 }), cromo: mat(0xd2d6db, { metalness: .95, roughness: .16 }),
    forno: mat(0x22335f, { roughness: .55 }), laranja: mat(0xe0622a, { roughness: .38, metalness: .1 }), painel: mat(0xd0d2cd, { roughness: .5 }),
    tela: mat(0x0d2233, { emissive: 0x2a8ad8, emissiveIntensity: .9, roughness: .2 }), grade: mat(0x5a5e64, { metalness: .3, roughness: .5 }),
    verde: mat(0x2e8a70, { roughness: .35, metalness: .2 }), termoCinza: mat(0x8f9296, { metalness: .45, roughness: .4 }), display: mat(0x200000, { emissive: 0xff3a24, emissiveIntensity: 1.3 }),
    laranjaJato: mat(0xd9692a, { roughness: .5 }), duto: mat(0xc2c4c6, { metalness: .65, roughness: .3 }), vidro: mat(0x161c22, { roughness: .08, metalness: .6 }),
    vermelho: mat(0xc4473a, { roughness: .4 }), preto: mat(0x1b1c1f, { roughness: .7 }), borracha: mat(0x141516, { roughness: .85 }),
    bandeja: mat(0x6a6e74, { metalness: .3, roughness: .4 }), vent: mat(0x2a2c30, { roughness: .6 }), madeira: mat(0x9a7a52, { roughness: .85 }),
    caixaAzul: mat(0x2659b0, { roughness: .6 }), cavaco: mat(0xb9bec4, { metalness: .85, roughness: .32 }), carrinho: mat(0xc22a24, { roughness: .35, metalness: .2 }),
    branco: mat(0xf0efe9), mangVerm: mat(0x7a1d18, { roughness: .8 }),
    mangAzul: mat(0x1f4fbf, { roughness: .45, metalness: .1 }), tambor: mat(0x1d5a3a, { roughness: .36, metalness: .35 }), tamborAro: mat(0x14402a, { roughness: .45, metalness: .35 }),
    etiqueta: mat(0xf2f2ee, { roughness: .7 }), paletePl: mat(0x26282b, { roughness: .8 }), extintor: mat(0xc8201a, { roughness: .35, metalness: .1 }),
    pisoVerm: mat(0xc42a22, { roughness: .6 }), tapete: mat(0x161718, { roughness: .95 }), parede: mat(0xe4e4df, { roughness: .92 }), rodape: mat(0xa9acaf, { roughness: .8 }),
    painelEl: mat(0xc4c8cb, { roughness: .55, metalness: .15 }), inox: mat(0xdde1e4, { metalness: .55, roughness: .26 }),
    azulPlaca: mat(0x1d3f8a, { roughness: .5 }), tanqueBranco: mat(0xe9ebe6, { roughness: .5 }), luminaria: mat(0x8d9196, { roughness: .4, metalness: .5 }),
    malha: guarda(new THREE.MeshStandardMaterial({ map: texMalha, transparent: true, alphaTest: .35, side: THREE.DoubleSide, metalness: .5, roughness: .5 })),
  };
  const GC = {};
  const gBox = (w, h, d) => { const k = 'b' + w + '|' + h + '|' + d; return GC[k] || (GC[k] = guarda(new THREE.BoxGeometry(w, h, d))); };
  const gTor = (R, r) => { const k = 't' + R + '|' + r; return GC[k] || (GC[k] = guarda(new THREE.TorusGeometry(R, r, 8, 36))); };
  const gCyl = (r, h, s) => { const k = 'c' + r + '|' + h + '|' + s; return GC[k] || (GC[k] = guarda(new THREE.CylinderGeometry(r, r, h, s))); };
  function malhaDe(geo, mt, p, sombra) { const o = new THREE.Mesh(geo, mt); o.castShadow = sombra; o.receiveShadow = true; p.add(o); return o; }
  const box = (p, w, h, d, mt, x, y, z) => { const o = malhaDe(gBox(w, h, d), mt, p, Math.max(w, h, d) > .3); o.position.set(x, y + h / 2, z); return o; };
  const cyl = (p, r, h, mt, x, y, z, seg = 20) => { const o = malhaDe(gCyl(r, h, seg), mt, p, h > .3 || r > .2); o.position.set(x, y + h / 2, z); return o; };
  const hcyl = (p, r, len, mt, x, y, z, eixo = 'x') => { const o = malhaDe(gCyl(r, len, 20), mt, p, true); if (eixo === 'x') o.rotation.z = Math.PI / 2; else o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return o; };
  const domo = (p, r, mt, x, y, z) => { const o = malhaDe(guarda(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mt, p, true); o.position.set(x, y, z); };
  const mangueira = (p, pts, r, mt) => malhaDe(guarda(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), 28, r || .045, 8)), mt || m.borracha, p, false);
  function planoUV(w, h, su, sv) { const g = guarda(new THREE.PlaneGeometry(w, h)); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
  const riscoMt = guarda(new THREE.MeshStandardMaterial({ map: texRisco, roughness: .5 }));
  const faixaRisco = (p, w, h, x, y, z) => { const o = new THREE.Mesh(planoUV(w, h, w / (h * 4), 1), riscoMt); o.position.set(x, y, z); p.add(o); };
  const placaCache = {};
  function placa(p, txt, x, y, z, ry = 0, w = .95, h = .27, fundo = '#163f7a', cor = '#ffffff') {
    const k = txt + fundo;
    const mt = placaCache[k] || (placaCache[k] = guarda(new THREE.MeshStandardMaterial({ roughness: .45, map: textura(256, 72, (c, W, H) => {
      c.fillStyle = fundo; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.strokeRect(5, 5, W - 10, H - 10);
      c.fillStyle = cor; c.font = '700 44px "Barlow Condensed","Arial Narrow",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W / 2, H / 2 + 2);
    }) })));
    const o = new THREE.Mesh(guarda(new THREE.PlaneGeometry(w, h)), mt); o.position.set(x, y, z); o.rotation.y = ry; p.add(o);
  }
  function guardaCorpo(p, w, d, x, y, z, h = 1.05) {
    const a = m.amarelo, t = .05;
    [d / 2, -d / 2].forEach((zz) => { box(p, w, t, t, a, x, y + h, z + zz); box(p, w, t, t, a, x, y + h / 2, z + zz); box(p, w, .12, .012, a, x, y, z + zz); });
    [-w / 2, w / 2].forEach((xx) => { box(p, t, t, d, a, x + xx, y + h, z); box(p, t, t, d, a, x + xx, y + h / 2, z); });
    const n = Math.round(w / 1.1);
    for (let i = 0; i <= n; i++) [-1, 1].forEach((j) => box(p, .06, h, .06, a, x - w / 2 + i * w / n, y, z + j * d / 2));
  }
  function escada(p, h, x, z, ao = 'x') {
    const a = m.amarelo;
    if (ao === 'x') { box(p, .06, h + .9, .06, a, x - .27, 0, z); box(p, .06, h + .9, .06, a, x + .27, 0, z); for (let y = .3; y < h; y += .33) box(p, .54, .04, .04, a, x, y, z); }
    else { box(p, .06, h + .9, .06, a, x, 0, z - .27); box(p, .06, h + .9, .06, a, x, 0, z + .27); for (let y = .3; y < h; y += .33) box(p, .04, .04, .54, a, x, y, z); }
  }
  function cerca(p, pts, h = 2) {
    for (const [x, z] of pts) box(p, .09, h, .09, m.amarelo, x, 0, z);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1]; const len = Math.hypot(x2 - x1, z2 - z1), ang = -Math.atan2(z2 - z1, x2 - x1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const tela = new THREE.Mesh(planoUV(len, h - .3, len * 2.2, (h - .3) * 2.2), m.malha); tela.position.set(mx, .16 + (h - .3) / 2, mz); tela.rotation.y = ang; p.add(tela);
      [h - .04, .12].forEach((y) => { const r = new THREE.Mesh(gBox(len, .06, .05), m.amarelo); r.position.set(mx, y, mz); r.rotation.y = ang; p.add(r); });
    }
  }

  // sinaleiro: verde embaixo, amarelo no meio, vermelho em cima
  const ACESO = {
    bx: guarda(new THREE.MeshStandardMaterial({ color: lin(0x3a0806), emissive: lin(0xff3b30), emissiveIntensity: 2.2 })),
    at: mat(0x3a2600, { emissive: 0xffb020, emissiveIntensity: 2 }), ok: mat(0x063a1f, { emissive: 0x2fe08a, emissiveIntensity: 1.8 }),
  };
  const APAGADO = { bx: mat(0x3b1715, { roughness: .3 }), at: mat(0x3b2d12, { roughness: .3 }), ok: mat(0x173327, { roughness: .3 }) };
  function sinaleiro(p, x, y, z) {
    cyl(p, .03, .45, m.acoEsc, x, y, z, 8);
    const seg = {};
    ['ok', 'at', 'bx'].forEach((k, i) => { seg[k] = cyl(p, .11, .16, APAGADO[k], x, y + .45 + i * .17, z, 16); });
    cyl(p, .12, .04, m.preto, x, y + .96, z, 16);
    return seg;
  }

  const robos = [];
  function robo(p, x, z, y = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
    box(g, 1.1, .18, 1.1, m.acoEsc, 0, 0, 0); cyl(g, .46, .32, m.acoEsc, 0, .18, 0);
    const giro = new THREE.Group(); giro.position.y = .5; g.add(giro);
    cyl(giro, .38, .5, m.laranja, 0, 0, 0); box(giro, .5, .35, .5, m.laranja, 0, .5, 0);
    const omb = new THREE.Group(); omb.position.set(0, .8, 0); giro.add(omb); omb.rotation.z = -.42;
    hcyl(omb, .2, .6, m.acoEsc, 0, 0, 0, 'z'); box(omb, .3, 1.7, .32, m.laranja, 0, 0, 0);
    const cot = new THREE.Group(); cot.position.set(0, 1.7, 0); omb.add(cot); cot.rotation.z = 1.8;
    hcyl(cot, .17, .5, m.acoEsc, 0, 0, 0, 'z'); box(cot, .25, 1.45, .27, m.laranja, 0, 0, 0); box(cot, .34, .28, .38, m.acoEsc, 0, 1.45, 0); box(cot, .12, .35, .5, m.aco, 0, 1.73, 0);
    mangueira(omb, [[.18, .1, .1], [.3, .9, .18], [.2, 1.7, .16]], .035);
    robos.push(giro);
    return g;
  }

  // ---------- equipamentos ----------
  function injetora(cfg, id) {
    const { marca, ton } = cfg;
    const g = new THREE.Group(); const s = ton >= 2000 ? 1.4 : ton >= 850 ? 1.06 : ton >= 800 ? 1 : .82;
    const L = +(9 * s).toFixed(2), W = +(2.6 * s).toFixed(2), H = +(2.4 * s).toFixed(2), lk = marca === 'LK'; const corpo = lk ? m.lkBranco : m.htAzul;
    box(g, L + .7, .06, W + .5, m.bandeja, 0, 0, 0);
    box(g, L, .5 * s, W * .86, m.acoEsc, 0, .06, 0);
    const Lc = L * .56, xc = L / 2 - Lc / 2, y0 = .5 * s + .06, hc = H - .5 * s;
    box(g, Lc, hc, W, corpo, xc, y0, 0);
    faixaRisco(g, Lc, .14, xc, y0 - .09, W * .43 + .012);
    box(g, Lc * .42, hc * .72, .06, lk ? m.amarelo : m.htBranco, xc - Lc * .08, y0 + .18, W / 2 + .03);
    box(g, Lc * .22, hc * .3, .04, m.vidro, xc - Lc * .08, y0 + hc * .38, W / 2 + .065);
    box(g, .05, hc * .4, .07, m.cromo, xc - Lc * .26, y0 + hc * .28, W / 2 + .1);
    box(g, Lc * .3, hc * .55, .04, m.vidro, xc + Lc * .25, y0 + hc * .25, W / 2 + .02);
    box(g, .9 * s, hc * .98, W * .94, lk ? m.lkBranco2 : m.htBranco, L / 2 - .45 * s, y0, 0);
    for (let i = 0; i < 5; i++) box(g, .5 * s, .05, .02, m.vent, L / 2 - .45 * s, y0 + hc * .55 + i * .11, W * .47 + .012);
    [[.32, .32], [.32, -.32], [.82, .32], [.82, -.32]].forEach(([fy, fz]) => { hcyl(g, .1 * s, .5, m.cromo, L / 2 + .22, y0 + hc * fy, W * fz); hcyl(g, .17 * s, .12, m.acoEsc, L / 2 + .06, y0 + hc * fy, W * fz); });
    const plataforma = ton >= 2000 || cfg.roboTopo;
    if (!plataforma) { box(g, Lc * .45, .45 * s, W * .55, lk ? m.lkBranco2 : m.htBranco, xc + Lc * .05, H, 0); for (let i = 0; i < 6; i++) box(g, .04, .3 * s, W * .56, m.vent, xc - Lc * .12 + i * Lc * .07, H + .07, 0); }
    placa(g, id, xc + Lc * .25, y0 + hc * .9, W / 2 + .045);
    const Li = L - Lc, xi = -L / 2 + Li / 2;
    box(g, Li, .85 * s, W * .62, m.aco, xi, y0, 0);
    box(g, Li * .5, .55 * s, W * .5, m.acoEsc, xi + Li * .15, y0 + .85 * s, W * .05);
    box(g, .55 * s, H * 1.05 - .5 * s, W * 1.05, m.acoEsc, -L / 2 + Li, y0, 0);
    hcyl(g, .26 * s, Li * .5, m.aco, xi - Li * .15, 1.62 * s, 0); hcyl(g, .12 * s, Li * .45, m.cromo, xi + Li * .3, 1.62 * s, 0);
    const blocoX = xi + Li * .15, blocoY = y0 + .85 * s + .55 * s;
    if (lk) {
      for (let k = 0; k < 4; k++) { const ax = xi - Li * .33 + k * .5 * s, az = -W * .24; cyl(g, .22 * s, 1.6 * s, m.lkBranco, ax, 1.42 * s, az); domo(g, .22 * s, m.lkBranco, ax, 3.02 * s, az); box(g, .2, .22, .04, m.amarelo, ax, 2.4 * s, az + .22 * s); mangueira(g, [[ax, 1.45 * s, az + .1], [ax + .1, 1.2 * s, az + .35], [blocoX - .2, blocoY - .15, .1]], .04 * s); }
    } else {
      for (let k = 0; k < 2; k++) { const ax = xi - Li * .2 + k * .82 * s, az = -W * .2; cyl(g, .36 * s, 2.3 * s, m.htAzul, ax, 1.42 * s, az); domo(g, .36 * s, m.htAzul, ax, 3.72 * s, az); box(g, .26, .3, .04, m.amarelo, ax, 2.8 * s, az + .36 * s); mangueira(g, [[ax, 1.5 * s, az + .2], [ax + .15, 1.2 * s, az + .5], [blocoX - .2, blocoY - .15, .1]], .05 * s); }
    }
    [-.6, 0, .6].forEach((dz, i) => box(g, .18, .18, .18, m.preto, blocoX - .3 + i * .25, blocoY, dz * W * .3));
    // mangueiras azuis em espiral em cima da unidade de injeção (como no galpão)
    [-.22, .02].forEach((dz, i) => { const t = malhaDe(gTor(.46 * s, .045 * s), m.mangAzul, g, false); t.position.set(blocoX + .35 + i * .25, blocoY + .62 * s, dz * W); t.rotation.y = .25; });
    box(g, 1.1, 1.9, .55, m.painel, -L / 2 + .7, 0, -W / 2 - .5); box(g, .02, 1.6, .48, m.vent, -L / 2 + .14, .15, -W / 2 - .5);
    box(g, .8, 1.9, .5, m.painel, L * .08, 0, W / 2 + .6); box(g, .58, .4, .03, m.tela, L * .08, 1.32, W / 2 + .86);
    [[-.2, 1.0], [0, 1.0], [.2, 1.0], [-.2, .82], [0, .82], [.2, .82]].forEach(([dx, yy], i) => { cyl(g, .035, .03, i === 2 ? m.vermelho : m.verde, L * .08 + dx, yy, W / 2 + .86, 10).rotation.x = Math.PI / 2; });
    box(g, 2, .98, 1.55, m.forno, -L / 2 + 1.1, 0, W / 2 + 1.32); box(g, 2.04, .12, 1.6, m.acoEsc, -L / 2 + 1.1, .98, W / 2 + 1.32); box(g, .6, .04, .6, m.aco, -L / 2 + 1.5, 1.1, W / 2 + 1.25);
    box(g, .9, .18, .5, m.acoEsc, -L / 2 + .25, .75, W / 2 + .85).rotation.z = .35;
    let topo = H + .5 * s;
    if (plataforma) { box(g, Lc * .62, .12, W * .92, m.grade, xc, H, 0); guardaCorpo(g, Lc * .62, W * .92, xc, H + .12, 0); escada(g, H, xc + Lc * .31 + .06, W / 2 + .16, 'z'); topo = H + 1.3; }
    const robos3d = {};
    if (cfg.roboTopo) { robos3d.Spray = robo(g, xc - Lc * .05, 0, H + .12); topo = H + 3.4; }
    if (cfg.robo) {
      const rx = L * .06, z1 = -W / 2 - .3, z2 = -W / 2 - 2.9;
      robos3d.Extrator = robo(g, rx, -W / 2 - 1.55);
      cerca(g, [[rx - 2.1, z1], [rx - 2.1, z2], [rx + 2.1, z2], [rx + 2.1, z1]]);
      box(g, .55, .06, .4, m.preto, rx + 1.4, 1.0, z1 - .45);
    }
    const seg = sinaleiro(g, L / 2 - .5 * s, plataforma ? H + .12 : H, -W / 2 + .35);
    return { g, seg, L, W, s, topo: Math.max(topo, H + 1.2), r: L / 2 + 1.3, matrizX: -L / 2 + Li + .3, robos3d };
  }
  function prensaLK(id) {
    const g = new THREE.Group();
    box(g, 2.6, .06, 2.4, m.bandeja, 0, 0, 0);
    [[-.9, -.75], [.9, -.75], [-.9, .75], [.9, .75]].forEach(([x, z]) => box(g, .42, 3.8, .42, m.aco, x, .06, z));
    box(g, 2.4, .75, 2, m.aco, 0, 3.8, 0); box(g, 1.8, .35, 1.6, m.acoEsc, 0, .06, 0); box(g, 1.5, .25, 1.3, m.acoEsc, 0, 1.9, 0);
    cyl(g, .38, .6, m.cromo, 0, 4.55, 0); cyl(g, .45, .5, m.acoEsc, 0, 4.67, 0);
    box(g, 1.7, 2.1, .08, m.amarelo, 0, 1.25, 1.02); box(g, .6, .6, .03, m.vidro, 0, 2.3, 1.07);
    [-1.13, 1.13].forEach((x) => { const t = new THREE.Mesh(planoUV(1.5, 1.9, 3.3, 4.2), m.malha); t.position.set(x, 1.3, 0); t.rotation.y = Math.PI / 2; g.add(t); });
    box(g, 2.6, .12, 2.3, m.grade, 0, 4.55, 0); guardaCorpo(g, 2.6, 2.3, 0, 4.67, 0); escada(g, 4.55, -1.42, .6, 'z');
    box(g, 1.1, 2.1, .6, m.painel, .35, 0, 1.95); placa(g, id, .35, 1.75, 2.255);
    [[-.15, 1.2], [.1, 1.2], [.35, 1.2]].forEach(([dx, yy], i) => { cyl(g, .04, .03, i ? m.verde : m.vermelho, .35 + dx, yy, 2.255, 10).rotation.x = Math.PI / 2; });
    return { g, seg: sinaleiro(g, .75, 2.1, 1.95), topo: 5.9, r: 2.1 };
  }
  function prensaRizzo(id) {
    const g = new THREE.Group();
    box(g, 2.5, .06, 2.2, m.bandeja, 0, 0, 0);
    box(g, 2, 3.1, 1.7, m.htBranco, 0, .06, 0); box(g, 2.3, 1, 1.9, m.amarelo, 0, 3.16, 0); box(g, 1.1, 1.3, .04, m.vidro, .35, 1.05, .86);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) box(g, .08, .08, .02, m.vent, -.75 + j * .12, 2.1 + i * .14, .86);
    [-.3, 0, .3].forEach((dx) => { hcyl(g, .1, .06, m.acoEsc, .55 + dx, 3.65, .97, 'z'); hcyl(g, .085, .02, m.branco, .55 + dx, 3.65, 1.01, 'z'); });
    escada(g, 4.1, -.55, .98, 'x'); cyl(g, .38, 1.65, m.verde, -1.65, 0, .8); domo(g, .38, m.verde, -1.65, 1.65, .8); cyl(g, .06, .25, m.acoEsc, -1.65, 2.0, .8);
    box(g, .75, 1.9, .5, m.painel, 1.6, 0, .7); placa(g, id, 1.6, 1.62, .955, 0, .68, .2);
    return { g, seg: sinaleiro(g, 1.6, 1.9, .7), topo: 4.6, r: 2.2 };
  }
  function termo(id) {
    const g = new THREE.Group();
    box(g, .72, 1.3, .78, m.lkBranco, -.38, .08, 0); box(g, .34, .24, .03, m.display, -.4, .98, .4); box(g, .4, .3, .02, m.acoEsc, -.4, .95, .395);
    for (let i = 0; i < 4; i++) box(g, .36, .03, .02, m.vent, -.38, .25 + i * .07, .4);
    box(g, .78, 1.12, .9, m.termoCinza, .38, .08, -.04); for (let i = 0; i < 5; i++) box(g, .5, .03, .02, m.vent, .38, .75 + i * .07, .415);
    [[-.65, .3], [-.1, .3], [-.65, -.3], [.65, -.4], [.65, .35]].forEach(([x, z]) => cyl(g, .05, .08, m.borracha, x, 0, z, 10));
    placa(g, id, -.38, .6, .395, 0, .5, .15);
    box(g, .04, 1.14, .92, m.htAzul, .79, .07, -.04); box(g, .8, .05, .92, m.htAzul, .38, 1.2, -.04); // lateral e topo azuis
    return { g, seg: sinaleiro(g, .6, 1.2, -.3), topo: 2.2, r: 1.1 };
  }
  function jateadora(id) {
    const g = new THREE.Group();
    [[-.75, -.6], [.75, -.6], [-.75, .6], [.75, .6]].forEach(([x, z]) => box(g, .12, 3.6, .12, m.aco, x, 0, z));
    box(g, 1.6, .9, 1.3, m.aco, 0, 2.7, 0); box(g, .9, .8, .9, m.acoEsc, -.15, 3.6, 0); hcyl(g, .22, .5, m.verde, .45, 4.0, 0, 'z');
    box(g, 1.5, 1.1, .1, m.laranjaJato, 0, 1.3, .68); box(g, 1.5, .12, .55, m.laranjaJato, 0, 1.22, .92);
    box(g, .06, 1.6, .06, m.cromo, 0, 2.3, .75); cyl(g, .07, .6, m.cromo, 0, 2.9, .75, 10);
    box(g, 1.15, .4, .65, m.preto, 0, .62, .62); box(g, 1.2, .62, .8, m.aco, 0, 0, .62);
    cyl(g, .3, 5.4, m.duto, .55, 0, -.95); hcyl(g, .3, 1.1, m.duto, .55, 5.1, -.4, 'z');
    box(g, .55, 1.9, .4, m.painel, 1.25, 0, .35); [0, 1, 2].forEach((i) => { cyl(g, .035, .03, i ? m.verde : m.vermelho, 1.13 + i * .12, 1.5, .555, 10).rotation.x = Math.PI / 2; });
    placa(g, id, 1.25, 1.2, .555, 0, .48, .14);
    return { g, seg: sinaleiro(g, 1.25, 1.9, .35), topo: 5.8, r: 1.8 };
  }
  function polaris(id) {
    const g = new THREE.Group();
    box(g, 2.4, .06, 2, m.bandeja, 0, 0, 0);
    box(g, 2.2, .9, 1.7, m.lkBranco2, 0, .06, 0); box(g, 2.2, 1.25, 1.7, m.lkBranco, 0, .96, 0); box(g, 1.05, .75, .03, m.vidro, -.25, 1.18, .86);
    box(g, .05, .6, .05, m.cromo, .33, 1.25, .9); box(g, 1.6, .25, .4, m.acoEsc, -.1, .25, 1.05);
    box(g, .8, 1.4, .8, m.lkBranco, -.3, 2.21, -.4); cyl(g, .26, .4, m.vermelho, -.3, 3.61, -.4);
    box(g, .62, .9, .32, m.painel, .88, 1.1, .98); box(g, .38, .26, .02, m.tela, .88, 1.68, 1.15);
    placa(g, id, -.25, 2.0, .86, 0, .62, .18);
    return { g, seg: sinaleiro(g, .55, 2.21, -.5), topo: 4.2, r: 1.9 };
  }
  function quadroSetores(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); S.add(g); box(g, .4, .04, .4, m.preto, 0, 0, 0); box(g, .06, 2.1, .06, m.preto, 0, 0, 0);
    [['MANUTENÇÃO', '#1b1c1f'], ['PROCESSO', '#e8b818'], ['FERRAMENTARIA', '#2e8a5a'], ['PRODUÇÃO', '#1f5aa8']].forEach(([t, c], i) => placa(g, t, 0, 1.95 - i * .26, .04, 0, .62, .2, c, c === '#e8b818' ? '#1a1500' : '#fff'));
  }
  function carrinho(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; S.add(g);
    box(g, .85, .82, .5, m.carrinho, 0, .12, 0); for (let i = 0; i < 4; i++) box(g, .8, .015, .02, m.preto, 0, .3 + i * .17, .26); box(g, .04, .04, .42, m.cromo, .47, .85, 0);
    [[-.35, -.18], [.35, -.18], [-.35, .18], [.35, .18]].forEach(([a, b]) => cyl(g, .06, .12, m.borracha, a, 0, b, 10));
  }
  function cacamba(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); S.add(g);
    box(g, 1.5, .06, 1, m.aco, 0, .12, 0); box(g, 1.5, .75, .05, m.aco, 0, .12, .48); box(g, 1.5, .75, .05, m.aco, 0, .12, -.48); box(g, .05, .75, 1, m.aco, .73, .12, 0); box(g, .05, .75, 1, m.aco, -.73, .12, 0);
    box(g, 1.4, .55, .9, m.cavaco, 0, .18, 0); box(g, 1.5, .1, .08, m.amarelo, 0, .75, .5); [-.6, .6].forEach((a) => box(g, .12, .12, 1, m.acoEsc, a, 0, 0));
  }
  function palete(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); S.add(g);
    [-.5, 0, .5].forEach((a) => box(g, .1, .1, 1, m.madeira, a, 0, 0)); for (let i = 0; i < 6; i++) box(g, 1.2, .03, .12, m.madeira, 0, .1, -.43 + i * .172);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < (i + j === 2 ? 2 : 3); k++) box(g, .56, .28, .46, m.caixaAzul, -.29 + i * .58, .13 + k * .3, -.24 + j * .48);
  }

  // tambores de óleo (verdes, 200 L) em palete — como ficam ao lado das máquinas
  function tambores(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    box(g, 1.3, .14, 1.05, m.paletePl, 0, 0, 0);
    [-.32, .32].forEach((dx) => {
      cyl(g, .29, .88, m.tambor, dx, .14, 0, 24);
      [.36, .72].forEach((y) => cyl(g, .302, .04, m.tamborAro, dx, .14 + y, 0, 24));
      cyl(g, .3, .03, m.tamborAro, dx, .99, 0, 24);
      cyl(g, .045, .03, m.cromo, dx + .12, 1.02, .08, 10);
      box(g, .26, .2, .01, m.etiqueta, dx, .5, .289);
    });
  }
  // extintor com o quadrado vermelho no piso
  function extintor(x, z) {
    const q = new THREE.Mesh(gBox(1, .02, 1), m.pisoVerm); q.position.set(x, .015, z); q.receiveShadow = true; S.add(q);
    const g = new THREE.Group(); g.position.set(x, 0, z); S.add(g);
    cyl(g, .11, .6, m.extintor, 0, .03, 0, 16); domo(g, .11, m.extintor, 0, .63, 0); cyl(g, .03, .08, m.preto, 0, .73, 0, 8);
    mangueira(g, [[.03, .78, 0], [.15, .62, .05], [.13, .22, .1]], .018, m.preto);
  }
  // guarda-corpo amarelo de tubo, separando a célula do corredor
  function corrimao(x1, x2, z) {
    const g = new THREE.Group(); S.add(g);
    const n = Math.max(1, Math.round((x2 - x1) / 1.7));
    for (let i = 0; i <= n; i++) cyl(g, .045, 1.1, m.amarelo, x1 + (x2 - x1) * i / n, 0, z, 10);
    [1.08, .55].forEach((y) => hcyl(g, .035, +(x2 - x1).toFixed(2), m.amarelo, (x1 + x2) / 2, y, z));
  }
  // parede do galpão (só a face de dentro: vista de fora ela some e não atrapalha a câmera)
  // como nas fotos: placas de concreto claro, venezianas, pilares de concreto, viga, tubulação vermelha (sprinkler) e azul,
  // luminárias nos pilares, eletrocalha no alto e, na parede do fundo, a passarela com guarda-corpo
  const H_PAR = 16.2;
  m.concreto = mat(0xd3d3cd, { roughness: .95 }); m.tuboVerm = mat(0xb8302a, { roughness: .4, metalness: .2 }); m.tuboAzul = mat(0x2f62b0, { roughness: .4, metalness: .2 });
  const texPlacas = textura(256, 256, (x, w, h) => {
    x.fillStyle = '#e1e1dc'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    x.fillStyle = 'rgba(115,118,116,.55)'; for (let i = 0; i < h; i += 64) x.fillRect(0, i, w, 3);
    x.fillStyle = 'rgba(115,118,116,.25)'; x.fillRect(0, 0, 2, h);
  }, true);
  const texVenez = textura(128, 128, (x, w, h) => {
    x.fillStyle = '#4d5157'; x.fillRect(0, 0, w, h);
    for (let i = 3; i < h - 3; i += 11) { const gr = x.createLinearGradient(0, i, 0, i + 9); gr.addColorStop(0, '#eef1f3'); gr.addColorStop(1, '#9aa1a8'); x.fillStyle = gr; x.fillRect(0, i + 1, w, 8); }
    x.fillStyle = '#7d838a'; x.fillRect(0, 0, 5, h); x.fillRect(w - 5, 0, 5, h); x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3);
  }, true);
  const venezMt = guarda(new THREE.MeshStandardMaterial({ map: texVenez, emissive: lin(0xffffff), emissiveMap: texVenez, emissiveIntensity: .3, roughness: .5 }));
  const texGuarda = textura(128, 64, (x, w, h) => { x.fillStyle = '#8b9096'; x.fillRect(0, 1, w, 6); x.fillRect(0, 29, w, 5); x.fillRect(0, h - 7, w, 6); x.fillRect(0, 0, 6, h); }, true);
  const guardaMt = guarda(new THREE.MeshStandardMaterial({ map: texGuarda, transparent: true, alphaTest: .4, side: THREE.DoubleSide, metalness: .4, roughness: .5 }));
  const luzParMt = guarda(new THREE.MeshBasicMaterial({ color: lin(0xfffbf0), toneMapped: false }));
  function parede(comp, x, z, ry, pilares = true, passarela = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    const pl = (w, h, y, mt, dz, geo) => { const o = new THREE.Mesh(geo || guarda(new THREE.PlaneGeometry(w, h)), mt); o.position.set(0, y, dz); o.receiveShadow = true; g.add(o); return o; };
    const tp = guarda(texPlacas.clone()); tp.needsUpdate = true; tp.repeat.set(comp / 4, H_PAR / 4);
    pl(comp, H_PAR, H_PAR / 2, guarda(new THREE.MeshStandardMaterial({ map: tp, roughness: .92 })), 0); pl(comp, 1.1, .55, m.rodape, .01);
    pl(comp, 2.6, 7.3, venezMt, .01, planoUV(comp, 2.6, comp / 2.5, 1));            // venezianas
    pl(comp, 1.3, 12.6, venezMt, .01, planoUV(comp, 1.3, comp / 2.5, .5));           // faixa alta de venezianas
    if (!pilares) return g;
    const vaos = Math.round(comp / 10);
    box(g, comp, .6, .5, m.concreto, 0, 9.2, .25);                                    // viga de concreto
    for (let i = 0; i <= vaos; i++) {
      const px = -comp / 2 + i * comp / vaos;
      const o = box(g, .95, H_PAR, .75, m.concreto, px, 0, .37); o.castShadow = false;
      if (i % 2 === 1) {                                                              // luminária no pilar (braço + prato)
        box(g, .08, .08, 1.4, m.acoEsc, px, 7.6, 1.4); cyl(g, .45, .14, m.luminaria, px, 7.32, 2.1, 16);
        const l = new THREE.Mesh(gCyl(.38, .02, 16), luzParMt); l.position.set(px, 7.3, 2.1); g.add(l);
      }
      if (i % 3 === 0) cyl(g, .07, 11.3, m.tuboVerm, px + .72, .6, .3, 10);           // descida do sprinkler
      if (i % 4 === 2) cyl(g, .09, 10.8, m.tuboAzul, px - .78, 1, .35, 10);           // descida da tubulação azul
    }
    hcyl(g, .08, comp, m.tuboVerm, 0, 11.9, .3); hcyl(g, .1, comp, m.tuboAzul, 0, 11.35, .45);
    box(g, comp, .12, .5, m.grade, 0, 13.7, .5);                                        // eletrocalha
    if (passarela) {
      // passarela em trechos (interrompida onde há forno torre encostado na parede); passarela = true ou lista de vãos [x0, x1]
      const vaosP = (Array.isArray(passarela) ? passarela : []).map(([a, b]) => [a - x, b - x]).sort((p, q) => p[0] - q[0]);
      const trechos = []; let a = -comp / 2; vaosP.forEach(([v0, v1]) => { if (v0 > a) trechos.push([a, v0]); a = Math.max(a, v1); }); if (a < comp / 2) trechos.push([a, comp / 2]);
      trechos.forEach(([t0, t1]) => {
        const w = t1 - t0, cx = (t0 + t1) / 2; if (w < .5) return;
        box(g, w, .14, 1.1, m.grade, cx, 4.9, 1.3); box(g, w, .3, .12, m.acoEsc, cx, 4.75, 1.85);
        const gp = new THREE.Mesh(planoUV(w, 1.1, w / 2, 1), guardaMt); gp.position.set(cx, 5.6, 1.86); g.add(gp);
      });
      hcyl(g, .07, comp, m.tuboVerm, 0, 6.6, .3);
    }
    g.traverse((o) => { o.castShadow = false; });
    return g;
  }
  // extintor em carreta, com o quadrado vermelho e a faixa amarela no piso
  function carretaExt(x, z, ry = 0) {
    const q = new THREE.Mesh(gBox(1.5, .02, 1.5), m.pisoVerm); q.position.set(x, .015, z); S.add(q);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    cyl(g, .2, 1.1, m.extintor, 0, .25, 0, 16); domo(g, .2, m.extintor, 0, 1.35, 0); cyl(g, .04, .15, m.preto, 0, 1.52, 0, 8);
    [-.32, .32].forEach((a) => hcyl(g, .22, .08, m.borracha, a, .22, .12, 'x')); hcyl(g, .03, .7, m.acoEsc, 0, .22, .12, 'x');
    box(g, .05, 1.3, .05, m.extintor, -.22, .2, -.24); box(g, .05, 1.3, .05, m.extintor, .22, .2, -.24); box(g, .5, .05, .05, m.extintor, 0, 1.5, -.24);
    mangueira(g, [[0, 1.5, .1], [.3, 1.2, .3], [.25, .6, .32], [.1, .4, .26]], .03, m.preto);
  }
  // painéis elétricos cinza encostados na parede
  function paineis(g, x0, n) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * .82;
      box(g, .8, 2.2, .6, m.painelEl, x, 0, .55); box(g, .03, .45, .04, m.acoEsc, x + .28, 1.05, .87); box(g, .46, .14, .01, m.vent, x, 1.85, .855); box(g, .46, .14, .01, m.vent, x, .35, .855);
    }
  }

  // central de desmoldante: tanques, bomba, tubulação laranja, grade e placa azul (como no galpão)
  function centralDesmoldante(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    box(g, 5.6, .08, 1.8, m.bandeja, 0, 0, 0);
    [-1.9, -.7].forEach((tx) => { box(g, 1.05, 1.15, 1.05, m.tanqueBranco, tx, .08, -.2); for (let k = 0; k < 3; k++) box(g, 1.08, .03, 1.08, m.aco, tx, .4 + k * .35, -.2); cyl(g, .12, .1, m.azulPlaca, tx, 1.23, -.2, 12); });
    cyl(g, .42, 1.3, m.htAzul, .6, .08, -.25, 20); domo(g, .42, m.htAzul, .6, 1.38, -.25);
    box(g, .7, .45, .45, m.acoEsc, 1.7, .08, -.3); hcyl(g, .16, .4, m.htAzul, 1.7, .5, -.3); // bomba
    box(g, .65, .9, .25, m.painel, 2.35, .7, .45); [[-.15, 1.35], [.15, 1.35]].forEach(([dx, yy]) => { hcyl(g, .08, .05, m.branco, 2.35 + dx, yy, .6, 'z'); }); // painel com manômetros
    hcyl(g, .06, 5, m.laranja, 0, 2.15, -.75); [-1.9, -.7, .6, 1.7].forEach((tx) => box(g, .07, .9, .07, m.laranja, tx, 1.25, -.75));
    mangueira(g, [[2.6, 1.9, -.7], [2.8, 1.2, -.4], [2.75, .6, .1]], .04, m.preto);
    cerca(g, [[-2.75, .85], [2.75, .85]], 1.5); cerca(g, [[-2.75, -.95], [-2.75, .85]], 1.5);
    [-1.2, 1.2].forEach((px) => box(g, .07, 2.35, .07, m.acoEsc, px, 0, .95));
    placa(g, 'DESMOLDANTE', 0, 2.05, .99, 0, 2.6, .5, '#1d3f8a');
  }
  // quadro de gestão à vista sobre rodinhas
  const texGestao = textura(256, 256, (x, w, h) => {
    x.fillStyle = '#f4f5f2'; x.fillRect(0, 0, w, h); x.fillStyle = '#1d3f8a'; x.fillRect(0, 0, w, 34);
    x.fillStyle = '#fff'; x.font = '700 22px "Barlow Condensed","Arial Narrow",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GESTÃO À VISTA', w / 2, 18);
    for (let c = 0; c < 3; c++) for (let l = 0; l < 3; l++) {
      const px = 12 + c * 82, py = 46 + l * 68; x.fillStyle = '#fff'; x.fillRect(px, py, 72, 60); x.strokeStyle = '#c9ccd0'; x.strokeRect(px, py, 72, 60);
      x.fillStyle = '#9aa1a8'; for (let k = 0; k < 6; k++) x.fillRect(px + 6, py + 8 + k * 8, 40 + ((c + l + k) % 3) * 8, 3);
    }
  });
  const gestaoMt = guarda(new THREE.MeshStandardMaterial({ map: texGestao, roughness: .6 }));
  function quadroGestao(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    [-.66, .66].forEach((px) => { box(g, .05, 2, .05, m.aco, px, .12, 0); box(g, .08, .05, .6, m.aco, px, .1, 0); [-.26, .26].forEach((pz) => cyl(g, .05, .08, m.borracha, px, 0, pz, 10)); });
    box(g, 1.38, 1.12, .04, m.aco, 0, .9, 0);
    const q = new THREE.Mesh(guarda(new THREE.PlaneGeometry(1.3, 1.05)), gestaoMt); q.position.set(0, 1.46, .025); g.add(q);
  }
  // carrinho de inox basculante (cavaco/peças), com rodízios
  function carrinhoInox(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    box(g, 1.25, .07, .85, m.acoEsc, 0, .16, 0); [[-.5, -.32], [.5, -.32], [-.5, .32], [.5, .32]].forEach(([a, b]) => cyl(g, .07, .14, m.borracha, a, 0, b, 10));
    box(g, 1.15, .62, .8, m.inox, -.05, .23, 0); box(g, 1.03, .02, .68, m.vent, -.05, .845, 0); // boca aberta
    const fr = new THREE.Mesh(gBox(.5, .7, .8), m.inox); fr.position.set(.55, .62, 0); fr.rotation.z = -.55; fr.castShadow = true; g.add(fr);
    box(g, .04, .04, .7, m.cromo, -.68, .95, 0); box(g, .04, .5, .04, m.cromo, -.68, .5, .32); box(g, .04, .5, .04, m.cromo, -.68, .5, -.32);
  }

  // ---------- fornos (fundo do galpão, atrás das máquinas 03, 02 e 13) ----------
  const rotulos = []; // placas amarelas grandes (fornos), desenhadas junto com as das células
  const torres = [];
  function fornoTorre(x, z, n) {
    const g = new THREE.Group(); g.position.set(x, 0, z); S.add(g); torres.push({ g, n, x, z });
    box(g, 6.4, .3, 5.2, m.acoEsc, 0, 0, 0);                                      // base
    box(g, 5.6, 3.6, 4.4, m.aco, 0, .3, .2);                                      // câmara de fusão
    for (let i = 0; i < 4; i++) box(g, 1.25, 2.4, .05, m.amarelo, -2.05 + i * 1.37, .9, 2.43); // painéis amarelos da frente
    box(g, 5.7, .12, 4.5, m.acoEsc, 0, 3.9, .2);
    for (let i = 0; i < 5; i++) box(g, .1, 3.6, .1, m.acoEsc, -2.8 + i * 1.4, .3, 2.45);   // nervuras
    box(g, 3, 6.4, 3, m.aco, -.6, 4, -.6);                                        // torre de carga
    for (let k = 0; k < 4; k++) box(g, 3.06, .1, 3.06, m.acoEsc, -.6, 4.8 + k * 1.5, -.6);
    box(g, 6.2, .16, 3.2, m.amarelo, .2, 4.02, 1.3); guardaCorpo(g, 6.2, 3.2, .2, 4.18, 1.3); // plataforma
    escada(g, 4, 3.45, 2.6, 'z');
    for (let k = 0; k < 7; k++) { const t = malhaDe(gTor(.42, .025), m.amarelo, g, false); t.rotation.x = Math.PI / 2; t.position.set(1.2, 6 + k * .62, -1.2); } // escada de gaiola
    box(g, .05, 4.4, .05, m.amarelo, .85, 4.2, -1.2); box(g, .05, 4.4, .05, m.amarelo, 1.55, 4.2, -1.2);
    // queimador e tubulação de gás
    hcyl(g, .75, 1.2, m.painel, 3.35, 2.3, .6); hcyl(g, .55, .2, m.acoEsc, 4, 2.3, .6);
    hcyl(g, .09, 3.4, m.amarelo, 1.6, 2.1, 2.7); box(g, .09, 1.9, .09, m.amarelo, 3.3, .2, 2.7);
    // duto de exaustão até o alto
    cyl(g, .55, 2.6, m.duto, -.6, 10.4, -.6); const d = new THREE.Mesh(gBox(1.1, 1.1, 5), m.duto); d.position.set(-.6, 13.3, -3); d.rotation.x = -.5; d.castShadow = true; g.add(d);
    // elevador de carga (gaiola amarela com tela)
    box(g, 1.8, .1, 1.8, m.acoEsc, -4.1, 0, -.4);
    [[-4.95, -1.25], [-3.25, -1.25], [-4.95, .45], [-3.25, .45]].forEach(([a, b]) => box(g, .09, 7.6, .09, m.preto, a, 0, b));
    [-4.1].forEach((cx2) => { for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(planoUV(1.7, 2.3, 4, 5.5), m.malha); t.position.set(cx2, 1.3 + k * 2.5, .46); g.add(t); box(g, 1.75, .07, .07, m.amarelo, cx2, .15 + k * 2.5, .47); } });
    box(g, .6, .9, .3, m.painel, 2.3, .9, 2.75); box(g, .2, .2, .03, m.vermelho, 2.3, 1.45, 2.91);  // painel de comando
    placa(g, 'FORNO TORRE ' + n, 0, 3.1, 2.47, 0, 1.6, .4);
    rotulos.push({ txt: 'FORNO TORRE ' + n, x: x, y: 12.2, z: z + .5 });
  }
  function fornoBarril(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    box(g, 3.4, .5, 2.2, m.preto, 0, 0, 0); box(g, .5, 1.2, 1.6, m.acoEsc, -1.3, .5, 0); box(g, .5, 1.2, 1.6, m.acoEsc, 1.3, .5, 0);
    hcyl(g, 1.15, 2.9, m.termoCinza, 0, 1.75, 0); hcyl(g, 1.2, .2, m.acoEsc, -1.2, 1.75, 0); hcyl(g, 1.2, .2, m.acoEsc, 1.2, 1.75, 0);
    const boca = malhaDe(gCyl(.62, .06, 24), guarda(new THREE.MeshBasicMaterial({ color: lin(0xff5a1f), toneMapped: false })), g, false); boca.rotation.z = Math.PI / 2; boca.position.set(1.48, 1.75, 0);
    hcyl(g, .82, .12, m.acoEsc, 1.47, 1.75, 0);
    box(g, 1.2, .9, 1, m.aco, 0, 3.05, 0); cyl(g, .3, 2.5, m.duto, 0, 3.95, 0);                     // coifa
    cyl(g, .55, 1, m.aco, 2.6, 0, 1.4); box(g, .08, 1.3, .08, m.acoEsc, 2.2, 0, 1.4);                 // panela de vazamento
    // palete de lingotes de alumínio
    box(g, 1.2, .12, 1, m.madeira, -.2, 0, 2.2);
    for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) box(g, 1.1, .12, .3, m.cromo, -.2, .12 + k * .13, 1.85 + j * .34);
    rotulos.push({ txt: 'FORNO BARRIL', x, y: 6.2, z });
  }
  // divisão entre os barracões: pilares, viga alta e parede embaixo, com passagem no corredor da frente (07 → 12)
  function divisao(x, z0, z1) {
    // só colunas (sem muro), a cada 9 m e fora dos corredores, junto da linha das células 13, 10 e 09
    const g = new THREE.Group(); S.add(g);
    [z0 + .4, z1 - .4].forEach((zz) => box(g, .8, 11.4, .8, m.concreto, x, 0, zz));
    for (let zz = z0 + 4.5; zz < z1 - 1; zz += 9) box(g, .8, 11.4, .8, m.concreto, x, 0, zz);
    box(g, .7, 1.3, z1 - z0, m.concreto, x, 9.9, (z0 + z1) / 2);                                         // viga alta
    box(g, .3, .18, z1 - z0, m.acoEsc, x - .25, 11.2, (z0 + z1) / 2); box(g, .3, .18, z1 - z0, m.acoEsc, x + .25, 11.2, (z0 + z1) / 2); // trilhos da ponte
  }
  // área de moldes (no canto do fundo do barracão 2): moldes, pórtico amarelo com talha, tambores no cavalete, caixas e quadro
  const texTelaFab = textura(256, 144, (x, w, h) => {
    x.fillStyle = '#0f1620'; x.fillRect(0, 0, w, h); const cores = ['#e8433a', '#f08a2c', '#f2c230', '#38b36b', '#2f7fd8', '#8a4fd0'];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) { x.fillStyle = cores[(r + c * 2) % 6]; x.globalAlpha = .75 + ((r * 7 + c * 3) % 5) * .05; x.fillRect(6 + c * 31, 8 + r * 22, 28, 19); }
    x.globalAlpha = 1;
  });
  const telaFabMt = guarda(new THREE.MeshStandardMaterial({ map: texTelaFab, emissive: lin(0xffffff), emissiveMap: texTelaFab, emissiveIntensity: .85, roughness: .3 }));
  const moldeMt = mat(0x3b3e43, { metalness: .55, roughness: .45 }), papelao = mat(0xb08a5a, { roughness: .9 });
  function molde(g, x, z, w, h, d, ry = 0) {
    const mg = new THREE.Group(); mg.position.set(x, 0, z); mg.rotation.y = ry; g.add(mg);
    box(mg, w, h, d, moldeMt, 0, 0, 0); box(mg, w + .06, .08, d + .06, m.acoEsc, 0, h * .5, 0);   // duas metades
    for (let i = 0; i < 6; i++) cyl(mg, .05, .06, m.cromo, -w / 2 + .3 + (i % 3) * (w - .6) / 2, h * .25 + Math.floor(i / 3) * h * .45, d / 2 + .01, 8).rotation.x = Math.PI / 2; // engates
    box(mg, .5, .4, .4, m.acoEsc, w * .2, h, 0); hcyl(mg, .1, .6, m.cromo, w * .2, h + .55, 0, 'z');            // cilindro hidráulico
    mangueira(mg, [[-w * .3, h, d * .3], [-w * .1, h + .5, d * .4], [w * .1, h + .1, d * .45]], .035, m.borracha);
    mangueira(mg, [[-w * .4, h * .6, d / 2], [-w * .45, h * .2, d / 2 + .4], [-w * .2, .05, d / 2 + .6]], .03, m.mangAzul);
  }
  function areaMoldes(cx, cz, ry = 0) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; S.add(g);
    // moldes em duas fileiras
    [[-5.6, -2.6, 2.6, 2, 1.8], [-2.4, -2.6, 2.2, 2.3, 1.7], [.9, -2.6, 2.4, 1.8, 1.8], [-5.4, 1.4, 2.2, 1.7, 1.6], [-2.2, 1.4, 2.6, 2.1, 1.9], [1.1, 1.4, 2, 1.6, 1.6]]
      .forEach(([x, z, w, h, d], i) => molde(g, x, z, w, h, d, (i % 2) * .08));
    // pórtico amarelo com talha, sobre os moldes
    [-7.4, 3.2].forEach((x) => { box(g, .3, 5.4, .3, m.amarelo, x, 0, -3.6); box(g, .3, 5.4, .3, m.amarelo, x, 0, 2.6); box(g, .3, .3, 6.5, m.amarelo, x, 5.4, -.5); box(g, .2, .2, 6.6, m.amarelo, x, .1, -.5); });
    box(g, 10.9, .45, .35, m.amarelo, -2.1, 5.75, -.5); box(g, .7, .5, .6, m.acoEsc, -2.6, 5.25, -.5); box(g, .03, 2.4, .03, m.preto, -2.6, 2.85, -.5); box(g, .22, .3, .15, m.amarelo, -2.6, 2.6, -.5);
    // cavalete com tambores verdes deitados
    box(g, 2.6, .9, .9, m.madeira, 6.2, 0, -4.6); [-.62, .62].forEach((dx) => { hcyl(g, .29, .88, m.tambor, 6.2 + dx, 1.22, -4.6, 'z'); });
    box(g, .25, .4, .06, m.etiqueta, 5.58, 1.3, -4.13);
    // caixas de papelão, caixas azuis, galões e o quadro branco
    [[6.4, -1.2], [7.4, -1.2], [6.4, -.2]].forEach(([x, z]) => box(g, .95, .7, .95, papelao, x, 0, z)); box(g, .95, .7, .95, papelao, 6.4, .7, -1.2);
    box(g, 1.2, .1, 1, m.madeira, 6.6, 0, 2.2); box(g, .55, .3, .4, m.caixaAzul, 6.4, .1, 2.0); box(g, .55, .3, .4, m.caixaAzul, 7, .1, 2.0); cyl(g, .18, .45, m.branco, 6.2, .1, 2.5, 12); cyl(g, .18, .45, m.branco, 6.7, .1, 2.6, 12);
    box(g, 1.3, 1.6, .05, m.branco, 4.6, .9, 4.4); [-.6, .6].forEach((dx) => box(g, .05, 2.5, .05, m.aco, 4.6 + dx, 0, 4.4));
  }
  // ponte rolante (viga amarela com o carro do guincho), uma em cada barracão
  function ponteRolante(x0, x1, z) {
    const g = new THREE.Group(); S.add(g); const vao = x1 - x0, mx = (x0 + x1) / 2;
    box(g, vao - .6, 1.1, .9, m.amarelo, mx, 11.4, z); box(g, vao - .6, .12, 1.2, m.amarelo, mx, 12.5, z);
    [x0 + .5, x1 - .5].forEach((xx) => box(g, .8, .7, 3.2, m.amarelo, xx, 11.35, z));                  // cabeceiras
    box(g, 1.6, 1, 1.9, m.acoEsc, mx, 12.4, z); box(g, .9, .7, 1.1, m.preto, mx, 11.2, z + .7);          // carro e talha
    box(g, .04, 4.5, .04, m.preto, mx, 6.8, z + .7); box(g, .3, .45, .2, m.amarelo, mx, 6.4, z + .7);    // cabo e gancho
    placa(g, 'CSM', mx + vao * .22, 11.95, z + .46, 0, 1.6, .5, '#1b1c1f', '#ffc20e');
  }

  // ---------- galpão ----------
  const PASSO_X = 22, PASSO_Z = 18, CEL_W = 20, CEL_D = 14, COLS = Math.max(...PLANTA.map((l) => l.length)), ROWS = PLANTA.length;
  const centro = (c, r) => [(c - (COLS - 1) / 2) * PASSO_X, (r - (ROWS - 1) / 2) * PASSO_Z];
  const X_DIV = 1 - .45;                                                // colunas da divisão, junto da linha das células 13, 10 e 09
  const PISO_W = COLS * PASSO_X + 16, PISO_D = ROWS * PASSO_Z + 16;
  texPiso.repeat.set(PISO_W / 8, PISO_D / 8);
  const chao = new THREE.Mesh(guarda(new THREE.PlaneGeometry(PISO_W, PISO_D)), guarda(new THREE.MeshStandardMaterial({ map: texPiso, roughness: .82, metalness: .05 })));
  chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; S.add(chao);
  const texFora = guarda(texPiso.clone()); texFora.needsUpdate = true; texFora.repeat.set(60, 60);
  const fora = new THREE.Mesh(guarda(new THREE.PlaneGeometry(480, 480)), guarda(new THREE.MeshStandardMaterial({ map: texFora, roughness: .88, color: lin(0x9a9da2) })));
  fora.rotation.x = -Math.PI / 2; fora.position.y = -.02; fora.receiveShadow = true; S.add(fora);
  const faixa = (w, d, x, z, mt, y = .012) => { const o = new THREE.Mesh(gBox(w, .02, d), mt); o.position.set(x, y, z); o.receiveShadow = true; S.add(o); };
  const linhaAm = mat(0xe8b818, { roughness: .55 }), corredorMt = mat(0x55595e, { roughness: .22, metalness: .08 }), linhaBr = mat(0xe6e6e0, { roughness: .6 }), zonaMt = mat(0x55585d, { roughness: .7 });
  CORREDOR_APOS.forEach((r) => {
    const z = centro(0, r)[1] + PASSO_Z / 2, larg = PASSO_Z - CEL_D; faixa(COLS * PASSO_X, larg - .4, 0, z, corredorMt, .006);
    faixa(COLS * PASSO_X, .24, 0, z - larg / 2 + .3, linhaAm); faixa(COLS * PASSO_X, .24, 0, z + larg / 2 - .3, linhaAm);
  });
  // demais corredores: trajetos com a mesma largura dos corredores centrais (4 m), cinza e com faixa amarela nas bordas
  // (as faixas param nos cruzamentos para não fechar a passagem)
  const corredoresExtra = (() => {
    const L = PASSO_Z - CEL_D, meio = L / 2;                                                // 4 m
    const zCentrais = CORREDOR_APOS.map((r) => centro(0, r)[1] + PASSO_Z / 2);
    const xCel = (c, lado) => centro(c, 0)[0] + lado * CEL_W / 2;
    const zFornos = centro(0, 0)[1] - CEL_D / 2 - meio - .1;                               // na frente dos fornos (tracejado)
    const zTorre3 = centro(0, 0)[1] + PASSO_Z / 2;                                         // entre a linha da 02 / forno torre 3 e a linha das células 03, 04 e 13
    const xEsq = xCel(0, -1) - meio - .9, xDir = xCel(3, 1) + meio + .9;                    // laterais, encostadas no fim dos corredores centrais
    const xT3 = xCel(2, 1) - meio + 1.8;                                                   // entre o forno torre 3 e a manutenção
    const zFim = zCentrais.at(-1) + meio - .2;
    const linhas = [];                                                                      // [eixo, fixo, ini, fim]
    const segs = (ini, fim, cortes) => { let a = ini; const out = []; cortes.filter(([c0, c1]) => c1 > ini && c0 < fim).sort((p, q) => p[0] - q[0]).forEach(([c0, c1]) => { if (c0 > a) out.push([a, c0]); a = Math.max(a, c1); }); if (fim > a) out.push([a, fim]); return out; };
    const caminhoX = (z, x0, x1, cortesX = []) => { faixa(x1 - x0, L - .4, (x0 + x1) / 2, z, corredorMt, .005); [z - meio + .3, z + meio - .3].forEach((zz) => segs(x0, x1, cortesX).forEach(([a, b]) => linhas.push(['x', zz, a, b]))); };
    const caminhoZ = (x, z0, z1, cortesZ = []) => { faixa(L - .4, z1 - z0, x, (z0 + z1) / 2, corredorMt, .005); [x - meio + .3, x + meio - .3].forEach((xx) => segs(z0, z1, cortesZ).forEach(([a, b]) => linhas.push(['z', xx, a, b]))); };
    const vao = (x0, x1, z0, z1) => faixa(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, corredorMt, .005);   // entre colunas de células (2 m)
    const cortesCentrais = zCentrais.map((z) => [z - meio, z + meio]);
    caminhoX(zFornos, -PISO_W / 2 + .7, PASSO_X + 1, [[xEsq - meio, xEsq + meio], [xT3 - meio, xT3 + meio]]);   // frente dos fornos (até a manutenção)
    caminhoZ(xEsq, zFornos - meio, zFim, [[zFornos - meio, zFornos + meio], [zTorre3 - meio, zTorre3 + meio], ...cortesCentrais]); // lateral esquerda
    caminhoZ(xDir, zCentrais[0] - meio, zFim, cortesCentrais);                                                  // lateral direita
    caminhoZ(xT3, zFornos - meio, zTorre3 + meio, [[zFornos - meio, zFornos + meio], [zTorre3 - meio, zTorre3 + meio]]); // ao lado do forno torre 3
    caminhoX(zTorre3, xEsq - meio, PASSO_X + 1, [[xEsq - meio, xEsq + meio], [xCel(0, 1), xCel(1, -1)], [xT3 - meio, xT3 + meio]]); // da parede até a manutenção, passando embaixo da 02 e do forno torre 3
    vao(xCel(0, 1) + .2, xCel(1, -1) - .2, zFornos + meio - .2, zFim);                                           // entre 03/05/07 e 02/04/06/08 (e ao lado da 02)
    vao(xCel(2, 1) + .2, xCel(3, -1) - .2, zTorre3 + meio - .2, zFim);                                           // entre 13/10/09 e 11/12
    linhas.forEach(([e, f, a, b]) => (e === 'x' ? faixa(b - a, .24, (a + b) / 2, f, linhaAm) : faixa(.24, b - a, f, (a + b) / 2, linhaAm)));
    return { zFornos, zTorre3 };
  })();


  // paredes do fundo e da esquerda (a câmera sempre olha da frente/direita), com painéis elétricos
  const pFundo = parede(PISO_W + 2, 0, -PISO_D / 2, 0, true, [[centro(0, 0)[0] - 5.4, centro(0, 0)[0] + 2], [centro(1, 0)[0] - 5.4, centro(1, 0)[0] + 2]]); paineis(pFundo, -50, 7); paineis(pFundo, 10, 9);
  carretaExt(-PISO_W / 2 + 1.4, -2, Math.PI / 2); carretaExt(-PISO_W / 2 + 1.4, 24, Math.PI / 2);
  const pEsq = parede(PISO_D + 2, -PISO_W / 2, 0, Math.PI / 2); paineis(pEsq, -12, 6);
  parede(PISO_D + 2, PISO_W / 2, 0, -Math.PI / 2, false); parede(PISO_W + 2, 0, PISO_D / 2, Math.PI, false);
  centralDesmoldante(centro(2, 3)[0] + PASSO_X / 2, PISO_D / 2 - 3.2, Math.PI); // na frente das máquinas 09 e 12
  // fornos no fundo do barracão 1, junto da parede: torre 1 atrás da 03, torre 2 atrás da 02 com o barril à direita; a torre 3 fica atrás da 13
  const Z_FORNO = -PISO_D / 2 + 3;
  fornoTorre(centro(0, 0)[0], Z_FORNO, 1);
  fornoTorre(centro(1, 0)[0], Z_FORNO, 2);
  fornoBarril(centro(1, 0)[0] + 7, -PISO_D / 2 + 3.2, 0);
  fornoTorre(centro(2, 0)[0], centro(2, 0)[1] - 3.5, 3);
  divisao(X_DIV, -PISO_D / 2, PISO_D / 2);
  ponteRolante(-PISO_W / 2, X_DIV - .5, -38.6); ponteRolante(X_DIV + .5, PISO_W / 2, -38.6);
  // ---------- fundo do barracão 2 (atrás da 13 e da 11) ----------
  // da esquerda para a direita: manutenção industrial (de trás da 11 até o fundo), ferramentaria (só no fundo) e área de moldes (no canto), as duas juntas
  {
    const X0 = PASSO_X + 1, X1 = PISO_W / 2 - .6, ZF = -PISO_D / 2 + .6, ZM = centro(0, 0)[1] + CEL_D / 2 + 1.5; // ZM: começo do quadrante do fundo
    const XF = X0 + 10, XM = XF + 8.5;                                                                           // divisas manutenção | ferramentaria | moldes
    const ZT = centro(0, 1)[1] + CEL_D / 2 - .4;                                                                 // atrás da 11, junto ao corredor
    const contorno = (x0, x1, z0, z1) => { faixa(x1 - x0, .16, (x0 + x1) / 2, z0, linhaAm); faixa(x1 - x0, .16, (x0 + x1) / 2, z1, linhaAm); faixa(.16, z1 - z0, x0, (z0 + z1) / 2, linhaAm); faixa(.16, z1 - z0, x1, (z0 + z1) / 2, linhaAm); };
    const G = (x, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g); return g; };
    const bancada = (x, z, ry = 0, w = 2.6) => {
      const g = G(x, z, ry);
      box(g, w, .08, .9, m.madeira, 0, .88, 0); box(g, w - .2, .05, .8, m.acoEsc, 0, .22, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, .07, .88, .07, m.azulPlaca, a * (w / 2 - .08), 0, b * .38));
      box(g, .32, .2, .26, m.azulPlaca, -w / 2 + .45, .96, .28); box(g, .07, .07, .34, m.cromo, -w / 2 + .45, 1.04, .5); // morsa
      box(g, w, 1.15, .05, m.painelEl, 0, 1.25, -.43);                                                                       // painel de ferramentas
      for (let i = 0; i < 7; i++) box(g, .06, .32 + (i % 3) * .1, .03, i % 2 ? m.vermelho : m.acoEsc, -w / 2 + .35 + i * (w - .7) / 6, 1.6, -.39);
      box(g, .5, .22, .3, m.carrinho, w / 2 - .5, .96, -.1); box(g, .6, .04, .4, m.caixaAzul, .2, .96, .15);
      return g;
    };
    const armario = (x, z, ry = 0, w = 1, h = 2) => { const g = G(x, z, ry); box(g, w, h, .55, m.branco, 0, 0, 0); box(g, .02, h - .2, .01, m.rodape, 0, .1, .28); [-.08, .08].forEach((d) => box(g, .03, .22, .04, m.acoEsc, d, h * .5, .29)); return g; };
    const estante = (x, z, ry = 0) => {
      const g = G(x, z, ry);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, .06, 2.4, .06, m.azulPlaca, a * .95, 0, b * .27));
      for (let k = 0; k < 4; k++) { box(g, 1.95, .04, .6, m.aco, 0, .15 + k * .7, 0); for (let j = 0; j < 3; j++) if ((k + j) % 4) box(g, .5, .32, .45, (k + j) % 2 ? m.caixaAzul : papelao, -.62 + j * .62, .19 + k * .7, 0); }
    };
    const televisao = (x, y, z, ry = 0) => { const g = G(x, z, ry); box(g, 1.7, 1, .08, m.preto, 0, y, 0); const t = new THREE.Mesh(guarda(new THREE.PlaneGeometry(1.6, .9)), telaFabMt); t.position.set(0, y + .5, .045); g.add(t); };
    const quadroFerr = (x, z, ry = 0) => {
      const g = G(x, z, ry); [-.7, .7].forEach((px) => { box(g, .05, 2.2, .05, m.aco, px, .15, 0); box(g, .08, .05, .6, m.aco, px, .12, 0); });
      box(g, 1.5, 1.7, .05, m.branco, 0, .55, 0); placa(g, 'GESTÃO À VISTA', 0, 2.1, .03, 0, 1.5, .26);
      for (let i = 0; i < 6; i++) box(g, .4, .28, .01, m.etiqueta, -.45 + (i % 3) * .45, 1.45 - Math.floor(i / 3) * .45, .03);
    };
    const furadeira = (x, z) => { const g = G(x, z); box(g, .7, .12, .5, m.verde, 0, 0, 0); cyl(g, .07, 1.7, m.cromo, 0, .12, -.15, 12); box(g, .45, .2, .4, m.verde, 0, .8, .02); box(g, .4, .5, .55, m.verde, 0, 1.55, -.05); cyl(g, .04, .25, m.cromo, 0, 1.3, .1, 10); };
    const torno = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, 2.8, .85, .6, m.verde, 0, 0, 0); box(g, 2.8, .12, .5, m.acoEsc, 0, .85, 0);
      box(g, .7, .6, .6, m.verde, -1.05, .97, 0); hcyl(g, .2, .2, m.cromo, -.6, 1.25, 0); box(g, .35, .35, .4, m.verde, 1.1, .97, 0); box(g, .5, .2, .45, m.acoEsc, .1, .97, 0);
      box(g, .55, .02, .4, m.cavaco, .1, .86, .35);
    };
    const rolo = (x, z, ry = 0) => { const g = G(x, z, ry); box(g, 2.4, .14, 1.1, m.paletePl, 0, 0, 0); hcyl(g, .32, 2.6, m.termoCinza, 0, .46, 0); hcyl(g, .33, .3, m.etiqueta, .7, .46, 0); };
    const solda = (x, z, ry = 0) => { const g = G(x, z, ry); box(g, .55, .7, .8, m.laranja, 0, .15, 0); box(g, .5, .06, .7, m.acoEsc, 0, .85, 0); [[-.22, -.32], [.22, -.32], [-.22, .32], [.22, .32]].forEach(([a, b]) => cyl(g, .07, .14, m.borracha, a, 0, b, 10)); cyl(g, .12, 1.1, m.verde, 0, .15, -.6, 14); mangueira(g, [[0, .7, .41], [.3, .4, .7], [.5, .05, .9]], .03, m.borracha); };

    const gaveteiro = (x, z, ry = 0) => { const g = G(x, z, ry); box(g, .6, 1.5, .6, m.painel, 0, 0, 0); for (let k = 0; k < 5; k++) { box(g, .54, .25, .01, m.rodape, 0, .1 + k * .28, .305); box(g, .16, .03, .03, m.acoEsc, 0, .3 + k * .28, .32); } };
    const mesa = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, 1.5, .05, .7, m.branco, 0, .74, 0); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, .05, .74, .05, m.aco, a * .7, 0, b * .3));
      box(g, .4, .02, .28, m.preto, -.2, .79, .05); const tl = box(g, .4, .26, .02, m.preto, -.2, .8, -.08); tl.rotation.x = -.2; box(g, .35, .2, .3, papelao, .45, .79, -.1);
      const c = G(x, z, ry); cyl(c, .26, .05, m.preto, -.1, .02, .75, 10); cyl(c, .03, .4, m.acoEsc, -.1, .05, .75, 8); box(c, .5, .08, .48, m.preto, -.1, .45, .75); box(c, .48, .55, .07, m.preto, -.1, .55, 1);
    };
    const carroFerr = (x, z, ry = 0) => { const g = G(x, z, ry); box(g, 1.3, .9, .65, m.preto, 0, .14, 0); box(g, 1.36, .05, .7, m.acoEsc, 0, 1.04, 0); for (let k = 0; k < 4; k++) box(g, .55, .015, .01, m.cromo, -.3, .3 + k * .19, .33); box(g, .3, .7, .01, m.acoEsc, .38, .25, .33); [[-.55, -.25], [.55, -.25], [-.55, .25], [.55, .25]].forEach(([a, b]) => cyl(g, .07, .14, m.borracha, a, 0, b, 10)); box(g, .3, .12, .2, m.vermelho, -.3, 1.09, 0); cyl(g, .05, .22, m.laranja, .4, 1.09, .1, 8); };
    const carroPrat = (x, z, ry = 0) => { const g = G(x, z, ry); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, .05, 1.1, .05, m.acoEsc, a * .55, .12, b * .3)); [.3, .7, 1.1].forEach((y) => box(g, 1.15, .04, .65, m.grade, 0, y + .1, 0)); box(g, .5, .2, .4, m.acoEsc, -.2, .84, 0); hcyl(g, .06, .7, m.cromo, .1, 1.3, 0); [[-.5, -.25], [.5, -.25], [-.5, .25], [.5, .25]].forEach(([a, b]) => cyl(g, .06, .12, m.borracha, a, 0, b, 10)); };
    const bomba = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, 1.4, .82, .7, m.azulPlaca, 0, 0, 0); box(g, 1.44, .05, .74, m.acoEsc, 0, .82, 0);
      hcyl(g, .2, .5, m.branco, -.1, 1.2, 0, 'z'); cyl(g, .07, .55, m.branco, -.1, .87, 0, 10); hcyl(g, .07, .7, m.branco, -.1, 1.55, 0); cyl(g, .05, .3, m.branco, .25, 1.55, 0, 8);
      mangueira(g, [[-.45, 1.55, 0], [-.7, 1.2, .25], [-.6, .9, .5], [-.3, .87, .2]], .05, m.borracha);
    };
    const tamborCarrinho = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, .7, .06, .7, m.preto, 0, .12, 0); [[-.36, .1], [.36, .1]].forEach(([a, b]) => { const r = cyl(g, .19, .08, m.borracha, a, .19, b, 16); r.rotation.z = Math.PI / 2; });
      box(g, .05, 1.4, .05, m.preto, -.3, .12, -.38); box(g, .05, 1.4, .05, m.preto, .3, .12, -.38); hcyl(g, .03, .65, m.preto, 0, 1.5, -.42);
      cyl(g, .29, .88, m.tambor, 0, .18, 0, 24); [.36, .72].forEach((y) => cyl(g, .302, .04, m.tamborAro, 0, .18 + y, 0, 24)); box(g, .2, .26, .01, m.etiqueta, .15, .55, .29);
      mangueira(g, [[.1, 1.07, .05], [.3, 1.5, -.2], [-.2, 1.3, -.5], [-.5, .4, -.3]], .03, m.borracha);
    };
    const saida = (x, y, z) => placa(S, 'SAÍDA', x, y, z, 0, .35, .14, '#1f8a46');
    const moldeRes = (x, z, w, h, d, ry = 0) => { const g = G(x, z, ry); box(g, w + .3, .14, d + .3, m.madeira, 0, 0, 0); const s = new THREE.Group(); s.position.y = .14; g.add(s); molde(s, 0, 0, w, h, d); return g; };
    const fresadora = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, 1.3, .25, 1.1, m.acoEsc, 0, 0, 0); box(g, .75, 2.3, .75, m.painel, 0, .25, -.3); box(g, .7, .6, 1.1, m.painel, 0, 2.2, .05);
      cyl(g, .1, .45, m.cromo, 0, 1.75, .4, 12); box(g, .8, .65, .55, m.painel, 0, .25, .35); box(g, 1.7, .14, .5, m.acoEsc, 0, .92, .38); box(g, .5, .2, .4, m.htAzul, 0, 1.06, .38);
      box(g, .5, .7, .08, m.preto, .55, 1.6, .6); box(g, .4, .3, .01, m.tela, .55, 1.85, .645); cyl(g, .12, .05, m.cromo, -.95, .97, .38, 14);
    };
    const retifica = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, 2.2, .95, 1.1, m.painel, 0, 0, 0); box(g, 2.3, .1, .8, m.acoEsc, 0, .95, .1); box(g, 1.4, .12, .6, m.cromo, 0, 1.05, .1);
      box(g, .7, 1.9, .6, m.painel, 0, .95, -.45); box(g, .6, .45, .7, m.htAzul, 0, 2.2, -.1); const r = hcyl(g, .32, .18, m.acoEsc, 0, 1.75, .25, 'x'); r.scale.set(1, 1, 1);
      box(g, .8, .5, .5, m.htAzul, 1.4, 0, .1); box(g, .45, .55, .06, m.preto, -1.1, 1.3, .58);
    };
    const eletroerosao = (x, z, ry = 0) => {
      const g = G(x, z, ry); box(g, 1.9, .85, 1.5, m.painel, 0, 0, 0); box(g, 1.6, .6, 1.2, m.htAzul, 0, .85, .1); box(g, 1.5, .05, 1.1, m.vidro, 0, 1.45, .1);
      box(g, .6, 2, .6, m.painel, 0, .85, -.5); box(g, .5, .5, .8, m.painel, 0, 2.45, -.15); cyl(g, .07, .5, m.cromo, 0, 1.95, .2, 10);
      box(g, .8, 1.9, .8, m.painel, 1.5, 0, -.2); box(g, .55, .35, .02, m.tela, 1.5, 1.35, .21); box(g, .55, .25, .02, m.preto, 1.5, .9, .21);
    };
    const estampo = (x, z, w, d, ry = 0, cor = m.htAzul) => {
      const g = G(x, z, ry); box(g, w + .3, .12, d + .3, m.madeira, 0, 0, 0); box(g, w, .35, d, m.acoEsc, 0, .12, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => cyl(g, .07, .55, m.cromo, a * (w / 2 - .18), .47, b * (d / 2 - .18), 10));
      box(g, w, .3, d, cor, 0, 1.02, 0); box(g, w * .45, .16, d * .4, m.acoEsc, 0, 1.32, 0); box(g, .5, .16, .02, m.etiqueta, 0, 1.1, d / 2 + .01);
    };

    // manutenção industrial: no fundo, ao lado do forno torre 2 (como na foto: armários brancos à esquerda,
    // TV, gaveteiro, estante e mesa no fundo, carro de ferramentas preto à direita, tambor no carrinho e tapete no meio)
    contorno(X0, XF, ZF + .2, ZM);
    for (let k = 0; k < 8; k++) { armario(X0 + .45, ZF + 3.6 + k * 1.22, Math.PI / 2, 1.2, 2.3); if (k % 3 !== 1) box(S, .9, .5 + (k % 2) * .25, .55, papelao, X0 + .45, 2.3, ZF + 3.6 + k * 1.22); }
    bomba(X0 + 1.3, ZF + 1.1); box(S, .9, .9, .5, m.branco, X0 + 2.6, 0, ZF + .6);
    gaveteiro(X0 + 3.6, ZF + .65); estante(X0 + 5.1, ZF + .65); box(S, .55, .3, .4, mat(0xe8d21c, { roughness: .5 }), X0 + 5.1, .87, ZF + .65);
    televisao(X0 + 5.1, 2.5, ZF + .25); saida(X0 + 6.6, 2.3, ZF + .2); mesa(X0 + 7, ZF + .8);
    cyl(S, .45, 1.1, m.azulPlaca, X0 + 9.2, 0, ZF + .8, 16); domo(S, .45, m.azulPlaca, X0 + 9.2, 1.1, ZF + .8);
    carroFerr(X0 + 8.9, ZF + 4.2, -Math.PI / 2); carroPrat(X0 + 9, ZF + 6.4, -Math.PI / 2); box(S, .9, .7, .8, papelao, X0 + 9.2, 0, ZF + 2.2); box(S, .8, .6, .7, papelao, X0 + 9.1, .7, ZF + 2.3);
    box(S, 1.3, .02, 2.3, m.tapete, X0 + 4.8, 0, ZF + 10); tamborCarrinho(X0 + 2.4, ZF + 12.6, .3); palete(X0 + 9.1, ZF + 9);
    // corredor: da ferramentaria até o corredor da frente (o da 13), com a ligação para o corredor do forno
    const zc0 = ZM + .3, zc1 = ZT + .6, zf0 = ZM - 1.1, zf1 = zf0 + 3.2;
    faixa(XF - X0, zc1 - zc0, (X0 + XF) / 2, (zc0 + zc1) / 2, corredorMt, .006);
    faixa(.24, zc1 - zc0, XF - .3, (zc0 + zc1) / 2, linhaAm);

    // ferramentaria + área de moldes (uma área só): máquinas no fundo, moldes reserva e estampos de prensa ocupando o resto
    contorno(XF + .4, X1 - .2, ZF + .2, ZT);
    armario(XF + 1.2, ZF + .55, 0, 1.2, 2.2); armario(XF + 2.5, ZF + .55, 0, 1.2, 2.2); box(S, .9, .6, .8, papelao, XF + 1.2, 2.2, ZF + .6);
    bancada(XF + 5.4, ZF + 1, 0, 3); torno(XF + 3.4, ZF + 4.6, 0); furadeira(XF + 7, ZF + 4.3); tambores(XF + 1.2, ZF + 4.6, Math.PI / 2);
    // fileiras de moldes reserva (para todas as injetoras) e estampos de prensa
    const MS = [[2, 1.6, 1.5], [1.7, 1.2, 1.3], [2.1, 1.9, 1.6], [1.6, 1.1, 1.2], [1.9, 1.5, 1.4]];
    [XF + 1.8, XF + 4.3, XF + 6.8].forEach((x, c) => [ZF + 8.2, ZF + 11, ZF + 13.8, ZF + 16.6, ZF + 19.4].forEach((z, r) => {
      const k = (c * 5 + r) % 7;
      if (k === 2 || k === 5) estampo(x, z, 1.9, 1.4, 0, k === 2 ? m.htAzul : m.verde);
      else { const [w, h, d] = MS[(c + r) % 5]; moldeRes(x, z, w, h, d, ((c + r) % 2) * .06); }
    }));
    // ao lado do pórtico (canto): mais moldes atrás e estampos na frente
    [XM + 2, XM + 4.6, XM + 7.2].forEach((x, i) => moldeRes(x, ZF + 1.6, ...[[2.1, 1.7, 1.5], [1.8, 1.4, 1.3], [2, 1.9, 1.6]][i]));
    [XM + 1.8, XM + 4.2, XM + 6.6, XM + 8.8].forEach((x, i) => (i % 2 ? moldeRes(x, ZM - 1.8, 1.7, 1.3, 1.3) : estampo(x, ZM - 1.8, 1.8, 1.3, 0, i ? m.verde : m.htAzul)));
    // ferramentaria também na frente (atrás da 11, até o corredor): máquinas, bancadas, armários e mais moldes
    fresadora(XF + 2.4, ZM + 2.4); fresadora(XF + 5, ZM + 2.4); retifica(XF + 8.6, ZM + 2.4); eletroerosao(XF + 12.6, ZM + 2.4); cyl(S, .38, .7, m.laranja, XF + 15, 0, ZM + 2, 16);
    tambores(X1 - 1, ZM + 2.4, Math.PI / 2);
    bancada(XF + 2.4, ZM + 6.6, Math.PI, 3); bancada(XF + 5.9, ZM + 6.6, Math.PI, 3); carrinho(XF + 4.2, ZM + 8.2, .2); carroFerr(XF + 8.6, ZM + 6.8, Math.PI);
    for (let k = 0; k < 5; k++) armario(X1 - .7, ZM + 5.6 + k * 1.22, -Math.PI / 2, 1.2, 2.2);
    estante(XF + 12.4, ZM + 6.6, 0); estante(XF + 14.6, ZM + 6.6, 0);
    [XF + 2, XF + 4.5, XF + 7, XF + 9.5, XF + 12, XF + 14.5].forEach((x, i) => (i % 3 === 1 ? estampo(x, ZT - 2.6, 1.8, 1.3, 0, i === 1 ? m.verde : m.htAzul) : moldeRes(x, ZT - 2.6, ...MS[i % 5])));
    [XF + 3.2, XF + 5.7, XF + 8.2, XF + 10.7, XF + 13.2].forEach((x, i) => (i % 2 ? moldeRes(x, ZT - 5.6, ...MS[(i + 2) % 5]) : estampo(x, ZT - 5.6, 1.9, 1.4, 0, i ? m.htAzul : m.verde)));
    quadroFerr(X1 - 1.6, ZT - .7, 0);
    const xm = (XM + X1) / 2 - .25, zm = (ZF + ZM) / 2;
    areaMoldes(xm, zm, -Math.PI / 2);
    rotulos.push({ txt: 'MANUTENÇÃO', x: (X0 + XF) / 2, y: 7.6, z: (ZF + ZM) / 2 });
    rotulos.push({ txt: 'FERRAMENTARIA', x: (XF + X1) / 2, y: 8.2, z: zm });
  }
  const teto = new THREE.Group(), tetoAlto = new THREE.Group(); S.add(teto); S.add(tetoAlto); // tetoAlto (telhado e treliças) só nas vistas de dentro, abaixo delas
  {
    // telhado (só visto de baixo), treliças escuras e luminárias: redondas e lineares, como nas fotos
    const texTelhado = textura(256, 256, (x, w, h) => { x.fillStyle = '#b5a88c'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(70,60,45,.22)'; for (let i = 0; i < w; i += 16) x.fillRect(i, 0, 2, h); x.fillStyle = '#3a3d42'; x.fillRect(0, 0, w, 7); }, true);
    texTelhado.repeat.set(PISO_W / 8, PISO_D / 8);
    const tel = new THREE.Mesh(guarda(new THREE.PlaneGeometry(PISO_W, PISO_D)), guarda(new THREE.MeshStandardMaterial({ map: texTelhado, emissive: lin(0xffffff), emissiveMap: texTelhado, emissiveIntensity: .55, roughness: .9 })));
    tel.rotation.x = Math.PI / 2; tel.position.y = H_PAR; tetoAlto.add(tel);
    const texTrelica = textura(512, 64, (x, w, h) => { x.strokeStyle = '#3a3e44'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 4); x.lineTo(w, 4); x.moveTo(0, h - 4); x.lineTo(w, h - 4); for (let i = 0; i < 8; i++) { const a = i * w / 8; x.moveTo(a, h - 4); x.lineTo(a + w / 16, 4); x.lineTo(a + w / 8, h - 4); } x.stroke(); }, true);
    const vaoB = PISO_W / 2; texTrelica.repeat.set(vaoB / 12.8, 1);
    const trelMt = guarda(new THREE.MeshStandardMaterial({ map: texTrelica, transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .6, metalness: .4 }));
    const trelGeo = guarda(new THREE.PlaneGeometry(vaoB, 1.5));
    for (let z = -PISO_D / 2 + 6; z < PISO_D / 2; z += 8) [-vaoB / 2, vaoB / 2].forEach((x) => { const t = new THREE.Mesh(trelGeo, trelMt); t.position.set(x, H_PAR - .75, z); tetoAlto.add(t); });
    const corpo = gCyl(.42, .22, 16), luzGeo = gCyl(.34, .02, 16), luzMt = luzParMt;
    let lin2 = 0;
    for (let z = -PISO_D / 2 + 7; z < PISO_D / 2; z += 12, lin2++) for (let x = -PISO_W / 2 + 8; x < PISO_W / 2; x += 11) {
      if (lin2 % 2) { const a = new THREE.Mesh(gBox(3.2, .1, .32), m.luminaria); a.position.set(x, 14.3, z); teto.add(a); const l = new THREE.Mesh(gBox(3, .02, .22), luzMt); l.position.set(x, 14.24, z); teto.add(l); }
      else { const a = new THREE.Mesh(corpo, m.luminaria); a.position.set(x, 14.2, z); teto.add(a); const l = new THREE.Mesh(luzGeo, luzMt); l.position.set(x, 14.08, z); teto.add(l); }
      const cabo = new THREE.Mesh(gBox(.02, 1.8, .02), m.preto); cabo.position.set(x, 15.25, z); teto.add(cabo);
    }
  }


  const texSombra = textura(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const sombraMt = guarda(new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, opacity: .6, color: 0x000000, toneMapped: false }));
  const texFeixe = textura(8, 256, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.25, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const feixeMt = guarda(new THREE.MeshBasicMaterial({ map: texFeixe, color: lin(COR.bx), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  const anelMt = {};
  Object.entries(COR).forEach(([k, c]) => { anelMt[k] = guarda(new THREE.MeshBasicMaterial({ color: lin(c), transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })); });

  const equips = [], pick = [], celulas = {};
  function registrar(info, nome, cel, x, z, tipo) {
    const g = info.g; g.position.set(x, 0, z); S.add(g);
    const anel = new THREE.Mesh(guarda(new THREE.RingGeometry(info.r, info.r + .35, 56)), anelMt.bx); anel.rotation.x = -Math.PI / 2; anel.position.set(x, .03, z); anel.visible = false; S.add(anel);
    const sw = info.L ? info.L + 2 : info.r * 2.3, sd = info.W ? info.W + 4.5 : info.r * 2.3;
    const sb = new THREE.Mesh(guarda(new THREE.PlaneGeometry(sw, sd)), sombraMt); sb.rotation.x = -Math.PI / 2; sb.position.set(x, .022, z + (info.W ? -.9 : 0)); sb.renderOrder = 1; S.add(sb);
    const feixe = new THREE.Mesh(guarda(new THREE.CylinderGeometry(.32, .32, 9, 20, 1, true)), feixeMt); feixe.position.set(x, info.topo + 4.6, z); feixe.renderOrder = 2; feixe.visible = false; S.add(feixe);
    const eq = { nome, tipo, cel, x, z, topo: info.topo, r: info.r, seg: info.seg, anel, feixe, g, dado: null, st: 'na', visivel: true, robos3d: info.robos3d || {}, prev: {} };
    equips.push(eq);
    g.traverse((o) => { if (o.isMesh) { o.userData.eq = eq; pick.push(o); } });
    Object.entries(eq.robos3d).forEach(([funcao, rg]) => rg.traverse((o) => { o.userData.robo = funcao; }));
    return info;
  }

  PLANTA.forEach((linha, r) => linha.forEach((cel, c) => {
    const cfg = cel && EQUIPAMENTOS[cel]; if (!cfg) return;
    const [cx, cz] = centro(c, r); celulas[cel] = { cx, cz };
    faixa(CEL_W, .16, cx, cz - CEL_D / 2, linhaAm); faixa(CEL_W, .16, cx, cz + CEL_D / 2, linhaAm); faixa(.16, CEL_D, cx - CEL_W / 2, cz, linhaAm); faixa(.16, CEL_D, cx + CEL_W / 2, cz, linhaAm);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => faixa(.9, .16, cx + i * (CEL_W / 2 - .45), cz + j * (CEL_D / 2 - .6), linhaBr, .016));
    const ix = cx - 2, iz = cz - 2.3;
    const inj = registrar(injetora(cfg, 'VTIA ' + cel), 'VTIA ' + cel, cel, ix, iz, 'Injetora ' + cfg.marca + ' ' + cfg.ton + ' t');
    faixa(inj.L + 1.4, inj.W + 5.6, ix, iz - 1.2, zonaMt, .004);
    registrar(cfg.marca === 'LK' ? prensaLK('VTPR ' + cel) : prensaRizzo('VTPR ' + cel), 'VTPR ' + cel, cel, cx + 7.4, cz - 2.2, cfg.marca === 'LK' ? 'Prensa de rebarbação LK' : 'Prensa de rebarbação Rizzo');
    const tx = ix - inj.L * .12, tz = iz + inj.W / 2 + 1.2;
    registrar(termo('VTTE ' + cel), 'VTTE ' + cel, cel, tx, tz, 'Termorregulador');
    const mx = ix + inj.matrizX, mz = iz + inj.W / 2;
    [-.12, .12].forEach((d, i) => mangueira(S, [[tx + .55 + d, .6, tz - .5], [tx + .7 + d, .15, tz - .85], [mx - .4 + d, .12, mz + .45], [mx + d, .9 * inj.s, mz + .06]], .05, i ? m.borracha : m.mangVerm));
    registrar(jateadora('VTJT ' + cel), 'VTJT ' + cel, cel, cx + 7.2, cz + 3.7, 'Jateadora');
    if (cfg.polaris) registrar(polaris('POLARIS ' + cel), 'Polaris ' + cel, cel, cx + 2.2, cz + 3.9, 'Centro de usinagem ROMI Polaris V400');
    quadroSetores(ix + inj.L * .08 + .85, iz + inj.W / 2 + .5);
    carrinho(ix + inj.L * .08 + 1.9, iz + inj.W / 2 + .9, .3);
    cacamba(cx + 5.6, cz + 1.2);
    palete(cx + (cfg.polaris ? 4.7 : 2.6), cz + 5.6);
    tambores(cx - 7.6, cz + 4.6, .12);
    extintor(cx + CEL_W / 2 - .9, cz + CEL_D / 2 - .9);
    faixa(2.6, 1.4, ix + inj.L * .08, iz + inj.W / 2 + 1.75, m.tapete, .016);
    corrimao(cx - 9.6, cx - 4.6, cz + CEL_D / 2 - .45);
    quadroGestao(cx + 6.6, cz + CEL_D / 2 - .8);
    carrinhoInox(cx + 7.4, cz - 4.7, .2);
    // forno de espera da célula (quando o mapeamento FORNO_ESPERA estiver preenchido)
    const fe = FORNO_ESPERA[cel];
    if (fe) {
      const g = new THREE.Group();
      const alvo = new THREE.Mesh(gBox(2.4, 1.4, 1.9), guarda(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
      alvo.position.y = .7; g.add(alvo);
      registrar({ g, r: 1.8, topo: 1.3, seg: null }, fe, cel, ix - inj.L / 2 + 1.1, iz + inj.W / 2 + 1.32, 'Forno de espera');
    }
  }));
  // fornos torre 1, 2 e 3 (clicáveis, com a situação da preventiva)
  torres.forEach(({ g, n, x, z }) => { if (n <= 3) registrar({ g, r: 4.6, topo: 13.2, seg: null }, 'VTFT 0' + n, 'fornos', x, z, 'Forno torre de fusão'); });

  // ---------- etiquetas ----------
  const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  const spriteDe = (canvas, w, h, ordem = 10) => {
    const t = guarda(new THREE.CanvasTexture(canvas)); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    const sp = new THREE.Sprite(guarda(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }))); sp.scale.set(w, h, 1); sp.renderOrder = ordem; return sp;
  };
  try { await Promise.race([document.fonts?.ready, new Promise((ok) => setTimeout(ok, 2500))]); } catch { /* segue com a fonte reserva */ }
  equips.forEach((eq) => {
    eq.canvas = document.createElement('canvas'); eq.canvas.width = 512; eq.canvas.height = 128;
    eq.et = spriteDe(eq.canvas, 3.2, .8); eq.et.position.set(eq.x, eq.topo + .9, eq.z); S.add(eq.et);
  });
  rotulos.forEach(({ txt, x, y, z }) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const k = c.getContext('2d');
    rr(k, 4, 4, 504, 120, 14); k.fillStyle = '#e9ebee'; k.fill(); k.fillStyle = '#15171a'; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.font = '700 70px "Barlow Condensed","Arial Narrow",sans-serif'; k.fillText(txt, 256, 70, 480);
    const sp = spriteDe(c, 6.4, 1.6, 11); sp.position.set(x, y, z); S.add(sp);
  });
  Object.entries(celulas).forEach(([n, { cx, cz }]) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    rr(x, 4, 4, 504, 120, 14); x.fillStyle = '#ffc20e'; x.fill(); x.fillStyle = '#15171a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 76px "Barlow Condensed","Arial Narrow",sans-serif'; x.fillText('CÉLULA ' + n, 256, 70);
    const sp = spriteDe(c, 7, 1.75, 11); sp.position.set(cx - CEL_W / 2 + 4.2, 7.8, cz - CEL_D / 2 + .5); S.add(sp);
  });
  function desenharEtiqueta(eq) {
    const x = eq.canvas.getContext('2d'); x.clearRect(0, 0, 512, 128);
    eq.semEtiqueta = !eq.dado;
    const cor = eq.dado ? COR[eq.st] : '#5d656e';
    rr(x, 4, 4, 504, 120, 18); x.fillStyle = 'rgba(16,17,20,.92)'; x.fill(); x.save(); x.clip(); x.fillStyle = cor; x.fillRect(4, 4, 16, 120); x.restore();
    x.textBaseline = 'middle'; x.font = '600 60px "Barlow Condensed","Arial Narrow",sans-serif'; x.fillStyle = eq.dado ? '#eceef0' : '#9aa3ad'; x.textAlign = 'left'; x.fillText(eq.nome.toUpperCase(), 40, 68);
    const dir = eq.dado ? eq.dado.rotulo || '' : '';
    if (dir) { x.textAlign = 'right'; x.font = '700 62px "Barlow Condensed","Arial Narrow",sans-serif'; x.fillStyle = cor; x.fillText(dir, 490, 68); }
    eq.et.material.map.needsUpdate = true;
  }

  // ---------- estado de cada máquina ----------
  let filtroAtivo = false;
  // ---------- preventiva ABB dos robôs (Spray em cima da injetora, Extrator no chão) ----------
  const COR_PREV3D = { proxima: '#f0a93b', atrasada: '#ff5a36' };
  const prevAnelMt = { proxima: anelMt.at, atrasada: anelMt.bx };
  function marcadorPrev(eq, funcao) {
    if (eq.prev[funcao]) return eq.prev[funcao];
    const rg = eq.robos3d[funcao]; if (!rg) return null;
    const base = new THREE.Vector3(); rg.getWorldPosition(base);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const sp = spriteDe(canvas, 4.6, 1.15, 12); sp.position.set(base.x, base.y > 1 ? base.y + 6.6 : 7.8, base.z); S.add(sp); // acima da máquina e da etiqueta dela
    const anel = new THREE.Mesh(guarda(new THREE.RingGeometry(1.25, 1.55, 48)), anelMt.at); anel.rotation.x = -Math.PI / 2; anel.position.set(base.x, base.y + .04, base.z); S.add(anel);
    return (eq.prev[funcao] = { sp, anel, canvas, st: null, txt: '' });
  }
  function aplicarPrev(eq) {
    const lista = eq.dado?.robos || [];
    Object.keys(eq.robos3d).forEach((funcao) => {
      const r = lista.find((x) => String(x.funcao).toLowerCase() === funcao.toLowerCase());
      const s = r ? statusPreventiva(r) : null;
      const alerta = s && (s.st === 'proxima' || s.st === 'atrasada') && eq.visivel;
      if (!alerta) { if (eq.prev[funcao]) { eq.prev[funcao].sp.visible = eq.prev[funcao].anel.visible = false; eq.prev[funcao].st = null; } return; }
      const mk = marcadorPrev(eq, funcao); if (!mk) return;
      const txt = s.st === 'atrasada' ? `ABB ${funcao.toUpperCase()} · ATRASADA` : `ABB ${funcao.toUpperCase()} · ${quando(s.dias).toUpperCase()}`;
      if (mk.txt !== txt) {
        const x = mk.canvas.getContext('2d'); x.clearRect(0, 0, 512, 128);
        rr(x, 4, 4, 504, 120, 18); x.fillStyle = COR_PREV3D[s.st]; x.fill();
        x.fillStyle = '#15171a'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 50px "Barlow Condensed","Arial Narrow",sans-serif';
        x.fillText(txt, 256, 68, 480); mk.sp.material.map.needsUpdate = true; mk.txt = txt;
      }
      mk.st = s.st; mk.anel.material = prevAnelMt[s.st]; mk.sp.visible = mk.anel.visible = true;
    });
  }
  // células com robô pedindo preventiva (para o passeio da TV)
  function prevPorCelula() {
    const pc = {};
    equips.forEach((eq) => Object.entries(eq.prev).forEach(([funcao, mk]) => { if (mk.st) (pc[eq.cel] ??= []).push({ funcao, st: mk.st, txt: mk.txt }); }));
    return pc;
  }

  function aplicar(eq) {
    const st = eq.dado ? eq.st : 'na';
    const luz = eq.dado && (st === 'bx' || st === 'at' || st === 'ok') ? st : null;
    if (eq.seg) ['ok', 'at', 'bx'].forEach((k) => { eq.seg[k].material = k === luz ? ACESO[k] : APAGADO[k]; });
    eq.anel.material = anelMt[st];
    eq.anel.visible = !!eq.dado && eq.visivel && (filtroAtivo || st === 'bx');
    eq.feixe.visible = !!eq.dado && eq.visivel && st === 'bx';
    desenharEtiqueta(eq);
  }
  function atualizar(lista, { mostrar = null } = {}) {
    const mapa = new Map((lista || []).map((d) => [norm(d.nome), d]));
    filtroAtivo = !!mostrar;
    equips.forEach((eq) => {
      eq.dado = mapa.get(norm(eq.nome)) || null;
      eq.st = eq.dado ? situacao(eq.dado) : 'na';
      eq.visivel = !mostrar || (eq.dado && mostrar.has(eq.dado.maquina_id));
      aplicar(eq);
    });
    if (selecionada) mostrarFicha(selecionada);
    if (tv) { contarParadas(); if (!primeira) { primeira = true; paradaFim = performance.now(); } else if (paradaAtual?.tipo === 'geral') legendaGeral(); }
  }

  // ---------- câmera ----------
  let alvo = null;
  const voar = (p, t, v = .06) => { alvo = { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t), v }; };
  const GERAL = tv ? [[28, 47, 60], [2, 0, 6]] : [[44, 70, 92], [0, 0, 2]];
  C.position.set(...GERAL[0]); O.target.set(...GERAL[1]);
  function irCelula(n, v) { const c = celulas[n]; if (c) voar([c.cx + 13, 15, c.cz + 19], [c.cx, 0, c.cz], v); }

  // ---------- ficha ao clicar (fora do modo TV) ----------
  let selecionada = null;
  const selAnel = new THREE.Mesh(guarda(new THREE.RingGeometry(1, 1.12, 64)), guarda(new THREE.MeshBasicMaterial({ color: lin(0xffc20e), side: THREE.DoubleSide, transparent: true, depthWrite: false })));
  selAnel.rotation.x = -Math.PI / 2; selAnel.position.y = .05; selAnel.visible = false; S.add(selAnel);
  // destaque da máquina escolhida: onda que se abre no chão + etiqueta que flutua
  const selOnda = new THREE.Mesh(guarda(new THREE.RingGeometry(1, 1.06, 64)), guarda(new THREE.MeshBasicMaterial({ color: lin(0xffc20e), side: THREE.DoubleSide, transparent: true, depthWrite: false })));
  selOnda.rotation.x = -Math.PI / 2; selOnda.position.y = .06; selOnda.visible = false; S.add(selOnda);
  let etFlutua = null;
  function mostrarFicha(eq) {
    const f = $('[data-ficha]'); if (!f) return;
    if (etFlutua && etFlutua !== eq) { etFlutua.et.position.y = etFlutua.topo + .9; etFlutua.et.scale.set(3.2, .8, 1); etFlutua = null; }
    selecionada = eq;
    if (!eq) { f.hidden = true; selAnel.visible = selOnda.visible = false; return; }
    selAnel.visible = selOnda.visible = true; selAnel.position.set(eq.x, .05, eq.z); selAnel.scale.setScalar(eq.r + .6);
    selOnda.position.set(eq.x, .06, eq.z); etFlutua = eq; eq.et.scale.set(3.2 * 1.25, .8 * 1.25, 1);
    const corpo = eq.dado && ficha ? ficha(eq.nome)
      : `<div><h3>${esc(eq.nome)}</h3><p class="p3d-sub">${esc(eq.tipo)}${eq.cel && eq.cel !== 'fornos' ? ' · Célula ' + eq.cel : ''}</p></div>
         <p class="p3d-sub">Fora do cronograma de preventivas (FR.06.08.068).</p>`;
    f.innerHTML = `<button type="button" class="p3d-fechar" data-fechar aria-label="Fechar">×</button>${corpo}`;
    f.hidden = false;
    f.querySelector('[data-fechar]').onclick = () => mostrarFicha(null);
  }

  // ---------- controles (fora do modo TV) ----------
  let girando = false;
  if (!tv) {
    const sel = $('[data-cel]');
    Object.keys(celulas).sort().forEach((n) => sel.insertAdjacentHTML('beforeend', `<option value="${n}">Célula ${n}</option>`));
    sel.onchange = () => irCelula(sel.value);
    $('[data-geral]').onclick = () => voar(...GERAL);
    $('[data-topo]').onclick = () => voar([0, 120, .1], [0, 0, 0]);
    const bg = $('[data-girar]');
    bg.onclick = () => { girando = !girando; O.autoRotate = girando; O.autoRotateSpeed = .6; bg.setAttribute('aria-pressed', String(girando)); bg.textContent = girando ? 'Parar' : 'Girar'; };
    // tour: passeia a câmera pelas células sozinha (para apresentações); qualquer toque na cena para
    const bt = $('[data-tour]'), ordemCel = Object.keys(celulas).sort();
    let tourTimer = null, tourI = 0;
    const pararTour = () => { if (!tourTimer) return; clearInterval(tourTimer); tourTimer = null; bt.setAttribute('aria-pressed', 'false'); bt.textContent = '▶ Tour'; };
    const passo = () => { if (!el.isConnected) return pararTour(); if (tourI >= ordemCel.length) { tourI = 0; voar(...GERAL, .03); return; } irCelula(ordemCel[tourI++], .035); };
    bt.onclick = () => { if (tourTimer) return pararTour(); if (girando) bg.click(); tourI = 0; passo(); tourTimer = setInterval(passo, 4500); bt.setAttribute('aria-pressed', 'true'); bt.textContent = '■ Parar tour'; };
    R.domElement.addEventListener('pointerdown', pararTour);
  }
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let desce = null, ultimoHover = 0;
  const acertarObj = (e) => { const r = R.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ptr, C); return ray.intersectObjects(pick, false)[0]?.object || null; };
  const acertar = (e) => acertarObj(e)?.userData.eq;
  const onDown = (e) => { desce = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (tv || !desce || Math.hypot(e.clientX - desce[0], e.clientY - desce[1]) > 6) return;
    const h = acertarObj(e), eq = h?.userData.eq || null;
    mostrarFicha(eq); if (eq?.dado && aoAbrir) aoAbrir(eq.dado);
    if (eq) { const dx = C.position.x - O.target.x, dz = C.position.z - O.target.z, dist = Math.min(30, Math.hypot(dx, dz)) || 20, a = Math.atan2(dz, dx); voar([eq.x + Math.cos(a) * dist * .7, Math.max(9, Math.min(C.position.y, 18)), eq.z + Math.sin(a) * dist * .7], [eq.x, 1, eq.z], .05); }
  };
  const onMove = (e) => { if (tv || e.buttons) return; const n = performance.now(); if (n - ultimoHover < 60) return; ultimoHover = n; R.domElement.style.cursor = acertar(e) ? 'pointer' : 'grab'; };
  R.domElement.addEventListener('pointerdown', onDown); R.domElement.addEventListener('pointerup', onUp); R.domElement.addEventListener('pointermove', onMove);

  // ---------- passeio automático (modo TV) ----------
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paradaIdx = 0, paradaIni = 0, paradaFim = Infinity, paradaAtual = null, primeira = false;
  function porCelula() { const pc = {}; equips.forEach((eq) => { if (!eq.dado) return; const k = (pc[eq.cel] ??= { bx: 0, at: 0, ok: 0, na: 0, off: 0 }); k[eq.st]++; }); return pc; }
  const resumo = (n) => {
    const p = []; if (n.bx) p.push(`${n.bx} em nível baixo`); if (n.at) p.push(`${n.at} em atenção`);
    (n.prev || []).forEach((x) => p.push(`preventiva ABB do ${x.funcao} ${x.st === 'atrasada' ? 'atrasada' : x.txt.split('· ')[1].toLowerCase()}`));
    return p.join(' · ') || 'todas OK';
  };
  let paradas = [{ tipo: 'geral' }];
  function contarParadas() {
    const pc = porCelula(), pp = prevPorCelula();
    Object.keys(pp).forEach((c) => { (pc[c] ??= { bx: 0, at: 0, ok: 0, na: 0, off: 0 }).prev = pp[c]; });
    const peso = (n) => n.bx * 10 + n.at + (n.prev ? n.prev.length * (n.prev.some((x) => x.st === 'atrasada') ? 6 : .5) : 0);
    paradas = [{ tipo: 'geral' }, ...Object.keys(pc).filter((c) => pc[c].bx || pc[c].at || pc[c].prev)
      .sort((a, b) => peso(pc[b]) - peso(pc[a]) || a.localeCompare(b)).map((c) => ({ tipo: 'cel', cel: c, n: pc[c] }))];
  }
  function legendaGeral() {
    const tot = { bx: 0, at: 0 }; equips.forEach((eq) => { if (eq.dado && (eq.st === 'bx' || eq.st === 'at')) tot[eq.st]++; });
    $('[data-tit]').textContent = 'Visão geral';
    $('[data-sub]').textContent = `${Object.keys(celulas).length} células · ${resumo(tot)}`;
  }
  // O tempo de cada parada só começa a contar quando a câmera chega (em TV lenta o voo demora mais).
  let paradaDur = 0, vooIni = 0;
  function irParada() {
    if (paradaIdx >= paradas.length) paradaIdx = 0;
    const p = paradas[paradaIdx++]; paradaAtual = p; const agora = performance.now(); paradaIni = agora; vooIni = agora;
    O.autoRotate = false; O.autoRotateSpeed = .22;
    if (p.tipo === 'geral') {
      voar(...GERAL, .025); legendaGeral();
      paradaDur = 15000;
    } else {
      const k = celulas[p.cel]; voar([k.cx + 12, 12.5, k.cz + 17], [k.cx + 1, 0, k.cz], .03);
      $('[data-tit]').textContent = 'Célula ' + p.cel; $('[data-sub]').textContent = resumo(p.n);
      paradaDur = 11000;
    }
    paradaFim = Infinity; // começa quando chegar (ou depois de 8 s de voo, por segurança)
    // avisa a tela da TV, que troca o painel lateral (lista geral ou dados da célula)
    try { aoParar?.(p.tipo === 'cel' ? { tipo: 'cel', cel: p.cel } : { tipo: 'geral' }); } catch (e) { console.error(e); }
  }
  function chegou(agora) { paradaIni = agora; paradaFim = agora + paradaDur; O.autoRotate = !reduz; }
  O.addEventListener('start', () => { alvo = null; if (tv) { paradaIni = performance.now(); paradaFim = paradaIni + 30000; O.autoRotate = false; } });

  // ---------- laço de desenho ----------
  let raf = 0, vivo = true, ultimoQuadro = performance.now();
  const relogio = new THREE.Clock();
  // qualidade: mede os quadros por segundo e, se a tela estiver lenta, baixa a resolução um degrau
  let medIni = 0, medQuadros = 0;
  function qualidade(agora) {
    if (nivel >= NIVEIS.length - 1) return;
    if (!medIni) { medIni = agora; medQuadros = 0; return; }
    medQuadros++;
    if (agora - medIni < 2500) return;
    const fps = medQuadros * 1000 / (agora - medIni); medIni = 0;
    if (fps < 28) { nivel++; R.setPixelRatio(NIVEIS[nivel]); tamanho(); R.shadowMap.needsUpdate = true; }
  }
  function loop() {
    if (!vivo) return;
    if (!el.isConnected) { destruir(); return; }
    raf = requestAnimationFrame(loop);
    const t = relogio.getElapsedTime();
    const agoraQ = performance.now(), dt = Math.min(.25, (agoraQ - ultimoQuadro) / 1000); ultimoQuadro = agoraQ;
    if (alvo) {
      // mesmo andamento em qualquer tela: o passo depende do tempo, não da quantidade de quadros
      const k = 1 - Math.pow(1 - alvo.v, dt * 60);
      C.position.lerp(alvo.p, k); O.target.lerp(alvo.t, k);
      if (C.position.distanceTo(alvo.p) < .3) { alvo = null; if (tv && paradaFim === Infinity) chegou(agoraQ); }
    }
    if (tv && paradaAtual && paradaFim === Infinity && agoraQ - vooIni > 8000) { alvo = null; chegou(agoraQ); }
    if (tv) qualidade(agoraQ);
    if (!reduz) {
      robos.forEach((g, i) => { g.rotation.y = Math.sin(t * .7 + i * 1.3) * 1.1; });
      ACESO.bx.emissiveIntensity = Math.sin(t * 6) > 0 ? 2.4 : .1;
      const pul = 1 + .06 * Math.sin(t * 4); equips.forEach((eq) => { if (eq.anel.visible && eq.st === 'bx') eq.anel.scale.setScalar(pul); });
      feixeMt.opacity = .6 + .4 * Math.sin(t * 3);
      equips.forEach((eq) => Object.values(eq.prev).forEach((mk) => { if (mk.st === 'atrasada') mk.anel.scale.setScalar(1 + .08 * Math.sin(t * 4)); }));
      selAnel.material.opacity = .6 + .4 * Math.sin(t * 3);
      if (selOnda.visible && selecionada) { const f = (t * .6) % 1; selOnda.scale.setScalar((selecionada.r + .6) * (1 + f * 1.4)); selOnda.material.opacity = .7 * (1 - f); }
      if (etFlutua) etFlutua.et.position.y = etFlutua.topo + 1.3 + .25 * Math.sin(t * 2.4);
    }
    equips.forEach((eq) => {
      const d = C.position.distanceTo(eq.et.position);
      if (tv) { const alerta = eq.dado && (eq.st === 'bx' || eq.st === 'at'); const naCel = paradaAtual?.cel === eq.cel; eq.et.visible = (naCel && d < 75) || (alerta && d < 110); }
      else eq.et.visible = !eq.semEtiqueta && eq.visivel && (d < 95 || eq === selecionada || eq.st === 'bx' || eq.st === 'at' || eq.st === 'ag');
    });
    if (tv) {
      const agora = performance.now(); const p = $('[data-prog]');
      if (p) p.style.width = Math.min(100, (agora - paradaIni) / Math.max(1, paradaFim - paradaIni) * 100) + '%';
      if (agora >= paradaFim) irParada();
    }
    teto.visible = C.position.y < 22; tetoAlto.visible = C.position.y < 13;
    O.update(); R.render(S, C);
  }

  function destruir() {
    if (!vivo) return; vivo = false;
    cancelAnimationFrame(raf); ro.disconnect(); O.dispose();
    R.domElement.removeEventListener('pointerdown', onDown); R.domElement.removeEventListener('pointerup', onUp); R.domElement.removeEventListener('pointermove', onMove);
    descartar.forEach((o) => { try { o.dispose(); } catch { /* já liberado */ } });
    R.dispose(); R.forceContextLoss(); R.domElement.remove();
  }

  equips.forEach(aplicar);
  $('.p3d-carregando')?.remove();
  if (tv) contarParadas();
  loop();
  const abrir = (nome) => { const eq = equips.find((q) => norm(q.nome) === norm(nome)); if (eq) { mostrarFicha(eq); if (eq.cel && celulas[eq.cel]) irCelula(eq.cel); else voar([eq.x + 16, 18, eq.z + 24], [eq.x, 2, eq.z]); } };
  return { atualizar, irCelula, abrir, olhar: (p, t) => voar(p, t, 1), destruir, el };
}

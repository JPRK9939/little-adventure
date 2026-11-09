import * as THREE from 'three';
import * as CH from './characters.js';
import { Sound } from './audio.js';

/* ================================================================ helpers */
const V3 = THREE.Vector3;
const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clamp01 = x => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const backOut = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
const hash = (x, z, s = 0) => { let h = (x * 374761393 + z * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================================================================ save */
const SAVE_KEY = 'hungry-bear.save.v1';
const DEF = { name: '', completed: false, checkpoint: null, music: .7, fx: .8, best: 0, history: [] };
let save = (() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (e) { return { ...DEF }; } })();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

/* ================================================================ names & lines */
const NAMES = ['แบม', 'แบมแบม', 'แบมบู', 'แบมมี่', 'ที่รัก', 'คนสวย', 'bam', 'bambam', 'bammy', 'babe', 'แฟนจิ๋ว'];
const norm = s => (s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
const matchName = s => NAMES.find(n => norm(n) === norm(s));
const WRONG = [
  'แน่ใจนะว่านี่ชื่อเธอ? 🤨',
  'ฉันรู้จักเธอดี… และนี่ไม่ใช่ชื่อเธอแน่ๆ',
  'อ๊ะๆ อย่ามาหลอกกันนะ',
  'ชื่อนี้ไม่คุ้นเลย ลองใหม่อีกทีสิ',
  'หืม… คนที่ฉันรออยู่ไม่ได้ชื่อนี้นะ',
  'ลองนึกดีๆ สิ ใครบางคนชอบเรียกเธอว่าอะไร?',
  'ไม่ใช่ ไม่ใช่ ไม่ใช่~ 🙅‍♀️',
  'เกมนี้ทำมาให้คนพิเศษคนเดียวเท่านั้นนะ',
  'ชื่อนี้เข้าไม่ได้หรอก ลองชื่อที่เขาชอบเรียกเธอดูสิ',
  'พิมพ์ผิดหรือเปล่าน้า? ลองอีกทีนะ',
  'ฮั่นแน่ ยังไม่ใช่!',
  'เธอไม่ใช่คนอื่นซะหน่อย ใส่ชื่อตัวเองสิ',
  'ถ้าไม่แน่ใจ กดลูกเต๋าข้างๆ ก็ได้นะ 🎲',
];
const EMPTY = ['พิมพ์ชื่อก่อนน้า~', 'ยังไม่ได้ใส่ชื่อเลยนะ', 'บอกชื่อหน่อยสิ หรือจะกด 🎲 ก็ได้'];
const GO_LINES = ['ไม่เป็นไรนะ ลองใหม่อีกทีจ้า', 'น้ำตาลเชื่อว่าเธอทำได้!', 'หายใจลึกๆ แล้วไปลุยกันใหม่!'];
let playerName = save.name || 'แบม';
const fmt = s => s.replaceAll('{name}', playerName);

/* ================================================================ audio */
const snd = new Sound(); snd.mv = save.music; snd.fv = save.fx;
const audioInit = () => snd.init();

/* ================================================================ stage & renderer */
const stage = $('stage'), canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap; renderer.shadowMap.autoUpdate = false;
let rt = null, SW = 1280, SH = 720;

// colour grading pass: whole world can go black & white, while layer-1 objects (warnings, fire) stay vivid
const gradeMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, sat: { value: .1 }, con: { value: 1 }, bri: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; uniform float sat, con, bri; varying vec2 vUv;
    void main(){
      vec4 c = linearToOutputTexel(texture2D(tColor, vUv));
      float l = dot(c.rgb, vec3(.299, .587, .114));
      vec3 g = mix(vec3(l), c.rgb, sat);
      g = (g - .5) * con + .5 + bri;
      gl_FragColor = vec4(clamp(g, 0., 1.), 1.);
      gl_FragDepthEXT = texture2D(tDepth, vUv).x;
    }`,
  depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, extensions: { fragDepth: true },
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
{ const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradeMat); q.frustumCulled = false; quadScene.add(q); }

function layout() {
  const w = Math.floor(Math.min(innerWidth, innerHeight * 16 / 9)), h = Math.floor(w * 9 / 16);
  SW = w; SH = h;
  stage.style.width = w + 'px'; stage.style.height = h + 'px'; stage.style.fontSize = (w / 1280 * 16) + 'px';
  const px = Math.max(2, Math.round(h / 260)), rw = Math.round(w / px), rh = Math.round(h / px);
  renderer.setSize(rw, rh, false);
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  rt.depthTexture = new THREE.DepthTexture(rw, rh);
}
function renderFrame(sc, cam, g) {
  gradeMat.uniforms.sat.value = g.sat; gradeMat.uniforms.con.value = g.con; gradeMat.uniforms.bri.value = g.bri;
  renderer.shadowMap.needsUpdate = true;
  cam.layers.set(0);
  renderer.setRenderTarget(rt); renderer.render(sc, cam);
  renderer.setRenderTarget(null);
  gradeMat.uniforms.tColor.value = rt.texture; gradeMat.uniforms.tDepth.value = rt.depthTexture;
  renderer.render(quadScene, quadCam);
  cam.layers.set(1);
  const bgc = sc.background; sc.background = null; renderer.autoClear = false;
  renderer.render(sc, cam);
  renderer.autoClear = true; sc.background = bgc; cam.layers.set(0);
}

/* ================================================================ world scene */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef0);
scene.fog = new THREE.Fog(0xe9eef0, 8, 40);
const camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 600);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a9aa0, 1.25);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.002;
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
scene.add(hemi, sun, sun.target);

const gtex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(0,0,0,${rand(.03, .08)})`; x.fillRect(rand(0, 32) | 0, rand(0, 32) | 0, 1 + (Math.random() * 2 | 0), 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.repeat.set(160, 160); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), new THREE.MeshLambertMaterial({ map: gtex, color: 0xb9dca8 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const vc = CH.vcMat();
const inst = (geo, n, shadow = false) => { const m = new THREE.InstancedMesh(geo, vc, n); m.count = 0; m.frustumCulled = false; m.castShadow = shadow; scene.add(m); return m; };
const tufts = inst(CH.tuftGeo(), 1200), pebbles = inst(CH.pebbleGeo(), 600);
const treeBare = inst(CH.treeBareGeo(), 300, true), treeCrown = inst(CH.treeCrownGeo(), 300, true), flowers = inst(CH.flowerGeo(), 1500);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _e = new THREE.Euler(), _v = new V3(), _w = new V3();
function setInst(mesh, i, x, y, z, ry, s) { _p.set(x, y, z); _q.setFromEuler(_e.set(0, ry, 0)); _s.set(s, s, s); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); }

const world = { arena: null, arenaR: 13, bloomC: new V3(), bloomR: 0, treeObst: [], focus: new V3() };
let decorCell = '', treesOn = false, sproutBurst = 0, lastSprout = 0;
const trees = new Map();
function updateDecor(f) {
  const C = 2.5, cx = Math.floor(f.x / C), cz = Math.floor(f.z / C), key = cx + ',' + cz;
  if (key === decorCell) return; decorCell = key;
  let nt = 0, np = 0;
  for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) {
    const gx = cx + i, gz = cz + j, h = hash(gx, gz, 1), x = (gx + hash(gx, gz, 2)) * C, z = (gz + hash(gx, gz, 3)) * C;
    if (Math.abs(x) < 3.2 && z > -1.5 && z < 8) continue; // keep the title shot clear
    if (h < .42) setInst(tufts, nt++, x, 0, z, h * 40, .8 + hash(gx, gz, 4) * .7);
    else if (h > .94) setInst(pebbles, np++, x, 0, z, h * 40, 1 + hash(gx, gz, 5) * 1.6);
  }
  tufts.count = nt; pebbles.count = np; tufts.instanceMatrix.needsUpdate = pebbles.instanceMatrix.needsUpdate = true;
}
function updateTrees(f) {
  world.treeObst.length = 0;
  if (!treesOn) { treeBare.count = treeCrown.count = 0; return; }
  const C = 8, cx = Math.floor(f.x / C), cz = Math.floor(f.z / C);
  let n = 0;
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
    const gx = cx + i, gz = cz + j;
    if (hash(gx, gz, 7) > .22) continue;
    const key = gx + ',' + gz;
    let r = trees.get(key);
    if (!r) {
      r = { x: (gx + .2 + hash(gx, gz, 8) * .6) * C, z: (gz + .2 + hash(gx, gz, 9) * .6) * C, s: .8 + hash(gx, gz, 10) * .6, ry: hash(gx, gz, 11) * 6.28,
        birth: gameTime + (gameTime < sproutBurst ? rand(0, 2.2) : rand(0, .5)), popped: false };
      trees.set(key, r);
    }
    if (world.arena && !r.goneAt && Math.hypot(r.x - world.arena.x, r.z - world.arena.z) < world.arenaR) r.goneAt = gameTime;
    const k = clamp01((gameTime - r.birth) / .7);
    if (k > 0 && !r.popped) { r.popped = true; if (gameTime - lastSprout > .12 && Math.hypot(r.x - f.x, r.z - f.z) < 30) { lastSprout = gameTime; snd.sfx('sprout'); } }
    let sc = (k > 0 ? backOut(k) : 0) * r.s;
    if (r.goneAt) sc *= 1 - clamp01((gameTime - r.goneAt) / .45);
    if (sc <= .01) continue;
    setInst(treeBare, n, r.x, 0, r.z, r.ry, sc);
    let lk = 0;
    if (world.bloomR > 0) lk = clamp01((world.bloomR - Math.hypot(r.x - world.bloomC.x, r.z - world.bloomC.z)) / 8);
    setInst(treeCrown, n, r.x, 0, r.z, r.ry, sc * (lk > 0 ? backOut(lk) : 0));
    if (sc > .5) world.treeObst.push(r);
    n++;
  }
  treeBare.count = treeCrown.count = n; treeBare.instanceMatrix.needsUpdate = treeCrown.instanceMatrix.needsUpdate = true;
}
function updateFlowers(f) {
  if (world.bloomR <= 0) { flowers.count = 0; return; }
  const C = 1.7, cx = Math.floor(f.x / C), cz = Math.floor(f.z / C);
  let n = 0;
  for (let i = -17; i <= 17 && n < 1500; i++) for (let j = -17; j <= 17 && n < 1500; j++) {
    const gx = cx + i, gz = cz + j, h = hash(gx, gz, 21);
    if (h > .33) continue;
    const x = (gx + hash(gx, gz, 22)) * C, z = (gz + hash(gx, gz, 23)) * C;
    const k = clamp01((world.bloomR - Math.hypot(x - world.bloomC.x, z - world.bloomC.z)) / 5);
    if (k <= 0) continue;
    setInst(flowers, n++, x, 0, z, h * 30, backOut(k) * (.8 + hash(gx, gz, 24) * .6));
  }
  flowers.count = n; flowers.instanceMatrix.needsUpdate = true;
}
const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0, emissive: 0x777777 });
const clouds = new THREE.Group(); scene.add(clouds); clouds.visible = false;
{ const g = CH.cloudGeo(); for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(g, cloudMat), a = i / 18 * 6.28 + rand(0, .3), r = rand(22, 75); m.position.set(Math.cos(a) * r, rand(16, 30), Math.sin(a) * r); m.scale.setScalar(rand(1.2, 2.6)); m.rotation.y = rand(0, 6); clouds.add(m); } }

/* ================================================================ vivid layer-1 effects */
const teleCircleGeo = new THREE.CircleGeometry(1, 28), teleRingGeo = new THREE.RingGeometry(.88, 1, 32), telePlane = new THREE.PlaneGeometry(1, 1);
const teles = [];
const redMat = (o) => new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: o, depthWrite: false, fog: false });
function onLayer1(o) { o.traverse(x => x.layers.set(1)); return o; }
function teleCircle(x, z, r, dur) {
  const g = new THREE.Group(), fill = new THREE.Mesh(teleCircleGeo, redMat(.35)), ring = new THREE.Mesh(teleRingGeo, redMat(.95));
  fill.rotation.x = ring.rotation.x = -Math.PI / 2; g.add(fill, ring); g.position.set(x, .05, z); g.scale.setScalar(r);
  scene.add(onLayer1(g));
  const t = { g, fill, ring, t: 0, dur, kind: 'c', x, z, r }; teles.push(t); return t;
}
function teleLine(from, yaw, len, width, dur) {
  const g = new THREE.Group(), fill = new THREE.Mesh(telePlane, redMat(.32)), core = new THREE.Mesh(telePlane, redMat(.8));
  fill.rotation.x = core.rotation.x = -Math.PI / 2;
  fill.position.set(0, .05, len / 2); fill.scale.set(width, len, 1);
  core.position.set(0, .06, 0); core.scale.set(width * .25, .001, 1);
  g.add(fill, core); g.position.set(from.x, 0, from.z); g.rotation.y = yaw;
  scene.add(onLayer1(g));
  const t = { g, fill, ring: core, t: 0, dur, kind: 'l', len, width }; teles.push(t); return t;
}
function removeTele(t) { if (!t) return; const i = teles.indexOf(t); if (i >= 0) teles.splice(i, 1); scene.remove(t.g); t.g.traverse(o => o.material && o.material.dispose()); }
function updateTeles(dt) {
  for (const t of teles.slice()) {
    t.t += dt; const k = clamp01(t.t / t.dur);
    if (t.kind === 'c') { t.fill.scale.setScalar(Math.max(.01, k)); t.ring.material.opacity = .6 + Math.sin(t.t * 18) * .35; }
    else { t.ring.position.z = t.len * k / 2; t.ring.scale.y = Math.max(.001, t.len * k); t.fill.material.opacity = .22 + Math.sin(t.t * 16) * .12; }
    if (t.life && t.t > t.life) removeTele(t);
  }
}
function clearTeles() { for (const t of teles.slice()) removeTele(t); }

class Particles {
  constructor(max, layer) {
    this.max = max; this.i = 0; this.ps = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: layer === 0 }), max);
    this.mesh.frustumCulled = false; this.mesh.layers.set(layer);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) { this.ps.push({ idx: i, life: 0, max: 1, pos: new V3(), vel: new V3(), size: .1, grav: 0, drag: 0 }); this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, c); }
    scene.add(this.mesh); this.col = new THREE.Color();
  }
  spawn(pos, vel, { life = .8, size = .15, color = 0xffffff, grav = -6, drag = 1 } = {}) {
    const p = this.ps[this.i]; this.i = (this.i + 1) % this.max;
    p.life = p.max = life; p.pos.copy(pos); p.vel.copy(vel); p.size = size; p.grav = grav; p.drag = drag;
    this.mesh.setColorAt(p.idx, this.col.set(color)); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (const p of this.ps) {
      if (p.life <= 0) { if (p.alive) { p.alive = false; this.mesh.setMatrixAt(p.idx, _m.makeScale(0, 0, 0)); } continue; }
      p.alive = true; p.life -= dt;
      p.vel.y += p.grav * dt; p.vel.multiplyScalar(Math.exp(-p.drag * dt)); p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0) { p.pos.y = 0; p.vel.y *= -.3; }
      const s = p.size * clamp01(p.life / p.max * 1.6);
      _s.set(s, s, s); _q.setFromEuler(_e.set(p.life * 3, p.life * 2, 0)); _m.compose(p.pos, _q, _s); this.mesh.setMatrixAt(p.idx, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const p of this.ps) p.life = 0; }
}
const dust = new Particles(500, 0), vivid = new Particles(500, 1);
function puff(pos, n = 12, color = 0xffffff, power = 3, size = .3) {
  pos = pos.clone();
  for (let i = 0; i < n; i++) { const a = rand(0, 6.28); dust.spawn(_v.set(pos.x, .15, pos.z), _w.set(Math.cos(a) * power * rand(.5, 1), rand(.5, 2), Math.sin(a) * power * rand(.5, 1)), { life: rand(.4, .9), size: rand(size * .6, size), color, grav: -2, drag: 3 }); }
}
function sparkle(pos, n = 8, colors = [0xfff07a, 0xffffff, 0xffb8d6], spread = .6) {
  pos = pos.clone();
  for (let i = 0; i < n; i++) vivid.spawn(_v.set(pos.x + rand(-spread, spread), pos.y + rand(-spread, spread), pos.z + rand(-spread, spread)), _w.set(rand(-1, 1), rand(.5, 2.5), rand(-1, 1)), { life: rand(.5, 1), size: rand(.08, .18), color: pick(colors), grav: -1, drag: 1.5 });
}
const guideStar = onLayer1(new THREE.Mesh(CH.GEO.oct, new THREE.MeshBasicMaterial({ color: 0xffe14d, fog: false })));
guideStar.scale.set(.5, .7, .5); guideStar.visible = false; scene.add(guideStar);
const stunStars = new THREE.Group(); scene.add(stunStars); stunStars.visible = false;
for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(CH.GEO.oct, new THREE.MeshBasicMaterial({ color: 0xffe14d, fog: false })); s.scale.setScalar(.28); stunStars.add(s); }
onLayer1(stunStars);
const dropShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
dropShadow.rotation.x = -Math.PI / 2; dropShadow.position.y = .04; scene.add(dropShadow);

/* ================================================================ characters & props */
const girl = CH.makeHuman({ gender: 'girl' }); scene.add(girl.g);
const dog = CH.makeDog(); CH.castShadows(dog.g); scene.add(dog.g); dog.g.visible = false;
const bear = CH.makeBear(); scene.add(bear.g); bear.g.visible = false;
const boy = CH.makeHuman({ gender: 'boy', accessories: ['glasses'] }); scene.add(boy.g); boy.g.visible = false;
const hammer = CH.makeHammer(); CH.castShadows(hammer); scene.add(hammer); hammer.visible = false;
const pedestal = CH.makePedestal(); pedestal.receiveShadow = true; scene.add(pedestal); pedestal.visible = false;
const heldSandwich = CH.makeSandwich(); heldSandwich.position.set(0, -.42, .16); heldSandwich.scale.setScalar(.8); girl.armL.add(heldSandwich); heldSandwich.visible = false;
const boySandwich = CH.makeSandwich(); boySandwich.position.set(0, -.42, .14); boySandwich.rotation.x = 1.2; boySandwich.scale.setScalar(.75); boy.armR.add(boySandwich);
const flySandwich = CH.makeSandwich(); scene.add(flySandwich); flySandwich.visible = false;

/* ================================================================ input */
const keys = {}; let pressed = {}; let mouseR = false, lookAccum = 0, lockFailed = false;
const isLocked = () => document.pointerLockElement === canvas;
function requestLock() {
  if (lockFailed) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockFailed = true; hidePause(); }); } catch (e) { lockFailed = true; }
}
function exitLock() { if (isLocked()) document.exitPointerLock(); }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.code === 'Enter') { audioInit(); onStart(); } return; }
  audioInit();
  keys[e.code] = true; if (!e.repeat) pressed[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseR = false; });
document.addEventListener('mousemove', e => {
  if (isLocked() || ((e.buttons & 1) && mode === 'story')) {
    cam.yaw -= e.movementX * .0026; cam.pitch = clamp(cam.pitch + e.movementY * .0022, -.12, 1.1);
    lookAccum += Math.abs(e.movementX) + Math.abs(e.movementY);
  }
  if (mode === 'whack') moveHammerCursor(e);
});
canvas.addEventListener('mousedown', e => {
  audioInit();
  if (mode === 'story' && !isLocked() && needLock()) requestLock();
  if (e.button === 0) pressed.Mouse0 = true;
  if (e.button === 2) mouseR = true;
  if (mode === 'whack' && e.button === 0) whackClick(e);
});
addEventListener('mouseup', e => { if (e.button === 2) mouseR = false; });
stage.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockerror', () => { lockFailed = true; hidePause(); });
document.addEventListener('pointerlockchange', () => {
  if (!isLocked() && mode === 'story' && needLock() && !anyModal()) showPause();
  if (isLocked()) hidePause();
});

/* ================================================================ tweens · scripting · dialog */
let gameTime = 0;
const tweens = [];
function tween(dur, fn, done) { const tw = { t: 0, dur, fn, done }; tweens.push(tw); return tw; }
function runTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; if (!tw) continue; tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur); if (!tw.cancel) tw.fn(k);
    if (k >= 1) { tweens.splice(tweens.indexOf(tw), 1); if (!tw.cancel && tw.done) tw.done(); }
  }
}
let token = 0; const ABORT = { abort: true }; const waiters = [];
function until(cond) { const tk = token; return new Promise((res, rej) => waiters.push({ cond, res, rej, tk })); }
const wait = s => { const t = gameTime + s; return until(() => gameTime >= t); };
function runWaiters() {
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    if (w.tk !== token) { waiters.splice(i, 1); w.rej(ABORT); continue; }
    let ok = false; try { ok = w.cond(); } catch (e) {}
    if (ok) { waiters.splice(i, 1); w.res(); }
  }
}
function abortStory() { token++; runWaiters(); }
const swallow = e => { if (e !== ABORT) console.error(e); };
const bg = p => { (typeof p === 'function' ? p() : p).catch(swallow); };
const runScript = fn => fn().catch(swallow);

const subEl = $('sub'), subWho = subEl.querySelector('.who'), subTxt = subEl.querySelector('.txt');
const segm = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
const graphemes = s => segm ? [...segm.segment(s)].map(x => x.segment) : Array.from(s);
const dlg = { q: [], cur: null };
const said = new Set();
function say(text, opt = {}) {
  const line = { g: graphemes(fmt(text)), who: opt.who || 'dog', hold: opt.hold, done: false, shown: 0, t: 0 };
  if (opt.now) { clearDialog(); }
  dlg.q.push(line); return until(() => line.done);
}
function sayOnce(key, text, opt) { if (said.has(key)) return; said.add(key); bg(say(text, opt)); }
function clearDialog() { for (const l of dlg.q) l.done = true; dlg.q.length = 0; if (dlg.cur) dlg.cur.done = true; dlg.cur = null; subEl.classList.add('hide'); }
function updateDialog(dt) {
  if (!dlg.cur) {
    if (!dlg.q.length) { subEl.classList.add('hide'); return; }
    dlg.cur = dlg.q.shift(); subWho.textContent = dlg.cur.who === 'dog' ? 'น้ำตาล 🐶' : dlg.cur.who === 'girl' ? playerName : 'เขา';
    subTxt.textContent = ''; subEl.classList.remove('hide');
  }
  const L = dlg.cur;
  if (L.shown < L.g.length) {
    const b = Math.floor(L.shown); L.shown = Math.min(L.g.length, L.shown + dt * 30); const n = Math.floor(L.shown);
    if (n !== b) { subTxt.textContent = L.g.slice(0, n).join(''); if ((n >> 1) !== (b >> 1)) snd.voice(L.who); }
  } else { L.t += dt; if (L.t >= (L.hold ?? clamp(L.g.length * .055, 1.4, 3.6))) { L.done = true; dlg.cur = null; } }
}
const dogTalking = () => dlg.cur && dlg.cur.who === 'dog' && dlg.cur.shown < dlg.cur.g.length;

const WASD = '<div class="keys-grid"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></div>';
const PROMPTS = {
  wasd: WASD,
  mouse: '<span class="arrows">◀</span><span class="mouse"></span><span class="arrows">▶</span>',
  run: '<span class="key mid">SHIFT</span><span class="plus">+</span>' + WASD,
  jump: '<span class="key wide">SPACE</span>',
  look: '<span class="mouse"><i class="rb on"></i></span><span class="hold">HOLD</span>',
  attack: '<span class="mouse"><i class="lb on"></i></span>',
  jumpAttack: '<span class="key wide">SPACE</span><span class="plus">+</span><span class="mouse"><i class="lb on"></i></span>',
};
const promptEl = $('prompt');
function showPrompt(k) { promptEl.innerHTML = PROMPTS[k]; promptEl.className = ''; }
function hidePrompt() { promptEl.className = 'hide'; }
async function promptDone() { promptEl.classList.add('done'); snd.sfx('ok'); await wait(.6); hidePrompt(); }
let hintTarget = null; const hintEl = $('hint');
function updateHint(cam_) {
  if (!hintTarget) { hintEl.classList.add('hide'); return; }
  _v.copy(hintTarget).project(cam_);
  if (_v.z > 1) { hintEl.classList.add('hide'); return; }
  hintEl.style.left = ((_v.x + 1) / 2 * 100) + '%'; hintEl.style.top = ((1 - _v.y) / 2 * 100) + '%'; hintEl.classList.remove('hide');
}

/* ================================================================ looks (colour mood) */
const LOOKS = {
  pale: { sky: 0xe9eef0, ground: 0xc9d6c4, near: 6, far: 34, sat: .1, con: .92, bri: .04 },
  soft: { sky: 0xdfeaf0, ground: 0xb9d4ac, near: 8, far: 44, sat: .34, con: .97, bri: .02 },
  dark: { sky: 0xd2dade, ground: 0xaec6a2, near: 9, far: 48, sat: .14, con: 1.14, bri: -.02 },
  rage: { sky: 0xd8c6bc, ground: 0xb8ae98, near: 9, far: 48, sat: .42, con: 1.16, bri: -.03 },
  bloom: { sky: 0xa8dcff, ground: 0x8fd47e, near: 35, far: 170, sat: 1.12, con: 1.02, bri: .02 },
  title2: { sky: 0xb4e0ff, ground: 0x93d683, near: 16, far: 90, sat: 1.08, con: 1.02, bri: .02 },
};
const WHACK_GRADE = { sat: 1.05, con: 1.02, bri: .02 };
const look = { sky: new THREE.Color(0xe9eef0), ground: new THREE.Color(0xc9d6c4), near: 6, far: 34, sat: .1, con: .92, bri: .04 };
let lookTw = null;
function setLook(name, dur = 0) {
  const to = LOOKS[name], from = { sky: look.sky.clone(), ground: look.ground.clone(), near: look.near, far: look.far, sat: look.sat, con: look.con, bri: look.bri };
  const sky = new THREE.Color(to.sky), gr = new THREE.Color(to.ground);
  if (lookTw) lookTw.cancel = true;
  const apply = k => { look.sky.copy(from.sky).lerp(sky, k); look.ground.copy(from.ground).lerp(gr, k); for (const p of ['near', 'far', 'sat', 'con', 'bri']) look[p] = lerp(from[p], to[p], k); };
  if (dur <= 0) { apply(1); lookTw = null; return; }
  lookTw = tween(dur, k => apply(ease(k)));
}
function applyLook() {
  scene.background.copy(look.sky); scene.fog.color.copy(look.sky); scene.fog.near = look.near; scene.fog.far = look.far;
  ground.material.color.copy(look.ground);
}

/* ================================================================ camera */
const cam = { yaw: 0, moveYaw: 0, locking: false, returning: false, pitch: .32, mode: 'follow', look: new V3(), anim: null, blend: null, custom: null, shake: 0 };
function cineTo(pos, lookAt, dur = 1.5, fn = ease) {
  const a = { p0: camera.position.clone(), p1: pos.clone(), l0: cam.look.clone(), l1: lookAt.clone(), t: 0, dur: Math.max(.0001, dur), fn };
  cam.mode = 'cine'; cam.anim = a; cam.blend = null;
  return until(() => a.t >= a.dur || cam.anim !== a);
}
function cineFollow(dur = 1) { cam.mode = 'follow'; cam.blend = { p0: camera.position.clone(), l0: cam.look.clone(), t: 0, dur }; }
const camForward = () => new V3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
const yawLookingAlong = d => Math.atan2(-d.x, -d.z);
function updateCamera(dt) {
  if (cam.mode === 'follow') {
    const lockable = bear.g.visible && ['chase', 'hammer', 'fight'].includes(phase) && mouseR;
    if (lockable && !cam.locking) { cam.locking = true; cam.moveYaw = cam.yaw; }
    if (!lockable && cam.locking) { cam.locking = false; cam.returning = true; }
    if (cam.returning) { cam.yaw = lerpAngle(cam.yaw, cam.moveYaw, 1 - Math.exp(-dt * 9)); if (Math.abs(lerpAngle(0, cam.moveYaw - cam.yaw, 1)) < .02) cam.returning = false; }
    if (lockable) { cam.yaw = lerpAngle(cam.yaw, yawLookingAlong(_v.set(BR.pos.x - P.pos.x, 0, BR.pos.z - P.pos.z)), 1 - Math.exp(-dt * 8)); cam.pitch = lerp(cam.pitch, .28, 1 - Math.exp(-dt * 5)); }
    const dist = phase === 'fight' ? 10.5 : 7.5;
    const tgt = _w.set(P.pos.x, P.pos.y + 1.45, P.pos.z);
    _p.set(tgt.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist, Math.max(.5, tgt.y + Math.sin(cam.pitch) * dist), tgt.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist);
    if (cam.blend) {
      cam.blend.t += dt; const k = ease(Math.min(1, cam.blend.t / cam.blend.dur));
      camera.position.lerpVectors(cam.blend.p0, _p, k); cam.look.lerpVectors(cam.blend.l0, tgt, k);
      if (k >= 1) cam.blend = null;
    } else { camera.position.copy(_p); cam.look.copy(tgt); }
  } else if (cam.mode === 'cine' && cam.anim) {
    const a = cam.anim; a.t += dt; const k = a.fn(Math.min(1, a.t / a.dur));
    camera.position.lerpVectors(a.p0, a.p1, k); cam.look.lerpVectors(a.l0, a.l1, k);
  } else if (cam.mode === 'custom' && cam.custom) cam.custom(dt);
  if (cam.shake > 0) {
    const s = cam.shake * .35; camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
  }
  camera.lookAt(cam.look);
}

/* ================================================================ player */
const P = { pos: new V3(), vel: new V3(), kb: new V3(), vy: 0, onGround: true, yaw: Math.PI, hp: 6, maxHp: 6, inv: 0, grabbed: false, swing: 0, swingHit: false,
  hasHammer: false, carrying: false, walkPhase: 0, moveAmt: 0, running: false, patting: false };
const WALK = 4.4, RUN = 7.9, JUMP = 8, GRAV = 22;
let ctrl = false, canRun = true, canJump = true;
const stats = { moved: 0, run: 0, jumps: 0 };
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (ctrl && !P.grabbed) {
    ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  }
  const my = cam.locking || cam.returning ? cam.moveYaw : cam.yaw;
  const fx = -Math.sin(my), fz = -Math.cos(my), rx = Math.cos(my), rz = -Math.sin(my);
  let mx = rx * ix - fx * iz, mz = rz * ix - fz * iz;
  const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
  P.running = ml > 0 && canRun && (keys.ShiftLeft || keys.ShiftRight);
  const sp = ml > 0 ? (P.running ? RUN : WALK) : 0;
  const acc = 1 - Math.exp(-dt * (P.onGround ? 12 : 5));
  P.vel.x = lerp(P.vel.x, mx * sp, acc); P.vel.z = lerp(P.vel.z, mz * sp, acc);
  if (!P.grabbed) {
    P.pos.x += (P.vel.x + P.kb.x) * dt; P.pos.z += (P.vel.z + P.kb.z) * dt;
    P.kb.multiplyScalar(Math.exp(-dt * 4));
    stats.moved += Math.hypot(P.vel.x, P.vel.z) * dt; if (P.running) stats.run += dt;
    if (pressed.Space && ctrl && canJump && P.onGround) { P.vy = JUMP; P.onGround = false; stats.jumps++; snd.sfx('jump'); }
    if (!P.onGround || P.pos.y > 0) {
      P.vy -= GRAV * dt; P.pos.y += P.vy * dt;
      if (P.pos.y <= 0) { P.pos.y = 0; if (!P.onGround) { snd.sfx(P.vy < -18 ? 'bigLand' : 'land'); puff(P.pos, P.vy < -18 ? 16 : 5, 0xffffff, P.vy < -18 ? 4 : 2, .25); } P.vy = 0; P.onGround = true; }
      else P.onGround = false;
    }
    if (ml > 0) P.yaw = lerpAngle(P.yaw, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    // collisions
    for (const t of world.treeObst) { const dx = P.pos.x - t.x, dz = P.pos.z - t.z, d = Math.hypot(dx, dz); if (d < .6 && d > 0) { P.pos.x = t.x + dx / d * .6; P.pos.z = t.z + dz / d * .6; } }
    if (bear.g.visible && BR.sc > .5 && !['fall', 'eat'].includes(BR.state)) {
      const dx = P.pos.x - BR.pos.x, dz = P.pos.z - BR.pos.z, d = Math.hypot(dx, dz), R = 2.05 * BR.sc;
      if (d < R && P.pos.y < 4) { const n = d || 1; P.pos.x = BR.pos.x + dx / n * R; P.pos.z = BR.pos.z + dz / n * R; }
    }
    if (boy.g.visible) { const dx = P.pos.x - boy.g.position.x, dz = P.pos.z - boy.g.position.z, d = Math.hypot(dx, dz); if (d < .9 && d > 0) { P.pos.x = boy.g.position.x + dx / d * .9; P.pos.z = boy.g.position.z + dz / d * .9; } }
  }
  if (P.inv > 0) P.inv -= dt;
  // attack
  if (pressed.Mouse0 && P.hasHammer && phase === 'fight' && P.swing <= 0 && !P.grabbed && ctrl) {
    P.swing = .38; P.swingHit = false; snd.sfx('swing');
    if (flat(P.pos, BR.pos) < 7) P.yaw = Math.atan2(BR.pos.x - P.pos.x, BR.pos.z - P.pos.z);
  }
  animateGirl(dt, ml > 0 && P.onGround);
}
function animateGirl(dt, moving) {
  P.moveAmt += ((moving ? 1 : 0) - P.moveAmt) * (1 - Math.exp(-dt * 10));
  const before = Math.floor(P.walkPhase / Math.PI);
  P.walkPhase += dt * (P.running ? 15 : 10.5) * P.moveAmt;
  if (Math.floor(P.walkPhase / Math.PI) !== before && P.onGround && P.moveAmt > .5) snd.sfx('step', P.running);
  const amp = P.running ? .95 : .7, sw = Math.sin(P.walkPhase) * amp * P.moveAmt;
  let ll = sw, lr = -sw, al = -sw * .8, ar = sw * .8, alz = 0, arz = 0, sy = 1;
  if (!P.onGround) { ll = .55; lr = -.35; al = -2.5; ar = -2.5; }
  if (P.grabbed) { ll = Math.sin(gameTime * 24) * .8; lr = -ll; al = -2.8 + Math.sin(gameTime * 20) * .3; ar = -2.8 - Math.sin(gameTime * 20) * .3; }
  if (P.carrying) al = -1.25;
  if (P.swing > 0) {
    P.swing -= dt; const k = 1 - Math.max(0, P.swing) / .38;
    ar = k < .35 ? lerp(0, -2.9, k / .35) : k < .6 ? lerp(-2.9, .5, (k - .35) / .25) : lerp(.5, 0, (k - .6) / .4);
    if (k >= .5 && !P.swingHit) resolveHit();
  }
  if (P.patting) { arz = 2.5 + Math.sin(gameTime * 7) * .12; ar = 0; sy = 3.2; if (Math.sin(gameTime * 7) > .98 && !P.patSnd) { P.patSnd = true; snd.sfx('pat'); } if (Math.sin(gameTime * 7) < 0) P.patSnd = false; }
  const k = 1 - Math.exp(-dt * 18);
  girl.legL.rotation.x = lerp(girl.legL.rotation.x, ll, k); girl.legR.rotation.x = lerp(girl.legR.rotation.x, lr, k);
  girl.armL.rotation.x = lerp(girl.armL.rotation.x, al, k); girl.armR.rotation.x = P.swing > 0 ? ar : lerp(girl.armR.rotation.x, ar, k);
  girl.armR.rotation.z = lerp(girl.armR.rotation.z, arz, k); girl.armL.rotation.z = alz; girl.armR.scale.y = lerp(girl.armR.scale.y, sy, k);
  const bob = P.onGround ? Math.abs(Math.sin(P.walkPhase)) * .1 * P.moveAmt + (1 - P.moveAmt) * Math.sin(gameTime * 2.2) * .02 : 0;
  girl.g.position.set(P.pos.x, P.pos.y + bob, P.pos.z);
  girl.g.rotation.y = P.yaw;
  girl.head.rotation.z = Math.sin(P.walkPhase * .5) * .06 * P.moveAmt;
  girl.g.visible = !(P.inv > 0 && !P.grabbed && Math.floor(gameTime * 12) % 2);
}

/* ================================================================ Nam Tan (dog) */
let dollState = 'none';
function placeDollAhead(dist) {
  const d = Math.hypot(P.vel.x, P.vel.z) > .5 ? new V3(P.vel.x, 0, P.vel.z).normalize() : camForward();
  if (dog.g.parent !== scene) scene.add(dog.g);
  dog.g.position.set(P.pos.x + d.x * dist, 0, P.pos.z + d.z * dist);
  dog.g.rotation.set(0, Math.atan2(P.pos.x - dog.g.position.x, P.pos.z - dog.g.position.z), 0);
  dog.g.scale.setScalar(1); dog.g.visible = true; dollState = 'ground';
}
function dogOnBack() {
  girl.g.add(dog.g); dog.g.position.set(0, .48, -.36); dog.g.rotation.set(0, Math.PI, 0); dog.g.scale.setScalar(.55); dog.g.visible = true; dollState = 'back';
}
function pickupDoll() {
  dollState = 'flying'; hintTarget = null; snd.sfx('doll');
  const from = dog.g.position.clone();
  sparkle(_v.set(from.x, .6, from.z), 14);
  tween(.6, k => {
    girl.g.updateMatrixWorld(); const to = girl.g.localToWorld(_w.set(0, .48, -.36));
    dog.g.position.lerpVectors(from, to, easeOut(k)); dog.g.position.y += Math.sin(k * Math.PI) * 1.5;
    dog.g.scale.setScalar(lerp(1, .55, k)); dog.g.rotation.y += .3;
  }, () => dogOnBack());
}
function updateDog(dt) {
  if (dollState === 'ground') {
    dog.tail.rotation.y = Math.sin(gameTime * 8) * .5;
    if (Math.random() < dt * 6) sparkle(_v.set(dog.g.position.x, 1.1, dog.g.position.z), 1, [0xfff07a, 0xffffff], .5);
    const d = flat(P.pos, dog.g.position);
    if (d > 26) placeDollAhead(15);
    if (d < 2.4) { hintTarget = _p.set(dog.g.position.x, 1.5, dog.g.position.z).clone(); if (pressed.KeyE) pickupDoll(); }
    else if (hintTarget && dollState === 'ground') hintTarget = null;
  } else if (dollState === 'back' || dollState === 'sit') {
    dog.tail.rotation.y = Math.sin(gameTime * (dollState === 'sit' ? 6 : 10)) * .5;
    const talk = dogTalking();
    dog.head.rotation.x = talk ? Math.sin(gameTime * 18) * .12 : 0;
    const sway = dollState === 'back' ? Math.sin(P.walkPhase) * .35 * P.moveAmt : Math.sin(gameTime * 1.5) * .05;
    dog.earL.rotation.z = -.12 - sway - (P.onGround ? 0 : .5); dog.earR.rotation.z = .12 - sway + (P.onGround ? 0 : .5);
  }
}

/* ================================================================ the bear */
const BR = { pos: new V3(), yaw: 0, state: 'hidden', t: 0, hp: 12, max: 12, rage: false, hungry: false, fed: false, atk: 0, last: '', dir: new V3(),
  run: 0, phase: 0, flash: 0, sub: 0, mash: 0, drain: 0, sc: 1, recoverDur: .8, circles: [], line: null, notYet: 0, moving: 0, lastStomp: 0 };
const bearSet = s => { BR.state = s; BR.t = 0; BR.sub = 0; };
const bearVulnerable = () => ['idle', 'recover', 'tired', 'stunned'].includes(BR.state);
const bearFwd = () => _w.set(Math.sin(BR.yaw), 0, Math.cos(BR.yaw));
function updateBear(dt) {
  if (!bear.g.visible) return;
  BR.t += dt;
  const dx = P.pos.x - BR.pos.x, dz = P.pos.z - BR.pos.z, d = Math.hypot(dx, dz);
  const faceP = (r = 6) => { BR.yaw = lerpAngle(BR.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * r)); };
  let moving = 0;
  switch (BR.state) {
    case 'roar': faceP(4); if (BR.t > 1.8 && phase === 'fight') bearSet('idle'); break;
    case 'chase': {
      faceP(8);
      const ramp = clamp01((BR.t - 1.2) / 2.5), sp = (phase === 'hammer' ? 5.7 : 6.5 + Math.max(0, d - 13) * .35) * ramp;
      if (d > 1) { BR.pos.x += dx / d * sp * dt; BR.pos.z += dz / d * sp * dt; }
      moving = sp;
      if (d < 2.45) gameOver('chase');
      break;
    }
    case 'idle': faceP(6); if (d > 7) { BR.pos.x += dx / d * 2.8 * dt; BR.pos.z += dz / d * 2.8 * dt; moving = 2.8; } if (BR.t > (BR.rage ? .6 : 1.0)) chooseAttack(); break;
    case 'chargeWind':
      if (BR.t < .65) { faceP(10); if (BR.line) { BR.line.g.position.set(BR.pos.x, 0, BR.pos.z); BR.line.g.rotation.y = BR.yaw; } }
      if (BR.t >= 1.0) { BR.dir.set(Math.sin(BR.yaw), 0, Math.cos(BR.yaw)); bearSet('charge'); BR.run = 0; snd.sfx('charge'); }
      break;
    case 'charge': {
      const sp = 16; BR.pos.addScaledVector(BR.dir, sp * dt); BR.run += sp * dt; moving = sp;
      if (Math.random() < .6) puff(BR.pos, 1, 0xffffff, 1.5, .4);
      if (!P.grabbed && P.inv <= 0 && d < 2.4 && P.pos.y < 1.15 && phase === 'fight') { startGrab(); break; }
      if (BR.run >= 19) { removeTele(BR.line); BR.line = null; bearSet('recover'); BR.recoverDur = .9; }
      break;
    }
    case 'slamWind': faceP(4); if (BR.t >= 1.25) { bearSet('slamHit'); resolveSlam(); } break;
    case 'slamHit': if (BR.t > .55) { bearSet('recover'); BR.recoverDur = .8; } break;
    case 'rocks':
      faceP(6);
      if (BR.sub < 3 && BR.t >= .6 + BR.sub * .45) { const tg = BR.sub === 0 ? P.pos : _v.set(P.pos.x + rand(-2.6, 2.6), 0, P.pos.z + rand(-2.6, 2.6)); throwRock(tg); BR.sub++; }
      if (BR.t > 2.3) { bearSet('recover'); BR.recoverDur = .6; }
      break;
    case 'recover': faceP(2); if (BR.t > BR.recoverDur) bearSet('idle'); break;
    case 'tired':
      if (Math.random() < dt * 3) dust.spawn(_v.set(BR.pos.x + rand(-1, 1), 4.2, BR.pos.z + rand(-1, 1)), _w.set(rand(-.5, .5), 1, rand(-.5, .5)), { life: .8, size: .18, color: 0xbfe6ff, grav: -6 });
      if (BR.t > (BR.rage ? 3.4 : 3.8)) bearSet('idle');
      break;
    case 'stunned': if (BR.t > 3) { bearSet('recover'); BR.recoverDur = .6; } break;
    case 'grab': updateGrab(dt); break;
    case 'transform': cam.shake = Math.max(cam.shake, .25); if (BR.t > 2.3) bearSet('idle'); break;
  }
  BR.moving = moving;
  if (moving > 4 && BR.sc > .6) {
    const s = Math.floor(BR.phase / Math.PI);
    if (s !== BR.lastStomp) { BR.lastStomp = s; snd.sfx('stomp'); const near = clamp01(1 - d / 18); cam.shake = Math.max(cam.shake, .25 * near); puff(BR.pos, 3, 0xffffff, 2, .45); }
  }
  if (BR.rage && !BR.fed) for (let i = 0; i < 3; i++) {
    const a = rand(0, 6.28), r = rand(1.2, 1.9);
    vivid.spawn(_v.set(BR.pos.x + Math.cos(a) * r, rand(.5, 5.2) * BR.sc, BR.pos.z + Math.sin(a) * r), _w.set(0, rand(1.5, 3.5), 0), { life: rand(.35, .7), size: rand(.2, .5), color: pick([0xff4a12, 0xff8a1f, 0xffc93a]), grav: 2, drag: 1 });
  }
  stunStars.visible = BR.state === 'stunned';
  if (stunStars.visible) {
    stunStars.position.set(BR.pos.x, 4.2, BR.pos.z);
    stunStars.children.forEach((s, i) => { const a = gameTime * 4 + i * Math.PI / 2; s.position.set(Math.cos(a) * 1.6, Math.sin(a * 2) * .2, Math.sin(a) * 1.6); s.rotation.y = a * 2; });
  }
  BR.flash = Math.max(0, BR.flash - dt * 5);
  bear.mat.emissive.setRGB(BR.flash * .9 + (BR.rage && !BR.fed ? .18 : 0), BR.flash * .9 + (BR.rage && !BR.fed ? .05 : 0), BR.flash * .9);
  bear.g.position.copy(BR.pos); bear.g.rotation.y = BR.yaw; bear.g.scale.setScalar(BR.sc);
  bearPose(dt, moving);
}
function bearPose(dt, moving) {
  const s = BR.state, t = BR.t;
  BR.phase += dt * (moving > 10 ? 11 : moving > 0 ? 6.5 : 0);
  let ll = 0, lr = 0, la = 0, ra = 0, rootY = 0, rootX = 0, headX = 0, headZ = 0, jit = 0;
  if (moving) { ll = Math.sin(BR.phase) * .65; lr = -ll; la = -ll * .7; ra = ll * .7; rootY = Math.abs(Math.sin(BR.phase)) * .15; }
  switch (s) {
    case 'roar': case 'transform': la = ra = -2.6 + Math.sin(t * 20) * .12; headX = -.35; jit = s === 'transform' ? .08 : 0; break;
    case 'chargeWind': rootY = -.35; rootX = .35; la = ra = .7; break;
    case 'charge': rootX = .45; break;
    case 'slamWind': la = ra = -2.9 * easeOut(Math.min(1, t / .5)); headX = -.2; rootY = .1; break;
    case 'slamHit': la = ra = lerp(-2.9, .5, Math.min(1, t / .1)); rootY = -.35 * (1 - Math.min(1, t / .5)); rootX = .25; break;
    case 'rocks': { const ph = (t - .6) / .45; ra = t < .6 ? -2.7 * (t / .6) : -2.7 + ((ph % 1) < .3 ? (ph % 1) / .3 * 3.2 : 3.2 - ((ph % 1) - .3) / .7 * 3.2); la = -.4; break; }
    case 'tired': case 'eat': case 'stunned':
      rootY = -1.25; rootX = s === 'eat' ? .05 : .3; headX = s === 'eat' ? -.15 + Math.sin(gameTime * 8) * .08 : .45; la = ra = s === 'eat' ? -1.3 + Math.sin(gameTime * 8) * .15 : .3; ll = lr = -1.3;
      if (s === 'stunned') headZ = Math.sin(t * 6) * .25; if (s === 'tired') rootY += Math.sin(gameTime * 6) * .06;
      break;
    case 'grab': la = ra = -1.5 + Math.sin(gameTime * 10) * .1; rootX = .1; break;
  }
  const k = 1 - Math.exp(-dt * 12);
  bear.legL.rotation.x = lerp(bear.legL.rotation.x, ll, k); bear.legR.rotation.x = lerp(bear.legR.rotation.x, lr, k);
  bear.armL.rotation.x = lerp(bear.armL.rotation.x, la, k); bear.armR.rotation.x = lerp(bear.armR.rotation.x, ra, k);
  bear.root.position.y = lerp(bear.root.position.y, rootY, k); bear.root.rotation.x = lerp(bear.root.rotation.x, rootX, k);
  bear.root.position.x = jit ? rand(-jit, jit) : 0;
  bear.head.rotation.x = lerp(bear.head.rotation.x, headX, k); bear.head.rotation.z = lerp(bear.head.rotation.z, headZ, k);
}
function chooseAttack() {
  if (BR.atk >= 3) {
    BR.atk = 0; bearSet('tired');
    if (BR.rage && P.carrying) { bg(say('ตอนนี้แหละ! กระโดดป้อนแซนวิชเข้าปากมันเลย!', { now: true })); showPrompt('jump'); bg(async () => { await wait(2.5); if (phase === 'fight') hidePrompt(); }); }
    else sayOnce('tired', 'มันเหนื่อยแล้ว! เข้าไปทุบเลย!');
    return;
  }
  BR.atk++;
  let a = BR.rage ? pick(['rocks', 'rocks', 'charge', 'slam']) : BR.last === 'charge' ? 'slam' : BR.last === 'slam' ? 'charge' : pick(['charge', 'slam']);
  if (!BR.rage && flat(P.pos, BR.pos) > 10) a = 'charge';
  BR.last = a;
  if (a === 'charge') { bearSet('chargeWind'); BR.line = teleLine(BR.pos, BR.yaw, 19, 2.8, 1.0); BR.line.life = 2.4; snd.sfx('warn'); sayOnce('t-charge', 'มันจะพุ่งมาเป็นเส้นตรง! วิ่งหลบออกข้างหรือกระโดดข้าม!'); }
  else if (a === 'slam') {
    bearSet('slamWind'); BR.circles = [];
    const n = BR.rage ? 5 : 4;
    for (let i = 0; i < n; i++) { const r = i ? rand(2.5, 6) : 0, ang = rand(0, 6.28); BR.circles.push(teleCircle(P.pos.x + Math.cos(ang) * r, P.pos.z + Math.sin(ang) * r, 1.7, 1.25)); }
    snd.sfx('warn'); sayOnce('t-slam', 'เห็นวงแดงบนพื้นไหม! รีบหลบออกมาเลย!');
  } else { bearSet('rocks'); sayOnce('t-rock', 'มันจะปาหิน! ดูวงแดงแล้วหลบนะ {name}!'); }
}
function resolveSlam() {
  snd.sfx('slam'); cam.shake = Math.max(cam.shake, .9);
  for (const c of BR.circles) {
    puff(_v.set(c.x, 0, c.z), 14, 0xffffff, 5, .5);
    if (phase === 'fight' && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < c.r + .2 && P.pos.y < .7 && !P.grabbed) hurt(1, _w.set(c.x, 0, c.z));
    removeTele(c);
  }
  BR.circles = [];
}
function startGrab() {
  P.grabbed = true; BR.mash = 0; BR.drain = 0; bearSet('grab'); snd.sfx('grab'); cam.shake = .6;
  removeTele(BR.line); BR.line = null;
  $('mash').classList.remove('hide');
  sayOnce('grab', 'โดนจับแล้ว! กด Space รัวๆ ดิ้นให้หลุด!!');
}
function updateGrab(dt) {
  const f = bearFwd();
  P.pos.set(BR.pos.x + f.x * 2.1, 2.5 + Math.sin(gameTime * 22) * .05, BR.pos.z + f.z * 2.1); P.vy = 0; P.onGround = false;
  P.yaw = BR.yaw + Math.PI;
  if (pressed.Space) { BR.mash += 1; snd.sfx('mash'); cam.shake = Math.max(cam.shake, .12); }
  BR.mash = Math.max(0, BR.mash - dt * 1.2);
  const need = BR.rage ? 12 : 10;
  $('mash').querySelector('i').style.width = clamp01(BR.mash / need) * 100 + '%';
  BR.drain += dt;
  if (BR.drain >= 1.5) { BR.drain = 0; snd.sfx('squeeze'); hurt(1, null, true); if (phase !== 'fight') return; }
  if (BR.mash >= need) {
    P.grabbed = false; $('mash').classList.add('hide');
    P.vy = 7; P.kb.set(f.x * 9, 0, f.z * 9); P.inv = 1.6; P.onGround = false;
    bearSet('recover'); BR.recoverDur = 1.4; snd.sfx('jump'); puff(P.pos, 10);
  }
}
function hurt(n = 1, from = null, force = false) {
  if (phase !== 'fight') return;
  if (!force && P.inv > 0) return;
  P.hp = Math.max(0, P.hp - n); if (!force) P.inv = 1.3;
  snd.sfx('hurt'); cam.shake = Math.max(cam.shake, .6);
  const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = 1; requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = 0; });
  renderHearts();
  if (from && !P.grabbed) { const kx = P.pos.x - from.x, kz = P.pos.z - from.z, l = Math.hypot(kx, kz) || 1; P.kb.set(kx / l * 8, 0, kz / l * 8); P.vy = 5; P.onGround = false; }
  if (P.hp <= 0) gameOver('fight');
}
function resolveHit() {
  P.swingHit = true;
  if (phase !== 'fight' || !bear.g.visible) return;
  const d = flat(P.pos, BR.pos);
  if (d > 3.9) return;
  const air = P.pos.y > .45;
  const at = _v.set(P.pos.x + Math.sin(P.yaw) * 1.2, 1.2 + P.pos.y, P.pos.z + Math.cos(P.yaw) * 1.2);
  if (!bearVulnerable() || BR.state === 'grab') { snd.sfx('clank'); sparkle(at, 6, [0xffffff, 0xdddddd]); P.kb.set(-Math.sin(P.yaw) * 4, 0, -Math.cos(P.yaw) * 4); sayOnce('deflect', 'ตอนมันกำลังโจมตีตีไม่เข้านะ รอจังหวะก่อน!'); return; }
  if (BR.rage) { snd.sfx('clank'); sparkle(at, 8, [0xffc93a, 0xff8a1f]); sayOnce('immune', 'เอ๊ะ… ตียังไงก็ไม่เจ็บแล้ว ต้องหาวิธีอื่น!'); return; }
  const dmg = air ? 2 : 1;
  BR.hp = Math.max(1, BR.hp - dmg); BR.flash = 1; cam.shake = Math.max(cam.shake, .45);
  snd.sfx(air ? 'bonk' : 'hit'); snd.sfx('bearHurt');
  sparkle(at, 14, [0xffffff, 0xfff07a, 0xffb8d6], .8);
  if (air && BR.state !== 'stunned') { bearSet('stunned'); snd.sfx('stun'); sayOnce('stun', 'เยี่ยม! มันมึนไปเลย ตีต่อเร็ว!'); }
  renderBoss();
  if (BR.hp <= 1) startRage();
}
function startRage() {
  BR.rage = true; BR.atk = 0; bearSet('transform'); clearTeles(); BR.circles = []; BR.line = null;
  snd.sfx('roar'); snd.play('rage'); snd.startLoop('fire'); setLook('rage', 1.5); cam.shake = 1;
  $('boss').classList.add('rage'); renderBoss();
  bg(async () => { await say('มันโกรธจนตัวลุกเป็นไฟเลย!!', { now: true }); await say('ระวังก้อนหินนะ {name}!'); });
}

/* ================================================================ rocks & ingredients */
const rocks = [];
function throwRock(target) {
  const m = CH.makeRock(); scene.add(m);
  const f = bearFwd();
  const from = new V3(BR.pos.x + f.x * .8 + Math.cos(BR.yaw) * 1.5, 5.6, BR.pos.z + f.z * .8 - Math.sin(BR.yaw) * 1.5);
  const to = new V3(target.x, 0, target.z);
  rocks.push({ m, from, to, t: 0, dur: 1.15, tele: teleCircle(to.x, to.z, 1.5, 1.15) });
  snd.sfx('throw');
}
function updateRocks(dt) {
  for (const r of rocks.slice()) {
    r.t += dt; const k = Math.min(1, r.t / r.dur);
    r.m.position.lerpVectors(r.from, r.to, k); r.m.position.y = lerp(r.from.y, .3, k) + Math.sin(k * Math.PI) * 6;
    r.m.rotation.x += dt * 8; r.m.rotation.z += dt * 5;
    if (k >= 1) {
      snd.sfx('crash'); cam.shake = Math.max(cam.shake, .35); puff(r.to, 12, 0xd8d8de, 4, .45);
      for (let i = 0; i < 8; i++) dust.spawn(_v.set(r.to.x, .4, r.to.z), _w.set(rand(-4, 4), rand(3, 7), rand(-4, 4)), { life: 1, size: .22, color: 0x9a9aa6, grav: -16, drag: .5 });
      if (phase === 'fight' && Math.hypot(P.pos.x - r.to.x, P.pos.z - r.to.z) < 1.65 && P.pos.y < .9 && !P.grabbed) hurt(1, r.to);
      if (BR.rage && !BR.hungry && phase === 'fight') startHungry();
      spawnIngredient(r.to);
      scene.remove(r.m); removeTele(r.tele); rocks.splice(rocks.indexOf(r), 1);
    }
  }
}
function clearRocks() { for (const r of rocks) { scene.remove(r.m); removeTele(r.tele); } rocks.length = 0; }
const ING_EMO = { bread: '🍞', egg: '🥚', tuna: '🐟', veg: '🥬' };
const ingr = []; let have = {};
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: .85, depthWrite: false, fog: false });
function startHungry() {
  BR.hungry = true; renderIngr(); $('ingr').classList.remove('hide');
  bg(async () => {
    await say('เดี๋ยวนะ… ได้ยินเสียงท้องร้องมั้ย? โครกกก~');
    await say('หมีตัวนี้ไม่ได้โกรธหรอก… มันแค่หิว!');
    await say('เก็บขนมปัง ไข่ ทูน่า แล้วก็ผัก มาทำแซนวิชให้มันกัน!');
  });
}
function spawnIngredient(at) {
  if (!BR.hungry || P.carrying) return;
  const miss = CH.INGREDIENTS.filter(t => !have[t] && !ingr.some(i => i.type === t));
  if (!miss.length) return;
  const type = pick(miss), mesh = CH.makeIngredient(type);
  const ring = onLayer1(new THREE.Mesh(teleRingGeo, ringMat)); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(.55);
  const a = rand(0, 6.28), r = rand(1.4, 2.6), pos = new V3(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r);
  scene.add(mesh, ring);
  const it = { type, mesh, ring, pos, t: 0 }; ingr.push(it);
  tween(.6, k => { mesh.position.set(lerp(at.x, pos.x, k), Math.sin(k * Math.PI) * 2.2, lerp(at.z, pos.z, k)); });
}
function updateIngredients(dt) {
  for (const it of ingr.slice()) {
    it.t += dt;
    if (it.t > .6) { it.mesh.position.set(it.pos.x, .25 + Math.sin(it.t * 3) * .12, it.pos.z); it.mesh.rotation.y += dt * 2; }
    it.ring.position.set(it.pos.x, .06, it.pos.z); it.ring.scale.setScalar(.55 + Math.sin(it.t * 5) * .06);
    if (it.t > .6 && flat(P.pos, it.pos) < 1.35 && P.pos.y < 1.6 && !P.grabbed) {
      have[it.type] = true; snd.sfx('ingredient', CH.INGREDIENTS.indexOf(it.type));
      sparkle(_v.set(it.pos.x, .6, it.pos.z), 12);
      scene.remove(it.mesh, it.ring); ingr.splice(ingr.indexOf(it), 1);
      if (CH.INGREDIENTS.every(t => have[t])) makeSandwich();
      renderIngr();
    }
  }
}
function clearIngredients() { for (const it of ingr) scene.remove(it.mesh, it.ring); ingr.length = 0; have = {}; }
function makeSandwich() {
  P.carrying = true; heldSandwich.visible = true; snd.sfx('sandwich');
  sparkle(_v.set(P.pos.x, 1.4, P.pos.z), 24);
  bg(async () => { await say('แซนวิชเสร็จแล้ว! หอมสุดๆ เลย', { now: true }); await say('รอให้มันเหนื่อย แล้วกระโดดป้อนเข้าปากเลย!'); });
}
function checkFeed() {
  if (!(BR.rage && P.carrying && !BR.fed && phase === 'fight')) return;
  const f = bearFwd(), mx = BR.pos.x + f.x * 1.9, mz = BR.pos.z + f.z * 1.9;
  if (Math.hypot(P.pos.x - mx, P.pos.z - mz) < 3.0 && P.pos.y > .35) {
    if (BR.state === 'tired') feedBear();
    else if (gameTime > BR.notYet) { BR.notYet = gameTime + 4; bg(say('ยังก่อน! รอให้มันหยุดโจมตีจนเหนื่อยก่อนนะ', { now: true })); }
  }
}
function feedBear() {
  BR.fed = true; P.carrying = false; heldSandwich.visible = false;
  heldSandwich.getWorldPosition(_v); const from = _v.clone(), f = bearFwd(), to = new V3(BR.pos.x + f.x * 1.2, 3.2, BR.pos.z + f.z * 1.2);
  flySandwich.visible = true; flySandwich.position.copy(from);
  tween(.5, k => { flySandwich.position.lerpVectors(from, to, k); flySandwich.position.y += Math.sin(k * Math.PI); flySandwich.rotation.y += .3; }, () => { flySandwich.visible = false; snd.sfx('munch'); });
}

/* ================================================================ HUD */
function renderHearts() { $('hearts').innerHTML = Array.from({ length: P.maxHp }, (_, i) => `<span class="${i < P.hp ? '' : 'off'}">❤️</span>`).join(''); }
function renderBoss() { $('boss').querySelector('.bar').innerHTML = Array.from({ length: BR.max }, (_, i) => `<i class="${i < BR.hp ? '' : 'off'}"></i>`).join(''); }
function renderIngr() {
  const el = $('ingr');
  el.innerHTML = P.carrying || BR.fed ? '<div class="slot big">🥪</div>' : CH.INGREDIENTS.map(t => `<div class="slot ${have[t] ? '' : 'off'}">${ING_EMO[t]}</div>`).join('');
}
function hideHud() { for (const id of ['hearts', 'boss', 'ingr', 'mash']) $(id).classList.add('hide'); $('boss').classList.remove('rage'); $('danger').style.opacity = 0; }

/* ================================================================ story */
let mode = 'title', phase = 'none', chaseT = 0, starPos = new V3();
const needLock = () => mode === 'story' && !['credits', 'thanks', 'over', 'none'].includes(phase);

function resetStoryWorld() {
  abortStory(); clearDialog(); hidePrompt(); hintTarget = null; tweens.length = 0; lookTw = null;
  camera.clearViewOffset(); cam.mode = 'follow'; cam.blend = cam.anim = cam.custom = null; cam.shake = 0; cam.yaw = 0; cam.pitch = .32; cam.locking = cam.returning = false;
  Object.assign(P, { vy: 0, onGround: true, yaw: Math.PI, hp: 6, inv: 0, grabbed: false, swing: 0, hasHammer: false, carrying: false, walkPhase: 0, moveAmt: 0, patting: false });
  P.pos.set(0, 0, 0); P.vel.set(0, 0, 0); P.kb.set(0, 0, 0);
  girl.setFace('normal'); girl.g.visible = true; girl.armR.scale.y = 1; girl.armR.rotation.set(0, 0, 0);
  if (hammer.parent !== scene) scene.add(hammer); hammer.visible = false; heldSandwich.visible = false; flySandwich.visible = false;
  if (dog.g.parent !== scene) scene.add(dog.g); dog.g.visible = false; dog.g.scale.setScalar(1); dollState = 'none';
  bear.g.visible = false; Object.assign(BR, { state: 'hidden', hp: 12, rage: false, hungry: false, fed: false, atk: 0, last: '', sc: 1, flash: 0, circles: [], line: null });
  bear.mat.emissive.setRGB(0, 0, 0);
  boy.g.visible = false; boy.setFace('normal'); CH.poseHuman(boy, 'stand');
  pedestal.visible = false; guideStar.visible = false; stunStars.visible = false; dropShadow.material.opacity = 0;
  clearTeles(); clearRocks(); clearIngredients(); dust.clear(); vivid.clear();
  treesOn = false; trees.clear(); world.arena = null; world.bloomR = 0; clouds.visible = false; cloudMat.opacity = 0; decorCell = '';
  snd.stopLoop('fire'); hideHud(); $('credits').classList.add('hide');
  said.clear(); phase = 'none'; stats.moved = stats.run = stats.jumps = 0;
}
function setupBase({ trees = true, dogBack = true, look: lk = 'dark' } = {}) {
  if (dogBack) dogOnBack();
  treesOn = trees; sproutBurst = gameTime + .5;
  setLook(lk, 0);
  ctrl = true; canRun = canJump = true;
}

async function storyIntro() {
  phase = 'intro'; setLook('pale', 0); snd.play('explore');
  P.pos.set(0, 24, 0); P.onGround = false; ctrl = false; canRun = false; canJump = false;
  await until(() => P.onGround);
  cam.shake = .5;
  await wait(1.2);
  ctrl = true;
  showPrompt('wasd'); stats.moved = 0; await until(() => stats.moved > 5); await promptDone();
  showPrompt('mouse'); lookAccum = 0; await until(() => lookAccum > 450); await promptDone();
  canRun = true; showPrompt('run'); stats.run = 0; await until(() => stats.run > 1.4); await promptDone();
  canJump = true; showPrompt('jump'); stats.jumps = 0; await until(() => stats.jumps >= 2); await promptDone();
  phase = 'roam';
  const t0 = gameTime; await until(() => gameTime - t0 >= 28);
  placeDollAhead(16);
  await until(() => dollState === 'back');
  await storyCompanion();
}
async function storyCompanion() {
  phase = 'companion'; setLook('soft', 3); treesOn = true; sproutBurst = gameTime + 2.5; snd.play('companion');
  await wait(1.2);
  await say('ว้าว! ในที่สุดก็มีคนมาเจอฉันสักที');
  await say('ฉันชื่อน้ำตาล เป็นตุ๊กตาหมาที่รู้ทุกเรื่องในโลกนี้เลยนะ');
  await say('ส่วนเธอ… {name} ใช่มั้ย? ฉันรอเธออยู่ตั้งนาน');
  await say('ที่นี่เคยมีสีสันสวยมากเลยนะ แต่ตอนนี้มันจางหายไปหมดแล้ว…');
  const d = camForward(); starPos.set(P.pos.x + d.x * 34, 2.2, P.pos.z + d.z * 34); guideStar.visible = true;
  await say('พาฉันไปด้วยนะ เดี๋ยวฉันบอกทางเอง ตามดาวดวงนั้นไปเลย!');
  const t1 = gameTime;
  bg(async () => { await wait(9); if (phase === 'companion') await say('ต้นไม้เริ่มโผล่ขึ้นมาแล้ว แต่ยังไม่มีใบเลย…'); await wait(6); if (phase === 'companion') say('รู้สึกเหมือนมีอะไรจ้องมองเราอยู่ไหม…?'); });
  await until(() => flat(P.pos, starPos) < 3.5 || gameTime - t1 > 30);
  guideStar.visible = false; sparkle(starPos, 20);
  await storyMonster();
}
async function storyMonster() {
  phase = 'monster'; ctrl = false; P.vel.set(0, 0, 0); clearDialog(); hidePrompt();
  const f = new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  const at = new V3(P.pos.x + f.x * 16, 0, P.pos.z + f.z * 16);
  BR.pos.set(at.x, 0, at.z); BR.yaw = Math.atan2(P.pos.x - at.x, P.pos.z - at.z); BR.sc = 1; bearSet('fall');
  bear.g.visible = true; bear.g.position.set(at.x, 60, at.z);
  dropShadow.position.set(at.x, .04, at.z);
  bg(say('เอ๊ะ… ทำไมพื้นมันมืดลงล่ะ?', { hold: 1.4 }));
  snd.sfx('whistle');
  cineTo(new V3(P.pos.x - f.x * 5, 2.4, P.pos.z - f.z * 5), new V3(at.x, 7, at.z), 1.2);
  let y = 60;
  tween(1.6, k => { y = lerp(60, 0, k * k); BR.pos.y = y; dropShadow.material.opacity = .45 * k; dropShadow.scale.setScalar(lerp(.5, 3, k)); });
  await wait(1.6);
  BR.pos.y = 0; dropShadow.material.opacity = 0;
  snd.sfx('boom'); cam.shake = 1.6; puff(at, 40, 0xffffff, 9, .7);
  P.vy = 4; P.onGround = false;
  await wait(.5);
  bearSet('roar'); snd.sfx('roar');
  const side = new V3(-f.z, 0, f.x), mid = new V3((P.pos.x + at.x) / 2, 0, (P.pos.z + at.z) / 2);
  cineTo(new V3(mid.x + side.x * 15, 6, mid.z + side.z * 15), new V3(at.x, 3.5, at.z), 2.4);
  await say('อ๊ากกก!! หมียักษ์!!!', { hold: .9 });
  await wait(.6);
  bg(say('{name} วิ่ง!!!', { hold: 1.4 }));
  snd.play('chase');
  cam.yaw = yawLookingAlong(new V3(P.pos.x - at.x, 0, P.pos.z - at.z)); cam.pitch = .42;
  cineFollow(.7);
  save.checkpoint = 'chase'; persist();
  await storyChase(false);
}
async function storyChase(setup) {
  if (setup) {
    setupBase();
    const d = camForward(); bear.g.visible = true; BR.pos.set(-d.x * 15, 0, -d.z * 15); BR.yaw = 0; BR.sc = 1;
  }
  phase = 'chase'; ctrl = true; chaseT = 0; setLook('dark', 2); snd.play('chase'); bearSet('chase');
  showPrompt('run'); bg(async () => { await wait(3.2); if (phase === 'chase') hidePrompt(); });
  const dur = setup ? 45 : 60;
  const line = async (t, text, pr) => { await until(() => chaseT >= t || phase !== 'chase'); if (phase !== 'chase') return; if (pr) showPrompt(pr); await say(text); if (pr) { await wait(2); if (phase === 'chase') hidePrompt(); } };
  bg(async () => {
    await line(7, 'อย่าหยุดวิ่งนะ {name}!!');
    await line(14, 'คลิกขวาค้างไว้ จะหันไปดูมันได้… แต่อย่าหยุดวิ่งล่ะ!', 'look');
    await line(26, 'มันใส่แว่นด้วย! ทำไมหมีต้องใส่แว่นล่ะ!?');
    await line(36, 'มันยังตามมาอยู่เลย!!');
    await line(dur - 8, 'อีกนิดเดียว อดทนไว้!');
  });
  await until(() => chaseT >= dur);
  await storyHammer();
}
async function storyHammer() {
  phase = 'hammerCut'; ctrl = false; bearSet('pause'); clearDialog(); hidePrompt();
  const d = Math.hypot(P.vel.x, P.vel.z) > .5 ? new V3(P.vel.x, 0, P.vel.z).normalize() : new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  P.vel.set(0, 0, 0);
  const ped = new V3(P.pos.x + d.x * 24, 0, P.pos.z + d.z * 24);
  for (const r of trees.values()) if (Math.hypot(r.x - ped.x, r.z - ped.z) < 3) r.goneAt = gameTime - 1;
  pedestal.position.copy(ped); pedestal.visible = true;
  hammer.visible = true; hammer.position.set(ped.x, 1.25, ped.z); hammer.rotation.set(0, 0, 0); hammer.scale.setScalar(1.2);
  const side = new V3(-d.z, 0, d.x);
  cam.mode = 'cine'; cam.anim = null; camera.position.set(ped.x + side.x * 4.5 - d.x * 6, 3, ped.z + side.z * 4.5 - d.z * 6); cam.look.set(ped.x, 1.4, ped.z);
  snd.sfx('flash');
  cineTo(new V3(ped.x - side.x * 4.5 - d.x * 6, 2.4, ped.z - side.z * 4.5 - d.z * 6), new V3(ped.x, 1.4, ped.z), 3.4, t => t);
  await say('ดูนั่น!! บนแท่นหินมีค้อนวิเศษ!');
  await say('ไปเอามาเร็ว!!', { hold: .9 });
  cam.yaw = yawLookingAlong(d); cineFollow(.6);
  phase = 'hammer'; ctrl = true; bearSet('chase'); BR.t = 2.5;
  await until(() => P.hasHammer);
  await storyFight(false);
}
function pickupHammer() {
  P.hasHammer = true; hintTarget = null;
  girl.armR.add(hammer); hammer.position.set(0, -.32, .06); hammer.rotation.set(Math.PI / 2, 0, 0); hammer.scale.setScalar(.85);
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = .9; requestAnimationFrame(() => { f.style.transition = 'opacity .8s'; f.style.opacity = 0; });
  snd.sfx('flash'); sparkle(_v.set(P.pos.x, 1.4, P.pos.z), 30);
  world.arena = P.pos.clone();
  if (bear.g.visible && flat(P.pos, BR.pos) < 9) { const dx = BR.pos.x - P.pos.x, dz = BR.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1; BR.pos.set(P.pos.x + dx / l * 9, 0, P.pos.z + dz / l * 9); }
  save.checkpoint = 'fight'; persist();
}
async function storyFight(setup) {
  if (setup) {
    setupBase();
    pickupHammer();
    bear.g.visible = true; BR.pos.set(0, 0, -10); BR.yaw = 0; BR.sc = 1;
    cam.yaw = 0;
  }
  phase = 'fight'; ctrl = true; snd.play('fight'); setLook('dark', 1);
  pedestal.visible = false;
  P.hp = P.maxHp; BR.hp = BR.max; BR.rage = false; BR.hungry = false; BR.fed = false; BR.atk = 0;
  renderHearts(); renderBoss(); $('hearts').classList.remove('hide'); $('boss').classList.remove('hide');
  bearSet('roar'); snd.sfx('roar'); cam.shake = .8;
  cam.yaw = yawLookingAlong(new V3(BR.pos.x - P.pos.x, 0, BR.pos.z - P.pos.z)); cam.pitch = .34; cineFollow(.8);
  bg(async () => {
    await wait(1); if (phase !== 'fight') return;
    showPrompt('attack'); await say('ได้ค้อนมาแล้ว! ทีนี้ไม่ต้องหนีแล้ว คลิกซ้ายเพื่อทุบเลย!'); await wait(1.5); if (phase === 'fight') hidePrompt();
    await say('แต่อย่าเพิ่งเข้าไปตอนมันโจมตีนะ รอให้มันเหนื่อยก่อน');
    await wait(5); if (phase !== 'fight' || BR.rage) return;
    showPrompt('jumpAttack'); await say('ลองกระโดดแล้วตีหัวมันสิ มันจะมึนไปเลย!'); await wait(2); if (phase === 'fight') hidePrompt();
  });
  await until(() => BR.fed);
  await storyEnding();
}
async function storyEnding() {
  phase = 'ending'; ctrl = false; P.vel.set(0, 0, 0); P.swing = 0;
  snd.stopLoop('fire'); hideHud(); hidePrompt(); clearTeles(); clearRocks(); clearIngredients();
  BR.rage = false; bearSet('eat'); snd.play('ending');
  save.checkpoint = null; persist();
  const c = BR.pos.clone(), f = bearFwd().clone(), sd = new V3(-f.z, 0, f.x);
  { const from = P.pos.clone(), to = new V3(c.x + f.x * 4.6 + sd.x * 1.2, 0, c.z + f.z * 4.6 + sd.z * 1.2);
    tween(.7, k => { P.pos.lerpVectors(from, to, easeOut(k)); P.yaw = Math.atan2(c.x - P.pos.x, c.z - P.pos.z); }); }
  await cineTo(new V3(c.x + f.x * 8 - sd.x * 5, 4.2, c.z + f.z * 8 - sd.z * 5), new V3(c.x, 2.8, c.z), 1.5);
  snd.sfx('munch');
  await say('มันกินแล้ว!!', { hold: 1 });
  snd.sfx('munch');
  world.bloomC.copy(c); clouds.position.set(c.x, 0, c.z); clouds.visible = true;
  setLook('bloom', 7);
  tween(9, k => { world.bloomR = 90 * ease(k); });
  tween(5, k => { cloudMat.opacity = k; });
  const a0 = Math.atan2(f.x, f.z);
  cam.mode = 'custom';
  const pan = tween(10, k => {
    const e = ease(k), r = lerp(9, 48, e), h = lerp(4.5, 26, e), a = a0 + e * 1.4;
    camera.position.set(c.x + Math.sin(a) * r, h, c.z + Math.cos(a) * r); cam.look.set(c.x, lerp(3, 1, e), c.z);
  });
  cam.custom = () => {};
  bg(async () => { await wait(2.5); await say('ดูสิ… สีกลับคืนมาแล้ว'); await say('ต้นไม้มีใบ ดอกไม้ก็บานเต็มไปหมดเลย!'); });
  await until(() => !tweens.includes(pan));
  await wait(.5);
  await cineTo(new V3(c.x + f.x * 7 - sd.x * 4.5, 3.2, c.z + f.z * 7 - sd.z * 4.5), new V3(c.x, 1.6, c.z), 3);
  bg(say('ห๊ะ!? หมีตัวเล็กลงเรื่อยๆ…'));
  snd.sfx('transform');
  const shrink = tween(3, k => { BR.sc = lerp(1, .22, ease(k)); if (Math.random() < .5) sparkle(_v.set(c.x + rand(-1.5, 1.5), rand(.5, 4) * BR.sc, c.z + rand(-1.5, 1.5)), 2); });
  await until(() => !tweens.includes(shrink));
  snd.sfx('poof'); puff(c, 30, 0xffffff, 4, .6); sparkle(_v.set(c.x, 1, c.z), 30);
  bear.g.visible = false;
  boy.g.visible = true; CH.poseHuman(boy, 'sit'); boy.g.position.set(c.x, -.16, c.z); boy.g.rotation.y = BR.yaw; boy.setFace('happy'); boySandwich.visible = true;
  await wait(1);
  await say('ที่แท้… ก็คือเขานี่เอง!');
  await say('หิวจนกลายร่างเป็นหมียักษ์ไปเลย ฮ่าๆ');
  await say('เข้าไปหาเขาหน่อยสิ {name}');
  cam.yaw = yawLookingAlong(new V3(c.x - P.pos.x, 0, c.z - P.pos.z)); cam.pitch = .3; cineFollow(1.2);
  phase = 'pat'; ctrl = true;
  await until(() => P.patting);
  await storyCredits();
}
function startPat() {
  ctrl = false; hintTarget = null; P.vel.set(0, 0, 0);
  const B = boy.g.position, Y = boy.g.rotation.y;
  P.yaw = Y; P.pos.set(B.x - Math.cos(Y) * 1.35, 0, B.z + Math.sin(Y) * 1.35); P.vy = 0; P.onGround = true;
  girl.setFace('flat'); P.patting = true; snd.sfx('pat');
  if (hammer.parent !== scene) scene.add(hammer); hammer.visible = false;
  scene.add(dog.g); dollState = 'sit'; dog.g.scale.setScalar(.7);
  dog.g.position.set(B.x + Math.cos(Y) * 1.3 + Math.sin(Y) * .4, 0, B.z - Math.sin(Y) * 1.3 + Math.cos(Y) * .4); dog.g.rotation.set(0, Y - .4, 0);
}
async function storyCredits() {
  phase = 'credits'; exitLock();
  const Y = P.yaw, F = new V3(Math.sin(Y), 0, Math.cos(Y));
  const c = new V3((P.pos.x + boy.g.position.x) / 2, .95, (P.pos.z + boy.g.position.z) / 2);
  await wait(1.5);
  await fadeTo(1, 800);
  cam.mode = 'cine'; cam.anim = null;
  camera.position.set(c.x + F.x * 5.4, c.y + 1.1, c.z + F.z * 5.4); cam.look.copy(c);
  camera.setViewOffset(1000, 562.5, 230, 0, 1000, 562.5);
  snd.play('credits');
  $('credits').classList.remove('hide'); buildCredits();
  fadeTo(0, 1200);
  await until(() => cred.done);
  await wait(2.5);
  phase = 'thanks';
  save.completed = true; save.checkpoint = null; persist();
  $('thanks').classList.remove('hide');
}
const CREDITS = [
  ['sec', '— นักแสดง —'],
  ['role', 'นักผจญภัยผู้กล้าหาญ'], ['name', '{name}'],
  ['role', 'ตุ๊กตาหมาผู้รู้ทุกเรื่อง'], ['name', 'น้ำตาล'],
  ['role', 'หมียักษ์ใส่แว่น (จริงๆ แค่หิว)'], ['name', 'เขาคนนั้น'],
  ['sec', '— ทีมงาน —'],
  ['role', 'ออกแบบโลกไร้ขอบฟ้า'], ['name', 'นกฮูก ฮูฮู'],
  ['role', 'กำกับภาพ'], ['name', 'แมวส้ม มะปราง'],
  ['role', 'ดนตรีประกอบ'], ['name', 'วาฬสีฟ้า'],
  ['role', 'เสียงประกอบ'], ['name', 'กบน้อย อ๊บอ๊บ'],
  ['role', 'แสงและเงา'], ['name', 'หิ่งห้อย 1,024 ตัว'],
  ['role', 'ปลูกต้นไม้ทั้งโลก'], ['name', 'ตัวตุ่น'],
  ['role', 'ฝ่ายดอกไม้สีชมพู'], ['name', 'ผีเสื้อ'],
  ['role', 'สตันท์วิ่งหนีหมี'], ['name', 'กระต่ายป่า'],
  ['role', 'สตันท์หมีวิ่งไล่'], ['name', 'เต่าบก (ช้ามาก)'],
  ['role', 'ฝ่ายขนมปัง'], ['name', 'หนูแฮมสเตอร์'],
  ['role', 'ฝ่ายไข่'], ['name', 'แม่ไก่ ป๊อกป๊อก'],
  ['role', 'ฝ่ายทูน่า'], ['name', 'แมวน้ำ'],
  ['role', 'ฝ่ายผัก'], ['name', 'กระต่ายขาว'],
  ['role', 'หัวหน้าฝ่ายแซนวิช'], ['name', 'กระรอก'],
  ['role', 'ช่างทำค้อนวิเศษ'], ['name', 'บีเวอร์'],
  ['role', 'ช่างทำแว่นให้หมี'], ['name', 'นกกระเต็น'],
  ['role', 'ฝ่ายเสื้อผ้า'], ['name', 'หนอนไหม'],
  ['role', 'ทดสอบเกม'], ['name', 'ลิงแสม 3 ตัว'],
  ['role', 'ดูแลกองถ่าย'], ['name', 'คาปิบาร่า'],
  ['role', 'ฝ่ายกำลังใจ'], ['name', 'โกลเด้นรีทรีฟเวอร์'],
  ['role', 'นั่งเฉยๆ แต่ได้เครดิต'], ['name', 'สลอธ'],
  ['sec', 'ขอบคุณเป็นพิเศษ'], ['name', '{name} ที่เล่นจนจบ 💖'],
  ['director', 'Director'], ['jiw', 'JIW'], ['fin', '— จบ —'],
];
const cred = { y: 0, target: 0, speed: 0, done: false };
function buildCredits() {
  const inner = $('credInner');
  inner.innerHTML = CREDITS.map(([c, t]) => `<div class="${c}">${fmt(t).replace(/</g, '&lt;')}</div>`).join('');
  const H = $('credits').clientHeight, jiw = inner.querySelector('.jiw');
  cred.y = H; cred.target = -(jiw.offsetTop + jiw.offsetHeight / 2 - H / 2); cred.speed = (cred.y - cred.target) / 82; cred.done = false;
  inner.style.transform = `translateY(${cred.y}px)`;
}
function updateCredits(dt) {
  if (cred.done) return;
  cred.y = Math.max(cred.target, cred.y - cred.speed * dt);
  $('credInner').style.transform = `translateY(${cred.y}px)`;
  if (cred.y <= cred.target) cred.done = true;
}

function gameOver(kind) {
  if (phase === 'over') return;
  phase = 'over'; ctrl = false; P.grabbed = false; $('mash').classList.add('hide');
  snd.stopLoop('fire'); snd.stopMusic(.6); snd.sfx('gameover'); clearDialog(); hidePrompt(); exitLock();
  $('goTitle').textContent = kind === 'chase' ? 'โดนจับได้แล้ว…' : 'โดนหมีทุบซะแล้ว…';
  $('goText').textContent = pick(GO_LINES);
  $('gameover').classList.remove('hide');
  $('goRetry').onclick = () => { audioInit(); $('gameover').classList.add('hide'); requestLock(); resetStoryWorld(); runScript(() => kind === 'chase' ? storyChase(true) : storyFight(true)); };
}
$('goHome').onclick = () => { $('gameover').classList.add('hide'); enterTitle(); };

function updateStory(dt) {
  if (phase === 'chase') chaseT += dt;
  updatePlayer(dt); updateDog(dt); updateBear(dt); checkFeed();
  updateRocks(dt); updateIngredients(dt); updateTeles(dt);
  // interactions
  if (phase === 'hammer' && !P.hasHammer) {
    if (flat(P.pos, pedestal.position) < 2.4) { hintTarget = new V3(pedestal.position.x, 2.6, pedestal.position.z); if (pressed.KeyE) pickupHammer(); } else hintTarget = null;
  }
  if (phase === 'pat' && !P.patting) {
    if (flat(P.pos, boy.g.position) < 2.2) { hintTarget = new V3(boy.g.position.x, 2, boy.g.position.z); if (pressed.KeyE) startPat(); } else hintTarget = null;
  }
  if (pedestal.visible && !P.hasHammer) { hammer.rotation.y += dt * 1.5; hammer.position.y = 1.25 + Math.sin(gameTime * 2) * .1; if (Math.random() < dt * 8) sparkle(_v.set(pedestal.position.x, 2, pedestal.position.z), 1); }
  if (guideStar.visible) { guideStar.position.set(starPos.x, starPos.y + Math.sin(gameTime * 2) * .3, starPos.z); guideStar.rotation.y += dt * 2; if (Math.random() < dt * 10) sparkle(guideStar.position, 1, [0xffe14d, 0xffffff], .8); }
  if (boy.g.visible) { boy.armR.rotation.x = -1.55 + Math.sin(gameTime * 6) * .18; boy.head.rotation.x = Math.sin(gameTime * 6) * .04; }
  if (phase === 'chase' || phase === 'hammer') { const d = flat(P.pos, BR.pos); $('danger').style.opacity = clamp01((12 - d) / 9); } else $('danger').style.opacity = 0;
  if (phase === 'credits') updateCredits(dt);
  updateWorld(P.pos);
  updateCamera(dt); updateDialog(dt);
}
function updateWorld(f) {
  world.focus.copy(f);
  ground.position.set(Math.round(f.x / 4) * 4, 0, Math.round(f.z / 4) * 4);
  updateDecor(f); updateTrees(f); updateFlowers(f);
  sun.position.set(f.x - 10, 28, f.z + 12); sun.target.position.set(f.x, 0, f.z);
  if (clouds.visible) clouds.rotation.y += .002;
  dust.update(lastDt); vivid.update(lastDt);
}

/* ================================================================ title */
const bubbleEl = $('bubble');
let bubbleT = 0, girlReact = { kind: '', t: 0 }, lastWrong = -1;
function bubble(text, ms = 3500) { bubbleEl.textContent = text; bubbleEl.classList.remove('hide'); bubbleEl.style.animation = 'none'; void bubbleEl.offsetWidth; bubbleEl.style.animation = ''; bubbleT = ms / 1000; snd.voice('girl'); setTimeout(() => snd.voice('girl'), 90); }
function enterTitle() {
  for (const id of ['settings', 'confirm', 'gameover', 'thanks', 'summary']) $(id).classList.add('hide');
  exitLock(); hidePause();
  resetStoryWorld(); mode = 'title'; phase = 'none';
  $('whud').classList.add('hide'); $('count').classList.add('hide'); $('hammerCur').classList.add('hide'); stage.style.cursor = '';
  $('title').classList.remove('hide');
  const done = save.completed;
  $('namePanel').classList.toggle('hide', done); $('donePanel').classList.toggle('hide', !done);
  $('newStory').classList.toggle('hide', !done); $('newStory').textContent = '↺ เริ่ม Story ใหม่';
  $('contBtn').classList.toggle('hide', !(save.checkpoint && !done));
  $('best').textContent = save.best ? `🏆 สถิติสูงสุด ${save.best} คะแนน` : '';
  $('nameInput').value = save.name || '';
  cam.mode = 'fixed';
  if (done) {
    setLook('title2', 0); treesOn = true; sproutBurst = 0;
    world.bloomC.set(0, 0, 0); world.bloomR = 999; clouds.visible = true; clouds.position.set(0, 0, 0); cloudMat.opacity = 1;
    P.pos.set(-.7, 0, 0); P.yaw = 0; girl.setFace('flat'); P.patting = true;
    boy.g.visible = true; CH.poseHuman(boy, 'sit'); boy.g.position.set(.65, -.16, 0); boy.g.rotation.y = 0; boy.setFace('happy'); boySandwich.visible = true;
    dog.g.visible = true; dog.g.scale.setScalar(.7); dog.g.position.set(1.75, 0, .5); dog.g.rotation.y = -.4; dollState = 'sit';
    camera.position.set(0, 1.35, 6.8); cam.look.set(.1, .4, 0);
    bubbleEl.classList.add('hide');
  } else {
    setLook('pale', 0); P.pos.set(0, 0, 0); P.yaw = 0;
    camera.position.set(0, 1.15, 6.6); cam.look.set(0, .35, 0);
    setTimeout(() => { if (mode === 'title' && !save.completed) bubble('สวัสดี~ บอกชื่อหน่อยสิ', 4000); }, 600);
  }
  // make trees appear instantly for the title
  updateWorld(world.focus.set(0, 0, 0)); for (const r of trees.values()) r.birth = -10;
  snd.play('title');
}
function updateTitle(dt) {
  if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) bubbleEl.classList.add('hide'); }
  girlReact.t += dt;
  P.onGround = true;
  animateGirl(dt, false);
  if (girlReact.kind === 'no') girl.head.rotation.y = Math.sin(girlReact.t * 22) * .35 * Math.max(0, 1 - girlReact.t / .7);
  else girl.head.rotation.y = 0;
  if (girlReact.kind === 'yes' && girlReact.t < .6) girl.g.position.y = Math.sin(girlReact.t / .6 * Math.PI) * .6;
  if (boy.g.visible) { boy.armR.rotation.x = -1.55 + Math.sin(gameTime * 6) * .18; boy.head.rotation.x = Math.sin(gameTime * 6) * .04; }
  updateDog(dt);
  updateWorld(world.focus.set(0, 0, 0));
  updateCamera(dt);
  if (!bubbleEl.classList.contains('hide')) { girl.g.updateMatrixWorld(); girl.head.getWorldPosition(_v); _v.y += 1.25; _v.project(camera); bubbleEl.style.left = ((_v.x + 1) / 2 * 100) + '%'; bubbleEl.style.top = ((1 - _v.y) / 2 * 100) + '%'; }
}
function checkName() {
  const v = $('nameInput').value;
  if (!v.trim()) { bubble(pick(EMPTY)); snd.sfx('wrong'); shakeInput(); girlReact = { kind: 'no', t: 0 }; return false; }
  const m = matchName(v);
  if (!m) {
    let i; do { i = Math.random() * WRONG.length | 0; } while (i === lastWrong && WRONG.length > 1); lastWrong = i;
    bubble(WRONG[i]); snd.sfx('wrong'); shakeInput(); girlReact = { kind: 'no', t: 0 }; return false;
  }
  playerName = m; save.name = m; persist();
  girl.setFace('happy'); girlReact = { kind: 'yes', t: 0 }; bubble(`ใช่แล้ว! ${m} ไปผจญภัยกันเลย!`); snd.sfx('ok');
  return true;
}
function shakeInput() { const el = $('nameInput'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
let starting = false;
async function onStart(fromCheckpoint = false) {
  if (mode !== 'title' || starting) return;
  if (save.completed && !$('donePanel').classList.contains('hide')) return;
  if (!checkName()) return;
  starting = true;
  if (document.activeElement) document.activeElement.blur();
  requestLock();
  await sleep(900);
  await fadeTo(1, 700);
  $('title').classList.add('hide'); $('newStory').classList.add('hide'); bubbleEl.classList.add('hide');
  resetStoryWorld(); mode = 'story';
  const cp = fromCheckpoint ? save.checkpoint : null;
  if (!fromCheckpoint) { save.checkpoint = null; persist(); }
  if (cp === 'chase') runScript(() => storyChase(true));
  else if (cp === 'fight') runScript(() => storyFight(true));
  else runScript(storyIntro);
  starting = false;
  await fadeTo(0, 900);
}
$('startBtn').onclick = () => { audioInit(); onStart(false); };
$('contBtn').onclick = () => { audioInit(); onStart(true); };
$('diceBtn').onclick = () => {
  audioInit(); snd.sfx('dice');
  const cur = $('nameInput').value; let n; do { n = pick(NAMES); } while (norm(n) === norm(cur));
  $('nameInput').value = n; bubble(pick(['ชื่อนี้ไง!', 'อ๊ะ ชื่อนี้น่ารักดี', 'เอาชื่อนี้เลยมั้ย?']), 2500);
};
$('newStory').onclick = () => {
  audioInit(); snd.sfx('click');
  const showing = !$('namePanel').classList.contains('hide');
  $('namePanel').classList.toggle('hide', showing); $('donePanel').classList.toggle('hide', !showing);
  $('contBtn').classList.add('hide');
  $('newStory').textContent = showing ? '↺ เริ่ม Story ใหม่' : '← กลับ';
  if (!showing) { $('nameInput').value = save.name || ''; $('nameInput').focus(); }
};
$('whackBtn').onclick = () => { audioInit(); startWhack(); };

/* ================================================================ whack-a-bear */
const wScene = new THREE.Scene(); wScene.background = new THREE.Color(0xbfe6ff); wScene.fog = new THREE.Fog(0xbfe6ff, 30, 70);
const wCam = new THREE.PerspectiveCamera(42, 16 / 9, .1, 200); wCam.position.set(0, 10.8, 9); wCam.lookAt(0, 0, .6);
{
  const h = new THREE.HemisphereLight(0xffffff, 0x88aa88, 1.3), s = new THREE.DirectionalLight(0xfff2dc, 1.5);
  s.position.set(-6, 14, 8); s.castShadow = true; s.shadow.mapSize.set(1024, 1024); Object.assign(s.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  wScene.add(h, s);
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ map: gtex, color: 0x9ad888 })); gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; wScene.add(gnd);
  const fl = new THREE.InstancedMesh(CH.flowerGeo(), vc, 160), tb = new THREE.InstancedMesh(CH.treeBareGeo(), vc, 14), tc = new THREE.InstancedMesh(CH.treeCrownGeo(), vc, 14);
  let n = 0; for (let i = 0; i < 160; i++) { const a = rand(0, 6.28), r = rand(5.5, 16); setInst(fl, n++, Math.cos(a) * r, 0, Math.sin(a) * r * .8, rand(0, 6), rand(.8, 1.4)); }
  for (let i = 0; i < 14; i++) { const x = -16 + i * 2.5 + rand(-.5, .5), z = -8 - rand(0, 3); setInst(tb, i, x, 0, z, rand(0, 6), rand(1, 1.4)); setInst(tc, i, x, 0, z, rand(0, 6), rand(1, 1.4)); }
  [fl, tb, tc].forEach(m => { m.castShadow = true; wScene.add(m); });
}
const holeGeo = new THREE.CircleGeometry(.95, 20), rimGeo = new THREE.TorusGeometry(.98, .2, 6, 20);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x2a221c }), rimMat = new THREE.MeshLambertMaterial({ color: 0x9a7b5c, flatShading: true });
const holes = [];
for (let i = 0; i < 9; i++) {
  const x = (i % 3 - 1) * 3.0, z = (Math.floor(i / 3) - 1) * 2.6;
  const hole = new THREE.Mesh(holeGeo, holeMat); hole.rotation.x = -Math.PI / 2; hole.position.set(x, .02, z); wScene.add(hole);
  const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.x = -Math.PI / 2; rim.position.set(x, .05, z); rim.castShadow = true; wScene.add(rim);
  const mk = gold => { const b = CH.makeBear(); b.g.scale.setScalar(.32); b.armL.rotation.x = b.armR.rotation.x = -2.5; if (gold) { b.mat.color.set(0xffe066); b.mat.emissive.set(0x3a2a00); } CH.castShadows(b.g); return b; };
  const bearM = mk(false), goldM = mk(true), boyM = CH.makeHuman({ gender: 'boy', accessories: ['glasses'] });
  boyM.armL.rotation.z = -2.6; boyM.armR.rotation.z = 2.6;
  const objs = { bear: bearM.g, gold: goldM.g, boy: boyM.g };
  for (const k in objs) { objs[k].position.set(x, -3, z); objs[k].visible = false; wScene.add(objs[k]); objs[k].userData.hole = i; }
  holes.push({ x, z, objs, faces: { boy: boyM }, type: null, state: 'down', t: 0, up: 1 });
}
const UPY = { bear: -.62, gold: -.62, boy: -.55 }, DOWNY = -2.2;
const W = { running: false, count: 0, t: 60, score: 0, hits: 0, gold: 0, boy: 0, combo: 0, maxCombo: 0, spawn: 0 };
const raycaster = new THREE.Raycaster();
function startWhack() {
  for (const id of ['summary']) $(id).classList.add('hide');
  $('title').classList.add('hide'); $('newStory').classList.add('hide'); bubbleEl.classList.add('hide');
  mode = 'whack'; phase = 'none';
  Object.assign(W, { running: false, count: 3.99, t: 60, score: 0, hits: 0, gold: 0, boy: 0, combo: 0, maxCombo: 0, spawn: .5, lastCount: 4 });
  for (const h of holes) { h.state = 'down'; h.type = null; for (const k in h.objs) h.objs[k].visible = false; }
  $('whud').classList.remove('hide'); $('hammerCur').classList.remove('hide'); stage.style.cursor = 'none';
  $('count').classList.remove('hide'); updateWhackHud();
  snd.stopMusic(.6);
}
function updateWhackHud() {
  $('wTime').textContent = Math.ceil(Math.max(0, W.t)); $('wScore').textContent = W.score;
  $('combo').textContent = W.combo >= 2 ? `🔥 x${W.combo}` : ''; $('combo').style.visibility = W.combo >= 2 ? 'visible' : 'hidden';
}
function updateWhack(dt) {
  if (W.count > 0) {
    W.count -= dt; const c = Math.ceil(W.count);
    if (c !== W.lastCount) { W.lastCount = c; const el = $('count'); el.textContent = c > 0 ? c : 'ทุบ!'; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; snd.sfx(c > 0 ? 'beep' : 'go'); }
    if (W.count <= 0) { W.running = true; snd.play('whack'); setTimeout(() => $('count').classList.add('hide'), 500); }
  } else if (W.running) {
    W.t -= dt; const prog = clamp01(1 - W.t / 60);
    W.spawn -= dt;
    if (W.spawn <= 0) {
      const free = holes.filter(h => h.state === 'down');
      if (free.length) {
        const h = pick(free), r = Math.random();
        h.type = r < .09 ? 'gold' : r < .23 ? 'boy' : 'bear'; h.state = 'up'; h.t = 0; h.up = lerp(1.2, .62, prog) * (h.type === 'gold' ? .8 : 1);
        for (const k in h.objs) h.objs[k].visible = k === h.type;
      }
      W.spawn = lerp(.85, .36, prog) * rand(.75, 1.2);
    }
    if (W.t <= 0) { W.running = false; W.t = 0; for (const h of holes) if (h.state === 'up') h.state = 'sink'; setTimeout(finishWhack, 900); snd.stopMusic(.8); snd.sfx('go'); }
    updateWhackHud();
  }
  for (const h of holes) {
    if (!h.type) continue;
    const o = h.objs[h.type]; h.t += dt;
    let y = DOWNY;
    if (h.state === 'up') { y = lerp(DOWNY, UPY[h.type], easeOut(Math.min(1, h.t / .14))); if (h.t > h.up) { h.state = 'sink'; h.t = 0; if (h.type !== 'boy') { W.combo = 0; updateWhackHud(); } } }
    else if (h.state === 'hit') { y = UPY[h.type] - Math.max(0, h.t - .25) * 8; o.scale.y = (h.type === 'boy' ? 1 : .32) * (h.t < .25 ? .7 : 1); if (h.t > .55) { h.state = 'down'; o.visible = false; o.scale.y = h.type === 'boy' ? 1 : .32; h.type = null; continue; } }
    else if (h.state === 'sink') { y = lerp(UPY[h.type], DOWNY, Math.min(1, h.t / .18)); if (h.t > .2) { h.state = 'down'; o.visible = false; h.type = null; continue; } }
    o.position.y = y;
    if (h.type === 'boy') h.faces.boy.setFace(h.state === 'hit' ? 'flat' : 'normal');
  }
}
function whackClick(e) {
  const hc = $('hammerCur'); hc.classList.add('down'); setTimeout(() => hc.classList.remove('down'), 110);
  if (!W.running) return;
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, wCam);
  const targets = holes.filter(h => h.state === 'up' && h.type).map(h => h.objs[h.type]);
  const hit = raycaster.intersectObjects(targets, true)[0];
  if (!hit) { snd.sfx('miss'); W.combo = 0; updateWhackHud(); return; }
  let o = hit.object; while (o && o.userData.hole === undefined) o = o.parent;
  const h = holes[o.userData.hole];
  h.state = 'hit'; h.t = 0;
  let txt, cls = '';
  if (h.type === 'bear') { W.combo++; const pts = W.combo >= 5 ? 2 : 1; W.score += pts; W.hits++; txt = '+' + pts; snd.sfx('whackHit'); }
  else if (h.type === 'gold') { W.combo++; W.score += 3; W.gold++; txt = '+3 ✨'; cls = 'gold'; snd.sfx('whackGold'); }
  else { W.score = Math.max(0, W.score - 2); W.boy++; W.combo = 0; txt = '-2 อย่าทุบเขา!'; cls = 'bad'; snd.sfx('whackBoy'); }
  W.maxCombo = Math.max(W.maxCombo, W.combo);
  popText(txt, h, cls); updateWhackHud();
}
function popText(txt, h, cls) {
  _v.set(h.x, 1.6, h.z).project(wCam);
  const el = document.createElement('div'); el.className = 'popTxt ' + cls; el.textContent = txt;
  el.style.left = ((_v.x + 1) / 2 * 100) + '%'; el.style.top = ((1 - _v.y) / 2 * 100) + '%';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 850);
}
function moveHammerCursor(e) {
  const r = stage.getBoundingClientRect(), hc = $('hammerCur');
  hc.style.left = (e.clientX - r.left - SW * .03) + 'px'; hc.style.top = (e.clientY - r.top - SW * .045) + 'px';
}
function finishWhack() {
  if (mode !== 'whack') return;
  const newBest = W.score > (save.best || 0);
  if (newBest) save.best = W.score;
  save.history = [{ score: W.score, at: Date.now() }, ...(save.history || [])].slice(0, 20); persist();
  $('sScore').textContent = W.score; $('sHits').textContent = W.hits; $('sGold').textContent = W.gold; $('sBoy').textContent = W.boy;
  $('sCombo').textContent = W.maxCombo; $('sBest').textContent = save.best; $('sNew').classList.toggle('hide', !newBest);
  $('summary').classList.remove('hide'); stage.style.cursor = ''; $('hammerCur').classList.add('hide');
  snd.sfx(newBest ? 'sandwich' : 'ok');
}
$('sAgain').onclick = () => { audioInit(); startWhack(); };
$('sHome').onclick = () => { $('summary').classList.add('hide'); enterTitle(); };

/* ================================================================ settings · pause · modals */
const anyModal = () => ['settings', 'confirm', 'gameover', 'thanks', 'summary'].some(id => !$(id).classList.contains('hide'));
let settingsOpen = false;
function showPause() { if (lockFailed) return; $('pause').classList.remove('hide'); }
function hidePause() { $('pause').classList.add('hide'); }
$('pause').onclick = () => { audioInit(); requestLock(); if (lockFailed) hidePause(); };
function syncSliders() {
  $('volMusic').value = Math.round(save.music * 100); $('volMusicV').textContent = $('volMusic').value;
  $('volFx').value = Math.round(save.fx * 100); $('volFxV').textContent = $('volFx').value;
}
$('gearBtn').onclick = () => {
  audioInit(); snd.sfx('click'); syncSliders();
  $('quitBtn').classList.toggle('hide', mode === 'title');
  $('fsBtn').textContent = document.fullscreenElement ? '⛶ ออกจากเต็มจอ' : '⛶ เต็มจอ';
  settingsOpen = true; exitLock(); hidePause(); $('settings').classList.remove('hide');
};
$('setClose').onclick = () => { settingsOpen = false; $('settings').classList.add('hide'); snd.sfx('click'); if (needLock()) showPause(); };
$('volMusic').oninput = e => { save.music = e.target.value / 100; $('volMusicV').textContent = e.target.value; snd.setMusicVolume(save.music); persist(); };
$('volFx').oninput = e => { save.fx = e.target.value / 100; $('volFxV').textContent = e.target.value; snd.setFxVolume(save.fx); persist(); snd.sfx('click'); };
$('fsBtn').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  setTimeout(() => { $('fsBtn').textContent = document.fullscreenElement ? '⛶ ออกจากเต็มจอ' : '⛶ เต็มจอ'; }, 300);
};
$('quitBtn').onclick = () => { $('confirm').classList.remove('hide'); };
$('cfNo').onclick = () => { $('confirm').classList.add('hide'); };
$('cfYes').onclick = () => { settingsOpen = false; $('confirm').classList.add('hide'); $('settings').classList.add('hide'); snd.stopMusic(.5); fadeTo(1, 400).then(() => { enterTitle(); fadeTo(0, 600); }); };
$('thanksClose').onclick = () => { $('thanks').classList.add('hide'); fadeTo(1, 600).then(() => { enterTitle(); fadeTo(0, 800); }); };
async function fadeTo(v, ms = 700) { const f = $('fade'); f.style.transitionDuration = ms + 'ms'; f.style.opacity = v; await sleep(ms); }
addEventListener('resize', layout);
document.addEventListener('fullscreenchange', layout);

/* ================================================================ main loop */
let last = performance.now(), lastDt = .016;
const isPaused = () => (mode === 'story' && (settingsOpen || !$('pause').classList.contains('hide') || !$('confirm').classList.contains('hide'))) || (mode === 'whack' && settingsOpen);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; lastDt = dt;
  if (!isPaused()) {
    gameTime += dt;
    runTweens(dt);
    if (mode === 'title') updateTitle(dt);
    else if (mode === 'story') updateStory(dt);
    else if (mode === 'whack') updateWhack(dt);
    runWaiters();
  } else lastDt = 0;
  if (mode === 'whack') renderFrame(wScene, wCam, WHACK_GRADE);
  else { applyLook(); renderFrame(scene, camera, look); }
  if (mode === 'story') updateHint(camera); else hintEl.classList.add('hide');
  pressed = {};
}
layout();
enterTitle();
requestAnimationFrame(frame);

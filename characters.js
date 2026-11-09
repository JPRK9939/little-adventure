// Reusable voxel character & prop kit (shared look with "Tiny Memory World").
// Everything is built from boxes so it stays chunky / pixel-friendly.
// Usage: import * as CH from './characters.js'; const girl = CH.makeHuman({ gender: 'girl' });
import * as THREE from 'three';

export const COLORS = {
  white: 0xffffff, ink: 0x1b1b2f, blush: 0xffb6c8,
  cap: 0x7ab8ff, bow: 0xff8fb8,
  dogFur: 0xd9b38c, dogLight: 0xf1dcbc, dogEar: 0x7a5236,
  bearFur: 0x8b6b52, bearLight: 0xcaa98b, bearDark: 0x3b2b22, glass: 0x16161f,
};

export const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dode: new THREE.DodecahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  ring: new THREE.TorusGeometry(1, 0.13, 6, 16),
  oct: new THREE.OctahedronGeometry(1, 0),
};

// merge many coloured parts into one vertex-coloured geometry (one draw call)
export function mergeParts(parts) {
  let n = 0;
  const gs = parts.map(p => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); g.applyMatrix4(p.m); n += g.attributes.position.count; return [g, p.c]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
  let o = 0;
  for (const [g, hex] of gs) {
    c.set(hex);
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
export const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const B = (x, y, z, w, h, d, c, rx = 0, ry = 0, rz = 0) => ({ geo: GEO.box, m: M(x, y, z, rx, ry, rz, w, h, d), c });
const I = (x, y, z, s, c, sy = s, sz = s) => ({ geo: GEO.ico, m: M(x, y, z, 0, 0, 0, s, sy, sz), c });
const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; return m; };
export function castShadows(obj) { obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); return obj; }

/* ---------------- the white chibi human (girl / boy) ---------------- */
// faces: 'normal' (big eyes) · 'flat' ( - _ - ) · 'happy' ( ^ ^ )
// accessories: 'bow' · 'cap' · 'glasses'
export function makeHuman({ gender = 'girl', accessories } = {}) {
  accessories = accessories || (gender === 'girl' ? ['bow'] : ['cap']);
  const g = new THREE.Group();
  const W = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8a98 });
  const Ink = new THREE.MeshBasicMaterial({ color: COLORS.ink });
  const Hi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const Pk = new THREE.MeshBasicMaterial({ color: COLORS.blush });
  const box = (w, h, d, m, x, y, z, parent) => { const me = mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); parent.add(me); return me; };
  const pivot = (x, y, parent = g) => { const p = new THREE.Group(); p.position.set(x, y, 0); parent.add(p); return p; };

  const legL = pivot(-.15, .28), legR = pivot(.15, .28);
  box(.2, .28, .24, W, 0, -.14, 0, legL); box(.2, .28, .24, W, 0, -.14, 0, legR);
  const body = box(.62, .5, .46, W, 0, .5, 0, g);
  const armL = pivot(-.4, .68), armR = pivot(.4, .68);
  box(.16, .34, .2, W, 0, -.15, 0, armL); box(.16, .34, .2, W, 0, -.15, 0, armR);
  const head = new THREE.Group(); head.position.y = .74; g.add(head);
  box(1.12, .96, .96, W, 0, .48, 0, head);

  const faces = { normal: new THREE.Group(), flat: new THREE.Group(), happy: new THREE.Group() };
  for (const k in faces) head.add(faces[k]);
  for (const s of [-1, 1]) {
    box(.17, .28, .04, Ink, s * .23, .46, .49, faces.normal);
    box(.07, .07, .02, Hi, s * .23 - .04, .53, .515, faces.normal);
    box(.24, .05, .04, Ink, s * .23, .44, .49, faces.flat);
    box(.13, .05, .04, Ink, s * .23 - .045, .44, .49, faces.happy).rotation.z = .6;
    box(.13, .05, .04, Ink, s * .23 + .045, .44, .49, faces.happy).rotation.z = -.6;
    box(.16, .07, .02, Pk, s * .4, .28, .49, head);
  }
  box(.14, .035, .04, Ink, 0, .25, .49, faces.flat);
  const setFace = name => { for (const k in faces) faces[k].visible = k === name; };
  setFace('normal');

  // accessories
  const acc = {};
  acc.cap = new THREE.Group(); head.add(acc.cap);
  const Cb = new THREE.MeshLambertMaterial({ color: COLORS.cap, emissive: 0x1d3d66 }), Cw = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x55555f });
  box(1.16, .2, 1.0, Cb, 0, 1.0, 0, acc.cap); box(.8, .12, .62, Cb, 0, 1.16, -.04, acc.cap);
  box(.7, .06, .36, Cb, 0, .93, .62, acc.cap); box(.18, .08, .18, Cw, 0, 1.25, -.04, acc.cap);
  acc.bow = new THREE.Group(); head.add(acc.bow);
  const Pb = new THREE.MeshLambertMaterial({ color: COLORS.bow, emissive: 0x66223d });
  acc.bow.position.set(.36, 1.0, .1); acc.bow.rotation.z = -.25;
  box(.3, .26, .14, Pb, -.2, 0, 0, acc.bow).rotation.z = .35; box(.3, .26, .14, Pb, .2, 0, 0, acc.bow).rotation.z = -.35;
  box(.14, .14, .16, Pk, 0, 0, 0, acc.bow);
  acc.glasses = new THREE.Group(); head.add(acc.glasses);
  for (const s of [-1, 1]) {
    const r = mesh(GEO.ring, Ink); r.scale.setScalar(.19); r.position.set(s * .23, .46, .52); acc.glasses.add(r);
    box(.04, .04, .5, Ink, s * .57, .5, .27, acc.glasses);
  }
  box(.1, .035, .035, Ink, 0, .48, .52, acc.glasses);
  const setAccessories = list => { for (const k in acc) acc[k].visible = list.includes(k); };
  setAccessories(accessories);

  return { g, body, head, legL, legR, armL, armR, faces, setFace, acc, setAccessories, W };
}

// simple pose helper: 'stand' | 'sit'
export function poseHuman(h, pose) {
  if (pose === 'sit') { h.legL.rotation.set(-1.45, 0, -.12); h.legR.rotation.set(-1.45, 0, .12); h.sit = true; }
  else { h.legL.rotation.set(0, 0, 0); h.legR.rotation.set(0, 0, 0); h.sit = false; }
}

/* ---------------- Nam Tan: light-brown dog plush with long floppy ears ---------------- */
export function makeDog() {
  const g = new THREE.Group(), mat = vcMat();
  const F = COLORS.dogFur, L = COLORS.dogLight, K = COLORS.ink;
  const body = mesh(mergeParts([
    B(0, .43, 0, .62, .46, .8, F), B(0, .42, .4, .4, .32, .06, L),
    B(-.18, .11, .26, .16, .22, .18, F), B(.18, .11, .26, .16, .22, .18, F),
    B(-.18, .11, -.26, .16, .22, .18, F), B(.18, .11, -.26, .16, .22, .18, F),
  ]), mat);
  g.add(body);
  const tail = new THREE.Group(); tail.position.set(0, .58, -.4); g.add(tail);
  tail.add(mesh(mergeParts([B(0, .1, -.06, .12, .12, .3, F, .7)]), mat));
  const head = new THREE.Group(); head.position.set(0, .7, .3); g.add(head);
  head.add(mesh(mergeParts([
    B(0, .29, .06, .66, .58, .58, F), B(0, .16, .4, .34, .22, .22, L),
    B(0, .24, .52, .14, .1, .06, K),
    B(-.16, .38, .36, .09, .13, .04, K), B(.16, .38, .36, .09, .13, .04, K),
    B(-.18, .42, .385, .04, .04, .02, 0xffffff), B(.14, .42, .385, .04, .04, .02, 0xffffff),
  ]), mat));
  const ear = s => { const p = new THREE.Group(); p.position.set(s * .36, .5, .02); head.add(p); p.add(mesh(mergeParts([B(0, -.27, 0, .15, .6, .3, COLORS.dogEar)]), mat)); p.rotation.z = s * .12; return p; };
  const earL = ear(-1), earR = ear(1);
  return { g, head, earL, earR, tail, mat };
}

/* ---------------- the giant bearded bear in glasses ---------------- */
export function makeBear() {
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const mat = vcMat();
  const F = COLORS.bearFur, L = COLORS.bearLight, D = COLORS.bearDark, K = COLORS.glass;
  const part = (parts, parent, x = 0, y = 0, z = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); p.add(mesh(mergeParts(parts), mat)); return p; };
  const legL = part([B(0, -.65, 0, 1.0, 1.3, 1.1, F), B(0, -1.2, .12, 1.04, .2, 1.0, L)], root, -.75, 1.3);
  const legR = part([B(0, -.65, 0, 1.0, 1.3, 1.1, F), B(0, -1.2, .12, 1.04, .2, 1.0, L)], root, .75, 1.3);
  const body = part([B(0, 2.6, 0, 2.6, 2.6, 2.0, F), B(0, 2.4, 1.0, 1.7, 1.8, .1, L)], root);
  const armL = part([B(0, -1.0, 0, .8, 2.2, .9, F), B(0, -2.0, .05, .84, .4, .94, L)], root, -1.55, 3.6);
  const armR = part([B(0, -1.0, 0, .8, 2.2, .9, F), B(0, -2.0, .05, .84, .4, .94, L)], root, 1.55, 3.6);
  const headParts = [
    B(0, .95, 0, 2.2, 1.9, 1.8, F),
    B(-.85, 1.95, 0, .6, .6, .35, F), B(.85, 1.95, 0, .6, .6, .35, F),
    B(-.85, 1.95, .18, .34, .34, .02, L), B(.85, 1.95, .18, .34, .34, .02, L),
    B(0, .62, .95, 1.0, .6, .5, L), B(0, .84, 1.24, .36, .22, .12, K),
    B(-.45, 1.2, .91, .18, .26, .04, K), B(.45, 1.2, .91, .18, .26, .04, K),
    B(-.28, .48, 1.22, .48, .14, .1, D, 0, 0, .18), B(.28, .48, 1.22, .48, .14, .1, D, 0, 0, -.18),
    B(0, .08, .78, 1.6, .8, .5, D), B(0, -.32, .7, 1.0, .4, .36, D),
    { geo: GEO.ring, m: M(-.45, 1.2, .95, 0, 0, 0, .34, .34, .34), c: K }, { geo: GEO.ring, m: M(.45, 1.2, .95, 0, 0, 0, .34, .34, .34), c: K },
    B(0, 1.24, .95, .22, .06, .06, K), B(-1.12, 1.24, .45, .06, .06, 1.0, K), B(1.12, 1.24, .45, .06, .06, 1.0, K),
  ];
  const head = part(headParts, root, 0, 3.9);
  return { g, root, body, head, armL, armR, legL, legR, mat, height: 5.85 };
}

/* ---------------- props ---------------- */
export function makeHammer() {
  const g = new THREE.Group();
  g.add(mesh(mergeParts([
    B(0, .45, 0, .12, .9, .12, 0xc79a6b),
    B(0, .97, 0, .56, .34, .34, 0xff9ec4),
    B(.31, .97, 0, .08, .38, .38, 0xffffff), B(-.31, .97, 0, .08, .38, .38, 0xffffff),
    B(-.04, 1.0, .18, .08, .08, .02, 0xff4f86), B(.04, 1.0, .18, .08, .08, .02, 0xff4f86), B(0, .95, .18, .08, .08, .02, 0xff4f86, 0, 0, .78),
  ]), vcMat()));
  return g;
}
export function makePedestal() {
  return mesh(mergeParts([B(0, .3, 0, 1.6, .6, 1.6, 0x9a9aa6), B(0, .8, 0, 1.2, .4, 1.2, 0xb0b0bb), B(0, 1.1, 0, .9, .2, .9, 0xc4c4cf)]), vcMat());
}
export function makeRock() {
  return mesh(mergeParts([{ geo: GEO.dode, m: M(0, 0, 0, .3, .5, 0, .62, .55, .6), c: 0x9a9aa6 }, { geo: GEO.dode, m: M(.25, .2, .1, 0, 0, 0, .3), c: 0xb3b3bd }]), vcMat());
}
export const INGREDIENTS = ['bread', 'egg', 'tuna', 'veg'];
export function makeIngredient(type) {
  const p = {
    bread: [B(0, .1, 0, .62, .15, .58, 0xc98d4b), B(0, .18, 0, .54, .02, .5, 0xf6e1b5)],
    egg: [I(0, .3, 0, .22, 0xfffaf0, .29, .22)],
    tuna: [{ geo: GEO.cyl, m: M(0, .14, 0, 0, 0, 0, .26, .26, .26), c: 0xb8c4cf }, { geo: GEO.cyl, m: M(0, .14, 0, 0, 0, 0, .27, .14, .27), c: 0x5aa0e0 }, { geo: GEO.cyl, m: M(0, .275, 0, 0, 0, 0, .22, .02, .22), c: 0xdde3ea }],
    veg: [I(0, .2, 0, .24, 0x7ccf5a), I(.15, .18, .08, .18, 0x9be07a), I(-.14, .17, -.05, .17, 0x6abf4e), I(.04, .32, -.1, .12, 0xff5a4a)],
  }[type];
  return mesh(mergeParts(p), vcMat());
}
export function makeSandwich() {
  return mesh(mergeParts([
    B(0, .06, 0, .6, .12, .56, 0xf3d9a4), B(0, .14, 0, .66, .05, .6, 0x7ccf5a),
    B(0, .19, 0, .58, .06, .52, 0xe8b9a0), B(0, .245, 0, .56, .05, .5, 0xffe27a),
    B(0, .32, 0, .6, .12, .56, 0xf3d9a4), B(0, .385, 0, .52, .02, .48, 0xc98d4b),
  ]), vcMat());
}

/* ---------------- world kit (geometry for instancing) ---------------- */
const TRUNK = 0x6e5240;
export const treeBareGeo = () => mergeParts([
  B(0, 1.1, 0, .32, 2.2, .32, TRUNK), B(.36, 1.95, 0, .14, .95, .14, TRUNK, 0, 0, -.7),
  B(-.32, 2.3, .1, .12, .8, .12, TRUNK, 0, .3, .8), B(0, 2.4, -.3, .12, .7, .12, TRUNK, .7, 0, 0),
  B(.1, 2.45, .25, .1, .6, .1, TRUNK, -.6, 0, 0),
]);
export const treeCrownGeo = () => mergeParts([
  I(0, 2.95, 0, 1.15, 0x7fcf7a), I(.65, 2.55, .2, .72, 0x92dd85), I(-.6, 2.65, -.2, .78, 0x6cc06e), I(.1, 2.6, .7, .6, 0x86d67d),
  I(.45, 3.35, .55, .2, 0xffa8cc), I(-.5, 3.1, .5, .18, 0xff8fbf), I(.7, 2.9, -.4, .18, 0xffb8d6), I(-.2, 3.7, -.3, .17, 0xffa8cc),
]);
export const tuftGeo = () => mergeParts([
  { geo: GEO.cone, m: M(0, .16, 0, 0, 0, 0, .07, .34, .07), c: 0x6fcf84 },
  { geo: GEO.cone, m: M(.09, .12, .03, 0, 0, -.4, .06, .28, .06), c: 0x7fd690 },
  { geo: GEO.cone, m: M(-.08, .12, -.02, 0, 0, .4, .06, .28, .06), c: 0x63c477 },
]);
export const pebbleGeo = () => mergeParts([{ geo: GEO.dode, m: M(0, .06, 0, .3, .2, 0, .16, .1, .13), c: 0xb7b7c2 }]);
export const flowerGeo = () => mergeParts([
  { geo: GEO.cyl, m: M(0, .14, 0, 0, 0, 0, .02, .28, .02), c: 0x5fbf6a },
  I(0, .3, 0, .11, 0xff9ec4), I(.09, .28, 0, .07, 0xffb8d6), I(-.09, .28, 0, .07, 0xffb8d6), I(0, .28, .09, .07, 0xff8fbf), I(0, .32, 0, .05, 0xfff2a8),
]);
export const cloudGeo = () => mergeParts([I(0, 0, 0, 1.6, 0xffffff), I(1.5, -.2, .2, 1.2, 0xffffff), I(-1.5, -.3, -.1, 1.1, 0xffffff), I(.6, .7, -.3, 1.0, 0xffffff)]);

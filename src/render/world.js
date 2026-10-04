// Procedural renderer. No external assets on purpose: the whole slice has to
// boot from a cold `npm run dev` on venue wifi. Every scale is the same arena
// re-coloured and re-populated, which is also what sells the ladder.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLOR } from '../core/elements.js';
import { landmarksAround } from '../core/landmarks.js';
import { ARENA_RADIUS } from '../core/match.js';
import { SCALES } from '../core/scales.js';

const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(canvas, match) {
    this.match = match;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
    this.cameraHeight = 18;
    this.cameraTargetHeight = 18;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.key = new THREE.DirectionalLight(0xffffff, 1.1);
    this.key.position.set(6, 14, 8);
    this.scene.add(this.key);

    this.buildArena();
    this.buildMotes();

    this.unitMeshes = new Map();
    this.projectileMeshes = new Map();
    this.wallMeshes = new Map();
    this.structureMeshes = new Map();
    this.landmarkMeshes = new Map();
    this.signalMeshes = new Map();
    this.loader = new GLTFLoader();
    this.modelUrls = new Map();
    this.failedUrls = new Set();
    this.accent = match.scale.palette.accent;
    this.gazeRing = this.buildGazeRing();

    this.applyScale(match.scale, { instant: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    const width = w || window.innerWidth;
    const height = h || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  buildArena() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS + 2, 72),
      new THREE.MeshStandardMaterial({ color: 0x14224a, roughness: 0.95, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.floor = floor;
    this.scene.add(floor);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS + 2, 0.12, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    );
    rim.rotation.x = -Math.PI / 2;
    this.rim = rim;
    this.scene.add(rim);

    const grid = new THREE.PolarGridHelper(ARENA_RADIUS + 2, 5, 6, 72, 0xffffff, 0xffffff);
    grid.material.opacity = 0.08;
    grid.material.transparent = true;
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  buildMotes() {
    // One oversized buffer reused across scales; only the draw range and the
    // colour change, so a transition never allocates.
    const max = 1400;
    const positions = new Float32Array(max * 3);
    for (let i = 0; i < max; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 26;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.16, transparent: true, opacity: 0.75 }),
    );
    this.scene.add(this.motes);
  }

  buildGazeRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);
    return ring;
  }

  applyScale(scale, { instant = false } = {}) {
    const { fog, floor, accent } = scale.palette;
    this.scene.fog = new THREE.FogExp2(fog, 0.016);
    this.renderer.setClearColor(fog);
    this.floor.material.color.setHex(floor);
    this.rim.material.color.setHex(accent);
    this.motes.material.color.setHex(accent);
    this.motes.geometry.setDrawRange(0, scale.motes);

    this.accent = accent;
    const index = SCALES.indexOf(scale);
    this.cameraTargetHeight = 14 + index * 1.15;
    if (instant) this.cameraHeight = this.cameraTargetHeight;
  }

  // Punchy camera kick so a scale shift reads instantly on a projector.
  punch(steps) {
    this.cameraHeight += steps * 9;
  }

  meshForUnit(unit) {
    let mesh = this.unitMeshes.get(unit.id);
    if (mesh) return mesh;

    const geometry =
      unit.name === 'companion'
        ? companionGeometry(unit.form)
        : unit.faction === 'enemy'
          ? enemyGeometry(unit.name)
          : new THREE.IcosahedronGeometry(0.85, 0);

    if (unit.role) {
      const champ = buildChampion(unit.role);
      this.scene.add(champ);
      this.unitMeshes.set(unit.id, champ);
      this.attachModel(champ, unit.rosterId);
      return champ;
    }

    mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: COLOR[unit.element], roughness: 0.4, metalness: 0.3 }),
    );
    mesh.userData.form = unit.form;

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.9;
    mesh.add(halo);
    mesh.userData.halo = halo;

    this.scene.add(mesh);
    this.unitMeshes.set(unit.id, mesh);
    return mesh;
  }

  sync(dt) {
    const { match } = this;

    for (const unit of match.units) {
      const mesh = this.meshForUnit(unit);
      if (!unit.alive) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = !(unit.hidden && !unit.revealed);
      mesh.position.set(unit.position.x, unit.role ? 0 : 1, unit.position.z);
      if (mesh.userData.tint) mesh.userData.tint(unit.element);
      else mesh.material.color.setHex(COLOR[unit.element]);
      mesh.userData.halo.material.opacity = unit.shield > 0 ? 0.55 : 0;

      if (unit.name === 'companion' && mesh.userData.form !== unit.form) {
        mesh.geometry.dispose();
        mesh.geometry = companionGeometry(unit.form);
        mesh.userData.form = unit.form;
      }

      if (unit.name === 'hero') {
        const vx = unit.position.x - (mesh.userData.px ?? unit.position.x);
        const vz = unit.position.z - (mesh.userData.pz ?? unit.position.z);
        if (Math.hypot(vx, vz) > 0.002) mesh.rotation.y = Math.atan2(vx, vz);
        mesh.userData.px = unit.position.x;
        mesh.userData.pz = unit.position.z;
        const swing = unit.swing ?? 0;
        mesh.userData.arm.rotation.x = swing > 0 ? -0.4 - (0.32 - swing) * 7 : -0.35;
      } else {
        mesh.rotation.y += dt * (unit.faction === 'enemy' ? 1.2 : 0.4);
      }
      const wounded = 1 - unit.hp / unit.maxHp;
      const base = unit.name === 'familiar' ? 0.62 : 1;
      mesh.scale.setScalar(base * (1 - wounded * 0.25));
    }

    this.syncPool(this.projectileMeshes, match.projectiles, (p) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 12),
        new THREE.MeshBasicMaterial({ color: COLOR[p.element] }),
      );
      this.scene.add(mesh);
      return mesh;
    }, (mesh, p) => {
      mesh.position.set(p.position.x, 1.2, p.position.z);
      mesh.material.color.setHex(COLOR[p.element]);
      mesh.scale.setScalar(p.compound ? 1.6 : 1);
    });

    this.syncPool(this.signalMeshes, match.signals, (signal) => {
      const group = new THREE.Group();
      const color = COLOR[signal.element] ?? 0xffffff;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.68, 22),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      const mark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
      );
      mark.position.y = 0.9;
      group.add(ring, mark);
      group.userData.mark = mark;
      this.scene.add(group);
      return group;
    }, (group, signal) => {
      group.position.set(signal.position.x, 0.05, signal.position.z);
      group.userData.mark.position.y = 0.75 + Math.sin(match.time * 5) * 0.12;
      group.userData.mark.material.opacity = signal.recognized ? 0.25 : 1;
    });

    this.syncPool(this.wallMeshes, match.walls, (w) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w.span, 2.4, 0.4),
        new THREE.MeshStandardMaterial({
          color: COLOR[w.element],
          transparent: true,
          opacity: 0.75,
          emissive: COLOR[w.element],
          emissiveIntensity: 0.35,
        }),
      );
      this.scene.add(mesh);
      return mesh;
    }, (mesh, w) => {
      mesh.position.set(w.position.x, 1.2, w.position.z);
      mesh.rotation.y = -w.angle;
      mesh.material.opacity = Math.min(0.75, w.ttl / 3);
    });

    this.syncPool(this.structureMeshes, match.structures, (s) => {
      const group = buildStructure(s);
      this.scene.add(group);
      return group;
    }, (group, s) => {
      group.position.set(s.position.x, 0, s.position.z);
      // Drawings push up out of the floor instead of popping in, which is
      // what makes "I drew that and it is now in the game" land on a stage.
      group.userData.rise = Math.min(1, (group.userData.rise ?? 0) + dt * 2.2);
      const rise = easeOut(group.userData.rise);
      group.scale.set(1, rise, 1);
      const wear = s.hp / s.maxHp;
      for (const slab of group.children) {
        slab.material.emissiveIntensity = 0.12 + (1 - wear) * 0.5;
      }
    });

    this.cameraHeight += (this.cameraTargetHeight - this.cameraHeight) * Math.min(1, dt * 2.4);
    const hero = match.hero.position;
    this.camera.position.set(hero.x * 0.3, this.cameraHeight, this.cameraHeight * 0.78 + 4);
    this.camera.up.copy(UP);
    this.camera.lookAt(hero.x * 0.3, 0, hero.z * 0.3);

    this.motes.rotation.y += dt * 0.02;
    this.syncLandmarks(dt);
  }

  // The ring of props is keyed by scale and grid cell, so walking — or
  // saying "take me to mars" — swaps the world without a level load.
  syncLandmarks(dt) {
    const marks = landmarksAround(this.match.scale.id, this.match.hero.position);
    const seen = new Set();
    for (const mark of marks) {
      seen.add(mark.id);
      let mesh = this.landmarkMeshes.get(mark.id);
      if (!mesh) {
        mesh = buildLandmark(mark, this.accent);
        mesh.userData.rise = 0;
        this.scene.add(mesh);
        this.landmarkMeshes.set(mark.id, mesh);
      }
      mesh.userData.rise = Math.min(1, mesh.userData.rise + dt * 1.6);
      const rise = easeOut(mesh.userData.rise);
      mesh.position.set(mark.x, (rise - 1) * 1.5, mark.z);
      mesh.scale.setScalar(mark.scale * (0.4 + 0.6 * rise));
    }
    for (const [id, mesh] of this.landmarkMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      dispose(mesh);
      this.landmarkMeshes.delete(id);
    }
  }

  // Keyed on object identity so pooled meshes track a list that shuffles.
  syncPool(store, items, create, update) {
    const seen = new Set();
    for (const item of items) {
      let mesh = store.get(item);
      if (!mesh) {
        mesh = create(item);
        store.set(item, mesh);
      }
      update(mesh, item);
      mesh.visible = true;
      seen.add(item);
    }
    for (const [item, mesh] of store) {
      if (seen.has(item)) continue;
      this.scene.remove(mesh);
      dispose(mesh);
      store.delete(item);
    }
  }

  rebuildUnit(unit) {
    const mesh = this.unitMeshes.get(unit.id);
    if (!mesh) return;
    this.scene.remove(mesh);
    dispose(mesh);
    this.unitMeshes.delete(unit.id);
  }

  // A Hyper3D export, or any .glb dropped on a card. Procedural stand-in
  // stays until the file actually parses.
  useModel(rosterId, url) {
    this.modelUrls.set(rosterId, url);
    this.failedUrls.delete(url);
    for (const unit of this.match.units) {
      if (unit.rosterId === rosterId) this.rebuildUnit(unit);
    }
  }

  attachModel(group, rosterId) {
    if (!rosterId) return;
    const url = this.modelUrls.get(rosterId) || `/models/${rosterId}.glb`;
    if (this.failedUrls.has(url)) return;
    this.loader.load(
      url,
      (gltf) => {
        if (!group.parent) return;
        const scene = gltf.scene;
        const box = new THREE.Box3().setFromObject(scene);
        const height = Math.max(box.getSize(new THREE.Vector3()).y, 0.001);
        const scale = 1.8 / height;
        scene.scale.setScalar(scale);
        scene.position.y = -box.min.y * scale;
        for (const part of group.userData.parts ?? []) part.visible = false;
        if (group.userData.sword) group.userData.sword.visible = false;
        group.add(scene);
      },
      undefined,
      () => this.failedUrls.add(url),
    );
  }

  showGaze(point, fromEyes = false) {
    if (!point) {
      this.gazeRing.visible = false;
      return;
    }
    this.gazeRing.visible = true;
    this.gazeRing.position.set(point.x, 0.05, point.z);
    this.gazeRing.material.color.setHex(fromEyes ? 0xfff2c4 : 0xffffff);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// A sketch becomes a solid by revolving its band profile around the vertical
// axis: each band is one slab, sized by how wide the player's ink was at that
// height. Round archetypes get cylinders, built ones get boxes, which is the
// whole difference between a drawn dome and a drawn keep.
function buildStructure(structure) {
  const { spec } = structure;
  const scale = structure.span * 2;
  const colour = COLOR[spec.element];
  const group = new THREE.Group();
  group.userData.rise = 0;

  spec.bands.forEach((band, index) => {
    const width = Math.max(0.12, band.halfWidth * 2 * scale);
    const height = Math.max(0.08, (band.y1 - band.y0) * scale);
    const geometry = spec.round
      ? new THREE.CylinderGeometry(width / 2, width / 2, height, 14)
      : new THREE.BoxGeometry(width, height, width);

    const slab = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.75,
        metalness: 0.15,
        emissive: colour,
        emissiveIntensity: 0.12,
        // Alternate the shading band to band so the stack reads as courses of
        // stone rather than one smooth lump.
        flatShading: index % 2 === 0,
      }),
    );
    slab.position.set(
      (band.offset - 0.5) * scale * 0.4,
      (band.y0 + band.y1) / 2 * scale,
      0,
    );
    slab.rotation.y = spec.round ? 0 : index * 0.04;
    group.add(slab);
  });

  return group;
}

// Structures are groups of slabs, everything else is a bare mesh, so walk.
function dispose(object) {
  object.geometry?.dispose();
  object.material?.dispose();
  for (const child of object.children) dispose(child);
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function buildChampion(role) {
  const mat = () =>
    new THREE.MeshStandardMaterial({ color: COLOR.fire, roughness: 0.42, metalness: 0.28 });
  const group = new THREE.Group();
  const parts = [];
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    parts.push(mesh);
    group.add(mesh);
    return mesh;
  };

  let arm = { rotation: { x: -0.35 } };
  let sword = null;

  const figure = (opts = {}) => {
    const slim = Boolean(opts.slim);
    add(new THREE.Mesh(new THREE.CapsuleGeometry(slim ? 0.26 : 0.34, slim ? 0.5 : 0.6, 4, 8), mat()), 0, 0.85, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(slim ? 0.2 : 0.24, 14, 12), mat()), 0, slim ? 1.38 : 1.5, 0);
    if (opts.hood) add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.36, 6), mat()), 0, 1.72, 0);
    if (opts.cape) add(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.95, 5), mat()), 0, 0.65, -0.12);
    if (opts.ring) {
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 20), mat()), 0, 1.95, 0);
      ring.rotation.x = Math.PI / 2;
    }
    arm = new THREE.Group();
    arm.position.set(0.42, 1.15, 0.1);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 3, 6), mat());
    limb.position.y = -0.28;
    parts.push(limb);
    arm.add(limb);
    if (opts.sword) {
      sword = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, opts.sword === 'short' ? 0.62 : 0.95, 0.07),
        new THREE.MeshStandardMaterial({
          color: COLOR.fire,
          emissive: COLOR.fire,
          emissiveIntensity: 0.45,
          roughness: 0.3,
        }),
      );
      sword.position.y = opts.sword === 'short' ? -0.7 : -0.95;
      arm.add(sword);
    }
    group.add(arm);
  };

  // One cartoon body per member. Familiar stays the small beast; the rival
  // keeps a plain blade silhouette and is not one of the seven.
  if (role === 'beast') {
    add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat()), 0, 0.55, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), mat()), 0.18, 1.05, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), mat()), -0.18, 1.05, 0);
  } else if (role === 'shade') figure({ hood: true });
  else if (role === 'dancer') figure({ slim: true });
  else if (role === 'voice') figure({ cape: true });
  else if (role === 'lead' || role === 'spark') figure({ ring: true });
  else if (role === 'athlete') figure({ sword: 'short' });
  else figure({ sword: true });

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.9, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.04;
  group.add(halo);
  group.userData.arm = arm;
  group.userData.sword = sword;
  group.userData.halo = halo;
  group.userData.parts = parts;
  group.userData.tint = (element) => {
    const color = COLOR[element];
    for (const part of parts) {
      part.material?.color?.setHex(color);
    }
    if (sword) {
      sword.material.color.setHex(color);
      sword.material.emissive.setHex(color);
    }
  };
  return group;
}

function enemyGeometry(name) {
  if (name === 'jiangshi') return new THREE.BoxGeometry(0.7, 1.7, 0.45);
  if (name === 'sword shade') return new THREE.OctahedronGeometry(0.7, 0);
  return new THREE.ConeGeometry(0.55, 1.5, 5);
}

function buildLandmark(mark, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.2,
    emissive: color,
    emissiveIntensity: 0.18,
    flatShading: true,
  });
  const group = new THREE.Group();
  group.rotation.y = mark.yaw;

  const add = (mesh) => {
    mesh.material = material.clone();
    group.add(mesh);
    return mesh;
  };

  switch (mark.kind) {
    case 'helix':
      for (let i = 0; i < 14; i += 1) {
        const bead = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), material));
        const angle = i * 0.7;
        bead.position.set(Math.cos(angle) * 0.7, 0.2 + i * 0.16, Math.sin(angle) * 0.7);
      }
      break;
    case 'cluster':
      for (let i = 0; i < 4; i += 1) {
        const bead = add(new THREE.Mesh(new THREE.SphereGeometry(0.22 + (i % 2) * 0.1, 10, 8), material));
        bead.position.set(Math.cos(i) * 0.45, 0.3, Math.sin(i) * 0.45);
      }
      break;
    case 'vesicle':
      add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), material)).position.y = 1.1;
      break;
    case 'fiber':
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), material)).position.y = 1.6;
      break;
    case 'arch':
      add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 18, Math.PI), material)).position.y = 0.2;
      break;
    case 'ruin':
      add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), material)).position.y = 1.1;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), material)).position.set(0.9, 0.7, 0.4);
      break;
    case 'dune':
      add(new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 7), material)).position.y = 0.25;
      break;
    case 'spiral':
      for (let i = 0; i < 8; i += 1) {
        const bead = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), material));
        const angle = i * 0.9;
        const r = 0.3 + i * 0.16;
        bead.position.set(Math.cos(angle) * r, 0.4 + i * 0.05, Math.sin(angle) * r);
      }
      break;
    case 'ring':
      add(new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 24), material)).rotation.x = Math.PI / 2;
      break;
    case 'crew':
      // Five original figures in a line. A crew, not a portrait of anyone.
      for (let i = 0; i < 5; i += 1) {
        const fig = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.7, 3, 6), material));
        fig.position.set((i - 2) * 0.48, 0.55, (i % 2) * 0.15);
      }
      break;
    case 'orbit':
    default:
      add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 20), material)).rotation.x = Math.PI / 2.4;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), material)).position.set(1.15, 0.2, 0);
      break;
  }

  material.dispose();
  return group;
}

function companionGeometry(form) {
  switch (form) {
    case 'robot':
      return new THREE.BoxGeometry(1.1, 1.3, 1.1);
    case 'alien':
      return new THREE.TorusKnotGeometry(0.5, 0.2, 64, 8);
    case 'dragon':
    default:
      return new THREE.OctahedronGeometry(0.85, 0);
  }
}

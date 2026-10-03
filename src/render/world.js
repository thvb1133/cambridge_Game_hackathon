// Procedural renderer. No external assets on purpose: the whole slice has to
// boot from a cold `npm run dev` on venue wifi. Every scale is the same arena
// re-coloured and re-populated, which is also what sells the ladder.

import * as THREE from 'three';
import { COLOR } from '../core/elements.js';
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

    const index = SCALES.indexOf(scale);
    this.cameraTargetHeight = 15 + index * 1.4;
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
      unit.faction === 'player' && unit.name === 'hero'
        ? new THREE.ConeGeometry(0.7, 1.9, 6)
        : unit.name === 'companion'
          ? companionGeometry(unit.form)
          : new THREE.IcosahedronGeometry(0.85, 0);

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
      mesh.visible = true;
      mesh.position.set(unit.position.x, 1, unit.position.z);
      mesh.material.color.setHex(COLOR[unit.element]);
      mesh.userData.halo.material.opacity = unit.shield > 0 ? 0.55 : 0;

      if (unit.name === 'companion' && mesh.userData.form !== unit.form) {
        mesh.geometry.dispose();
        mesh.geometry = companionGeometry(unit.form);
        mesh.userData.form = unit.form;
      }

      // Lean into the direction of travel; cheap but makes units feel alive.
      mesh.rotation.y += dt * (unit.faction === 'enemy' ? 1.2 : 0.4);
      const wounded = 1 - unit.hp / unit.maxHp;
      mesh.scale.setScalar(1 - wounded * 0.25);
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

  showGaze(point) {
    if (!point) {
      this.gazeRing.visible = false;
      return;
    }
    this.gazeRing.visible = true;
    this.gazeRing.position.set(point.x, 0.05, point.z);
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

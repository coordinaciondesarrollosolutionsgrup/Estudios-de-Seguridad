// src/components/ThreeBackground.jsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground({
  className = "fixed inset-0 -z-10 pointer-events-none",
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    /* ─── Renderer ─── */
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;pointer-events:none;";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.tabIndex = -1;
    mount.appendChild(renderer.domElement);

    /* ─── Scene / Camera ─── */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07101d);
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 90;

    /* ─── Helpers ─── */
    const addOrb = (hexColor, radius, opacity) => {
      const geo = new THREE.SphereGeometry(radius, 32, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(hexColor),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      return mesh;
    };

    /* ─── Glowing orbs (2 layers each = soft glow) ─── */
    const orbDefs = [
      { color: "#1d4ed8", r: 40, op: 0.16, bx: 38, by: 22, sz: -50, ax: 10, ay: 8,  sp: 0.38 },
      { color: "#7c3aed", r: 32, op: 0.14, bx:-42, by:-14, sz: -45, ax: 12, ay: 9,  sp: 0.30 },
      { color: "#0891b2", r: 26, op: 0.18, bx:  2, by: 32, sz: -38, ax:  9, ay: 10, sp: 0.50 },
      { color: "#6d28d9", r: 36, op: 0.12, bx:-18, by:-28, sz: -55, ax: 11, ay:  7, sp: 0.28 },
      { color: "#0f4c75", r: 44, op: 0.10, bx: 10, by:-10, sz: -60, ax:  7, ay: 12, sp: 0.22 },
    ];
    const orbMeshes = orbDefs.map(({ color, r, op, bx, by, sz }) => {
      const outer = addOrb(color, r,       op * 0.5);
      const inner = addOrb(color, r * 0.5, op);
      outer.position.set(bx, by, sz);
      inner.position.set(bx, by, sz);
      return { outer, inner };
    });

    /* ─── Circle sprite texture ─── */
    const circleTexture = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0,   "rgba(255,255,255,1)");
      g.addColorStop(0.35,"rgba(255,255,255,0.8)");
      g.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    /* ─── Particle field (circles) ─── */
    const N = 2200;
    const pPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pPos[i * 3 + 0] = (Math.random() - 0.5) * 280;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 160;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 2.2,
      map: circleTexture,
      color: new THREE.Color("#6b8aff"),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.01,
    });
    const stars = new THREE.Points(pGeo, pMat);
    scene.add(stars);

    /* ─── Wireframe icosahedra (floating geometry) ─── */
    const icoDefs = [
      { r: 9,  x:  55, y:  28, z: -22, rx:  0.004, ry:  0.006 },
      { r: 6,  x: -58, y: -22, z: -18, rx: -0.005, ry:  0.003 },
      { r: 7,  x: -12, y: -38, z: -28, rx:  0.003, ry: -0.005 },
      { r: 5,  x:  32, y: -32, z: -12, rx:  0.006, ry:  0.002 },
      { r: 8,  x: -30, y:  35, z: -30, rx: -0.003, ry:  0.007 },
    ];
    const icoMeshes = icoDefs.map(({ r, x, y, z }) => {
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#2560d0"),
        wireframe: true,
        transparent: true,
        opacity: 0.10,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    });

    /* ─── Subtle torus (ring accent) ─── */
    const torusDefs = [
      { rx: 18, ry: 0.6, seg: 80, x:  45, y: -30, z: -35, rx2:  0.002, ry2:  0.004 },
      { rx: 12, ry: 0.5, seg: 60, x: -50, y:  30, z: -28, rx2: -0.003, ry2:  0.002 },
    ];
    const torusMeshes = torusDefs.map(({ rx, ry, seg, x, y, z }) => {
      const geo = new THREE.TorusGeometry(rx, ry, 8, seg);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#3b82f6"),
        transparent: true,
        opacity: 0.07,
        wireframe: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.x = Math.PI / 4;
      scene.add(mesh);
      return mesh;
    });

    /* ─── Animation ─── */
    let running = true;
    const clock = new THREE.Clock();

    const animate = () => {
      if (!running) return;
      const t = clock.getElapsedTime();

      /* Orbs drift on lissajous paths */
      orbDefs.forEach(({ bx, by, ax, ay, sp }, i) => {
        const ox = bx + Math.sin(t * sp)       * ax;
        const oy = by + Math.sin(t * sp * 1.3) * ay;
        orbMeshes[i].outer.position.x = ox;
        orbMeshes[i].outer.position.y = oy;
        orbMeshes[i].inner.position.x = ox;
        orbMeshes[i].inner.position.y = oy;
      });

      /* Very slow star field rotation */
      stars.rotation.y = t * 0.012;
      stars.rotation.x = t * 0.006;

      /* Icosahedra spin */
      icoDefs.forEach(({ rx: rx2, ry: ry2 }, i) => {
        icoMeshes[i].rotation.x += rx2;
        icoMeshes[i].rotation.y += ry2;
      });

      /* Torus rotation */
      torusDefs.forEach(({ rx2, ry2 }, i) => {
        torusMeshes[i].rotation.x += rx2;
        torusMeshes[i].rotation.z += ry2;
      });

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    /* ─── Resize / Visibility ─── */
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) animate();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    /* ─── Cleanup ─── */
    return () => {
      running = false;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      circleTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className={className} />;
}

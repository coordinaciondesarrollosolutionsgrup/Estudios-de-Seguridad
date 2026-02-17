// src/components/ThreeBackground.jsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground({
  className = "fixed inset-0 -z-10 pointer-events-none", // debajo del contenido, sin capturar eventos
  particleCount = 1800,
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ------- renderer -------
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.tabIndex = -1;              // no focusable
    renderer.domElement.style.pointerEvents = "none";
    mount.appendChild(renderer.domElement);

    // ------- scene/camera -------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 60);

    // ------- background glow (optional) -------
    const fog = new THREE.FogExp2(0x0b1220, 0.015);
    scene.fog = fog;

    // ------- particles -------
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 220;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.6,
      transparent: true,
      opacity: 0.85,
      color: new THREE.Color(0x88aaff),
    });

    const points = new THREE.Points(geom, mat);
    scene.add(points);

    // ------- subtle wireframe plane (tech vibe) -------
    const grid = new THREE.GridHelper(400, 40, 0x2b5df5, 0x2b5df5);
    grid.material.opacity = 0.08;
    grid.material.transparent = true;
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -60;
    scene.add(grid);

    // ------- animation loop -------
    let running = true;
    let raf = 0;
    const animate = () => {
      if (!running) return;
      points.rotation.y += 0.0009;
      points.rotation.x += 0.0003;
      renderer.render(scene, camera);
      raf = renderer.setAnimationLoop(animate);
    };
    animate();

    // ------- resize / visibility -------
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) animate();
      else renderer.setAnimationLoop(null);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    // ------- cleanup -------
    return () => {
      running = false;
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      mount.removeChild(renderer.domElement);
      geom.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [particleCount]);

  return <div ref={mountRef} className={className} />;
}

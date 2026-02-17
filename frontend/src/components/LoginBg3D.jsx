// src/components/LoginBg3D.jsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function LoginBg3D() {
  const ref = useRef(null);
  const cleanupRef = useRef(() => {});

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1220, 6, 18);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Luces suaves
    const aLight = new THREE.AmbientLight(0x335577, 0.5);
    scene.add(aLight);

    // Grupo de partículas (3 capas con tamaños/colores/velocidades distintas)
    const group = new THREE.Group();
    scene.add(group);

    function makeLayer({ count, radius, color, size, speed }) {
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        // puntos dentro de una esfera
        const r = radius * Math.cbrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
      }
      geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      const mat = new THREE.PointsMaterial({
        color,
        size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geom, mat);
      points.userData.speed = speed;
      group.add(points);
    }

    makeLayer({ count: 1800, radius: 8.5, color: 0x60a5fa, size: 0.06, speed: 0.0022 }); // azul claro
    makeLayer({ count: 1200, radius: 7.0, color: 0x22d3ee, size: 0.075, speed: 0.0032 }); // cian
    makeLayer({ count: 800,  radius: 5.5, color: 0xa78bfa, size: 0.09,  speed: 0.0042 }); // lila

    // Parallax sutil con el mouse
    const targetRot = { x: 0, y: 0 };
    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width  - 0.5;
      const ny = (e.clientY - rect.top)  / rect.height - 0.5;
      targetRot.y = nx * 0.3;
      targetRot.x = ny * 0.25;
    };
    window.addEventListener("pointermove", onPointerMove);

    let rafId = 0;
    const tick = () => {
      // rotación suave del grupo
      group.rotation.y += 0.0008;
      group.rotation.x += 0.0003;

      // cada capa gira con velocidad propia
      group.children.forEach((p, i) => {
        p.rotation.y += p.userData.speed;
        p.rotation.x -= p.userData.speed * 0.35;
      });

      // parallax (interpolación suave hacia el target)
      camera.rotation.x += (targetRot.x - camera.rotation.x) * 0.05;
      camera.rotation.y += (targetRot.y - camera.rotation.y) * 0.05;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      // liberar geometrías/materiales
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    };

    return () => cleanupRef.current();
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 -z-0"
      aria-hidden
    />
  );
}

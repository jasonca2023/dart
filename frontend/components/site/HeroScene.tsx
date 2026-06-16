"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles, MeshDistortMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Brand chromatics — the only color allowed to surface (ad energy made visible).
const VIOLET = "#0447ff";
const EMBER = "#ff4704";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// The hero asset: a soft glass orb, lit violet on one flank and ember on the
// other so the brand gradient is painted by real light, not a texture.
function Core({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const intro = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    intro.current = Math.min(1, intro.current + dt / 1.1);
    m.scale.setScalar(0.55 + 0.45 * easeOutCubic(intro.current));
    if (!reduced) m.rotation.y += dt * 0.12;
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 8]} />
      <MeshDistortMaterial
        color="#efeaff"
        distort={reduced ? 0 : 0.34}
        speed={reduced ? 0 : 1.5}
        roughness={0.12}
        metalness={0.06}
      />
    </mesh>
  );
}

// A motion-graphic ring that drifts around the core on its own tilt.
function Ring({
  radius,
  tilt,
  speed,
  color,
  reduced,
}: {
  radius: number;
  tilt: number;
  speed: number;
  color: string;
  reduced: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current && !reduced) ref.current.rotation.z += dt * speed;
  });
  return (
    <mesh ref={ref} rotation={[tilt, 0.3, 0]}>
      <torusGeometry args={[radius, 0.007, 12, 180]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  );
}

// Small bodies that fly in from beyond the frame and settle into orbit.
function Orbit({
  radius,
  count,
  tilt,
  speed,
  size,
  color,
  reduced,
}: {
  radius: number;
  count: number;
  tilt: number;
  speed: number;
  size: number;
  color: string;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const intro = useRef(0);
  const phases = useMemo(
    () => Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2),
    [count],
  );
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    intro.current = Math.min(1, intro.current + dt / 1.5);
    const e = easeOutCubic(intro.current);
    const r = THREE.MathUtils.lerp(radius * 1.9, radius, e); // converge to center
    const t = reduced ? 0 : state.clock.elapsedTime * speed;
    g.children.forEach((child, i) => {
      const a = phases[i] + t;
      child.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      child.scale.setScalar(e);
    });
  });
  return (
    <group ref={group} rotation={[tilt, 0, 0.2]}>
      {phases.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[size, 24, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.35}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

// Gentle pointer parallax on the whole rig — premium, never literal.
function Rig({
  reduced,
  children,
}: {
  reduced: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g || reduced) return;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, state.pointer.x * 0.3, 0.05);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -state.pointer.y * 0.22, 0.05);
  });
  return <group ref={ref}>{children}</group>;
}

export function HeroScene({ reduced }: { reduced: boolean }) {
  return (
    <Canvas
      camera={{ fov: 38, position: [0, 0, 7] }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.55} />
      <pointLight color={VIOLET} intensity={2.4} decay={0} position={[-3.5, 2, 3]} />
      <pointLight color={EMBER} intensity={2.4} decay={0} position={[3.5, -1.5, 2.5]} />
      <directionalLight color="#ffffff" intensity={0.5} position={[0, 3, 5]} />

      <Rig reduced={reduced}>
        <Float
          speed={reduced ? 0 : 1.2}
          rotationIntensity={reduced ? 0 : 0.3}
          floatIntensity={reduced ? 0 : 0.5}
        >
          <Core reduced={reduced} />
        </Float>
        <Ring radius={1.65} tilt={1.3} speed={0.3} color={VIOLET} reduced={reduced} />
        <Ring radius={2.05} tilt={-0.6} speed={-0.22} color={EMBER} reduced={reduced} />
        <Orbit radius={1.8} count={3} tilt={0.5} speed={0.5} size={0.085} color={VIOLET} reduced={reduced} />
        <Orbit radius={2.15} count={2} tilt={-0.45} speed={-0.4} size={0.065} color={EMBER} reduced={reduced} />
        <Sparkles count={36} scale={6} size={2.2} speed={reduced ? 0 : 0.3} color={VIOLET} opacity={0.5} />
      </Rig>
    </Canvas>
  );
}

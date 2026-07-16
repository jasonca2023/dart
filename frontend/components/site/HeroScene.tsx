"use client";

/* Hallmark · component: hero orb (WebGL centerpiece) · genre: atmospheric · theme: Bloom
 * interaction: pointer parallax (existing) · grab-to-spin with inertia · hover spin-up
 * states: idle · hover (grab cursor, distort+orbit lift) · drag (grabbing, direct rotation)
 *         · release (inertia, damped) · reduced-motion (drag allowed, no autonomous motion)
 * The orb is decorative — never a surface, never holds text — so disabled/loading/error/
 * success don't apply; the CSS <Orb> fallback in HeroVisual covers the loading state. */

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Float,
  Sparkles,
  MeshDistortMaterial,
  Environment,
  Lightformer,
} from "@react-three/drei";
import { useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";

// Brand chromatics — the only color allowed to surface (ad energy made visible).
const VIOLET = "#0447ff";
const EMBER = "#ff4704";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// 0→1 ramp shared by the pieces that react to hover/drag ("the factory spins
// up under your hand"). A plain ref so consumers read it per-frame without
// re-rendering the tree.
type Boost = React.MutableRefObject<number>;

// The hero asset: a soft glass orb, lit violet on one flank and ember on the
// other so the brand gradient is painted by real light, not a texture. A studio
// reflection rig (Environment + Lightformers, no network fetch) gives the
// surface gentle specular streaks so it reads as polished glass — kept soft, not
// glaring.
function Core({ reduced, boost }: { reduced: boolean; boost: Boost }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<ComponentRef<typeof MeshDistortMaterial>>(null);
  const intro = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    intro.current = Math.min(1, intro.current + dt / 1.1);
    const b = boost.current;
    m.scale.setScalar((0.55 + 0.45 * easeOutCubic(intro.current)) * (1 + 0.03 * b));
    if (!reduced) {
      m.rotation.y += dt * 0.1;
      if (mat.current) mat.current.distort = 0.26 + 0.09 * b;
    }
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 12]} />
      <MeshDistortMaterial
        ref={mat}
        color="#f1edff"
        distort={reduced ? 0 : 0.26}
        speed={reduced ? 0 : 1.2}
        roughness={0.16}
        metalness={0.18}
        envMapIntensity={0.6}
      />
    </mesh>
  );
}

// A soft chromatic halo hugging the silhouette — energy bleeding off the glass.
function Halo({ color, scale }: { color: string; scale: number }) {
  return (
    <mesh scale={scale}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.13}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// One orbital plane: a thin ring with small bodies riding *on* the ring line.
// Ring + dots live in the same local XY plane (the torus lies in XY, so a circle
// of the same radius sits exactly on its centerline). Spinning the shared group
// about Z carries the dots along the ring while the ring itself — rotationally
// symmetric about Z — appears to hold still.
function OrbitalRing({
  radius,
  orient,
  spin,
  count,
  dotSize,
  color,
  reduced,
  boost,
}: {
  radius: number;
  orient: [number, number, number];
  spin: number;
  count: number;
  dotSize: number;
  color: string;
  reduced: boolean;
  boost: Boost;
}) {
  const spinRef = useRef<THREE.Group>(null);
  const dotsRef = useRef<THREE.Group>(null);
  const intro = useRef(0);
  const phases = useMemo(
    () => Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2),
    [count],
  );
  useFrame((_, dt) => {
    if (spinRef.current && !reduced)
      spinRef.current.rotation.z += dt * spin * (1 + 0.8 * boost.current);
    // Entrance: dots pop onto the line rather than flying through the frame.
    intro.current = Math.min(1, intro.current + dt / 1.2);
    const e = easeOutCubic(intro.current);
    dotsRef.current?.children.forEach((c) => c.scale.setScalar(e));
  });
  return (
    <group rotation={orient}>
      <group ref={spinRef}>
        <mesh>
          <torusGeometry args={[radius, 0.01, 16, 220]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            toneMapped={false}
          />
        </mesh>
        <group ref={dotsRef}>
          {phases.map((p, i) => (
            <mesh
              key={i}
              position={[Math.cos(p) * radius, Math.sin(p) * radius, 0]}
            >
              <sphereGeometry args={[dotSize, 24, 24]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.7}
                roughness={0.25}
                metalness={0.1}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// Direct manipulation: an invisible hit sphere over the orb makes the whole
// assembly grabbable — drag to spin, release to let it coast on damped inertia.
// Pointer capture (R3F honours setPointerCapture per-object) keeps the drag
// alive even when the pointer leaves the orb's silhouette. Under reduced
// motion the drag itself still works (user-initiated), but inertia is zeroed on
// release so nothing moves on its own.
function Grabbable({
  reduced,
  boost,
  children,
}: {
  reduced: boolean;
  boost: Boost;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const dragging = useRef(false);
  const hovering = useRef(false);
  const vel = useRef({ x: 0, y: 0 });
  const last = useRef<{ x: number; y: number; t: number } | null>(null);

  useFrame((_, dt) => {
    // Hover/drag ramp for the pieces that react to attention.
    const target = dragging.current || hovering.current ? 1 : 0;
    boost.current += (target - boost.current) * Math.min(1, dt * 6);

    const g = group.current;
    if (!g) return;
    if (!dragging.current) {
      // Coast on the released velocity, easing out with exponential damping.
      g.rotation.y += vel.current.x * dt;
      g.rotation.x += vel.current.y * dt;
      const damp = Math.exp(-dt * 1.8);
      vel.current.x *= damp;
      vel.current.y *= damp;
      // Once settled, drift the pitch back level so the rig never rests askew.
      if (Math.abs(vel.current.x) < 0.02 && Math.abs(vel.current.y) < 0.02) {
        g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, Math.min(1, dt * 1.5));
      }
    }
    g.rotation.x = THREE.MathUtils.clamp(g.rotation.x, -0.9, 0.9);
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // capture unavailable — the buttons guard in onMove still ends drags
    }
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    vel.current = { x: 0, y: 0 };
    gl.domElement.style.cursor = "grabbing";
  };
  // One exit path for every way a drag can end (pointerup, pointercancel,
  // lost capture, or a buttons-up move after a missed release) so the drag
  // flag can never stay latched — a past click must never steer the orb.
  const endDrag = (e?: ThreeEvent<PointerEvent>) => {
    if (e) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // capture already gone — nothing to release
      }
    }
    dragging.current = false;
    last.current = null;
    if (reduced) vel.current = { x: 0, y: 0 };
    gl.domElement.style.cursor = hovering.current ? "grab" : "auto";
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    // The button was released but we never saw the up event (release outside
    // the window, OS-level grab, etc.) — end the stale drag instead of
    // steering the orb from a hover.
    if (e.buttons === 0) {
      endDrag(e);
      return;
    }
    if (!last.current || !group.current) return;
    const now = performance.now();
    const dtMs = Math.max(1, now - last.current.t);
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    group.current.rotation.y += dx * 0.006;
    group.current.rotation.x += dy * 0.004;
    vel.current = { x: (dx * 6) / dtMs, y: (dy * 4) / dtMs };
    last.current = { x: e.clientX, y: e.clientY, t: now };
  };

  return (
    <group ref={group}>
      {children}
      <mesh
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerOver={() => {
          hovering.current = true;
          if (!dragging.current) gl.domElement.style.cursor = "grab";
        }}
        onPointerOut={() => {
          hovering.current = false;
          if (!dragging.current) gl.domElement.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[1.25, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
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
  const boost = useRef(0);
  return (
    <Canvas
      camera={{ fov: 38, position: [0, 0, 7] }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      // pan-y keeps vertical touch scrolling alive over the hero; horizontal
      // drags on the orb spin it instead.
      style={{ background: "transparent", touchAction: "pan-y" }}
    >
      <ambientLight intensity={0.45} />
      <pointLight color={VIOLET} intensity={2.4} decay={0} position={[-3.5, 2, 3]} />
      <pointLight color={EMBER} intensity={2.4} decay={0} position={[3.5, -1.5, 2.5]} />
      <directionalLight color="#ffffff" intensity={0.35} position={[0, 3, 5]} />
      {/* Rim back-light — a soft crescent on the orb's edge, not a hotspot. */}
      <pointLight color="#ffffff" intensity={0.8} decay={0} position={[0, 0.6, -3.6]} />

      {/* Studio reflection rig — baked once, no network. Soft specular streaks. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1.3} color="#ffffff" position={[0, 2.5, 3]} scale={[5, 2, 1]} />
        <Lightformer form="rect" intensity={2} color={VIOLET} position={[-4, 1, 2]} scale={[3, 5, 1]} />
        <Lightformer form="rect" intensity={2} color={EMBER} position={[4, -1.2, 2]} scale={[3, 5, 1]} />
        <Lightformer form="ring" intensity={0.9} color="#ffffff" position={[0, 0, -4]} scale={5} />
      </Environment>

      <Rig reduced={reduced}>
        <Grabbable reduced={reduced} boost={boost}>
          <Float
            speed={reduced ? 0 : 1.2}
            rotationIntensity={reduced ? 0 : 0.3}
            floatIntensity={reduced ? 0 : 0.5}
          >
            <Halo color={VIOLET} scale={1.05} />
            <Halo color={EMBER} scale={1.12} />
            <Core reduced={reduced} boost={boost} />
          </Float>
          {/* Each color's dots ride its own ring line. */}
          <OrbitalRing radius={1.65} orient={[1.3, 0.3, 0]} spin={0.35} count={3} dotSize={0.085} color={VIOLET} reduced={reduced} boost={boost} />
          <OrbitalRing radius={2.05} orient={[-0.6, 0.3, 0]} spin={-0.26} count={2} dotSize={0.065} color={EMBER} reduced={reduced} boost={boost} />
        </Grabbable>
        <Sparkles count={34} scale={6} size={2.2} speed={reduced ? 0 : 0.3} color={VIOLET} opacity={0.5} />
        <Sparkles count={18} scale={5} size={1.5} speed={reduced ? 0 : 0.25} color={EMBER} opacity={0.4} />
      </Rig>
    </Canvas>
  );
}

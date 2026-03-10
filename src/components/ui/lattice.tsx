"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function CryptoLattice() {
  const group = useRef<THREE.Group>(null!);

  const { positions, colors, lines } = useMemo(() => {
    const pointCount = 300;
    // Slightly larger spread to accommodate bigger nodes
    const spread = 15;

    const pts: THREE.Vector3[] = [];
    const pos: number[] = [];
    const col: number[] = [];

    for (let i = 0; i < pointCount; i++) {
      const v = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(spread),
        THREE.MathUtils.randFloatSpread(spread),
        THREE.MathUtils.randFloatSpread(spread),
      );

      pts.push(v);

      pos.push(v.x, v.y, v.z);

      // More diverse colors: random hue, saturation, lightness
      const hue = Math.random();
      const saturation = 0.5 + Math.random() * 0.5; // 0.5–1.0
      const lightness = 0.5 + Math.random() * 0.1; // 0.4–0.9
      const c = new THREE.Color().setHSL(hue, saturation, lightness);
      col.push(c.r, c.g, c.b);
    }

    const linePos: number[] = [];
    // Slightly increased threshold to keep connections visible with larger nodes
    const threshold = 2.8;

    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = pts[i].distanceTo(pts[j]);

        if (d < threshold) {
          linePos.push(
            pts[i].x,
            pts[i].y,
            pts[i].z,
            pts[j].x,
            pts[j].y,
            pts[j].z,
          );
        }
      }
    }

    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(col),
      lines: new Float32Array(linePos),
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // group.current.rotation.y += 0.0001;
    group.current.rotation.x = Math.cos(t * 0.2) * 1;
  });

  const circleTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, 2 * Math.PI);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <group ref={group}>
      {/* nodes */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={positions}
            count={positions.length / 3}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={colors}
            count={colors.length / 3}
            itemSize={3}
          />
        </bufferGeometry>

        {/* INCREASED NODE SIZE */}
        <pointsMaterial
          size={0.3}
          vertexColors
          transparent
          depthWrite={false}
          map={circleTexture}
        />
      </points>

      {/* bonds */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={lines}
            count={lines.length / 3}
            itemSize={3}
          />
        </bufferGeometry>

        <lineBasicMaterial color="#8aa0ff" transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
}

export default function Lattice() {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 60 }}
      style={{ width: "100%", height: "100%" }}
    >
      {/*<ambientLight intensity={1} />*/}
      <spotLight intensity={0.5} />

      <CryptoLattice />

      <OrbitControls enableZoom={true} enablePan={true} rotateSpeed={0.6} />
    </Canvas>
  );
}

"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function CryptoLattice() {
  const group = useRef<THREE.Group>(null!);

  const { positions, colors, lines } = useMemo(() => {
    const pointCount = 260;

    const pts: THREE.Vector3[] = [];
    const pos: number[] = [];
    const col: number[] = [];

    for (let i = 0; i < pointCount; i++) {
      const v = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(12),
        THREE.MathUtils.randFloatSpread(12),
        THREE.MathUtils.randFloatSpread(12),
      );

      pts.push(v);

      pos.push(v.x, v.y, v.z);

      const c = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
      col.push(c.r, c.g, c.b);
    }

    const linePos: number[] = [];

    const threshold = 2.3;

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

    group.current.rotation.y += 0.002;
    group.current.rotation.x = Math.sin(t * 0.4) * 0.2;
  });

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

        <pointsMaterial
          size={0.18}
          vertexColors
          transparent
          depthWrite={false}
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
      camera={{ position: [0, 0, 20], fov: 60 }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.8} />

      <CryptoLattice />

      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.6} />
    </Canvas>
  );
}

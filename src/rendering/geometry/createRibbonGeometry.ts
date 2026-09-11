import * as THREE from 'three';

export interface RibbonSample {
  position: THREE.Vector3;
  width: number;
}

export function createRibbonGeometry(samples: readonly RibbonSample[]): THREE.BufferGeometry {
  if (samples.length < 2) {
    throw new Error('A ribbon requires at least two samples.');
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let travelled = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const current = samples[i]!;
    const previous = samples[Math.max(0, i - 1)]!.position;
    const next = samples[Math.min(samples.length - 1, i + 1)]!.position;

    if (i > 0) travelled += current.position.distanceTo(samples[i - 1]!.position);

    const tangent = next.clone().sub(previous);
    tangent.y = 0;
    tangent.normalize();

    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(current.width * 0.5);
    const left = current.position.clone().add(side);
    const right = current.position.clone().sub(side);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, travelled, 1, travelled);

    if (i < samples.length - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

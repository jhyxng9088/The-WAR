import * as THREE from 'three';
import { WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const FOV = 35;
const DEFAULT_DISTANCE = 560;
const DEFAULT_YAW = 0.67;
const DEFAULT_PITCH = 1.03;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

export class WorldCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 2600);
  readonly target = new THREE.Vector3(0, 3, -24);

  constructor() {
    const horizontal = Math.cos(DEFAULT_PITCH) * DEFAULT_DISTANCE;
    this.camera.position.set(
      this.target.x + Math.sin(DEFAULT_YAW) * horizontal,
      this.target.y + Math.sin(DEFAULT_PITCH) * DEFAULT_DISTANCE,
      this.target.z + Math.cos(DEFAULT_YAW) * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    return {
      width: (WORLD_HALF_WIDTH + 980) * 2,
      depth: (WORLD_HALF_DEPTH + 980) * 2,
    };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}

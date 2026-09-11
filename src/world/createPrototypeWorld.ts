import * as THREE from 'three';
import { createVerticalSliceWorld } from './vertical-slice/VerticalSliceWorld';

export function createPrototypeWorld(scene: THREE.Scene): Promise<void> {
  return createVerticalSliceWorld(scene);
}

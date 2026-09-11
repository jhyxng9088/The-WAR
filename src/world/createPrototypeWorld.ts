import * as THREE from 'three';
import { addWorldLighting } from './rendering/LightingRenderer';
import { addRiver } from './rendering/RiverRenderer';
import { addTerrain } from './rendering/TerrainRenderer';
import { addTerritory, type TerritoryVisual } from './rendering/TerritoryRenderer';
import { addVegetation } from './rendering/VegetationRenderer';

const TERRITORIES: readonly TerritoryVisual[] = [
  {
    color: 0x4d83e8,
    capital: [-6.4, 2.4],
    polygon: [
      [-9.8, 4.2],
      [-7.0, 5.5],
      [-3.4, 5.0],
      [-1.4, 3.2],
      [-2.4, 0.5],
      [-5.5, -0.7],
      [-8.8, 0.8],
    ],
  },
  {
    color: 0xe46661,
    capital: [7.0, -3.3],
    polygon: [
      [2.9, 0.0],
      [5.4, -1.5],
      [9.5, -0.7],
      [10.7, -3.7],
      [8.1, -6.1],
      [4.2, -5.6],
      [1.6, -3.0],
    ],
  },
];

export function createPrototypeWorld(scene: THREE.Scene): void {
  addWorldLighting(scene);
  addTerrain(scene);
  addRiver(scene);
  addVegetation(scene);

  for (const territory of TERRITORIES) {
    addTerritory(scene, territory);
  }
}

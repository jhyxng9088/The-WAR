import * as THREE from 'three';
import { MAP_SCALE, type XZ } from './WorldField';
import { addWorldLighting } from './rendering/LightingRenderer';
import { addRiver } from './rendering/RiverRenderer';
import { addTerrain } from './rendering/TerrainRenderer';
import { addTerritory, type TerritoryVisual } from './rendering/TerritoryRenderer';
import { addVegetation } from './rendering/VegetationRenderer';

function scalePoint([x, z]: XZ): XZ {
  return [x * MAP_SCALE, z * MAP_SCALE];
}

function scaleTerritory(territory: TerritoryVisual): TerritoryVisual {
  return {
    color: territory.color,
    capital: scalePoint(territory.capital),
    polygon: territory.polygon.map(scalePoint),
  };
}

const TERRITORIES: readonly TerritoryVisual[] = [
  scaleTerritory({
    color: 0x4d83e8,
    capital: [-13.2, 5.5],
    polygon: [
      [-17.8, 8.0],
      [-14.6, 9.5],
      [-10.7, 8.9],
      [-8.7, 6.3],
      [-9.8, 3.1],
      [-13.1, 2.0],
      [-16.8, 3.5],
    ],
  }),
  scaleTerritory({
    color: 0xe46661,
    capital: [14.8, -2.8],
    polygon: [
      [10.2, -0.2],
      [13.5, 1.1],
      [17.8, 0.2],
      [19.8, -2.5],
      [18.4, -5.7],
      [14.5, -7.0],
      [10.9, -5.1],
    ],
  }),
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

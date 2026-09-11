import * as THREE from 'three';
import { STRATEGIC_TERRITORIES } from './StrategicWorld';
import { addWorldLighting } from './rendering/LightingRenderer';
import { addRiver } from './rendering/RiverRenderer';
import { addRoads } from './rendering/RoadRenderer';
import { addSettlements } from './rendering/SettlementRenderer';
import { addTerrain } from './rendering/TerrainRenderer';
import { addTerritory } from './rendering/TerritoryRenderer';
import { addVegetation } from './rendering/VegetationRenderer';

export function createPrototypeWorld(scene: THREE.Scene): void {
  addWorldLighting(scene);
  addTerrain(scene);

  for (const territory of STRATEGIC_TERRITORIES) addTerritory(scene, territory);

  addRoads(scene);
  addRiver(scene);
  addVegetation(scene);
  addSettlements(scene);
}

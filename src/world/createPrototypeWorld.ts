import * as THREE from 'three';
import { STRATEGIC_TERRITORIES } from './StrategicWorld';
import { addWorldLighting } from './rendering/LightingRenderer';
import { addRoads } from './rendering/RoadRenderer';
import { addSettlements } from './rendering/SettlementRenderer';
import { addTerrain } from './rendering/TerrainRenderer';
import { addTerritory } from './rendering/TerritoryRenderer';

export async function createPrototypeWorld(scene: THREE.Scene): Promise<void> {
  addWorldLighting(scene);
  addTerrain(scene);

  for (const territory of STRATEGIC_TERRITORIES) addTerritory(scene, territory);
  addRoads(scene);
  addSettlements(scene);
}

import * as THREE from 'three';
import { STRATEGIC_TERRITORIES } from './StrategicWorld';
import { addWorldLighting } from './rendering/LightingRenderer';
import { addRoads } from './rendering/RoadRenderer';
import { addSettlements } from './rendering/SettlementRenderer';
import { addTerrain } from './rendering/TerrainRenderer';
import { addTerritory } from './rendering/TerritoryRenderer';
import { addVegetation, type VegetationController } from './rendering/VegetationRenderer';

export interface PrototypeWorldController {
  update(camera: THREE.Camera): void;
  dispose(): void;
}

export async function createPrototypeWorld(
  scene: THREE.Scene,
): Promise<PrototypeWorldController> {
  addWorldLighting(scene);
  addTerrain(scene);

  for (const territory of STRATEGIC_TERRITORIES) addTerritory(scene, territory);
  addRoads(scene);
  addSettlements(scene);

  const vegetation: VegetationController = await addVegetation(scene);

  return {
    update: (camera: THREE.Camera) => vegetation.update(camera),
    dispose: () => vegetation.dispose(),
  };
}

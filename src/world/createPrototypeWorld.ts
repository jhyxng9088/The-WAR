import * as THREE from 'three';
import { TerritoryController } from '../territory/TerritoryController';
import { TerritoryHud } from '../territory/TerritoryHud';
import { TerritoryInput } from '../territory/TerritoryInput';
import { addWorldLighting } from './rendering/LightingRenderer';
import { addSettlements } from './rendering/SettlementRenderer';
import { addTerrain } from './rendering/TerrainRenderer';
import {
  createTerritoryRenderer,
  type TerritoryRenderController,
} from './rendering/TerritoryRenderer';
import { addVegetation, type VegetationController } from './rendering/VegetationRenderer';

export interface PrototypeWorldController {
  update(camera: THREE.Camera, deltaSeconds: number): void;
  dispose(): void;
}

export async function createPrototypeWorld(
  scene: THREE.Scene,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
): Promise<PrototypeWorldController> {
  addWorldLighting(scene);
  const terrain = addTerrain(scene);

  // Stage 2 starts with capitals and a small territory footprint. Roads and
  // secondary towns stay as scenario data until ownership/economy makes them real.
  addSettlements(scene);
  const vegetation: VegetationController = await addVegetation(scene);

  // TerritoryController is the sole owner of territory state and expansion rules.
  // Input issues commands; render/HUD only read state.
  const territory = new TerritoryController();
  const territoryRenderer: TerritoryRenderController = createTerritoryRenderer(scene, territory);
  const territoryInput = new TerritoryInput(canvas, camera, terrain.land, territory);
  const hudHost = canvas.parentElement ?? document.body;
  const territoryHud = new TerritoryHud(hudHost, territory);

  territoryRenderer.update();

  return {
    update: (activeCamera: THREE.Camera, deltaSeconds: number) => {
      territory.update(deltaSeconds);
      territoryRenderer.update();
      territoryHud.update();
      vegetation.update(activeCamera);
    },
    dispose: () => {
      territoryHud.dispose();
      territoryInput.dispose();
      territoryRenderer.dispose();
      vegetation.dispose();
    },
  };
}

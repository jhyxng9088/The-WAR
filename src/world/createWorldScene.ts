import {
  Color,
  DirectionalLight,
  HemisphereLight,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  BufferGeometry,
  Float32BufferAttribute,
} from "three";
import { WORLD_DEPTH, WORLD_WIDTH } from "./WorldField";

export interface WorldSceneHandle {
  readonly scene: Scene;
  readonly width: number;
  readonly depth: number;
  dispose(): void;
}

export function createWorldScene(): WorldSceneHandle {
  const scene = new Scene();
  scene.background = new Color(0xb5c3c2);

  const hemisphere = new HemisphereLight(0xeaf1e5, 0x566652, 1.8);
  scene.add(hemisphere);

  const sunlight = new DirectionalLight(0xfff4d6, 1.8);
  sunlight.position.set(-1800, 3600, 1400);
  scene.add(sunlight);

  const groundGeometry = new PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH, 1, 1);
  const groundMaterial = new MeshStandardMaterial({
    color: 0x73865f,
    roughness: 1,
    metalness: 0,
  });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "flat-gameplay-sandbox";
  scene.add(ground);

  const borderGeometry = new BufferGeometry();
  borderGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -WORLD_WIDTH / 2, 0.08, -WORLD_DEPTH / 2,
         WORLD_WIDTH / 2, 0.08, -WORLD_DEPTH / 2,
         WORLD_WIDTH / 2, 0.08,  WORLD_DEPTH / 2,
        -WORLD_WIDTH / 2, 0.08,  WORLD_DEPTH / 2,
      ],
      3,
    ),
  );
  const borderMaterial = new LineBasicMaterial({
    color: 0xc7d8b8,
    transparent: true,
    opacity: 0.35,
  });
  const border = new LineLoop(borderGeometry, borderMaterial);
  border.name = "world-boundary";
  scene.add(border);

  return {
    scene,
    width: WORLD_WIDTH,
    depth: WORLD_DEPTH,
    dispose(): void {
      scene.clear();
      groundGeometry.dispose();
      groundMaterial.dispose();
      borderGeometry.dispose();
      borderMaterial.dispose();
    },
  };
}

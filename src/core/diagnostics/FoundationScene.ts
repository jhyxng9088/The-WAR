import {
  BoxGeometry, Color, DirectionalLight, GridHelper, HemisphereLight,
  Mesh, MeshStandardMaterial, PlaneGeometry, RingGeometry, Scene,
} from "three";

export interface FoundationSceneHandle {
  scene: Scene;
  dispose(): void;
}

export function createFoundationScene(): FoundationSceneHandle {
  const scene = new Scene();
  scene.background = new Color(0x172126);

  const hemisphere = new HemisphereLight(0xdce7d7, 0x26332f, 1.8);
  scene.add(hemisphere);

  const sunlight = new DirectionalLight(0xffffff, 1.7);
  sunlight.position.set(120, 180, 90);
  scene.add(sunlight);

  const groundGeometry = new PlaneGeometry(1800, 1800);
  const groundMaterial = new MeshStandardMaterial({ color: 0x66765d, roughness: 1, metalness: 0 });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  const grid = new GridHelper(1800, 72, 0x9cae91, 0x536052);
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
    material.transparent = true;
    material.opacity = 0.23;
  }
  scene.add(grid);

  const markerGeometry = new BoxGeometry(8, 5, 8);
  const markerMaterial = new MeshStandardMaterial({ color: 0xd4dba7, roughness: 0.92 });
  const markerPositions = [
    [-120, 2.5, -80],
    [150, 2.5, -120],
    [190, 2.5, 150],
    [-170, 2.5, 170],
  ] as const;
  const markers = markerPositions.map(([x, y, z]) => {
    const marker = new Mesh(markerGeometry, markerMaterial);
    marker.position.set(x, y, z);
    scene.add(marker);
    return marker;
  });

  const ringGeometry = new RingGeometry(7, 7.8, 64);
  const ringMaterial = new MeshStandardMaterial({ color: 0xe7edc0, roughness: 1 });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  return {
    scene,
    dispose(): void {
      scene.remove(ground, grid, ring, hemisphere, sunlight, ...markers);
      groundGeometry.dispose();
      groundMaterial.dispose();
      grid.geometry.dispose();
      for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
    },
  };
}

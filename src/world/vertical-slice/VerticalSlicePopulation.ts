import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SLICE_CITY, SLICE_TREES, heightAt, verticalSliceAssetUrl } from './VerticalSliceAssets';

const loader = new GLTFLoader();
const UP_CORRECTION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export async function addVerticalSlicePopulation(scene: THREE.Scene): Promise<void> {
  const [treeAsset, settlementAsset] = await Promise.all([
    loader.loadAsync(verticalSliceAssetUrl('trees.gltf')),
    loader.loadAsync(verticalSliceAssetUrl('settlement.gltf')),
  ]);

  addTreeInstances(scene, treeAsset.scene);
  addSettlement(scene, settlementAsset.scene);
}

function addTreeInstances(scene: THREE.Scene, source: THREE.Object3D): void {
  const broadleaf = source.getObjectByName('Broadleaf') as THREE.Mesh | undefined;
  const conifer = source.getObjectByName('Conifer') as THREE.Mesh | undefined;
  if (!broadleaf || !conifer) throw new Error('Vertical slice tree kit is incomplete.');

  const broadleafPlacements = SLICE_TREES.filter((tree) => tree[2] === 0);
  const coniferPlacements = SLICE_TREES.filter((tree) => tree[2] === 1);
  const broadleafInstances = createInstances(broadleaf, broadleafPlacements);
  const coniferInstances = createInstances(conifer, coniferPlacements);
  broadleafInstances.name = 'AuthoredBroadleafForest';
  coniferInstances.name = 'AuthoredConiferForest';
  scene.add(broadleafInstances, coniferInstances);
}

function createInstances(
  source: THREE.Mesh,
  placements: typeof SLICE_TREES,
): THREE.InstancedMesh {
  const geometry = source.geometry.clone();
  const material = Array.isArray(source.material)
    ? source.material.map((entry) => entry.clone())
    : source.material.clone();
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yaw = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();

  placements.forEach(([x, z, , size, angle], index) => {
    position.set(x, heightAt(x, z) + 0.04, z);
    scale.setScalar(size * 1.16);
    yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    rotation.copy(yaw).multiply(UP_CORRECTION);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function addSettlement(scene: THREE.Scene, source: THREE.Object3D): void {
  const [x, z] = SLICE_CITY;
  source.position.set(x, heightAt(x, z) + 0.05, z);
  source.quaternion.copy(UP_CORRECTION);
  source.scale.setScalar(1.32);
  source.name = 'AuthoredSettlement';
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    if (!Array.isArray(object.material)) {
      object.material.vertexColors = true;
      object.material.roughness = 0.9;
      object.material.metalness = 0;
      object.material.needsUpdate = true;
    }
  });
  scene.add(source);
}

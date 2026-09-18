import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SRGBColorSpace,
} from "three";
import {
  TERRITORY_GRID_DEPTH,
  TERRITORY_GRID_WIDTH,
  TerritoryState,
} from "./TerritoryState";

export interface TerritoryView {
  sync(state: TerritoryState): void;
  dispose(): void;
}

const TEXTURE_WIDTH = 640;
const TEXTURE_HEIGHT = 448;

export function createTerritoryView(
  scene: Scene,
  state: TerritoryState,
): TerritoryView {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;

  const context = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: false,
  });

  if (!context) {
    throw new Error("2D canvas unavailable for territory rendering.");
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;

  const surfaceGeometry = new PlaneGeometry(
    TERRITORY_GRID_WIDTH,
    TERRITORY_GRID_DEPTH,
  );
  const surfaceMaterial = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const surface = new Mesh(surfaceGeometry, surfaceMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.12;
  surface.name = "organic-territory-surface";
  scene.add(surface);

  const selectionGeometry = new RingGeometry(18, 27, 40);
  const selectionMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const selection = new Mesh(selectionGeometry, selectionMaterial);
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.28;
  selection.visible = false;
  scene.add(selection);

  const expansionGeometry = new RingGeometry(23, 31, 48);
  const expansionMaterial = new MeshBasicMaterial({
    color: 0xf6f8ff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const expansionRing = new Mesh(expansionGeometry, expansionMaterial);
  expansionRing.rotation.x = -Math.PI / 2;
  expansionRing.position.y = 0.32;
  expansionRing.visible = false;
  scene.add(expansionRing);

  const capitalGeometry = new CylinderGeometry(7, 10, 22, 6);
  const capitalMaterials: MeshStandardMaterial[] = [];
  const capitals: Mesh[] = [];

  for (const nation of state.nations) {
    const material = new MeshStandardMaterial({
      color: nation.color,
      roughness: 0.88,
      metalness: 0,
    });
    capitalMaterials.push(material);

    const capital = new Mesh(capitalGeometry, material);
    const cell = state.capitalCell(nation.id);

    if (cell) {
      const center = state.cellCenter(cell);
      capital.position.set(center.x, 11, center.z);
      if (nation.isPlayer) capital.scale.setScalar(1.18);
    }

    capitals.push(capital);
    scene.add(capital);
  }

  let lastVersion = -1;

  const rebuildSurface = (): void => {
    const ownerMap = new Uint8Array(TEXTURE_WIDTH * TEXTURE_HEIGHT);
    const nationIndex = new Map(
      state.nations.map((nation, index) => [nation.id, index + 1]),
    );

    for (let py = 0; py < TEXTURE_HEIGHT; py += 1) {
      const z =
        -TERRITORY_GRID_DEPTH / 2 +
        ((py + 0.5) / TEXTURE_HEIGHT) * TERRITORY_GRID_DEPTH;

      for (let px = 0; px < TEXTURE_WIDTH; px += 1) {
        const x =
          -TERRITORY_GRID_WIDTH / 2 +
          ((px + 0.5) / TEXTURE_WIDTH) * TERRITORY_GRID_WIDTH;
        const cell = state.cellFromWorld(x, z);

        if (cell?.owner) {
          ownerMap[py * TEXTURE_WIDTH + px] =
            nationIndex.get(cell.owner) ?? 0;
        }
      }
    }

    const image = context.createImageData(
      TEXTURE_WIDTH,
      TEXTURE_HEIGHT,
    );
    const data = image.data;

    for (let py = 0; py < TEXTURE_HEIGHT; py += 1) {
      for (let px = 0; px < TEXTURE_WIDTH; px += 1) {
        const index = py * TEXTURE_WIDTH + px;
        const owner = ownerMap[index] ?? 0;

        if (owner === 0) continue;

        const nation = state.nations[owner - 1];
        if (!nation) continue;

        const color = new Color(nation.color);
        const left =
          px > 0 ? ownerMap[index - 1] : 0;
        const right =
          px < TEXTURE_WIDTH - 1 ? ownerMap[index + 1] : 0;
        const up =
          py > 0 ? ownerMap[index - TEXTURE_WIDTH] : 0;
        const down =
          py < TEXTURE_HEIGHT - 1
            ? ownerMap[index + TEXTURE_WIDTH]
            : 0;

        const isBorder =
          left !== owner ||
          right !== owner ||
          up !== owner ||
          down !== owner;

        let red = Math.round(color.r * 255);
        let green = Math.round(color.g * 255);
        let blue = Math.round(color.b * 255);
        let alpha = 92;

        if (isBorder) {
          const touchesNation =
            (left !== 0 && left !== owner) ||
            (right !== 0 && right !== owner) ||
            (up !== 0 && up !== owner) ||
            (down !== 0 && down !== owner);

          if (touchesNation) {
            red = 238;
            green = 235;
            blue = 220;
          } else {
            red = Math.round(red + (255 - red) * 0.52);
            green = Math.round(green + (255 - green) * 0.52);
            blue = Math.round(blue + (255 - blue) * 0.52);
          }

          alpha = 220;
        }

        const dataIndex = index * 4;
        data[dataIndex] = red;
        data[dataIndex + 1] = green;
        data[dataIndex + 2] = blue;
        data[dataIndex + 3] = alpha;
      }
    }

    context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    context.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  };

  const sync = (current: TerritoryState): void => {
    if (lastVersion !== current.version) {
      lastVersion = current.version;
      rebuildSurface();
    }

    const selected = current.selectedCell();

    if (selected) {
      const center = current.cellCenter(selected);
      selection.position.set(center.x, 0.28, center.z);
      selection.visible = true;

      if (selected.owner) {
        selectionMaterial.color.set(
          current.nation(selected.owner).color,
        );
      } else {
        selectionMaterial.color.set(
          current.isPlayerFrontier(selected)
            ? 0xf7e7a8
            : 0xd7d7d0,
        );
      }
    } else {
      selection.visible = false;
    }

    const expansionCell = current.expansionCell();

    if (expansionCell) {
      const center = current.cellCenter(expansionCell);
      const progress = current.expansionProgress();

      expansionRing.position.set(center.x, 0.32, center.z);
      expansionRing.scale.setScalar(0.72 + progress * 0.42);
      expansionRing.rotation.z = progress * Math.PI * 1.5;
      expansionMaterial.opacity = 0.42 + progress * 0.5;
      expansionRing.visible = true;
    } else {
      expansionRing.visible = false;
    }
  };

  sync(state);

  return {
    sync,
    dispose(): void {
      scene.remove(surface, selection, expansionRing, ...capitals);

      surfaceGeometry.dispose();
      surfaceMaterial.dispose();
      texture.dispose();

      selectionGeometry.dispose();
      selectionMaterial.dispose();
      expansionGeometry.dispose();
      expansionMaterial.dispose();

      capitalGeometry.dispose();
      for (const material of capitalMaterials) material.dispose();
    },
  };
}

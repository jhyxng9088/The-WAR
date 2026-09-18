export const WORLD_WIDTH = 5200;
export const WORLD_DEPTH = 3800;
export const SEA_LEVEL = 0;

export type TerrainKind = "grassland";

export class WorldField {
  public readonly width = WORLD_WIDTH;
  public readonly depth = WORLD_DEPTH;
  public readonly seaLevel = SEA_LEVEL;

  public heightAt(_x: number, _z: number): number {
    return 0;
  }

  public terrainKindAt(_x: number, _z: number): TerrainKind {
    return "grassland";
  }
}

export interface RegionCellRef {
  readonly id: number;
  readonly col: number;
  readonly row: number;
}

export interface RegionDefinition {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly label: string;
  readonly cellIds: readonly number[];
}

export const REGION_CELL_COLS = 8;
export const REGION_CELL_ROWS = 7;

export class RegionIndex {
  public readonly regions: readonly RegionDefinition[];
  public readonly cols: number;
  public readonly rows: number;

  private readonly regionIdByCellId: Uint16Array;

  public constructor(
    private readonly territoryCols: number,
    private readonly territoryRows: number,
  ) {
    if (
      territoryCols % REGION_CELL_COLS !== 0 ||
      territoryRows % REGION_CELL_ROWS !== 0
    ) {
      throw new Error(
        "Territory dimensions must divide evenly into Region groups.",
      );
    }

    this.cols = territoryCols / REGION_CELL_COLS;
    this.rows = territoryRows / REGION_CELL_ROWS;
    this.regionIdByCellId = new Uint16Array(
      territoryCols * territoryRows,
    );

    const regions: RegionDefinition[] = [];

    for (let regionRow = 0; regionRow < this.rows; regionRow += 1) {
      for (let regionCol = 0; regionCol < this.cols; regionCol += 1) {
        const id = regionRow * this.cols + regionCol;
        const cellIds: number[] = [];

        for (
          let localRow = 0;
          localRow < REGION_CELL_ROWS;
          localRow += 1
        ) {
          for (
            let localCol = 0;
            localCol < REGION_CELL_COLS;
            localCol += 1
          ) {
            const col =
              regionCol * REGION_CELL_COLS + localCol;
            const row =
              regionRow * REGION_CELL_ROWS + localRow;
            const cellId = row * territoryCols + col;

            cellIds.push(cellId);
            this.regionIdByCellId[cellId] = id;
          }
        }

        regions.push({
          id,
          col: regionCol,
          row: regionRow,
          label: regionLabel(regionCol, regionRow),
          cellIds,
        });
      }
    }

    this.regions = regions;
  }

  public regionForCell(cell: RegionCellRef): RegionDefinition {
    return this.regionById(this.regionIdByCellId[cell.id] ?? 0);
  }

  public regionById(id: number): RegionDefinition {
    const region = this.regions[id];

    if (!region) {
      throw new Error(`Unknown Region id: ${id}`);
    }

    return region;
  }
}

function regionLabel(col: number, row: number): string {
  return String.fromCharCode(65 + col) + String(row + 1);
}

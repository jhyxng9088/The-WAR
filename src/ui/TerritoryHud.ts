import { TerritoryState } from "../territory/TerritoryState";

export class TerritoryHud {
  private readonly element: HTMLDivElement;
  private readonly nationLine: HTMLDivElement;
  private readonly statsLine: HTMLDivElement;
  private readonly selectionLine: HTMLDivElement;
  private lastSignature = "";

  public constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "territory-hud";

    const label = document.createElement("div");
    label.className = "territory-hud__label";
    label.textContent = "YOUR NATION";

    this.nationLine = document.createElement("div");
    this.nationLine.className = "territory-hud__nation";

    this.statsLine = document.createElement("div");
    this.statsLine.className = "territory-hud__stats";

    this.selectionLine = document.createElement("div");
    this.selectionLine.className = "territory-hud__selection";

    this.element.append(
      label,
      this.nationLine,
      this.statsLine,
      this.selectionLine,
    );

    root.append(this.element);
  }

  public sync(state: TerritoryState): void {
    const player = state.nation(state.playerNation);
    const selected = state.selectedCell();
    const expansion = state.expansion;
    const owned = state.ownedCount(state.playerNation);
    const frontier = state.frontierCells().length;
    const region = selected ? state.regionForCell(selected) : null;
    const regionControl = region
      ? state.regionControl(region.id)
      : null;

    const signature = [
      state.version,
      state.selectedCellId,
      expansion?.targetId ?? -1,
      expansion ? Math.floor(state.expansionProgress() * 20) : -1,
    ].join(":");

    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.nationLine.textContent = player.name;
    this.nationLine.style.setProperty(
      "--nation-color",
      "#" + player.color.toString(16).padStart(6, "0"),
    );
    this.statsLine.textContent =
      owned + " territory · " +
      frontier + " frontier options · " +
      state.nations.length + " nations · rivals are expanding";

    if (!selected) {
      this.selectionLine.textContent =
        "Tap neutral land along your border to expand.";
      return;
    }

    if (expansion?.targetId === selected.id) {
      this.selectionLine.textContent =
        "Claiming frontier · " +
        Math.round(state.expansionProgress() * 100) +
        "%";
      return;
    }

    const regionSuffix = region && regionControl
      ? formatRegionSuffix(state, regionControl)
      : "";

    if (selected.owner === state.playerNation) {
      this.selectionLine.textContent = state.isCapital(selected)
        ? "Selected: your capital" + regionSuffix
        : "Selected: your territory" + regionSuffix;
      return;
    }

    if (selected.owner) {
      this.selectionLine.textContent =
        "Selected: " +
        state.nation(selected.owner).name +
        regionSuffix;
      return;
    }

    this.selectionLine.textContent =
      (state.isPlayerFrontier(selected)
        ? "Selected: neutral frontier"
        : "Selected: distant neutral land") +
      regionSuffix;
  }

  public dispose(): void {
    this.element.remove();
  }
}


function formatRegionSuffix(
  state: TerritoryState,
  control: ReturnType<TerritoryState["regionControl"]>,
): string {
  const percent = Math.round(control.leadingShare * 100);

  if (!control.leadingNation) {
    return " · Region " + control.region.label + " · neutral";
  }

  const leader = state.nation(control.leadingNation).name;
  const contested = control.contested ? " · contested" : "";

  return (
    " · Region " +
    control.region.label +
    " · " +
    leader +
    " " +
    percent +
    "%" +
    contested
  );
}

import { TerritoryController, type TerritorySelectionView } from './TerritoryController';

const BIOME_LABELS: Record<TerritorySelectionView['biome'], string> = {
  sea: '바다',
  shore: '해안',
  wetland: '습지',
  'fertile-lowland': '비옥한 평야',
  grassland: '평야',
  'dry-grassland': '건조 평야',
  highland: '고지대',
  rocky: '산악지대',
};

export class TerritoryHud {
  private readonly root = document.createElement('section');
  private readonly nationDot = document.createElement('span');
  private readonly title = document.createElement('strong');
  private readonly detail = document.createElement('span');
  private readonly progressTrack = document.createElement('div');
  private readonly progressBar = document.createElement('div');
  private readonly action = document.createElement('button');
  private lastViewKey = '';

  constructor(
    host: HTMLElement,
    private readonly territory: TerritoryController,
  ) {
    this.root.className = 'territory-hud';
    this.root.setAttribute('aria-live', 'polite');

    const header = document.createElement('div');
    header.className = 'territory-hud-header';
    this.nationDot.className = 'territory-hud-dot';
    this.title.className = 'territory-hud-title';
    header.append(this.nationDot, this.title);

    this.detail.className = 'territory-hud-detail';

    this.progressTrack.className = 'territory-hud-progress';
    this.progressBar.className = 'territory-hud-progress-bar';
    this.progressTrack.append(this.progressBar);

    this.action.className = 'territory-hud-action';
    this.action.type = 'button';
    this.action.addEventListener('click', this.onAction);

    this.root.append(header, this.detail, this.progressTrack, this.action);
    host.append(this.root);
    this.update();
  }

  update(): void {
    const nation = this.territory.getActiveNation();
    const selection = this.territory.getSelection();

    if (nation) {
      this.nationDot.style.background = `#${nation.color.toString(16).padStart(6, '0')}`;
    }

    if (!selection) {
      const key = `empty:${nation?.id ?? ''}`;
      if (key === this.lastViewKey) return;
      this.lastViewKey = key;
      this.title.textContent = nation ? `${nation.name} · 영토 확장` : '영토 확장';
      this.detail.textContent = '지도에서 국경 근처의 중립 지역을 눌러봐.';
      this.progressTrack.hidden = true;
      this.action.hidden = true;
      return;
    }

    const progress = selection.expansion?.progress ?? -1;
    const key = [
      selection.cell.id,
      selection.cell.ownerId ?? 'neutral',
      selection.canExpand ? '1' : '0',
      selection.reason ?? '',
      Math.floor(progress * 100),
    ].join(':');
    if (key === this.lastViewKey) return;
    this.lastViewKey = key;

    const ownerLabel = selection.owner?.name ?? '중립 지역';
    this.title.textContent = `${ownerLabel} · ${BIOME_LABELS[selection.biome]}`;

    if (selection.expansion) {
      const percent = Math.round(selection.expansion.progress * 100);
      this.detail.textContent = `국경을 확장하는 중 · ${percent}%`;
      this.progressTrack.hidden = false;
      this.progressBar.style.width = `${percent}%`;
      this.action.hidden = false;
      this.action.disabled = true;
      this.action.textContent = '확장 중';
      return;
    }

    this.progressTrack.hidden = true;
    this.action.hidden = false;
    this.action.disabled = !selection.canExpand;
    this.action.textContent = selection.canExpand ? '이 지역으로 확장' : '확장 불가';
    this.detail.textContent = selection.canExpand
      ? '현재 국경과 맞닿아 있어 확장할 수 있어.'
      : selection.reason ?? '';
  }

  dispose(): void {
    this.action.removeEventListener('click', this.onAction);
    this.root.remove();
  }

  private readonly onAction = (): void => {
    this.territory.requestSelectedExpansion();
    this.lastViewKey = '';
    this.update();
  };
}

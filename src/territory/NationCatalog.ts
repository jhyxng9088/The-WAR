export type NationId =
  | "player"
  | "ember"
  | "azure"
  | "violet"
  | "sand";

export interface NationDefinition {
  readonly id: NationId;
  readonly name: string;
  readonly color: number;
  readonly capitalCol: number;
  readonly capitalRow: number;
  readonly isPlayer: boolean;
}

export const PLAYER_NATION_ID: NationId = "player";

export const NATIONS: readonly NationDefinition[] = [
  {
    id: "player",
    name: "Crownland",
    color: 0x4f78c7,
    capitalCol: 17,
    capitalRow: 28,
    isPlayer: true,
  },
  {
    id: "ember",
    name: "Ember Reach",
    color: 0xc86455,
    capitalCol: 62,
    capitalRow: 14,
    isPlayer: false,
  },
  {
    id: "azure",
    name: "Azure League",
    color: 0x4d9a9d,
    capitalCol: 63,
    capitalRow: 42,
    isPlayer: false,
  },
  {
    id: "violet",
    name: "Violet Crown",
    color: 0x8d6bb3,
    capitalCol: 40,
    capitalRow: 13,
    isPlayer: false,
  },
  {
    id: "sand",
    name: "Golden March",
    color: 0xb99652,
    capitalCol: 41,
    capitalRow: 43,
    isPlayer: false,
  },
] as const;

export function nationById(id: NationId): NationDefinition {
  const nation = NATIONS.find((candidate) => candidate.id === id);

  if (!nation) {
    throw new Error(`Unknown nation: ${id}`);
  }

  return nation;
}

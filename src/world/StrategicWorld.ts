import { MAP_SCALE, type XZ } from './WorldField';

export type SettlementKind = 'capital' | 'town';

export interface StrategicSettlement {
  readonly id: string;
  readonly name: string;
  readonly kind: SettlementKind;
  readonly position: XZ;
}

export interface StrategicRoad {
  readonly from: XZ;
  readonly to: XZ;
  readonly bend: number;
}

export interface StrategicTerritory {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly polygon: readonly XZ[];
  readonly capital: StrategicSettlement;
  readonly settlements: readonly StrategicSettlement[];
  readonly roads: readonly StrategicRoad[];
}

function p([x, z]: XZ): XZ {
  return [x * MAP_SCALE, z * MAP_SCALE];
}

function settlement(id: string, name: string, kind: SettlementKind, position: XZ): StrategicSettlement {
  return { id, name, kind, position: p(position) };
}

function road(from: XZ, to: XZ, bend: number): StrategicRoad {
  return { from: p(from), to: p(to), bend };
}

function territory(
  id: string,
  name: string,
  color: number,
  polygon: readonly XZ[],
  capital: StrategicSettlement,
  settlements: readonly StrategicSettlement[],
  roads: readonly StrategicRoad[],
): StrategicTerritory {
  return {
    id,
    name,
    color,
    polygon: polygon.map(p),
    capital,
    settlements,
    roads,
  };
}

const valmereCapital = settlement('valmere-capital', 'Crownford', 'capital', [-27, 21]);
const eldwoodCapital = settlement('eldwood-capital', 'Greenhollow', 'capital', [-38, -13]);
const thalorCapital = settlement('thalor-capital', 'Suncrest', 'capital', [4, -17]);
const drakarCapital = settlement('drakar-capital', 'Redspire', 'capital', [39, 21]);
const orvanCapital = settlement('orvan-capital', 'Shadowfen', 'capital', [43, -22]);

export const STRATEGIC_TERRITORIES: readonly StrategicTerritory[] = [
  territory(
    'valmere',
    'VALMERE',
    0x4f82dd,
    [[-63, 23], [-50, 39], [-21, 43], [3, 29], [1, 14], [-17, 5], [-42, 7], [-60, 13]],
    valmereCapital,
    [
      settlement('valmere-ravenstead', 'Ravenstead', 'town', [-49, 25]),
      settlement('valmere-highwatch', 'Highwatch', 'town', [-17, 31]),
      settlement('valmere-oakridge', 'Oakridge', 'town', [-37, 9]),
    ],
    [
      road([-27, 21], [-49, 25], 0.22),
      road([-27, 21], [-17, 31], -0.18),
      road([-27, 21], [-37, 9], 0.14),
    ],
  ),
  territory(
    'eldwood',
    'ELDWOOD',
    0x4f8b5a,
    [[-66, 4], [-48, 17], [-24, 12], [-8, -4], [-17, -26], [-40, -39], [-61, -28], [-69, -13]],
    eldwoodCapital,
    [
      settlement('eldwood-mossford', 'Mossford', 'town', [-56, -6]),
      settlement('eldwood-lowgrove', 'Lowgrove', 'town', [-49, -27]),
      settlement('eldwood-ashmere', 'Ashmere', 'town', [-18, -18]),
    ],
    [
      road([-38, -13], [-56, -6], -0.16),
      road([-38, -13], [-49, -27], 0.18),
      road([-38, -13], [-18, -18], -0.12),
    ],
  ),
  territory(
    'thalor',
    'THALOR',
    0xd3aa3f,
    [[-20, 4], [0, 13], [24, 8], [38, -10], [27, -35], [1, -42], [-24, -26], [-30, -8]],
    thalorCapital,
    [
      settlement('thalor-westmere', 'Westmere', 'town', [-12, -5]),
      settlement('thalor-goldfield', 'Goldfield', 'town', [20, -11]),
      settlement('thalor-southgate', 'Southgate', 'town', [8, -31]),
    ],
    [
      road([4, -17], [-12, -5], 0.16),
      road([4, -17], [20, -11], -0.18),
      road([4, -17], [8, -31], 0.11),
    ],
  ),
  territory(
    'drakar',
    'DRAKAR',
    0xc75b52,
    [[3, 28], [21, 43], [55, 39], [69, 20], [57, 1], [32, 0], [11, 12]],
    drakarCapital,
    [
      settlement('drakar-ironhold', 'Ironhold', 'town', [21, 29]),
      settlement('drakar-skallheim', 'Skallheim', 'town', [55, 20]),
      settlement('drakar-redpine', 'Redpine', 'town', [38, 5]),
    ],
    [
      road([39, 21], [21, 29], -0.2),
      road([39, 21], [55, 20], 0.14),
      road([39, 21], [38, 5], -0.1),
    ],
  ),
  territory(
    'orvan',
    'ORVAN',
    0x7b5aaa,
    [[27, 2], [49, 5], [68, -8], [63, -35], [39, -43], [18, -31], [18, -13]],
    orvanCapital,
    [
      settlement('orvan-highridge', 'Highridge', 'town', [28, -14]),
      settlement('orvan-blackfen', 'Blackfen', 'town', [55, -12]),
      settlement('orvan-stonewatch', 'Stonewatch', 'town', [47, -35]),
    ],
    [
      road([43, -22], [28, -14], 0.16),
      road([43, -22], [55, -12], -0.13),
      road([43, -22], [47, -35], 0.12),
    ],
  ),
] as const;

export const STRATEGIC_ROADS: readonly StrategicRoad[] = STRATEGIC_TERRITORIES.flatMap((item) => item.roads);

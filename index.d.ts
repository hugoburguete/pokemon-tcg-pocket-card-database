type Attack = {
  name: string;
  cost: string[];
  extras: string;
  damage: number;
};

type Ability = {
  name: string;
  description: string;
};

type Card = {
  id: string;
  name: string;
  element: string;
  type: string;
  subtype: string;
  health: number;
  craftingCost: number;
  set: string;
  pack: string;
  rarity: string;
  retreatCost: string[];
  attacks: Attack[];
  abilities: Ability[];
};

export declare const en: {
  geneticApex: Card[];
  a1: typeof en.geneticApex;

  deluxePackEx: Card[];
  a4b: typeof en.deluxePackEx;

  mythicalIsland: Card[];
  a1a: typeof en.mythicalIsland;

  spaceTimeSmackdown: Card[];
  a2: typeof en.spaceTimeSmackdown;

  triumphantLight: Card[];
  a2a: typeof en.triumphantLight;

  shiningRevelry: Card[];
  a2b: typeof en.shiningRevelry;

  celestialGuardians: Card[];
  a3: typeof en.celestialGuardians;

  extradimensionalCrisis: Card[];
  a3a: typeof en.extradimensionalCrisis;

  eeveeGrove: Card[];
  a3b: typeof en.eeveeGrove;

  wisdomOfSeaAndSky: Card[];
  a4: typeof en.wisdomOfSeaAndSky;

  secludedSprings: Card[];
  a4a: typeof en.secludedSprings;

  megaRising: Card[];
  b1: typeof en.megaRising;

  crimsonBlaze: Card[];
  b1a: typeof en.crimsonBlaze;

  promoA: Card[];
  promoB: Card[];
};

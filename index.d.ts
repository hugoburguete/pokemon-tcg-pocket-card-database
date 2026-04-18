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
  mythicalIsland: Card[];
  spaceTimeSmackdown: Card[];
  triumphantLight: Card[];
  shiningRevelry: Card[];
  celestialGuardians: Card[];
  extradimensionalCrisis: Card[];
  eeveeGrove: Card[];
  wisdomOfSeaAndSky: Card[];
  secludedSprings: Card[];
  deluxePackEx: Card[];
  megaRising: Card[];
  crimsonBlaze: Card[];

  promoA: Card[];
  promoB: Card[];
};

export declare const fr: {
  puissanceGenetique: Card[];
  ileFabuleuse: Card[];
  chocSpatioTemporel: Card[];
  lumiereTriomphale: Card[];
  rejouissancesRayonnantes: Card[];
  gardiensAstraux: Card[];
  criseInterdimensionnelle: Card[];
  clairiereDevoli: Card[];
  sagesseEntreCielEtMer: Card[];
  sourceSecrete: Card[];
  boosterDeLuxeEx: Card[];
  megaAscension: Card[];
  embrasementEcarlate: Card[];
  paradeOnirique: Card[];
  megaRayonnement: Card[];
};

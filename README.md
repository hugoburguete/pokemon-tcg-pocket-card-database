# Pokemon TCG Pocket Card database

An open-source database of cards for the Pokémon Trading Card Game Pocket mobile game.

The goal of this repository is to create a standard, scalable and up-to-date collection of the cards as the game evolves so they can be used by the community to create apps for the game.

## How to use

All cards can be found within the `cards` directory. Within the `cards` directory, you will find subdirectories for each supported locale. Finally, within those folders you'll find a JSON file for each set.

The package also exports the cards directly:

```js
const { en, fr } = require('pokemon-tcg-pocket-card-database');

console.log(en.geneticApex.length); // 286
console.log(en.rulerOfTheSkies.length); // 233
```

### Card shape

Each card looks like this:

```jsonc
{
  "id": "b4-001",
  "name": "Wurmple",
  "element": "Grass",          // or null for Trainers
  "type": "Pokemon",           // "Pokemon" | "Trainer"
  "subtype": "Basic",          // Basic / Stage 1 / Stage 2 / Item / Tool / Supporter / Stadium
  "health": 60,                // or null
  "set": "Ruler of the Skies (B4)",
  "pack": null,                // booster pack, or null
  "attacks": [
    { "name": "Gnaw", "damage": "10", "cost": ["Colorless"], "effect": "..." }
  ],
  "retreatCost": 1,            // number, or null
  "weakness": "Fire",          // or null
  "abilities": [
    { "name": "Victory Star", "effect": "..." }
  ],
  "evolvesFrom": null,         // or the name of the previous stage
  "rarity": "Common"           // or null
}
```

## Card viewer

A static, dependency-free card viewer lives in [`viewer/`](viewer/). It runs entirely in the browser — no build step and no server needed.

Features:

- Keyword search across the **whole card** (name, attacks, abilities, effects, set, pack, etc.) — e.g. searching `discard` finds every attack/ability/effect containing "discard"
- Filters for element, card type, subtype, rarity, set, booster pack, weakness, retreat cost, HP range, and "has ability"/"has attack"
- Sorting (set order, name, HP, rarity) and result highlighting

To use it, just open `viewer/index.html` in a browser, or serve the folder:

```bash
python3 -m http.server -d viewer
```

The bundled card data (`viewer/cards.js`) is generated from the English sets with:

```bash
python3 scripts/generate-viewer-data.py
```

## Updating the data

New sets can be scraped from [Pocket Limitless](https://pocket.limitlesstcg.com) with the included scraper:

```bash
python3 scripts/scrape-limitless.py B5   # or any set code, e.g. B4 B3b
```

The scraper writes `cards/en/<set>.json`. After adding a set, remember to:

1. Export it from `cards/en/index.js`
2. Add it to `index.d.ts`
3. Regenerate the viewer data (`scripts/generate-viewer-data.py`)

## Contribution

If there are any issues, feel free to raise them. PRs are also welcome if you would like to improve on the data set.

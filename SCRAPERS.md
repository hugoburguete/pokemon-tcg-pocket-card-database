# Scrapers

This project includes two scraper scripts that pull card data from [pocket.limitlesstcg.com](https://pocket.limitlesstcg.com) and enrich the local database.

---

## `scripts/scrape-set.mjs` — Full Set Scraper ⭐ (Recommended)

Scrapes **all cards** from a given set (Pokémon + Trainers) and generates the corresponding JSON file in `cards/en/`. Trainer card effects are captured automatically in the same pass.

### Usage

```bash
node scripts/scrape-set.mjs \
  --set   <SET_CODE> \
  --name  "<Full Set Name>" \
  --pack  "<Pack Name>" \
  --file  <output-filename> \
  [--update-index]
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--set` | ✅ | Set code as used on limitlesstcg (e.g. `B3`, `A4b`, `P-A`) |
| `--name` | ✅ | Full display name of the set (e.g. `"Pulsing Aura (B3)"`) |
| `--pack` | ✅ | Pack name (e.g. `"Mega Lucario"`). Use `none` if the set has no packs |
| `--file` | ✅ | Output filename without extension (e.g. `b3-pulsing-aura`) |
| `--update-index` | ❌ | Automatically adds the new set to `cards/en/index.js` |

### Example — Adding a new set

```bash
# 1. Scrape the set and update index.js
node scripts/scrape-set.mjs \
  --set B3 \
  --name "Pulsing Aura (B3)" \
  --pack "Mega Lucario" \
  --file b3-pulsing-aura \
  --update-index

# 2. Rebuild the merged database
node merge.js
```

This will:
1. Fetch all cards from `pocket.limitlesstcg.com` for the given set
2. Write `cards/en/b3-pulsing-aura.json` with all card data
3. Register the new set in `cards/en/index.js`
4. Regenerate `cards_en.json` with the new set included

### Output card structure

```json
{
  "id": "b3-001",
  "name": "Tangela",
  "element": "Grass",
  "type": "Pokemon",
  "subtype": "Basic",
  "health": 80,
  "set": "Pulsing Aura (B3)",
  "pack": "Mega Lucario",
  "attacks": [
    {
      "name": "Bind",
      "damage": "20",
      "cost": ["Grass", "Colorless"],
      "effect": "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed."
    }
  ],
  "retreatCost": 2,
  "weakness": "Fire",
  "abilities": [],
  "evolvesFrom": null,
  "rarity": null
}
```

> **Note:** `rarity` is always `null` because the list page does not expose rarity information. It must be filled in manually or via a separate script if needed.

For **Trainer cards**, an `effect` field is added at the card level:

```json
{
  "id": "b3-149",
  "name": "Korrina",
  "type": "Trainer",
  "subtype": "Supporter",
  "set": "Pulsing Aura (B3)",
  "pack": "Mega Lucario",
  "attacks": [],
  "abilities": [],
  "effect": "During this turn, attacks used by your [F] Pokémon do +30 damage to your opponent's Active Pokémon.",
  ...
}
```

---

## `scripts/scrape-trainer-effects.mjs` — Trainer Effects Scraper (Legacy)

> **ℹ️ You usually don't need this script anymore.** The full set scraper (`scrape-set.mjs`) captures trainer effects during the normal scrape pass. Use this script only if you need to backfill effects for older sets that were added before the new scraper existed.

Scrapes **only Trainer cards** across all sets and generates two JSON files:

| File | Contents |
|------|----------|
| `scripts/trainer_effects_all.json` | All trainer cards found on the site with their effects |
| `scripts/trainer_effects_missing.json` | Only trainer cards from `cards_en.json` that are missing an `effect` field |

`merge.js` reads `trainer_effects_missing.json` and applies the effects to any trainer card that doesn't already have one.

### Usage

```bash
node scripts/scrape-trainer-effects.mjs
```

No arguments are required. The script reads `cards_en.json` automatically to determine which cards are missing effects.

---

## Workflow — Adding a new set from scratch

```
┌─────────────────────────────────────────────────────────────┐
│  New set released                                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  node scripts/scrape-set.mjs                                │
│    --set   <CODE>                                           │
│    --name  "<Full Name>"                                    │
│    --pack  "<Pack Name>"                                    │
│    --file  <filename>                                       │
│    --update-index                                           │
└──────────────────────────┬──────────────────────────────────┘
                           │  generates cards/en/<filename>.json
                           │  updates cards/en/index.js
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  node merge.js                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │  regenerates cards_en.json
                           ▼
                        Done ✅
```

---

## Dependencies

Both scripts require `cheerio` and `node-fetch`, already listed in `devDependencies`:

```bash
npm install
```

---

## Notes

- Both scripts include a **1.5 second delay** between paginated requests to avoid overloading the server.
- If a page returns no results, a `debug_<SET>_page<N>.html` file is saved in `scripts/` for inspection.
- The set code in `--set` must match exactly what limitlesstcg uses in its URLs (check `pocket.limitlesstcg.com/cards/B3/1` for the code format).

#!/usr/bin/env python3
"""
Scrape card data for a Pokémon TCG Pocket set from Pocket Limitless
(https://pocket.limitlesstcg.com) and emit it in the format used by this repo.

Usage:
    python3 scripts/scrape-limitless.py B4            # scrape set B4
    python3 scripts/scrape-limitless.py B3b B4        # scrape several sets

The output is written to cards/en/<slug>.json where <slug> is derived from the
set code (e.g. B4 -> b4-ruler-of-the-skies.json, B3b -> b3b-everyday-wonders.json).

This parser fixes two bugs present in the widely-mirrored community scraper
(LucachuTW/CARDS-PokemonPocket-scrapper):

  1. Attack names were corrupted when the name contained a letter that also
     appeared in the attack cost (e.g. "Water Gun" -> "ater Gun"), because the
     scraper removed cost symbols with str.replace() instead of removing the
     cost <span> elements.

  2. Ability effect text lost its energy references (e.g. "take a [L] Energy"
     became "take a  Energy"), because the scraper stripped [bracketed] text
     instead of resolving the symbol tooltips to their full names.
"""

import argparse
import copy
import json
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE = "https://pocket.limitlesstcg.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}

# Energy symbol letters -> element names (matches the game's type codes).
ENERGY = {
    "G": "Grass",
    "R": "Fire",
    "W": "Water",
    "L": "Lightning",
    "P": "Psychic",
    "F": "Fighting",
    "D": "Darkness",
    "M": "Metal",
    "C": "Colorless",
}
ELEMENTS = set(ENERGY.values()) | {"Dragon", "Fairy"}

# Limitless rarity symbols -> this repo's rarity labels.
RARITY_SYMBOL = {
    "\u25ca": "Common",
    "\u25ca\u25ca": "Uncommon",
    "\u25ca\u25ca\u25ca": "Rare",
    "\u25ca\u25ca\u25ca\u25ca": "Rare EX",
    "\u2606": None,  # single star: full art OR shiny (decided below)
    "\u2606\u2606": None,  # double star: full art EX/supporter OR shiny
    "\u2606\u2606\u2606": "Immersive",
    "Crown Rare": "Gold Crown",
}


def fetch(url, retries=3):
    last = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


def collapse(text):
    return re.sub(r"\s+", " ", text or "").strip()


def effect_text(element):
    """Resolve energy-symbol spans to full names and return clean text."""
    el = copy.copy(element)
    for span in el.select("span[data-tooltip]"):
        span.replace_with(span["data-tooltip"])
    for span in el.select("span.copy-only"):
        span.decompose()
    # No separator and no per-string strip: the original text nodes already
    # carry their own spaces/punctuation, and collapse() normalizes the rest.
    return collapse(el.get_text(""))


def shiny_card_set():
    """Return {(SET, number), ...} of all shiny cards, from Limitless search."""
    html = fetch(f"{BASE}/cards/?q=is:shiny,sfa&show=all")
    out = set()
    for href in re.findall(r'href="(/cards/([A-Z0-9-]+)/(\d+))"', html):
        out.add((href[1].upper(), int(href[2])))
    return out


def set_numbers(set_code):
    """Return the ordered card numbers in a set from its listing page."""
    html = fetch(f"{BASE}/cards/{set_code}")
    seen = {}
    for href in re.findall(rf'href="(/cards/{re.escape(set_code)}/(\d+))"', html):
        seen[int(href[1])] = True
    return sorted(seen)


def parse_card(html, set_code, number, shiny):
    soup = BeautifulSoup(html, "html.parser")
    card = {}

    # Name / HP / element -------------------------------------------------
    name_el = soup.select_one(".card-text-name")
    name = name_el.get_text(strip=True) if name_el else "Unknown"
    title_el = soup.select_one(".card-text-title")
    # Drop the name span so element/HP detection only sees the type + HP part
    # (a card literally named "Psychic" must not be read as its element).
    title_only = copy.copy(title_el)
    for nm in title_only.select(".card-text-name"):
        nm.decompose()
    title = collapse(title_only.get_text(""))
    hp = None
    m = re.search(r"(\d+)\s*HP", title)
    if m:
        hp = int(m.group(1))
    element = None
    for token in re.split(r"\s+", title):
        if token in ELEMENTS:
            element = token
            break

    # Type / subtype / evolution ------------------------------------------
    type_el = soup.select_one(".card-text-type")
    card_type = collapse(type_el.get_text(" ", strip=True))
    is_trainer = card_type.startswith("Trainer")
    parts = [p.strip() for p in card_type.split("-")]
    subtype = parts[1] if len(parts) > 1 else "Basic"
    evolves_from = None
    m = re.search(r"Evolves from (.+)$", card_type)
    if m:
        evolves_from = m.group(1).strip()

    # Attacks ---------------------------------------------------------------
    attacks = []
    for atk in soup.select(".card-text-attack"):
        info = atk.select_one(".card-text-attack-info")
        if not info:
            continue
        cost = []
        for sym in info.select("span.ptcg-symbol"):
            for ch in sym.get_text(strip=True):
                cost.append(ENERGY.get(ch, ch))
        info_only = copy.copy(info)
        for sym in info_only.select("span.ptcg-symbol"):
            sym.decompose()
        text = collapse(info_only.get_text(" ", strip=True))
        m = re.match(r"^(.*?)\s+(\d+(?:[+x\u00d7])?)\s*$", text)
        if m:
            attack_name, damage = m.group(1).strip(), m.group(2)
        else:
            attack_name, damage = text, ""
        eff = effect_text(atk.select_one(".card-text-attack-effect"))
        attack = {"name": attack_name, "damage": damage, "cost": cost}
        if eff:
            attack["effect"] = eff
        attacks.append(attack)

    # Ability -----------------------------------------------------------------
    abilities = []
    ability_el = soup.select_one(".card-text-ability")
    if ability_el:
        info = ability_el.select_one(".card-text-ability-info")
        eff = ability_el.select_one(".card-text-ability-effect")
        ability_name = (
            collapse(info.get_text(" ", strip=True)).replace("Ability:", "").strip()
            if info
            else ""
        )
        ability_effect = effect_text(eff) if eff else ""
        if ability_name and ability_effect and ability_effect != "No effect":
            abilities.append({"name": ability_name, "effect": ability_effect})

    # Weakness / retreat -----------------------------------------------------
    weakness = None
    retreat = None
    wrr = soup.select_one(".card-text-wrr")
    if wrr:
        wrr_text = collapse(wrr.get_text(" ", strip=True))
        m = re.search(r"Weakness:\s*(\S+)", wrr_text)
        if m and m.group(1).lower() not in ("none", "n/a", "\u2014", "-"):
            weakness = m.group(1)
        m = re.search(r"Retreat:\s*(\S+)", wrr_text)
        if m and m.group(1).isdigit():
            retreat = int(m.group(1))

    # Set name / pack / rarity ------------------------------------------------
    cur = soup.select_one(".card-prints-current")
    set_name = ""
    pack = None
    rarity_symbol = None
    if cur:
        name_span = cur.select_one(".text-lg")
        if name_span:
            set_name = collapse(name_span.get_text(" ", strip=True))
        for span in cur.select(".prints-current-details span"):
            span_text = collapse(span.get_text(" ", strip=True))
            m = re.search(r"#\d+\s*\u00b7\s*([^\u00b7]+)", span_text)
            if m:
                rarity_symbol = m.group(1).strip()
            mp = re.search(r"\u00b7\s*([^\u00b7]+?)\s+pack", span_text)
            if mp and mp.group(1).strip() != "Every":
                pack = mp.group(1).strip()

    rarity = None
    if rarity_symbol == "\u2606":
        rarity = "One shiny star" if (set_code.upper(), number) in shiny else "Full Art"
    elif rarity_symbol == "\u2606\u2606":
        rarity = (
            "Two shiny stars" if (set_code.upper(), number) in shiny else "Full Art EX/Support"
        )
    elif rarity_symbol in RARITY_SYMBOL:
        rarity = RARITY_SYMBOL[rarity_symbol]

    card = {
        "id": f"{set_code.lower()}-{number:03d}",
        "name": name,
        "element": element,
        "type": "Trainer" if is_trainer else "Pokemon",
        "subtype": subtype,
        "health": hp,
        "set": set_name,
        "pack": pack,
        "attacks": attacks,
        "retreatCost": retreat,
        "weakness": weakness,
        "abilities": abilities,
        "evolvesFrom": evolves_from,
        "rarity": rarity,
    }
    return card


SLUGS = {
    "B3b": "b3b-everyday-wonders",
    "B4": "b4-ruler-of-the-skies",
}


def slug_for(set_code):
    return SLUGS.get(set_code, set_code.lower())


# Manual corrections for typos present in the Limitless source data.
# Keyed by (set_code, number); each value is (field, old, new) with old/new
# applied as substring replacement (or exact match for name/evolvesFrom).
KNOWN_FIXES = {
    ("B4", 19): ("name", "Teal MaskOgerpon", "Teal Mask Ogerpon"),
    ("B4", 96): ("evolvesFrom", "GalarianZigzagoon", "Galarian Zigzagoon"),
    ("B4", 97): ("evolvesFrom", "GalarianLinoone", "Galarian Linoone"),
    ("B4", 231): ("effect", "40 damage.(If", "40 damage. (If"),
}


def apply_known_fixes(card):
    key = (card["id"].split("-")[0].upper(), int(card["id"].split("-")[-1]))
    fix = KNOWN_FIXES.get(key)
    if not fix:
        return
    field, old, new = fix
    if field == "name" and card["name"] == old:
        card["name"] = new
    elif field == "evolvesFrom" and card["evolvesFrom"] == old:
        card["evolvesFrom"] = new
    elif field == "effect":
        for attack in card["attacks"]:
            if old in attack.get("effect", ""):
                attack["effect"] = attack["effect"].replace(old, new)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sets", nargs="+", help="set codes, e.g. B4 B3b")
    args = parser.parse_args()

    print("Fetching shiny card list...")
    shiny = shiny_card_set()
    print(f"  {len(shiny)} shiny cards known")

    for set_code in args.sets:
        numbers = set_numbers(set_code)
        print(f"\nScraping {set_code}: {len(numbers)} cards")
        cards = []
        for i, number in enumerate(numbers, 1):
            html = fetch(f"{BASE}/cards/{set_code}/{number}")
            card = parse_card(html, set_code, number, shiny)
            apply_known_fixes(card)
            cards.append(card)
            if i % 20 == 0 or i == len(numbers):
                print(f"  {i}/{len(numbers)}")
            time.sleep(0.4)
        out_path = f"cards/en/{slug_for(set_code)}.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(cards, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"  wrote {out_path}")


if __name__ == "__main__":
    main()

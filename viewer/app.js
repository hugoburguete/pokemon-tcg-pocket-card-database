/* Pokémon TCG Pocket — static card viewer */
(function () {
  "use strict";

  const CARDS = window.POKEMON_CARDS || [];

  // Precompute a searchable blob for every card (lowercased, all fields).
  CARDS.forEach(function (card) {
    card._search = JSON.stringify(card).toLowerCase();
  });

  /* ---------- Element styling ---------- */
  const ELEMENT = {
    Grass: { color: "#1f9d55" },
    Fire: { color: "#e11d48" },
    Water: { color: "#0284c7" },
    Lightning: { color: "#d97706" },
    Psychic: { color: "#c026d3" },
    Fighting: { color: "#c2410c" },
    Darkness: { color: "#475569" },
    Metal: { color: "#64748b" },
    Dragon: { color: "#6d28d9" },
    Colorless: { color: "#94a3b8" },
  };

  const ELEMENT_ORDER = [
    "Grass", "Fire", "Water", "Lightning", "Psychic",
    "Fighting", "Darkness", "Metal", "Dragon", "Colorless",
  ];
  const SUBTYPE_ORDER = ["Basic", "Stage 1", "Stage 2", "Item", "Tool", "Supporter", "Stadium"];
  const RARITY_ORDER = [
    "Common", "Uncommon", "Rare", "Rare EX",
    "Full Art", "Full Art EX/Support", "Immersive",
    "One shiny star", "Two shiny stars", "Gold Crown",
  ];

  /* ---------- State ---------- */
  const state = {
    search: "",
    element: "",
    type: "",
    subtype: "",
    rarity: "",
    set: "",
    pack: "",
    weakness: "",
    retreat: "",
    hpMin: null,
    hpMax: null,
    hasAbility: false,
    hasAttack: false,
    sort: "set",
    visible: 200,
  };

  /* ---------- Helpers ---------- */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function hl(text) {
    const q = state.search.trim();
    if (!q) return esc(text);
    const lower = String(text).toLowerCase();
    const ql = q.toLowerCase();
    let out = "";
    let i = 0;
    while (true) {
      const idx = lower.indexOf(ql, i);
      if (idx === -1) {
        out += esc(String(text).slice(i));
        break;
      }
      out += esc(String(text).slice(i, idx));
      out += "<mark>" + esc(String(text).slice(idx, idx + q.length)) + "</mark>";
      i = idx + q.length;
    }
    return out;
  }

  function costChip(cost) {
    if (cost === "0") return '<span class="cost-chip" style="background:#6b7280" title="No energy cost">0</span>';
    const e = ELEMENT[cost] || ELEMENT.Colorless;
    return '<span class="cost-chip" style="background:' + e.color + '">' + esc(cost) + "</span>";
  }

  /* ---------- Filter option population ---------- */
  function fillSelect(id, options) {
    const sel = document.getElementById(id);
    sel.innerHTML = options
      .map(function (o) {
        return '<option value="' + esc(o.v) + '">' + esc(o.l) + "</option>";
      })
      .join("");
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
  }

  function populateFilters() {
    const elements = CARDS.map(function (c) { return c.element; }).filter(Boolean);
    const elementOptions = [{ v: "", l: "Any" }]
      .concat(
        ELEMENT_ORDER.filter(function (e) { return elements.indexOf(e) !== -1; })
          .map(function (e) { return { v: e, l: e }; })
      )
      .concat([{ v: "__none__", l: "No element (Trainer)" }]);

    const subtypes = uniqueSorted(CARDS.map(function (c) { return c.subtype; }))
      .sort(function (a, b) { return SUBTYPE_ORDER.indexOf(a) - SUBTYPE_ORDER.indexOf(b); });
    const rarities = uniqueSorted(CARDS.map(function (c) { return c.rarity; }))
      .sort(function (a, b) { return RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b); });
    const packs = uniqueSorted(CARDS.map(function (c) { return c.pack; }));
    const weaknesses = uniqueSorted(CARDS.map(function (c) { return c.weakness; }));

    // Ordered, unique sets (cards.js is already in release order).
    const sets = [];
    const seen = new Set();
    CARDS.forEach(function (c) {
      if (!seen.has(c.setCode)) {
        seen.add(c.setCode);
        sets.push({ code: c.setCode, name: c.set || c.setCode });
      }
    });

    fillSelect("f-element", elementOptions);
    fillSelect("f-type", [
      { v: "", l: "Any" },
      { v: "Pokemon", l: "Pokémon" },
      { v: "Trainer", l: "Trainer" },
    ]);
    fillSelect("f-subtype", [{ v: "", l: "Any" }].concat(subtypes.map(function (s) { return { v: s, l: s }; })));
    fillSelect("f-rarity", [{ v: "", l: "Any" }]
      .concat(rarities.map(function (r) { return { v: r, l: r }; }))
      .concat([{ v: "__none__", l: "No rarity" }]));
    fillSelect("f-set", [{ v: "", l: "Any" }].concat(sets.map(function (s) { return { v: s.code, l: s.name }; })));
    fillSelect("f-pack", [{ v: "", l: "Any" }]
      .concat(packs.map(function (p) { return { v: p, l: p }; }))
      .concat([{ v: "__none__", l: "No pack" }]));
    fillSelect("f-weakness", [{ v: "", l: "Any" }]
      .concat(weaknesses.map(function (w) { return { v: w, l: w }; }))
      .concat([{ v: "__none__", l: "No weakness" }]));
    fillSelect("f-retreat", [
      { v: "", l: "Any" },
      { v: "0", l: "0" },
      { v: "1", l: "1" },
      { v: "2", l: "2" },
      { v: "3", l: "3" },
      { v: "4", l: "4" },
      { v: "__none__", l: "None" },
    ]);
  }

  /* ---------- Matching ---------- */
  function matches(card) {
    if (state.search && card._search.indexOf(state.search) === -1) return false;

    if (state.element) {
      if (state.element === "__none__" ? card.element !== null : card.element !== state.element) return false;
    }
    if (state.type && card.type !== state.type) return false;
    if (state.subtype && card.subtype !== state.subtype) return false;
    if (state.rarity) {
      if (state.rarity === "__none__" ? card.rarity !== null : card.rarity !== state.rarity) return false;
    }
    if (state.set && card.setCode !== state.set) return false;
    if (state.pack) {
      if (state.pack === "__none__" ? card.pack !== null : card.pack !== state.pack) return false;
    }
    if (state.weakness) {
      if (state.weakness === "__none__" ? card.weakness !== null : card.weakness !== state.weakness) return false;
    }
    if (state.retreat) {
      if (state.retreat === "__none__" ? card.retreatCost !== null : card.retreatCost !== parseInt(state.retreat, 10)) return false;
    }
    if (state.hpMin !== null || state.hpMax !== null) {
      if (card.health === null) return false;
      if (state.hpMin !== null && card.health < state.hpMin) return false;
      if (state.hpMax !== null && card.health > state.hpMax) return false;
    }
    if (state.hasAbility && card.abilities.length === 0) return false;
    if (state.hasAttack && card.attacks.length === 0) return false;
    return true;
  }

  /* ---------- Sorting ---------- */
  function sort(list) {
    const by = state.sort;
    list.sort(function (a, b) {
      switch (by) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "hp-desc":
          return (b.health || 0) - (a.health || 0);
        case "hp-asc":
          return (a.health || 0) - (b.health || 0);
        case "rarity": {
          const ra = RARITY_ORDER.indexOf(a.rarity);
          const rb = RARITY_ORDER.indexOf(b.rarity);
          if (ra !== rb) return ra - rb;
          return a.id.localeCompare(b.id);
        }
        default:
          return a.id.localeCompare(b.id, undefined, { numeric: true });
      }
    });
  }

  /* ---------- Rendering ---------- */
  function cardHTML(card) {
    let badge;
    if (card.type === "Trainer") {
      badge = '<span class="badge trainer"><span class="dot"></span>Trainer</span>';
    } else {
      const e = ELEMENT[card.element] || ELEMENT.Colorless;
      badge = '<span class="badge" style="background:' + e.color + '"><span class="dot"></span>' + esc(card.element) + "</span>";
    }

    const hp = card.health !== null ? '<span class="hp">HP ' + card.health + "</span>" : "";
    const sub = [card.subtype, card.evolvesFrom ? "Evolves from " + card.evolvesFrom : null]
      .filter(Boolean)
      .join(" · ");

    const attacks = card.attacks
      .map(function (a) {
        const cost = (a.cost || []).map(costChip).join("");
        const dmg = a.damage ? '<span class="damage">' + hl(a.damage) + "</span>" : "";
        const eff = a.effect ? '<div class="effect">' + hl(a.effect) + "</div>" : "";
        return (
          '<div class="attack"><div class="attack-head"><span class="attack-name">' +
          hl(a.name) +
          "</span>" +
          dmg +
          "</div>" +
          (cost ? '<div class="cost">' + cost + "</div>" : "") +
          eff +
          "</div>"
        );
      })
      .join("");

    const abilities = card.abilities
      .map(function (a) {
        return (
          '<div class="ability"><div class="ability-name">Ability: ' +
          hl(a.name) +
          '</div><div class="effect">' +
          hl(a.effect) +
          "</div></div>"
        );
      })
      .join("");

    const meta = [];
    if (card.weakness) meta.push("Weakness " + card.weakness);
    if (card.retreatCost !== null) meta.push("Retreat " + card.retreatCost);
    if (card.rarity) meta.push(card.rarity);
    if (card.set) meta.push(card.set);
    if (card.pack) meta.push(card.pack + " pack");
    meta.push(card.id.toUpperCase());
    const metaHTML = meta.map(function (m) { return '<span class="meta-chip">' + esc(m) + "</span>"; }).join("");

    return (
      '<article class="card">' +
      '<div class="card-top"><div class="card-title">' + badge + '<span class="card-name">' + hl(card.name) + "</span></div>" + hp + "</div>" +
      '<div class="card-sub">' + esc(sub) + "</div>" +
      attacks +
      abilities +
      '<div class="card-meta">' + metaHTML + "</div>" +
      "</article>"
    );
  }

  function render() {
    const list = CARDS.filter(matches);
    sort(list);
    const total = list.length;
    const shown = list.slice(0, state.visible);

    document.getElementById("grid").innerHTML = shown.length
      ? shown.map(cardHTML).join("")
      : '<div class="empty">No cards match your search.</div>';

    document.getElementById("count").textContent =
      "Showing " + shown.length.toLocaleString() + " of " + total.toLocaleString() + " cards";

    const more = document.getElementById("load-more");
    if (state.visible < total) {
      more.classList.remove("hidden");
      more.textContent = "Load more (" + (total - state.visible).toLocaleString() + " remaining)";
    } else {
      more.classList.add("hidden");
    }
  }

  /* ---------- Wire up events ---------- */
  function bind() {
    const search = document.getElementById("search");
    const clear = document.getElementById("clear-search");

    search.addEventListener("input", function () {
      state.search = search.value.trim().toLowerCase();
      clear.classList.toggle("visible", search.value.length > 0);
      state.visible = 200;
      render();
    });

    clear.addEventListener("click", function () {
      search.value = "";
      state.search = "";
      clear.classList.remove("visible");
      state.visible = 200;
      render();
      search.focus();
    });

    function bindSelect(id, key) {
      document.getElementById(id).addEventListener("change", function () {
        state[key] = this.value;
        state.visible = 200;
        render();
      });
    }
    bindSelect("f-element", "element");
    bindSelect("f-type", "type");
    bindSelect("f-subtype", "subtype");
    bindSelect("f-rarity", "rarity");
    bindSelect("f-set", "set");
    bindSelect("f-pack", "pack");
    bindSelect("f-weakness", "weakness");
    bindSelect("f-retreat", "retreat");

    document.getElementById("f-hp-min").addEventListener("input", function () {
      state.hpMin = this.value === "" ? null : parseInt(this.value, 10);
      state.visible = 200;
      render();
    });
    document.getElementById("f-hp-max").addEventListener("input", function () {
      state.hpMax = this.value === "" ? null : parseInt(this.value, 10);
      state.visible = 200;
      render();
    });

    document.getElementById("f-has-ability").addEventListener("change", function () {
      state.hasAbility = this.checked;
      state.visible = 200;
      render();
    });
    document.getElementById("f-has-attack").addEventListener("change", function () {
      state.hasAttack = this.checked;
      state.visible = 200;
      render();
    });

    document.getElementById("sort").addEventListener("change", function () {
      state.sort = this.value;
      render();
    });

    document.getElementById("load-more").addEventListener("click", function () {
      state.visible += 200;
      render();
    });

    document.getElementById("reset-filters").addEventListener("click", function () {
      search.value = "";
      state.search = "";
      state.element = state.type = state.subtype = state.rarity = "";
      state.set = state.pack = state.weakness = state.retreat = "";
      state.hpMin = state.hpMax = null;
      state.hasAbility = state.hasAttack = false;
      state.visible = 200;
      [
        "f-element", "f-type", "f-subtype", "f-rarity", "f-set",
        "f-pack", "f-weakness", "f-retreat",
      ].forEach(function (id) { document.getElementById(id).value = ""; });
      document.getElementById("f-hp-min").value = "";
      document.getElementById("f-hp-max").value = "";
      document.getElementById("f-has-ability").checked = false;
      document.getElementById("f-has-attack").checked = false;
      clear.classList.remove("visible");
      render();
    });

    document.getElementById("toggle-filters").addEventListener("click", function () {
      document.getElementById("filters").classList.toggle("open");
    });
  }

  /* ---------- Init ---------- */
  populateFilters();
  bind();
  render();
})();

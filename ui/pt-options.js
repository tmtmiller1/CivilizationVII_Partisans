// pt-options.js - Partisans: its group in the game's Options screen, under Mods.
//
// Registered from the main menu and in a game. Each option writes through as it is changed and applies at the next
// pass in a game. Cancel Changes puts back the value the option had when the screen opened. Registered as an init
// callback, as the other Tower mods do, because the game rebuilds the Options list after every Confirm.
"use strict";

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";
import { getOption, setOption } from "./pt-settings.js";

function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }

// The shared "Mods" category: the first mod to load creates it, the others reuse it.
if (!CategoryType.Mods) CategoryType["Mods"] = "mods";
if (!CategoryData[CategoryType.Mods]) {
  CategoryData[CategoryType.Mods] = { title: "LOC_UI_CONTENT_MGR_SUBTITLE", description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION" };
}

function applyLive() { safe(() => window.__towerPartisans && window.__towerPartisans.applySettings()); }

/** One checkbox row: the label is the text stem, the tooltip the stem + "_DESCRIPTION". */
function checkbox(id, loc, key) {
  return {
    category: CategoryType.Mods,
    // Underscore token: the game derives the group header key as LOC_OPTIONS_GROUP_${group.toUpperCase()}.
    group: "partisans",
    type: OptionType.Checkbox,
    id,
    label: loc,
    description: loc + "_DESCRIPTION",
    initListener: (info) => { info.currentValue = getOption(key); info.openValue = info.currentValue; },
    updateListener: (info, value) => { info.currentValue = !!value; setOption(key, !!value); applyLive(); },
    restoreListener: (info) => {
      if (getOption(key) !== info.openValue) { setOption(key, info.openValue); applyLive(); }
    },
  };
}

const ROWS = [
  ["pt-flip", "LOC_OPTIONS_PT_FLIP", "flipRisings"],
  ["pt-enclave", "LOC_OPTIONS_PT_ENCLAVE", "enclaveRisings"],
  ["pt-misery", "LOC_OPTIONS_PT_MISERY", "miseryRisings"],
  ["pt-any-mod", "LOC_OPTIONS_PT_ANY_MOD", "flipsFromAnyMod"],
  ["pt-parks", "LOC_OPTIONS_PT_PARKS", "parksCalm"],
];

function registerAll() {
  for (const [id, loc, key] of ROWS) safe(() => Options.addOption(checkbox(id, loc, key)));
}

try {
  Options.addInitCallback(registerAll);
} catch (_e) {
  registerAll();   // the list was already built: add them now
}

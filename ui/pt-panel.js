// pt-panel.js - Partisans: the settlement section (SPEC 8) in the game's City Details panel, Citizen Growth tab,
// through a decorator as Emigration adds its sections. It lists the three pressures in plain numbers and the state of
// any rising, and refreshes on the panel's own "update-city-details" event.

import { CONFIG } from "./pt-config.js";
import { miseryNeed } from "./pt-model.js";
import { cityKey, gameTurn, safe } from "./pt-engine.js";
import { text } from "./pt-notify.js";
import { dlog } from "./pt-log.js";

const UPDATE_EVENT = "update-city-details";
const SECTION_ID = "pt-city-section";
/** @type {() => import("./pt-state.js").State|null} */
let stateRef = () => null;

/** The rising, brewing or cooling line, or null when the settlement is calm. */
function statusLine(state, rec, key, turn) {
  if (rec && rec.risings.length) {
    const r = rec.risings[0];
    return { key: "LOC_PT_PANEL_RISING", args: [r.units.length + r.joiners.reduce((s, j) => s + j.units.length, 0)] };
  }
  if (state.pending.some((p) => p.at === key)) return { key: "LOC_PT_PANEL_BREWING", args: [] };
  if (rec && rec.cooling > turn) return { key: "LOC_PT_PANEL_COOLING", args: [rec.cooling - turn] };
  return null;
}

/**
 * The lines the section shows for a settlement, pure given the state.
 * @param {import("./pt-state.js").State|null} state @param {string} key @param {number} turn
 * @returns {{key:string, args:*[]}[]}
 */
export function panelLines(state, key, turn) {
  if (!state || !key) return [{ key: "LOC_PT_PANEL_CALM", args: [] }];
  const rec = state.cities[key];
  const lines = [];
  const status = statusLine(state, rec, key, turn);
  if (status) lines.push(status);
  lines.push({ key: "LOC_PT_PANEL_MISERY", args: [rec ? rec.M : 0, miseryNeed(CONFIG, state.speed || 1)] });
  lines.push({ key: "LOC_PT_PANEL_TENSION", args: [rec ? Math.round(rec.T) : 0] });
  return lines;
}

/** @returns {*} the city the panel shows */
function selectedCity() {
  return safe(() => Cities.get(UI.Player.getHeadSelectedCity()), null);
}

/** @param {HTMLElement} host @returns {HTMLElement} a fresh section element in place of the last */
function replaceSection(host) {
  const prev = host.querySelector(`#${SECTION_ID}`);
  if (prev) prev.remove();
  const sec = document.createElement("div");
  sec.id = SECTION_ID;
  sec.classList.add("mx-3", "my-2");
  host.appendChild(sec);
  return sec;
}

/** @param {HTMLElement} sec @param {string} content @param {boolean} header */
function addLine(sec, content, header) {
  const p = document.createElement("div");
  p.classList.add(header ? "font-title-base" : "font-body-sm", header ? "uppercase" : "text-accent-2", "my-1");
  p.textContent = content;
  sec.appendChild(p);
}

class PartisansCityPanel {
  /** @param {*} panel the panel-city-details component */
  constructor(panel) {
    this.panel = panel;
    this.onUpdate = () => this.refresh();
  }

  beforeAttach() {}

  afterAttach() {
    this.refresh();
    safe(() => window.addEventListener(UPDATE_EVENT, this.onUpdate), null);
  }

  beforeDetach() {}

  afterDetach() { safe(() => window.removeEventListener(UPDATE_EVENT, this.onUpdate), null); }

  onAttributeChanged() {}

  refresh() {
    safe(() => {
      const root = this.panel && this.panel.Root;
      const host = root && root.querySelector("#city-details-tab-growth fxs-scrollable");
      if (!host) return;
      const city = selectedCity();
      const sec = replaceSection(host);
      addLine(sec, text("LOC_PT_PANEL_TITLE"), true);
      for (const line of panelLines(stateRef(), city ? cityKey(city) : "", gameTurn())) addLine(sec, text(line.key, ...line.args), false);
    }, null);
  }
}

/** Register the decorator. @param {() => import("./pt-state.js").State|null} getState */
export function installPanel(getState) {
  stateRef = getState;
  if (!safe(() => typeof Controls.decorate === "function", false)) { dlog("Controls.decorate unavailable; no panel section"); return false; }
  safe(() => Controls.decorate("panel-city-details", (panel) => new PartisansCityPanel(panel)), null);
  return true;
}

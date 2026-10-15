// pt-bootstrap.js - Partisans, game scope. Boots the mod: loads the saved state, runs the pass at the start of each
// local turn, listens for settlements changing hands, adds the City Details section and the notification click
// handler, and exposes a console surface for the devtools harness. In a network game nothing is written: the section
// still reads what an earlier single-player session saved, and the pass stays off.

import { CONFIG } from "./pt-config.js";
import { loadState, saveState } from "./pt-state.js";
import { readHistory } from "./pt-history.js";
import { ageHash, engineReady, gameTurn, isMultiplayer, localId, scanCamps, safe } from "./pt-engine.js";
import { runPass } from "./pt-pass.js";
import { runRising } from "./pt-rising.js";
import { flipOutlook, onCityTransfered, onCultureFlip } from "./pt-transfer.js";
import { sweepMarkers } from "./pt-muster.js";
import { parkReliefFor } from "./pt-parks.js";
import { installClickHandler } from "./pt-notify.js";
import { installPanel } from "./pt-panel.js";
import { getOption, resetSettings } from "./pt-settings.js";
import { cityAtKey } from "./pt-engine.js";
import { log, setDebug } from "./pt-log.js";

const G = globalThis;
const KEY = "__towerPartisans";
const VERSION = "1.0.0";
const SETTLE_MS = 800;

const ctx = {
  state: null,
  rand: Math.random,
  placements: { attempts: 0, refused: 0 },
  campsCache: { turn: -1, list: [] },
  camps() {
    const turn = gameTurn();
    if (this.campsCache.turn !== turn) this.campsCache = { turn, list: scanCamps() };
    return this.campsCache.list;
  },
  listeners: [],
  passing: null,
  multiplayer: false
};

function listen(name, fn) {
  if (safe(() => { engine.on(name, fn); return true; }, false)) ctx.listeners.push([name, fn]);
}

/** Run the pass once, never two at a time. @param {string} why */
function pass(why) {
  if (ctx.passing) return ctx.passing;
  ctx.passing = runPass(ctx).then((r) => {
    log(`pass (${why}): ${r.ms} ms bookkeeping, ${r.requests} rising(s)${r.outcomes.length ? ": " + r.outcomes.join("; ") : ""}`);
    return r;
  }).catch((e) => { log(`pass threw ${String(e && e.stack || e)}`); return null; })
    .finally(() => { ctx.passing = null; });
  return ctx.passing;
}

function onTransfer(data) {
  safe(() => {
    const what = onCityTransfered(ctx.state, data, ctx.rand);
    if (what !== "other transfer") saveState(ctx.state);
  }, null);
}

function applySettings() {
  resetSettings();
  setDebug(getOption("debug"));
}

/** The console surface the harness drives. */
function installConsole() {
  G[KEY] = {
    version: VERSION,
    config: CONFIG,
    state: () => ctx.state,
    // The read API other mods use (version 1): every rising this game, open ones without an end.
    apiVersion: 1,
    risings: () => readHistory(ctx.state),
    // For Cultural Diffusion's "has joined" notice: is this settlement arming? flipOutlook("x,y").
    flipOutlook: (key) => flipOutlook(ctx.state, key),
    save: () => saveState(ctx.state),
    runNow: () => pass("manual"),
    applySettings,
    setRandom: (fn) => { ctx.rand = typeof fn === "function" ? fn : Math.random; },
    placements: () => ({ ...ctx.placements }),
    camps: () => ctx.camps(),
    get multiplayer() { return ctx.multiplayer; },
    // A rising now at a settlement, for the acceptance checks: rise("x,y", "misery", 0.6).
    rise: (key, cause = "misery", I = 0.6, from) => runRising(ctx, ctx.state, { key, owner: cityAtKey(key)?.owner ?? -1, cause, I, from })
      .then((r) => { saveState(ctx.state); return r; }),
    // The flip roll for a settlement that changed hands, as the transfer listener would run it.
    flip: (key, from, to) => {
      const r = onCultureFlip(ctx.state, cityAtKey(key), from, to, ctx.rand);
      saveState(ctx.state);
      return r;
    },
    // The park relief the misery check adds for a settlement: relief("x,y").
    relief: (key) => parkReliefFor(cityAtKey(key)),
    sweep: sweepMarkers,
    stop: () => { for (const [n, f] of ctx.listeners) safe(() => engine.off(n, f), null); ctx.listeners = []; return "stopped"; }
  };
}

/** The panel section and the notification click handler. */
function installUi() {
  installPanel(() => ctx.state);
  installClickHandler();
}

function boot() {
  applySettings();
  ctx.state = loadState(ageHash());
  ctx.multiplayer = isMultiplayer();
  installConsole();
  installUi();
  if (ctx.multiplayer) { log(`v${VERSION} in a network game: reads only, no risings`); return; }
  if (!engineReady()) { log("engine.on unavailable; the pass only runs from the console"); return; }
  listen("PlayerTurnActivated", (d) => { if (d && (d.player ?? d.Player) === localId()) setTimeout(() => pass(`turn ${gameTurn()}`), SETTLE_MS); });
  listen("CityTransfered", onTransfer);
  setTimeout(() => sweepMarkers(), 5000);
  log(`v${VERSION} active: ${Object.keys(ctx.state.cities).length} settlement record(s), ${ctx.state.pending.length} pending, age ${ctx.state.age}`);
}

if (!G[KEY]) boot();

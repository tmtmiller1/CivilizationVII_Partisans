// pt-placement.js - Partisans: putting a band on the map (SPEC 6.5). Some plots refuse a unit for reasons the probes
// didn't pin, so each unit is sent, the owner's unit list re-read after a short wait, and the next plot tried when
// nothing landed. Rings 3, 4 then 2 around the settlement, unowned plots first; never on water, a unit, a settlement,
// an urban district, a wonder, a park tile or a plot another Tower mod is still writing to.

import { CONFIG } from "./pt-config.js";
import { placementOrder } from "./pt-model.js";
import { createUnit, destroyUnit, distance, plotOpen, plotOwner, ring, sleep, unitIds, unitLocation, safe }
  from "./pt-engine.js";
import { isParkTile } from "./pt-parks.js";
import { dlog } from "./pt-log.js";

/**
 * Plots another Tower mod has a write pending on: Cultural Diffusion's saved pending map ("x,y" keys) and the Mod
 * Commons registry when it exposes one. Read, never written.
 * @returns {Set<string>}
 */
export function pendingPlots() {
  const out = new Set();
  safe(() => {
    const raw = Configuration.getGame().getValue("CulturalDiffusionState_v2");
    const parsed = typeof raw === "string" && raw ? JSON.parse(raw) : null;
    const pending = parsed && parsed.data ? parsed.data.pending : parsed && parsed.pending;
    for (const k of Object.keys(pending || {})) out.add(k);
  }, null);
  safe(() => {
    const reg = globalThis.ModCommons && globalThis.ModCommons.pendingPlots;
    for (const k of (typeof reg === "function" ? reg() : reg) || []) out.add(String(k));
  }, null);
  return out;
}

/**
 * The open plots in the placement rings around a centre, each with its ring, index and owner.
 * @param {{x:number, y:number}} center @param {number[]} rings @param {Set<string>} pending
 */
export function openPlots(center, rings, pending) {
  const out = [];
  for (const r of rings) {
    for (const p of ring(center, r)) {
      if (pending.has(`${p.x},${p.y}`) || !plotOpen(p.x, p.y) || isParkTile(p.x, p.y)) continue;
      out.push({ ...p, owner: plotOwner(p.x, p.y) });
    }
  }
  return out;
}

/** The plots to try, in order, nearest a camp first when one is given. */
function orderedPlots(center, cityOwner, opt) {
  const cfg = opt.rings ? { ...CONFIG, placementRings: opt.rings } : CONFIG;
  const order = placementOrder(cfg, openPlots(center, cfg.placementRings, pendingPlots()), cityOwner);
  if (!opt.towards) return order;
  const t = opt.towards;
  return order.slice().sort((a, b) => distance(a.x, a.y, t.x, t.y) - distance(b.x, b.y, t.x, t.y));
}

/**
 * Send one unit and read back whether it landed on the plot asked for. The engine sometimes creates a unit for an
 * independent that hasn't met the settlement's owner next to the independent's own camp instead (watched
 * 2026-10-15, eleven tiles off); such a unit is removed and the plot counts as refused.
 * @returns {Promise<{owner:number, id:number}[]>} the new units standing on the plot
 */
async function tryPlot(ip, type, plot, known) {
  createUnit(type, plot, ip);
  await sleep(CONFIG.placementWaitMs);
  const landed = [];
  for (const id of unitIds(ip).filter((id) => !known.has(id))) {
    known.add(id);
    const at = unitLocation(ip, id);
    if (at && at.x === plot.x && at.y === plot.y) { landed.push({ owner: ip, id }); continue; }
    dlog(`${type} for ${ip} came up at ${at ? at.x + "," + at.y : "?"} instead of ${plot.x},${plot.y}; removed`);
    destroyUnit({ owner: ip, id });
  }
  if (!landed.length) dlog(`plot ${plot.x},${plot.y} refused a ${type}`);
  else dlog(`${type} for ${ip} landed at ${plot.x},${plot.y} (ring ${plot.ring})`);
  return landed;
}

/**
 * Place a band of `types` for `ip` around a settlement, one unit per plot, verifying each.
 * @param {{x:number, y:number}} center @param {number} cityOwner @param {number} ip @param {string[]} types
 * @param {{rings?:number[], towards?:{x:number, y:number}}} [opt] `towards` sorts the plots nearest a camp first
 * @returns {Promise<{units:{owner:number, id:number}[], attempts:number, refused:number}>}
 */
export async function placeBand(center, cityOwner, ip, types, opt = {}) {
  const known = new Set(unitIds(ip));
  const units = [];
  let attempts = 0, refused = 0;
  for (const plot of orderedPlots(center, cityOwner, opt)) {
    if (units.length >= types.length) break;
    attempts++;
    const landed = await tryPlot(ip, types[units.length], plot, known);
    if (!landed.length) refused++;
    units.push(...landed);
  }
  return { units, attempts, refused };
}

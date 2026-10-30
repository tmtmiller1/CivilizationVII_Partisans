// pt-notify.js - Partisans: what the player is told (SPEC 8). Each message kind has its own notification type in the
// game's train (data/partisans-notifications.xml), because the engine keeps one live notification per type and
// player and drops a second; a turn's lines of one kind go into one notification. Text comes from LOC keys composed
// in the game's language. A notice goes to a human player: at once when it's their turn, else (another hotseat seat)
// when their turn starts. What happens between two AI civs stays in the log.

import { log, dlog } from "./pt-log.js";
import { localId, gameTurn, player, safe } from "./pt-engine.js";

/** @typedef {"brewing"|"rising"|"join"|"ended"|"lost"} Kind */

/** @type {Record<Kind, {type:string, title:string}>} */
export const KINDS = Object.freeze({
  brewing: { type: "NOTIFICATION_PT_BREWING", title: "LOC_PT_NOTIFY_BREWING_TITLE" },
  rising: { type: "NOTIFICATION_PT_RISING", title: "LOC_PT_NOTIFY_RISING_TITLE" },
  join: { type: "NOTIFICATION_PT_JOIN", title: "LOC_PT_NOTIFY_JOIN_TITLE" },
  ended: { type: "NOTIFICATION_PT_ENDED", title: "LOC_PT_NOTIFY_ENDED_TITLE" },
  lost: { type: "NOTIFICATION_PT_LOST", title: "LOC_PT_NOTIFY_LOST_TITLE" }
});

/** The lines sent this turn per player and kind; a second line of a kind replaces the live notification with both. */
const shown = new Map();
/** Notices for a hotseat seat whose turn isn't the current one, sent when it starts. @type {Map<number, *[]>} */
const waiting = new Map();
/** Where each kind's live notification points, for the click handler. @type {Map<string, {x:number, y:number}>} */
const places = new Map();
let handlerInstalled = false;

/** Move the camera to a plot. @param {{x:number, y:number}|undefined} at */
function lookAt(at) {
  if (!at) return;
  safe(() => { Camera.lookAtPlot({ x: at.x, y: at.y }); return true; }, false);
}

/**
 * Register a handler for the mod's notification types on the train's model, so a click on one moves the camera to
 * the settlement it's about (the engine ignores a location given from script, so the default handler can't). The
 * same registration Emigration uses; without the model, the default handler stays.
 */
export function installClickHandler() {
  if (handlerInstalled || !trainAvailable()) return;
  handlerInstalled = true;
  import("/base-standard/ui/notification-train/model-notification-train.js").then((mod) => {
    const manager = mod && mod.NotificationModel && mod.NotificationModel.manager;
    if (!manager || typeof manager.registerHandler !== "function" || typeof manager.add !== "function") return;
    const byHash = new Map(Object.entries(KINDS).map(([kind, spec]) => [Game.getHash(spec.type), kind]));
    const placeOf = (id) => {
      const n = Game.Notifications.find(id);
      return n ? places.get(byHash.get(n.Type)) : undefined;
    };
    const handler = {
      lookAt(id) { lookAt(placeOf(id)); },
      activate(id) { lookAt(placeOf(id)); return true; },
      add(id) { const n = Game.Notifications.find(id); return !!n && manager.add(n.Type, n.GroupType, id) != null; },
      dismiss(id) { if (typeof manager.onDismiss === "function") manager.onDismiss(id); }
    };
    for (const spec of Object.values(KINDS)) manager.registerHandler(spec.type, handler);
    log("notification click handler registered: a click moves the camera to the settlement");
  }).catch((e) => dlog(`notification click handler not installed: ${e}`));
}

/** @param {string} key @param {...*} args @returns {string} */
export function text(key, ...args) {
  const s = safe(() => Locale.compose(key, ...args), "");
  return typeof s === "string" && s.length ? s : key;
}

/** @returns {boolean} */
function trainAvailable() {
  return safe(() => typeof Game.Notifications.send === "function", false);
}

/** @param {number} pid @param {string} type */
function dismissLive(pid, type) {
  safe(() => {
    const hash = Game.getHash(type);
    for (const id of Game.Notifications.getIdsForPlayer(pid) || []) {
      const n = Game.Notifications.find(id);
      if (n && n.Type === hash) Game.Notifications.dismiss(id);
    }
  }, null);
}

/** The train's hover text is the summary alone, so the title (which says where) leads each entry in it. */
function entryOf(line, title) { return title ? `[B]${title}[/B][N]${line}` : line; }

/**
 * The first of the players that's human (the local player, or another hotseat seat), or -1 when none is.
 * @param {...number} pids @returns {number}
 */
export function humanOf(...pids) {
  const me = localId();
  for (const pid of pids) if (typeof pid === "number" && pid >= 0 && (pid === me || player(pid)?.isHuman === true)) return pid;
  return -1;
}

/**
 * Tell a human player one thing. Lines of one kind in one turn go into one notification, a blank line apart.
 * @param {Kind} kind @param {string} line composed text, [N] between its own lines @param {string} [title] the
 *   notification's title, else the kind's @param {{x:number, y:number}} [at] where a click on it takes the camera
 * @param {number} [to] the player it's for, the local player when absent
 */
export function notify(kind, line, title, at, to) {
  const spec = KINDS[kind];
  const me = localId();
  log(`notice (${kind}): ${line.replace(/\[N\]/g, " | ")}`);
  if (!spec || me < 0 || !trainAvailable() || held(to, me, { kind, line, title, at })) return;
  if (at) places.set(kind, at);
  const lines = turnLines(me, kind, spec, entryOf(line, title));
  const sent = safe(() => {
    Game.Notifications.send({ Type: Game.getHash(spec.type), Message: title || text(spec.title),
      Summary: lines.join("[N][N]") }, me);
    return true;
  }, false);
  if (!sent) dlog(`notification ${spec.type} not sent`);
}

/** This turn's lines of a kind with the new one; a live notification of the kind this turn is dismissed for them. */
function turnLines(me, kind, spec, entry) {
  const turn = gameTurn();
  const before = shown.get(`${me}:${kind}`);
  const same = !!before && before.turn === turn;
  if (same) dismissLive(me, spec.type);
  const lines = same ? before.lines.concat(entry) : [entry];
  shown.set(`${me}:${kind}`, { turn, lines });
  return lines;
}

/** Hold a notice for another hotseat seat until its turn starts. @returns {boolean} whether it was held */
function held(to, me, notice) {
  if (typeof to !== "number" || to < 0 || to === me) return false;
  if (!waiting.has(to)) waiting.set(to, []);
  waiting.get(to).push(notice);
  dlog(`notice for player ${to} waits for their turn`);
  return true;
}

/** Send the notices that waited for the local player's turn. @returns {number} how many */
export function flushNotices() {
  const me = localId();
  const list = waiting.get(me);
  if (!list) return 0;
  waiting.delete(me);
  for (const n of list) notify(n.kind, n.line, n.title, n.at);
  return list.length;
}

/** Test hook. */
export function resetNotices() { shown.clear(); waiting.clear(); }

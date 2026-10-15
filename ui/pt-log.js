// pt-log.js - Partisans: the log. A mod's console.log doesn't reach the game's UI.log, but console.error does, so
// every line goes out that way with a [Partisans] prefix. Grep for it in Logs/UI.log.

const PREFIX = "[Partisans]";
let debugOn = false;

/** @param {boolean} on */
export function setDebug(on) { debugOn = !!on; }

/** @returns {boolean} */
export function isDebug() { return debugOn; }

/** One line whatever the debug flag says: boot, outcomes and errors. @param {string} msg */
export function log(msg) {
  try { console.error(`${PREFIX} ${msg}`); } catch (_e) { /* no console */ }
}

/** One line only while debug logging is on. @param {string} msg */
export function dlog(msg) {
  if (debugOn) log(msg);
}

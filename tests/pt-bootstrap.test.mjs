// pt-bootstrap.test.mjs - the turn-start pass: once a turn, and a turn that starts while a pass runs still gets one.
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld } from "./_world.mjs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a turn gets one pass, however many turn starts it sees, and one asked for during a pass runs after it", async () => {
  const w = makeWorld({ local: 0, turn: 10, players: [
    { id: 0, kind: "major", cities: [{ x: 20, y: 10, happiness: -12, population: 3 }] },
    { id: 1, kind: "major", cities: [{ x: 30, y: 20, capital: true }] }
  ] });
  await import("../ui/pt-bootstrap.js");
  const P = globalThis.__towerPartisans;
  await P.turnPass();
  assert.equal(P.state().cities["20,10"].M, 1);
  w.local = 1;   // hotseat: the second seat's turn starts, same Game.turn
  await P.turnPass();
  assert.equal(P.state().cities["20,10"].M, 1, "counted once");
  // The next turn starts while this turn's pass is still running: it waits, then runs.
  const running = P.runNow();
  w.turn++;
  P.turnPass();
  await running;
  await tick();
  assert.equal(P.state().lastPass, "100:11");
  assert.equal(P.state().cities["20,10"].M, 3, "the manual pass and turn 11's");
});

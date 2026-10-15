// pt-muster.test.mjs - the muster marker's placement, detection and matching against the stub world.
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld, addPlayer, addCamp } from "./_world.mjs";
import { MARKER, placeMarker, removeMarkers, sweepMarkers, newRebelPeoples, matchRebels, markerAvailable } from "../ui/pt-muster.js";
import { scanCamps, constructiblesOfType, cityAt } from "../ui/pt-engine.js";

function world() {
  const w = makeWorld({ players: [
    { id: 0, kind: "major", cities: [{ x: 10, y: 10 }] },
    { id: 1, kind: "major", cities: [{ x: 30, y: 20 }] },
    { id: 20, kind: "independent" }
  ] });
  w.constructibleDefs.set(MARKER, { ConstructibleType: MARKER, ConstructibleClass: "BUILDING" });
  return w;
}

test("the marker is placed for the city's owner, found and removed; a sweep clears every city", () => {
  const w = world();
  assert.equal(markerAvailable(), true);
  const city = cityAt(10, 10);
  assert.equal(placeMarker(city), true);
  assert.deepEqual(w.requests[0].args, { Kind: "CONSTRUCTIBLE", Type: MARKER, Location: { x: 10, y: 10 }, Owner: 0 });
  assert.equal(constructiblesOfType(cityAt(10, 10), MARKER).length, 1);
  assert.equal(removeMarkers(cityAt(10, 10)), 1);
  assert.equal(constructiblesOfType(cityAt(10, 10), MARKER).length, 0);
  placeMarker(cityAt(10, 10));
  placeMarker(cityAt(30, 20));
  assert.equal(sweepMarkers(), 2);
  assert.equal(sweepMarkers(), 0);
});

test("a new independent camped in an encampment is a rebel people; villages and old independents aren't", () => {
  const w = world();
  addCamp(w, 20, 5, 5, "IMPROVEMENT_VILLAGE");
  const snapshot = [20];
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 12, 14, "IMPROVEMENT_ENCAMPMENT");
  addPlayer(w, { id: 25, kind: "independent" });
  addCamp(w, 25, 2, 2, "IMPROVEMENT_VILLAGE");
  const camps = scanCamps();
  assert.equal(camps.length, 3);
  assert.deepEqual(newRebelPeoples(snapshot, camps), [{ ip: 24, camp: { x: 12, y: 14 } }]);
});

test("two civs mustering the same turn each get the people nearest their settlements", () => {
  const w = world();
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 33, 22, "IMPROVEMENT_ENCAMPMENT");
  addPlayer(w, { id: 25, kind: "independent" });
  addCamp(w, 25, 13, 12, "IMPROVEMENT_ENCAMPMENT");
  const peoples = newRebelPeoples([20], scanCamps());
  assert.deepEqual(matchRebels(peoples, [0, 1]), { 0: 25, 1: 24 });
  assert.deepEqual(matchRebels(peoples.slice(0, 1), [0, 1]), { 0: 24 }, "one people for two civs: the first owner takes it");
  assert.deepEqual(matchRebels([], [0]), {});
});

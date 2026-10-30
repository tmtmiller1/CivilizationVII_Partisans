-- Room for rebel peoples (SPEC 7.1, DESIGN section 11). A muster's rebel people takes an independent slot, and the
-- game keeps majors x (INDEPENDENT_NUM_PER_MAJOR + INDEPENDENT_EXTRAS_PER_MAJOR) of them. Antiquity sets 3 + 1;
-- Exploration and Modern leave the extras at 0, so their 12 villages (six majors) fill every slot by turn 2 and a
-- muster after that spawns nothing. One spare slot per major, as Antiquity has, lets the muster spawn again; the
-- game doesn't fill the spare slots with ordinary villages (watched 2026-10-29, seed 4242, both ages).
-- Only raised: a mod that sets more room keeps it.
INSERT OR IGNORE INTO GlobalParameters (Name, Value) VALUES ('INDEPENDENT_EXTRAS_PER_MAJOR', '1');
UPDATE GlobalParameters SET Value = '1' WHERE Name = 'INDEPENDENT_EXTRAS_PER_MAJOR' AND CAST(Value AS REAL) < 1;

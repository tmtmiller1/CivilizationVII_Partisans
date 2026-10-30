-- One spare independent slot per major civ, as Antiquity sets it; a higher value from another mod is kept.
INSERT OR IGNORE INTO GlobalParameters (Name, Value) VALUES ('INDEPENDENT_EXTRAS_PER_MAJOR', '1');
UPDATE GlobalParameters SET Value = '1' WHERE Name = 'INDEPENDENT_EXTRAS_PER_MAJOR' AND CAST(Value AS INTEGER) < 1;

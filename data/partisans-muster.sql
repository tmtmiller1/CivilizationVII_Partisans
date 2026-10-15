-- Written by scripts/gen-data.mjs; edit the script, not this file.
-- The muster marker (SPEC 7.1). A hidden building in one of a civ's settlements makes the crisis's own rebel effect
-- spawn that civ's rebel people at the next turn roll. One trait per major leader owns that leader's modifier; the
-- building belongs to a trait no civilization has, so it is never offered to anyone. Only the player-level spawn
-- effect is used: the city army effect crashes the game (watched 2026-10-14).

-- Traits: one per major leader, and one nobody has.
INSERT INTO Types (Type, Kind) SELECT 'TRAIT_PARTISANS_' || LeaderType, 'KIND_TRAIT' FROM (SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO Traits (TraitType, InternalOnly) SELECT 'TRAIT_PARTISANS_' || LeaderType, 1 FROM (SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO LeaderTraits (LeaderType, TraitType) SELECT LeaderType, 'TRAIT_PARTISANS_' || LeaderType FROM (SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO Types (Type, Kind) VALUES ('TRAIT_PARTISANS_NONE', 'KIND_TRAIT');
INSERT INTO Traits (TraitType, InternalOnly) VALUES ('TRAIT_PARTISANS_NONE', 1);

-- The marker building.
INSERT INTO Types (Type, Kind) VALUES ('BUILDING_PARTISANS_MUSTER', 'KIND_CONSTRUCTIBLE');
INSERT INTO Constructibles (ConstructibleType, Name, Description, Tooltip, ConstructibleClass, Cost, Population, ExistingDistrictOnly, CanBeHidden)
VALUES ('BUILDING_PARTISANS_MUSTER', 'LOC_BUILDING_PARTISANS_MUSTER_NAME', 'LOC_BUILDING_PARTISANS_MUSTER_DESCRIPTION', 'LOC_BUILDING_PARTISANS_MUSTER_TOOLTIP', 'BUILDING', 1, 0, 1, 1);
INSERT INTO Buildings (ConstructibleType, Movable, Purchasable, Town, TraitType) VALUES ('BUILDING_PARTISANS_MUSTER', 0, 0, 1, 'TRAIT_PARTISANS_NONE');
INSERT INTO TypeTags (Type, Tag) VALUES ('BUILDING_PARTISANS_MUSTER', 'IGNORE_DISTRICT_PLACEMENT_CAP');
INSERT INTO Constructible_ValidDistricts (ConstructibleType, DistrictType) VALUES ('BUILDING_PARTISANS_MUSTER', 'DISTRICT_CITY_CENTER');

-- The modifier type: the crisis's player-level rebel spawn.
INSERT INTO Types (Type, Kind) VALUES ('MODIFIER_PARTISANS_SPAWN_TRIBE_NEAR', 'KIND_MODIFIER');
INSERT INTO DynamicModifiers (ModifierType, CollectionType, EffectType)
VALUES ('MODIFIER_PARTISANS_SPAWN_TRIBE_NEAR', 'COLLECTION_OWNER', 'EFFECT_PLAYER_SPAWN_TRIBE_NEAR');

-- Per leader: the requirement (the leader's player holds the marker), the modifier, its arguments and its trait.
INSERT INTO Requirements (RequirementId, RequirementType) SELECT 'REQ_' || ModifierId, 'REQUIREMENT_PLAYER_HAS_CONSTRUCTIBLE' FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementArguments (RequirementId, Name, Value) SELECT 'REQ_' || ModifierId, 'ConstructibleType', 'BUILDING_PARTISANS_MUSTER' FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementSets (RequirementSetId, RequirementSetType) SELECT 'RS_' || ModifierId, 'REQUIREMENTSET_TEST_ALL' FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) SELECT 'RS_' || ModifierId, 'REQ_' || ModifierId FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO Modifiers (ModifierId, ModifierType, RunOnce, Permanent, SubjectRequirementSetId)
SELECT ModifierId, 'MODIFIER_PARTISANS_SPAWN_TRIBE_NEAR', 0, 1, 'RS_' || ModifierId FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO ModifierArguments (ModifierId, Name, Value) SELECT ModifierId, 'TribeType', 'TRIBE_CRISIS' FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO ModifierArguments (ModifierId, Name, Value) SELECT ModifierId, 'NumCities', '1' FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO TraitModifiers (TraitType, ModifierId) SELECT 'TRAIT_PARTISANS_' || Owner, ModifierId FROM (SELECT 'MOD_PARTISANS_MUSTER_' || LeaderType AS ModifierId, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);

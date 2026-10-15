-- Written by gen-probe.mjs. Throwaway probe data for the Partisans acceptance checks; never shipped.
INSERT INTO Types (Type, Kind) SELECT 'TRAIT_PTPROBE_' || LeaderType, 'KIND_TRAIT' FROM (SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO Traits (TraitType, InternalOnly) SELECT 'TRAIT_PTPROBE_' || LeaderType, 1 FROM (SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO LeaderTraits (LeaderType, TraitType) SELECT LeaderType, 'TRAIT_PTPROBE_' || LeaderType FROM (SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO Types (Type, Kind) VALUES ('TRAIT_PTPROBE_NONE', 'KIND_TRAIT');
INSERT INTO Traits (TraitType, InternalOnly) VALUES ('TRAIT_PTPROBE_NONE', 1);

INSERT INTO Types (Type, Kind) VALUES ('MODIFIER_PTPROBE_TRANSFER', 'KIND_MODIFIER'), ('MODIFIER_PTPROBE_YIELD', 'KIND_MODIFIER');
INSERT INTO DynamicModifiers (ModifierType, CollectionType, EffectType) VALUES
  ('MODIFIER_PTPROBE_TRANSFER', 'COLLECTION_ALL_CITIES', 'EFFECT_CITY_TRANSFER_OWNER'),
  ('MODIFIER_PTPROBE_YIELD', 'COLLECTION_ALL_CITIES', 'EFFECT_CITY_ADJUST_YIELD');

-- Guard: the city's owner isn't on the modifier owner's team. Without it a RunOnce 0 transfer fires again on the new
-- owner until the stack overflows (watched 2026-10-14).
INSERT INTO Requirements (RequirementId, RequirementType, Inverse) VALUES ('REQ_PTPROBE_NOT_SAME_TEAM', 'REQUIREMENT_CITY_OWNER_IS_SAME_TEAM', 1);

INSERT INTO Types (Type, Kind) SELECT Building, 'KIND_CONSTRUCTIBLE' FROM (SELECT Building FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1));
INSERT INTO Constructibles (ConstructibleType, Name, ConstructibleClass, Cost, Population, ExistingDistrictOnly)
SELECT Building, 'LOC_BUILDING_PTPROBE_NAME', 'BUILDING', 1, 0, 1 FROM (SELECT Building FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1));
INSERT INTO Buildings (ConstructibleType, Movable, Purchasable, Town, TraitType) SELECT Building, 0, 0, 1, 'TRAIT_PTPROBE_NONE' FROM (SELECT Building FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1));
INSERT INTO TypeTags (Type, Tag) SELECT Building, 'IGNORE_DISTRICT_PLACEMENT_CAP' FROM (SELECT Building FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1));
INSERT INTO Constructible_ValidDistricts (ConstructibleType, DistrictType) SELECT Building, 'DISTRICT_CITY_CENTER' FROM (SELECT Building FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1));

INSERT INTO Requirements (RequirementId, RequirementType) SELECT 'REQ_' || ModifierId, 'REQUIREMENT_CITY_HAS_BUILDING' FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementArguments (RequirementId, Name, Value) SELECT 'REQ_' || ModifierId, 'BuildingType', Building FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementSets (RequirementSetId, RequirementSetType) SELECT 'RS_' || ModifierId, 'REQUIREMENTSET_TEST_ALL' FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) SELECT 'RS_' || ModifierId, 'REQ_' || ModifierId FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) SELECT 'RS_' || ModifierId, 'REQ_PTPROBE_NOT_SAME_TEAM' FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO Modifiers (ModifierId, ModifierType, RunOnce, Permanent, SubjectRequirementSetId)
SELECT ModifierId, 'MODIFIER_PTPROBE_TRANSFER', 0, 1, 'RS_' || ModifierId FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO ModifierArguments (ModifierId, Name, Value) SELECT ModifierId, 'TransferType', 'BY_CULTURAL_IDENTITY' FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);
INSERT INTO TraitModifiers (TraitType, ModifierId) SELECT 'TRAIT_PTPROBE_' || Owner, ModifierId FROM (SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1);

-- The unhappiness markers, owner-free (GameModifiers): -15 and, for a deeper misery, -25 (both can stand together).

INSERT INTO Types (Type, Kind) SELECT Building, 'KIND_CONSTRUCTIBLE' FROM (SELECT 'BUILDING_PTPROBE_UNH' AS Building UNION ALL SELECT 'BUILDING_PTPROBE_UNH2');
INSERT INTO Constructibles (ConstructibleType, Name, ConstructibleClass, Cost, Population, ExistingDistrictOnly)
SELECT Building, 'LOC_BUILDING_PTPROBE_NAME', 'BUILDING', 1, 0, 1 FROM (SELECT 'BUILDING_PTPROBE_UNH' AS Building UNION ALL SELECT 'BUILDING_PTPROBE_UNH2');
INSERT INTO Buildings (ConstructibleType, Movable, Purchasable, Town, TraitType) SELECT Building, 0, 0, 1, 'TRAIT_PTPROBE_NONE' FROM (SELECT 'BUILDING_PTPROBE_UNH' AS Building UNION ALL SELECT 'BUILDING_PTPROBE_UNH2');
INSERT INTO TypeTags (Type, Tag) SELECT Building, 'IGNORE_DISTRICT_PLACEMENT_CAP' FROM (SELECT 'BUILDING_PTPROBE_UNH' AS Building UNION ALL SELECT 'BUILDING_PTPROBE_UNH2');
INSERT INTO Constructible_ValidDistricts (ConstructibleType, DistrictType) SELECT Building, 'DISTRICT_CITY_CENTER' FROM (SELECT 'BUILDING_PTPROBE_UNH' AS Building UNION ALL SELECT 'BUILDING_PTPROBE_UNH2');

INSERT INTO Requirements (RequirementId, RequirementType) VALUES ('REQ_PTPROBE_UNH', 'REQUIREMENT_CITY_HAS_BUILDING');
INSERT INTO RequirementArguments (RequirementId, Name, Value) VALUES ('REQ_PTPROBE_UNH', 'BuildingType', 'BUILDING_PTPROBE_UNH');
INSERT INTO RequirementSets (RequirementSetId, RequirementSetType) VALUES ('RS_PTPROBE_UNH', 'REQUIREMENTSET_TEST_ALL');
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) VALUES ('RS_PTPROBE_UNH', 'REQ_PTPROBE_UNH');
INSERT INTO Modifiers (ModifierId, ModifierType, RunOnce, Permanent, SubjectRequirementSetId) VALUES ('MOD_PTPROBE_UNH', 'MODIFIER_PTPROBE_YIELD', 0, 1, 'RS_PTPROBE_UNH');
INSERT INTO ModifierArguments (ModifierId, Name, Value) VALUES ('MOD_PTPROBE_UNH', 'YieldType', 'YIELD_HAPPINESS'), ('MOD_PTPROBE_UNH', 'Amount', '-15');
INSERT INTO GameModifiers (ModifierId) VALUES ('MOD_PTPROBE_UNH');
INSERT INTO Requirements (RequirementId, RequirementType) VALUES ('REQ_PTPROBE_UNH2', 'REQUIREMENT_CITY_HAS_BUILDING');
INSERT INTO RequirementArguments (RequirementId, Name, Value) VALUES ('REQ_PTPROBE_UNH2', 'BuildingType', 'BUILDING_PTPROBE_UNH2');
INSERT INTO RequirementSets (RequirementSetId, RequirementSetType) VALUES ('RS_PTPROBE_UNH2', 'REQUIREMENTSET_TEST_ALL');
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) VALUES ('RS_PTPROBE_UNH2', 'REQ_PTPROBE_UNH2');
INSERT INTO Modifiers (ModifierId, ModifierType, RunOnce, Permanent, SubjectRequirementSetId) VALUES ('MOD_PTPROBE_UNH2', 'MODIFIER_PTPROBE_YIELD', 0, 1, 'RS_PTPROBE_UNH2');
INSERT INTO ModifierArguments (ModifierId, Name, Value) VALUES ('MOD_PTPROBE_UNH2', 'YieldType', 'YIELD_HAPPINESS'), ('MOD_PTPROBE_UNH2', 'Amount', '-25');
INSERT INTO GameModifiers (ModifierId) VALUES ('MOD_PTPROBE_UNH2');

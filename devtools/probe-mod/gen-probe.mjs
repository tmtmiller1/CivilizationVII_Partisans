// gen-probe.mjs - writes the throwaway probe mod the acceptance checks use (devtools/README.md). Two markers:
//   BUILDING_PTPROBE_CULT_<LEADER>: hands the city holding it to that leader by culture (BY_CULTURAL_IDENTITY), the
//     same transfer Cultural Diffusion's whole-settlement flip will produce; guarded so it fires once.
//   BUILDING_PTPROBE_UNH: -15 Happiness in the city holding it, for the misery checks.
// Never installed for play; tower-bench's lab removes it after a run. Run: node devtools/probe-mod/gen-probe.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const MAJORS = "SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1";

function building(src) {
  return `
INSERT INTO Types (Type, Kind) SELECT Building, 'KIND_CONSTRUCTIBLE' FROM (${src});
INSERT INTO Constructibles (ConstructibleType, Name, ConstructibleClass, Cost, Population, ExistingDistrictOnly)
SELECT Building, 'LOC_BUILDING_PTPROBE_NAME', 'BUILDING', 1, 0, 1 FROM (${src});
INSERT INTO Buildings (ConstructibleType, Movable, Purchasable, Town, TraitType) SELECT Building, 0, 0, 1, 'TRAIT_PTPROBE_NONE' FROM (${src});
INSERT INTO TypeTags (Type, Tag) SELECT Building, 'IGNORE_DISTRICT_PLACEMENT_CAP' FROM (${src});
INSERT INTO Constructible_ValidDistricts (ConstructibleType, DistrictType) SELECT Building, 'DISTRICT_CITY_CENTER' FROM (${src});
`;
}

const cult = `SELECT 'MOD_PTPROBE_CULT_' || LeaderType AS ModifierId, 'BUILDING_PTPROBE_CULT_' || LeaderType AS Building, LeaderType AS Owner FROM Leaders WHERE IsMajorLeader = 1`;

const sql = `-- Written by gen-probe.mjs. Throwaway probe data for the Partisans acceptance checks; never shipped.
INSERT INTO Types (Type, Kind) SELECT 'TRAIT_PTPROBE_' || LeaderType, 'KIND_TRAIT' FROM (${MAJORS});
INSERT INTO Traits (TraitType, InternalOnly) SELECT 'TRAIT_PTPROBE_' || LeaderType, 1 FROM (${MAJORS});
INSERT INTO LeaderTraits (LeaderType, TraitType) SELECT LeaderType, 'TRAIT_PTPROBE_' || LeaderType FROM (${MAJORS});
INSERT INTO Types (Type, Kind) VALUES ('TRAIT_PTPROBE_NONE', 'KIND_TRAIT');
INSERT INTO Traits (TraitType, InternalOnly) VALUES ('TRAIT_PTPROBE_NONE', 1);

INSERT INTO Types (Type, Kind) VALUES ('MODIFIER_PTPROBE_TRANSFER', 'KIND_MODIFIER'), ('MODIFIER_PTPROBE_YIELD', 'KIND_MODIFIER');
INSERT INTO DynamicModifiers (ModifierType, CollectionType, EffectType) VALUES
  ('MODIFIER_PTPROBE_TRANSFER', 'COLLECTION_ALL_CITIES', 'EFFECT_CITY_TRANSFER_OWNER'),
  ('MODIFIER_PTPROBE_YIELD', 'COLLECTION_ALL_CITIES', 'EFFECT_CITY_ADJUST_YIELD');

-- Guard: the city's owner isn't on the modifier owner's team. Without it a RunOnce 0 transfer fires again on the new
-- owner until the stack overflows (watched 2026-10-14).
INSERT INTO Requirements (RequirementId, RequirementType, Inverse) VALUES ('REQ_PTPROBE_NOT_SAME_TEAM', 'REQUIREMENT_CITY_OWNER_IS_SAME_TEAM', 1);
${building(`SELECT Building FROM (${cult})`)}
INSERT INTO Requirements (RequirementId, RequirementType) SELECT 'REQ_' || ModifierId, 'REQUIREMENT_CITY_HAS_BUILDING' FROM (${cult});
INSERT INTO RequirementArguments (RequirementId, Name, Value) SELECT 'REQ_' || ModifierId, 'BuildingType', Building FROM (${cult});
INSERT INTO RequirementSets (RequirementSetId, RequirementSetType) SELECT 'RS_' || ModifierId, 'REQUIREMENTSET_TEST_ALL' FROM (${cult});
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) SELECT 'RS_' || ModifierId, 'REQ_' || ModifierId FROM (${cult});
INSERT INTO RequirementSetRequirements (RequirementSetId, RequirementId) SELECT 'RS_' || ModifierId, 'REQ_PTPROBE_NOT_SAME_TEAM' FROM (${cult});
INSERT INTO Modifiers (ModifierId, ModifierType, RunOnce, Permanent, SubjectRequirementSetId)
SELECT ModifierId, 'MODIFIER_PTPROBE_TRANSFER', 0, 1, 'RS_' || ModifierId FROM (${cult});
INSERT INTO ModifierArguments (ModifierId, Name, Value) SELECT ModifierId, 'TransferType', 'BY_CULTURAL_IDENTITY' FROM (${cult});
INSERT INTO TraitModifiers (TraitType, ModifierId) SELECT 'TRAIT_PTPROBE_' || Owner, ModifierId FROM (${cult});

-- The unhappiness markers, owner-free (GameModifiers): -15 and, for a deeper misery, -25 (both can stand together).
${building("SELECT 'BUILDING_PTPROBE_UNH' AS Building UNION ALL SELECT 'BUILDING_PTPROBE_UNH2'")}
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
`;
writeFileSync(join(DIR, "data", "pt-probe.sql"), sql);
writeFileSync(join(DIR, "pt-probe.modinfo"), `<?xml version="1.0" encoding="utf-8"?>
<!-- Throwaway probe for the Partisans acceptance checks. Installed for a lab run and removed afterwards. -->
<Mod id="pt-probe" version="1" xmlns="ModInfo">
    <Properties>
        <Name>Partisans Probe (dev)</Name>
        <Description>Throwaway probe data: a culture-flip marker per leader and an unhappiness marker.</Description>
        <Authors>Tower</Authors>
        <Package>PartisansProbe</Package>
        <PackageSortIndex>9998</PackageSortIndex>
        <Version>0.0.1</Version>
        <AffectsSavedGames>1</AffectsSavedGames>
    </Properties>
    <Dependencies>
        <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME" />
    </Dependencies>
    <ActionCriteria>
        <Criteria id="always"><AlwaysMet></AlwaysMet></Criteria>
    </ActionCriteria>
    <ActionGroups>
        <ActionGroup id="pt-probe-game" scope="game" criteria="always">
            <Properties><LoadOrder>9000</LoadOrder></Properties>
            <Actions><UpdateDatabase><Item>data/pt-probe.sql</Item></UpdateDatabase></Actions>
        </ActionGroup>
    </ActionGroups>
</Mod>
`);
const shortAge = join(DIR, "..", "probe-short-age");
writeFileSync(join(shortAge, "data", "short-age.sql"), `-- Written by gen-probe.mjs. Antiquity ends at 20 age points (base 140), so a lab game reaches the transition in
-- about twenty turns. For the age-transition check only.
UPDATE AgeProgressions SET MaxPoints_Abbreviated = 20, MaxPoints_Standard = 20, MaxPoints_Long = 20 WHERE AgeType = 'AGE_ANTIQUITY';
`);
writeFileSync(join(shortAge, "pt-probe-short-age.modinfo"), `<?xml version="1.0" encoding="utf-8"?>
<!-- Throwaway: a twenty-turn Antiquity for the age-transition check. Installed for a lab run and removed afterwards. -->
<Mod id="pt-probe-short-age" version="1" xmlns="ModInfo">
    <Properties>
        <Name>Partisans Probe: short age (dev)</Name>
        <Description>Antiquity ends at 20 age points.</Description>
        <Authors>Tower</Authors>
        <Package>PartisansProbeShortAge</Package>
        <PackageSortIndex>9998</PackageSortIndex>
        <Version>0.0.1</Version>
        <AffectsSavedGames>1</AffectsSavedGames>
    </Properties>
    <Dependencies>
        <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME" />
    </Dependencies>
    <ActionCriteria>
        <Criteria id="always"><AlwaysMet></AlwaysMet></Criteria>
    </ActionCriteria>
    <ActionGroups>
        <ActionGroup id="pt-probe-short-age-game" scope="game" criteria="always">
            <Properties><LoadOrder>9000</LoadOrder></Properties>
            <Actions><UpdateDatabase><Item>data/short-age.sql</Item></UpdateDatabase></Actions>
        </ActionGroup>
    </ActionGroups>
</Mod>
`);
console.log("wrote the probe mods");

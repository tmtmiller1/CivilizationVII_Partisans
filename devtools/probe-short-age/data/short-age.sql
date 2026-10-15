-- Written by gen-probe.mjs. Antiquity ends at 20 age points (base 140), so a lab game reaches the transition in
-- about twenty turns. For the age-transition check only.
UPDATE AgeProgressions SET MaxPoints_Abbreviated = 20, MaxPoints_Standard = 20, MaxPoints_Long = 20 WHERE AgeType = 'AGE_ANTIQUITY';

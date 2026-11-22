-- L'examen se tire sur toute la fournée (2026-09-30) : tiré parmi les seuls retenus du modèle en
-- service, il tronquait ses notes et favorisait tout challenger à la promotion. `retained` garde
-- le verdict au moment du tirage, pour le taux de oui des retenus.
ALTER TABLE ballots ADD COLUMN retained INTEGER NOT NULL DEFAULT 0 CHECK (retained IN (0, 1));

-- Plancher de score des nouveautés (docs/conception.md §4) : `floored` marque une nouveauté écartée
-- par le plancher alors que le quota de sa famille n'était pas épuisé et son artiste libre, une
-- par artiste. Le rapport de la fournée les compte.
ALTER TABLE scores ADD COLUMN floored INTEGER NOT NULL DEFAULT 0 CHECK (floored IN (0, 1));

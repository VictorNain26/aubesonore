-- Grille publiée (docs/conception.md §7.3) : les titres que chaque heure écrite va jouer. La grille
-- suivante compte un titre publié mais pas encore joué comme joué à la fin de son heure : à
-- 23:00, l'heure de 23 h n'est pas encore dans l'historique d'AzuraCast.
CREATE TABLE grille (
    hour_start REAL NOT NULL,
    song_id    TEXT NOT NULL,
    PRIMARY KEY (hour_start, song_id)
) STRICT;

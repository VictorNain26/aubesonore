-- The covers table held the kept tracks' copies of the antenna's art, which the pipeline takes
-- from Deezer: the site keeps none of it (migration 0024 clears the tracks' addresses, and the
-- kept-cover pass gives them their record's cover from the Cover Art Archive).
-- Idempotent: a database without the table passes.
DROP TABLE IF EXISTS covers;

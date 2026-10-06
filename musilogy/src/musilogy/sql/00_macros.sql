-- The types whose MusicBrainz begin is a formation. A person's is a birth; for
-- an artist without a type, a character or an "other", it is either, and
-- nothing in the dump tells which (2026-10-06: among those with a begin and a
-- first album, 10 % sit 15 years or more before the album; Adolf Brunner,
-- 1901, beside Plague Bearer, 1992).
CREATE OR REPLACE MACRO formed(type) AS coalesce(type IN ('Group', 'Orchestra', 'Choir'), false);
-- Never NULL: an artist without a type is not a person, and a NULL here would
-- spread through the date rules (see birth_below_min_year, 10_bands.sql).
CREATE OR REPLACE MACRO person(type) AS coalesce(type = 'Person', false);

CREATE OR REPLACE MACRO yr(s) AS
  CASE WHEN regexp_full_match(substr(s, 1, 4), '[0-9]{4}')
       THEN CAST(substr(s, 1, 4) AS INTEGER) END;

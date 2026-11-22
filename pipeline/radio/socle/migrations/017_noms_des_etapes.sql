-- Les étapes prennent les noms du vocabulaire (docs/conception.md, « Vocabulaire ») : les
-- rapports déjà écrits aussi, pour que `radio rapport` ne montre qu'un nom par étape et que
-- `radio bilan` les reconnaisse.
UPDATE stage_reports SET stage = CASE stage
    WHEN 'library-sync' THEN 'bibliotheque'
    WHEN 'discover' THEN 'decouverte'
    WHEN 'negatives-sync' THEN 'negatifs'
    WHEN 'signals' THEN 'empreintes'
    WHEN 'train' THEN 'gout'
    WHEN 'votes-select' THEN 'tirage'
    WHEN 'acquire' THEN 'telechargement'
    WHEN 'check' THEN 'bilan'
    WHEN 'backup' THEN 'sauvegarde'
    WHEN 'report' THEN 'rapport'
    WHEN 'alert' THEN 'alerte'
END
WHERE stage IN ('library-sync', 'discover', 'negatives-sync', 'signals', 'train', 'votes-select',
                'acquire', 'check', 'backup', 'report', 'alert');

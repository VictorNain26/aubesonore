# Consigne des juges du banc d'évaluation

Le banc (`src/musilogy/bench.py`) donne ce texte à chaque juge, tel quel. Une version du banc
épingle son empreinte : le modifier ouvre une nouvelle version du banc, car des verdicts donnés
sous deux consignes ne se mélangent pas.

---

Tu évalues, pour une encyclopédie de la musique, si des artistes candidats ont **le même son** qu'un
artiste de référence. Le jugement s'appuie sur ce que des sources qui décrivent la musique en disent,
jamais sur ta mémoire seule ni sur la popularité.

## Ce que tu reçois

Un fichier JSON : `ref`, l'artiste de référence, et `candidates`, les artistes à juger. Chacun a un
`mbid`, un nom, parfois une désambiguïsation, un type, des années, un pays, et `urls`, les pages que
MusicBrainz lui relie, sa page MusicBrainz en premier. L'ordre des candidats ne veut rien dire.

Un candidat dont le `mbid` commence par `lastfm:` ou `deezer:` n'a pas d'identifiant MusicBrainz :
seuls son nom et sa page Last.fm ou Deezer sont connus. Identifie-le par cette page et par le
contexte de la référence. Si plusieurs artistes portent ce nom et que rien ne dit lequel est visé,
le verdict est `inconnu`.

## Méthode

1. **Décris d'abord la référence** à partir d'au moins deux sources que tu as lues, citées par leur
   URL : critiques, articles, encyclopédies, biographies, page Bandcamp (présentation, tags), page de
   label. Vérifie que la source parle bien de cet artiste (même pays, mêmes années, même
   désambiguïsation) : les homonymes sont fréquents. Écris trois ou quatre phrases sur ces quatre
   points :
   - **le courant précis** : le sous-genre, pas la grande famille (« French house filtrée », pas
     « électronique ») ;
   - **l'époque** où il a fait l'essentiel de sa musique ;
   - **l'instrumentation et la production** ;
   - **l'ambiance**.
2. **Pour chaque candidat**, trouve au moins une source qui décrit sa musique. Décris son son en une
   ou deux phrases sur les mêmes quatre points, puis juge-le **contre la description de la
   référence**, point par point.
3. **Ignore tout ce qui n'est pas le son.** Un label commun, une collaboration, un membre partagé,
   une ville commune ou une influence citée ne rendent pas deux sons proches. Note ce lien à part
   dans `lien` : il ne relève jamais le verdict.
4. **Un candidat qui est la référence elle-même**, sous une autre graphie ou créditée avec un invité,
   n'apprend rien à qui la connaît : verdict `lointain`, et `lien` le dit. Un projet parallèle d'un
   membre est un autre artiste, jugé sur son son.

## Outils

Tu as la recherche web (WebSearch) et la lecture de pages (WebFetch). Commence par les URL fournies,
puis :

- la page MusicBrainz de l'artiste, qui liste ses autres liens (site, label, critiques) ;
- Wikipedia dans la langue du pays de l'artiste, puis en anglais ;
- Bandcamp (`https://bandcamp.com/search?q=<nom>&item_type=b`) : présentation, tags, notes des
  disques ;
- les critiques et pages de labels que ces pages citent ; une recherche web
  `"<nom>" <courant ou disque> review` quand rien de cela ne suffit.

Discogs répond souvent 403 : n'insiste pas. Si un site limite tes requêtes, passe à un autre. Un
candidat qu'aucune source ne décrit est `inconnu` : ne le descends jamais en `lointain` faute de
source.

## Verdicts (`son`)

- `meme_son` : même courant précis et même couleur ; un auditeur qui aime l'un reconnaîtrait la même
  musique (même sous-genre, époque proche, instrumentation et ambiance semblables).
- `parente` : même famille, avec une différence nette (sous-genre voisin, autre époque, autre
  couleur) ; une recommandation défendable, pas un sosie.
- `lointain` : seulement une grande famille commune (« rock », « électronique », « jazz »).
- `etranger` : musique sans rapport.
- `inconnu` : aucune source ne décrit la musique de ce candidat, ou impossible de savoir quel artiste
  c'est.

Sois exigeant : `meme_son` est réservé aux cas nets. Dans le doute entre deux verdicts, prends le
plus bas.

## Appui (`appui`)

- `texte` : au moins une source rédigée décrit la musique (critique, article, biographie,
  présentation Bandcamp, encyclopédie).
- `tags` : seules des étiquettes la décrivent (styles Discogs, tags Bandcamp ou Last.fm).
- `aucun` : rien (va avec `inconnu`).

Tout verdict autre qu'`inconnu` cite au moins une source lue, par son URL complète : un verdict sans
source est refusé et redonné à juger.

## Sortie

Écris un seul fichier JSON, UTF-8, au chemin indiqué, de cette forme exacte :

```json
{
  "ref_mbid": "…",
  "ref": "nom",
  "ref_description": "trois ou quatre phrases",
  "ref_sources": ["https://…", "https://…"],
  "verdicts": [
    {"mbid": "…", "name": "…", "description": "une ou deux phrases sur son son",
     "son": "meme_son|parente|lointain|etranger|inconnu", "appui": "texte|tags|aucun",
     "lien": null, "raison": "une phrase qui compare au son de la référence",
     "sources": ["https://…"]}
  ]
}
```

Un verdict par candidat, tous les candidats, le `mbid` recopié tel quel. Écris en français.

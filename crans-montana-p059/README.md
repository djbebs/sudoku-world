# Crans-Montana Pixel Atlas · P0.5.9

## Version publiée dans le dépôt

**Aperçu 3D :** https://djbebs.github.io/sudoku-world/crans-montana-p059/?v=1

**Ancienne P0.5.8 préservée :** https://djbebs.github.io/sudoku-world/crans-montana-p058/?v=1

La P0.5.9 réalise la prochaine étape sans fond photographique ni géométries reconstituées depuis les captures d'écran. Elle interroge directement les couches cadastrales officielles du Valais à chaque ouverture de la page et construit uniquement les objets géographiques effectivement renvoyés par le service. Les zones non disponibles restent sans détail, plutôt que de recevoir un chemin ou un aménagement inventé.

## Emprise

- Place Ycoor, Crans-Montana, Valais.
- Origine LV95 (EPSG:2056) : **E=2'603'036, N=1'128'849**.
- Limites : **E=2'602'986 à 2'603'086 ; N=1'128'799 à 1'128'899**.
- Carré pilote : **100 × 100 mètres**.
- Axes locaux Three.js : `x = E - 2'603'036`, `z = 1'128'849 - N`. Il n'y a pas de calcul d'angle à partir d'une capture photographique.

## Source géométrique et traçabilité

| Layer | Donnée officielle | Géométries utilisées |
| --- | --- | --- |
| **270** | Mensuration officielle, couverture du sol | Routes/chemins (6), trottoirs (7), bassins (11), revêtements durs (12), champs (13/14), jardins (17), espaces verts (19), eau stagnante (20), cours d'eau (21), sable (29), sol sans végétation (31) |
| **180** | Objets divers linéaires | Escalier important (4), pont/passerelle (6), sentier (26) |
| **190** | Objets divers surfaciques | Escalier important (4), pont/passerelle (6), quai (7), fontaine (8), sentier surfacique (26) |
| **260** | Couverture du sol, bâtiments cadastraux | Contrôle de présence et d'attributs, sans créer de volumes de bâtiments artificiels |

Documentation ArcGIS publique :
- [Service MO du Valais](https://sit.vs.ch/arcgis/rest/services/MO/MapServer)
- [Couche 270](https://sit.vs.ch/arcgis/rest/services/MO/MapServer/270)
- [Couche 180](https://sit.vs.ch/arcgis/rest/services/MO/MapServer/180)
- [Couche 190](https://sit.vs.ch/arcgis/rest/services/MO/MapServer/190)
- [Couche 260](https://sit.vs.ch/arcgis/rest/services/MO/MapServer/260)
- [VSGIS Crans-Montana](https://map.vsgis.ch/cransmontana/?lang=fr)

**Attention :** VSGIS est un excellent visualiseur officiel, mais ses téléchargements GeoPackage peuvent nécessiter un compte. Cette version n'utilise pas d'export VSGIS non vérifié : elle se connecte aux services publics du canton.

Pour chaque objet accepté, la page conserve `OBJECTID`, `GID`, `GENRE`, le code de couche et une URL de requête officielle. Un panneau « Résultats cadastraux par couche » détaille les catégories, les nombres reçus et les identifiants.

## Rendu 3D 100 % pixel-art

- Toitures et volumes de bâtiments en 3D : swissBUILDINGS3D (swisstopo).
- Végétation 3D : service officiel swisstopo.
- Sol : matériaux low-poly par catégorie cadastrale, sans photographie ni raster.
- Polygones : triangulation des contours originaux, prise en charge des trous et îlots, découpage géométrique précis au bord des 100 mètres, subdivision des triangles **à l'intérieur uniquement** pour suivre le relief.
- Sentiers / escaliers / passerelles : lignes des coordonnées cadastrales exactes en X/Z, avec une **largeur symbolique** (non mesurée) pour la visibilité.
- Relief : neuf altitudes échantillonnées auprès du service officiel swisstopo ; la surface entre les échantillons est interpolée. Le rendu altimétrique complet n'est donc **pas un relevé de terrain de précision**.
- Aucun véhicule, équipement de jeu ou autre décor n'est posé sans coordonnées de source.
- Le moteur n'utilise pas le GeoJSON supprimé de P0.5.7 et n'utilise jamais la photographie de P0.5.6.

## Conditions d'acceptation et limites

1. **Un retour valide et vide** du service ArcGIS signifie qu'aucun objet de cette couche ne touche le carré. Il est affiché comme zéro confirmé.
2. **Une requête refusée, interrompue, bloquée par CORS ou invalide** est indiquée « Indisponible ». Elle ne devient jamais un résultat « zéro ».
3. Les résultats tronqués (`exceededTransferLimit`, limite atteinte) sont refusés plutôt que déclarés complets.
4. Le contenu de la mensuration officielle est **officiel**, mais notre interface navigateur n'est pas un **extrait cadastral certifié et signé**, et les choix de style/largeur/relief n'ont pas valeur juridique.
5. Une géométrie officiellement absente ou non obtenue ne sera pas reconstituée d'après une capture.

## Tests effectués

- Les trois nouveaux fichiers `index.html`, `mo-valais-strict.js` et `cadastre-mesh.js` sont présents sur GitHub et ont été relus.
- Validation syntaxique JavaScript des trois fichiers.
- Tests de conversion LV95 : grandes surfaces englobant le carré, segments passant par la zone avec sommets hors du carré, identification de `OBJECTID` et du code `GENRE`.
- Tests géométriques : découpe des triangles à `x=±50`, trous de polygones et îlots, triangulation et suivi de l'altitude sur un maillage de test.
- Conservation de la version P0.5.8 et du jeu Sudoku World.

## Ce qui n'est PAS encore validé

L'environnement de travail ne peut pas obtenir les réponses JSON **réelles** de l'API ArcGIS pour Ycoor. Nous n'avons donc **aucun nombre de sentiers, trottoirs, jardins ou surfaces d'eau confirmé pour cette emprise** à cet instant. Le lecteur de la page P0.5.9 tentera lui-même les requêtes en ouvrant le site et présentera leur résultat ou la cause d'échec.

La propagation de GitHub Pages, le rendu des véritables objets de Ycoor et le comportement Chrome Android ne sont pas encore vérifiés en conditions réelles.

**Ne pas annoncer « P0 validé » tant que les objets précis ne sont pas reçus et confrontés au jeu de données cadastral officiel.**

# Crans-Montana Pixel Atlas · P0.5.8 — sources cadastrales officielles

## Ouvrir

https://djbebs.github.io/sudoku-world/crans-montana-p058/?v=1

Cette version est la **seule version active** de la série P0.5 à utiliser pour l'exigence « aucun tracé issu des captures utilisateur ». L'ancienne P0.5.7 redirige vers elle. Les traces provisoires ont été retirées de la branche active du dépôt.

## Sources utilisées dans la scène

| Élément | Fournisseur et source | Statut |
| --- | --- | --- |
| Routes/chemins (polygones), trottoirs, jardins et zones d'eau | **État du Valais**, mensuration officielle, couche ArcGIS 270 *Couverture du sol surfaces*, EPSG:2056 | Officiel, vectoriel, géométrie retournée par la source sans nouveau relevé |
| Sentiers (lignes) | **État du Valais**, mensuration officielle, couche ArcGIS 180 *Objets divers élément linéaire*, catégorie `GENRE=26` | Officiel, vectoriel |
| Bâtiments et toitures 3D | swisstopo swissBUILDINGS3D, 3D Tiles | Officiel |
| Végétation 3D | swisstopo vegetation 3D, 3D Tiles | Officiel |
| Relief | swisstopo service d'altitude, grille de neuf points interpolés | Officiel aux points échantillonnés ; l'interpolation visuelle n'est pas un MNT pleine résolution |

### API cadastrale

- Service : https://sit.vs.ch/arcgis/rest/services/MO/MapServer
- Couche 270 : https://sit.vs.ch/arcgis/rest/services/MO/MapServer/270
- Couche 180 : https://sit.vs.ch/arcgis/rest/services/MO/MapServer/180
- Centre Ycoor : LV95 E=2'603'036, N=1'128'849.
- Emprise étudiée : [2'602'986, 1'128'799, 2'603'086, 1'128'899], carré **100 × 100 m**.
- Lecture : ArcGIS REST /query avec enveloppe EPSG:2056, `outSR=2056`, `f=json`. Seuls les objets qui recoupent l'emprise sont retenus. Données stockées dans la session du navigateur, non reproduites manuellement.
- Champs conservés en mémoire : `OBJECTID`, `GID`, `GENRE`, `GENRE_FR`, avec couche d'origine et date d'interrogation.
- Catégories 270 : 6 route/chemin, 7 trottoir, 11 bassin, 12 autre revêtement dur, 17 jardin, 19 autre surface verte, 20 eau stagnante.
- Catégorie 180 : 26 sentier uniquement. Les autres « objets divers » ne sont pas transformés en chemins.

Les polygones multi-anneaux qui ne pourraient pas être triangulés sans modifier leur topologie ne sont pas remplis. Une géométrie absente n'est pas fabriquée.

## Exigences de qualité

- **Aucune coordonnée, aucune largeur de sentier et aucune surface créées en se basant sur les captures d'écran utilisateur.**
- Les surfaces cadastrales sont stylisées (matériaux et couleurs), sans recalcul de leur tracé.
- La ligne « sentier » a une largeur d'affichage conventionnelle de 1,3 m dans le moteur 3D : **ce n'est pas une largeur mesurée**. Les coordonnées des sommets restent celles de la source officielle.
- Aucune voiture, personnage, équipement du jardin, route ou arbre OSM inventé n'est inséré.
- Si une requête échoue, l'objet concerné ne sera pas dessiné. Le message affiche l'absence de données, sans substitution non officielle.

### Important : certification juridique

La mensuration officielle fournit un cadre géographique officiel, mais cette page web **n'est pas un extrait certifié**. Les rendus Three.js, couleurs, hauteurs interpolées, et largeur symbolique des lignes ne doivent pas être considérés comme un relevé topographique certifié.

Pour obtenir un document probant ou signé, demander un extrait de mensuration officielle auprès de la géoinformation/cadastre du canton du Valais ou d'un ingénieur géomètre habilité : https://geo.vs.ch/mensuration-officielle

## Vérifications effectuées

- L'analyse syntaxique du code JS a réussi.
- Les catégories 270 (exemple `GENRE=7`) et 180 (`GENRE=26`) ont été testées sur des géométries de test en LV95 ; calcul des offsets exact et rejet des autres catégories de chemins vérifiés.
- Le code de chargement OSM et le générateur de jeux ont été supprimés de P0.5.8.
- La référence à `ycoor-traced-features.geojson` a été supprimée.
- P0.5.7 est maintenant une page de retrait/redirection ; son GeoJSON a été supprimé de la branche courante (les anciens commits restent dans l'historique Git).

## Contrôles qui restent nécessaires

- **Les réponses réelles de l'API cadastrale n'ont pas pu être obtenues dans l'environnement de préparation.** Le nombre et l'emplacement exact des objets renvoyés sur Ycoor restent à vérifier depuis le navigateur.
- Chargement CORS et rendu Chrome Android / GPU non validés.
- Les couches cadastrales peuvent être incomplètes ou ne pas contenir les petits chemins du jardin. Ne pas interpréter une absence d'objet comme absence physique.
- Pour une validation « certifiée » au sens juridique, fournir un document cantonal authentifié et vérifier la correspondance de la géométrie à cet extrait.
- Pour un MNT certifié plus détaillé que neuf échantillons, importer une donnée altimétrique officielle appropriée, avec sa résolution et son millésime.

## Références

- © État du Valais, mensuration officielle.
- © swisstopo (modèles swissBUILDINGS3D, végétation et altimétrie).
- Trois.js (MIT), 3d-tiles-renderer (Apache-2.0), Pixelify Sans (SIL OFL).

Les versions antérieures de la maquette restent dans des répertoires séparés pour archive, mais ne satisfont pas cette nouvelle règle d'usage exclusif de données officielles cadastrales.

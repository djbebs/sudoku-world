# Crans-Montana Pixel Atlas · P0.6

## Aperçu

**Atlas 3D P0.6 :** https://djbebs.github.io/sudoku-world/crans-montana-p06/?v=1

P0.6 est une nouvelle préversion indépendante de P0.5.9, de P0.5.8 et de Sudoku World.

## Fonctionnalités P0.6

- Sol, chemins et jardins : uniquement les coordonnées vectorielles des couches de **mensuration officielle du Valais** (270, 180, 190). Couche 260 chargée pour contrôle des bâtiments.
- Bâtiments 3D et arbres : **swissBUILDINGS3D et végétation 3D swisstopo** comme dans la version précédente.
- **Nouveauté : mobilier urbain en pixel-art**, chargé depuis **OpenStreetMap** en direct, seulement lorsque la géométrie OSM fournit une position ou un contour exploitable.
- Bouton **« 🪑 Mobilier : ON/OFF »** dans la carte. Il affiche/cache uniquement le mobilier, sans masquer les surfaces cadastrales.
- Section dépliante **« Mobilier OSM »** : catégorie, nombre de données référencées, date source OSM quand fournie, erreur serveur si inaccessible, bouton Actualiser.
- Chaque petit objet 3D possède un identifiant **OSM `node/id`**, nom si fourni, lien vers sa fiche OSM, type et source. Un clic/toucher affiche les détails.
- Les **aires de jeux** cartographiées en polygone sont délimitées sur les contours OSM. Aucune balançoire, structure ou toboggan n'est placé sans point d'équipement `playground=...`.
- Si OpenStreetMap répond avec **zéro équipement**, le résultat affiché est « zéro référencé », pas « aucun mobilier réel ». Si la requête échoue, l'état est **indisponible** et aucun objet n'est inventé.
- Aucune photographie affichée, aucun tracé déduit des captures utilisateur, aucune position procédurale aléatoire.

## Catégories d'objets et tags OSM

| Objet 3D simplifié | Tag source OpenStreetMap |
| --- | --- |
| Banc | `amenity=bench` |
| Aire de jeux, panneau ou contour | `leisure=playground` (nœud ou contour fermé géoréférencé) |
| Toboggan | `playground=slide` |
| Balançoire | `playground=swing` |
| Structure à grimper | `playground=climbingframe`, `climbing_frame`, `climbingwall` ou `climbing_wall` |
| Poubelle | `amenity=waste_basket` |
| Lampadaire | `highway=street_lamp` |
| Arrêt de bus | `highway=bus_stop` ou `public_transport=platform + bus=yes` |
| Table de pique-nique | `leisure=picnic_table` |
| Fontaine | `amenity=fountain` |
| Point d'eau potable | `amenity=drinking_water` |
| Stationnement vélo | `amenity=bicycle_parking` |
| Borne | `barrier=bollard` |

**Sécurité de provenance :** les catégories sont inférées uniquement depuis les tags d'objets réels. Seuls les nœuds OSM peuvent entraîner la création d'un équipement ou d'un modèle ponctuel. Les voies `leisure=playground` ne servent qu'à dessiner leur véritable périmètre ; leur centre n'est jamais utilisé pour placer un jouet fictif. Les objets de type `access=private`, désaffectés ou détruits sont ignorés.

**Géométrie et précision :** le centre LV95 est **E 2'603'036, N 1'128'849**. La conversion WGS84→LV95 locale s'appuie sur un jacobien calculé par PROJ au centre. Vérification numérique avec PROJ des quatre coins du carré : erreur maximale inférieure à **1 mm** pour cette *transformation*, ce qui ne dit rien de la précision terrain du relevé OSM. Les coordonnées cadastrales sont directement lues en LV95, sans transformation écran.

Les objets pixel-art sont des **symboles 3D**. Leur présence et leur position sont appuyées par la source OSM, mais leurs dimensions, couleurs, orientation et forme peuvent ne pas correspondre au mobilier physique. Le choix de modèle n'est pas une prétention de relevé détaillé.

## Fichiers

- `index.html` : moteur Three.js, panneaux de sources et interrupteur de mobilier.
- `mo-valais-strict.js` : adaptateur des couches cadastrales officielles du Valais, copie figée de P0.5.9.
- `cadastre-mesh.js` : maillage des surfaces cadastrales avec trous et limites, copie figée de P0.5.9.
- `furniture-source.js` : requête Overpass, parsing strict, filtrage sur les 100 m et métadonnées OSM.
- `furniture-mesh.js` : modèles low-poly au point OSM, sans géométrie fictive de terrain.

## Adresses des services

- Mensuration officielle : https://sit.vs.ch/arcgis/rest/services/MO/MapServer
- Overpass OSM suisse : https://overpass.osm.ch/api/interpreter
- Serveur alternatif : https://overpass.kumi.systems/api/interpreter
- Serveur alternatif : https://overpass-api.de/api/interpreter
- Attribution : © OpenStreetMap contributors, Open Database License (ODbL), https://www.openstreetmap.org/copyright
- © État du Valais, © swisstopo pour les données officielles.

## Vérifications terminées

- Les fichiers de P0.6 existent sur le dépôt GitHub et leur code est valide syntaxiquement.
- Test en environnement simulé : l'objet `amenity=bench` produit un banc low-poly interactif avec l'identifiant OSM correct.
- Test de parsing : un nœud de balançoire, un banc et un polygone fermé `leisure=playground` sont acceptés. Un objet privé et un objet hors emprise sont exclus.
- Vérification PROJ du centrage : transformation numérique locale correcte aux quatre coins à moins de 1 mm d'erreur de calcul.
- Les quatre sources cadastrales, les toitures et la végétation sont conservées sans modification de P0.5.9.

## Ce qui n'a pas encore été vérifié

- L'accès réel à l'API Overpass OSM depuis un navigateur connecté, son CORS et le contenu précis d'Ycoor n'ont pas été validés dans l'environnement de préparation.
- Le nombre de bancs, de jeux et de lampadaires effectivement **référencés** à Ycoor reste inconnu à ce stade.
- Le rendu réel sous Chrome Android, la propagation GitHub Pages et la superposition avec les bâtiments n'ont pas encore pu être inspectés visuellement.
- Des inventaires officiels communaux plus détaillés, s'ils sont publiés avec des coordonnées et une licence d'accès, pourront remplacer ou compléter ponctuellement OSM.

L'absence de tags OSM ne signifie pas absence physique de mobilier. La découverte de données incomplètes n'autorise jamais à générer des objets non localisés.

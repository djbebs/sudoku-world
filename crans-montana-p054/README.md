# Crans-Montana Pixel Atlas · P0.5.4

Preview géographique indépendante, surface 100 × 100 m autour d'Ycoor. Ne modifie pas Sudoku World ni les précédents atlas P0.4/P0.5.3.

## Voir

https://djbebs.github.io/sudoku-world/crans-montana-p054/?v=1

## Objectifs réalisés dans le code

- **Vrais bâtiments** : conservés depuis swissBUILDINGS3D en 3D Tiles, via Three.js avec GLTFLoader/DRACOLoader (comme P0.5.3).
- **Arbres OSM** : positions issues uniquement des nœuds `natural=tree`. Types d'arbres `leaf_type` respectés lorsqu'ils sont renseignés, formes low-poly illustratives.
- **Végétation officielle** : source `ch.swisstopo.vegetation.3d/v1/20250728`, indépendante, découpe de rendu à ±50 m, de basse précision adaptée au mobile, bouton « 🌲 Végétation 3D » pour masquer/recharger. Si elle ne fonctionne pas, les arbres OSM restent visibles (s'ils sont cartographiés).
- **Chemins et routes** : coordonnées OSM `highway=*`, largeur `width=*` lorsqu'elle existe, largeur par défaut approximative sinon. Segments subdivisés tous les ~2 m et appliqués au relief swisstopo échantillonné. Aucun chemin de démonstration inventé.
- **Étang** : surface uniquement lorsque la parcelle `natural=water` est fournie par OSM. Les polygones sont découpés dans les limites de la zone pilote.
- **Jardin d'enfants / aire de jeux** : contour et marqueur seulement à partir des points ou polygones OSM `leisure=playground`. Équipements séparés `playground=slide/swing/climbingframe` uniquement lorsque leur position est renseignée par OSM. Les maquettes d'équipements sont des **symboles à dimensions, orientation et couleurs illustratives**, jamais des répliques fidèles.
- **Animations simulées** : voitures sur segments de voirie OSM sûrs, piétons sur segments OSM piétons sûrs. Sans segment admissible, l'objet n'est pas affiché. Aucune position GPS en direct.
- **État des données** : compteur visible des arbres, chemins, aires de jeux et équipements provenant d'OSM. Si les données sont manquantes, les objets correspondants restent absents.

## Sources et références

- © swisstopo : https://docs.geo.admin.ch/visualize-data/3d-tiles.html
- © OpenStreetMap contributors (ODbL) : https://www.openstreetmap.org/copyright
- Jardin d'Ycoor, informations et photographies : https://www.crans-montana.ch/fr/jardins_ycoor
- Aire de jeux Ycoor : https://www.crans-montana.ch/fr/?idcmt=Partenaire_Activite_4ff811345b2094222f969b680bb9ac78
- Three.js, licence MIT ; 3d-tiles-renderer, Apache 2.0 ; Pixelify Sans, SIL OFL.

## Tests effectués

- Analyse syntaxique du JavaScript : réussie.
- Tests géométriques locaux : découpe polygonale aux limites 100 × 100 m, point dans un polygone, distance point-mur : réussis.
- Contrôle statique : absence de génération d'arbres aléatoires, de routes de démonstration, de trajectoires préprogrammées pour piéton et voiture : confirmé.
- Présence des connecteurs OSM et 3D Tiles dans le code GitHub : confirmée.

## Tests restant à faire

- **Aucune validation de rendu visuel dans Chrome Android n'a encore été effectuée pour P0.5.4.**
- Le nombre d'arbres OSM, de chemins et de jeux réellement présents à Ycoor dépend des objets actuellement cartographiés et accessibles via Overpass. **Il n'a pas été mesuré** depuis l'environnement de préparation.
- Valider l'alignement des modèles de végétation swisstopo, l'absence de décalage vertical, les performances sur mobile, et l'absence de doublons.
- Si OSM ne décrit pas la parcelle de jeux et ses installations, ne pas inventer leur emplacement. Il faudra un relevé terrain, de l'orthophoto géoréférencée ou un modèle local vérifié.
- Les modèles 3D et les données géographiques sont téléchargés par le navigateur (connexion requise), le projet n'est pas encore autonome/offline.

## Condition de sortie P0

Comparaison à une vue aérienne et à des photos locales : bâtiments, terrain, cheminement, arbres, étang et aire de jeux doivent se trouver au bon endroit à une tolérance explicitement définie. Ensuite seulement étendre vers P1 (250 × 250 m).

# Crans-Montana Pixel Atlas P0.5.1 — préversion expérimentale

Objectif : afficher les **véritables toitures** d'Ycoor dans **la même scène Three.js** que la végétation, les routes, les personnages et les voitures, en conservant la navigation isométrique rétro inspirée de bb.jest.pro.

## URL et isolation

- Préversion : https://djbebs.github.io/sudoku-world/crans-montana-p05/
- P0.4 maintenu : https://djbebs.github.io/sudoku-world/crans-montana-p0/
- Le site Sudoku n'est pas modifié. P0.5 se trouve dans un dossier distinct.

## Technique

- Surface pilote : **100 × 100 mètres**, centrée à 46.311036 N, 7.478052 E (secteur Ycoor).
- Une scène et un seul contexte WebGL : Three.js **0.180.0**.
- Affichage des bâtiments authentiques à partir de l'API **3D Tiles** swisstopo (swissBUILDINGS3D) via `3d-tiles-renderer@0.4.28` (Apache-2.0).
- Transformations des coordonnées géocentriques ECEF vers un repère local Est/Haut/Sud. Altitude de référence **provisoire : 1515 m**. Les formes géométriques de toiture ne sont pas reconstruites arbitrairement, elles proviennent du flux 3D.
- Découpe d'affichage à ±50 mètres par quatre plans ; couleur des façades et toits interprétée par la normale des triangles, et effet pixelisé.
- Mode de secours : bâtiments approximatifs extrudés depuis les empreintes OSM si les tuiles officielles ne chargent pas.
- Sol et relief local échantillonnés depuis swisstopo à neuf points, routes et chemins obtenus depuis OSM. Arbres, voiture et piétons toujours simulés.

## Correctifs P0.5.1 après vidéo utilisateur (14 novembre 2026)

La vidéo du test de P0.5 montre le fallback OSM et un message « chargement d’une tuile impossible ». Les modèles officiels n'étaient pas affichés dans le moteur Three.js.

- Deux révisions officielles de swissBUILDINGS3D essayées en séquence : 20260520 puis 20251121. Chaque tentative expire si aucune géométrie n'est reçue.
- Les erreurs retournées par `3d-tiles-renderer` exposent leur message et la fin de l'URL de la tuile pour diagnostic sur Android.
- Alignement vertical recalculé selon l'altitude centrale échantillonnée par l'API swisstopo, plutôt que figé à 1515 m.
- Si le chargeur échoue toujours, le bouton d'erreur ouvre P0.4 (version Cesium ayant déjà montré les vraies toitures sur le téléphone).
- La validation d'affichage Three.js des bâtiments reste **non réalisée**. Le chargement des sources officielles et leur rendu ne doivent pas être annoncés comme réussis sans un contrôle visuel effectif.

## Ce que P0.5 **n'est pas** encore

- Pas de conversion ou de téléchargement hors ligne du modèle 3D vers des fichiers GLB autonomes. Les maillages sont décodés et rendus **en direct dans Three.js** depuis le service swisstopo.
- Pas de validation visuelle ni de mesure FPS sur l'Android de l'utilisateur. Le fonctionnement de l'import ESM, du rendu des tuiles et de la superposition géographique reste à confirmer sur un vrai navigateur.
- L'altitude de référence, le contraste de toiture, la taille des bâtiments aux bords de la zone et les performances pourront nécessiter des ajustements.
- Les informations GPS bus, affluence et remontées en temps réel ne font pas partie de P0.5.

## Contrôles de recette avant publication dans P0 principal

1. Confirmer que les véritables bâtiments se chargent sans écran noir dans Chrome Android.
2. Comparer le grand bâtiment d'Ycoor avec P0.4 et vérifier son orientation, ses dimensions et ses véritables toits.
3. Confirmer l'absence de doubles bâtiments quand les données OSM arrivent après le flux swisstopo.
4. Vérifier les animations des arbres/piétons/voitures, les saisons, l'heure du soleil, la navigation tactile et le bouton 3D / OSM.
5. Mesurer les images par seconde et la consommation mémoire, et réduire le chargement 3D sur téléphone si nécessaire.

## Sources / crédits

- © swisstopo : https://docs.geo.admin.ch/visualize-data/3d-tiles.html
- © OpenStreetMap contributors (ODbL) : https://www.openstreetmap.org/copyright
- Three.js : MIT ; 3d-tiles-renderer : Apache 2.0 ; Pixelify Sans : SIL OFL.

# Crans-Montana Live Pixel Atlas — P0.1 (Ycoor)

Prototype technique autonome dans `crans-montana-p0/index.html`. Aucune modification du Sudoku ou de l'atlas V5.

## Portée

- Emprise : 100 × 100 m, centrée vers 46.31220 N / 7.48060 E, autour d'Ycoor. Position approximative de cadrage, pas géoréférencement cadastral certifié.
- Moteur Three.js : caméra orthographique à orientation isométrique, panoramique tactile, pincement, rotation et zoom.
- Rendu : maillage de terrain facetté, bâtiments simplifiés, arbres polygonaux, basse résolution pixelisée, typographie Pixelify Sans, panneaux rétro.
- Horloge : réglage date/heure, avance temporelle, orientation solaire calculée, modes studio et saisons.
- Animation : une voiture et un piéton procéduraux, **simulation non temps réel**.
- Géodonnées : requêtes navigateur Overpass (© OpenStreetMap contributors) pour empreintes de bâtiments et voirie ; 9 points d'altitude swisstopo pour un relief interpolé. Les hauteurs des bâtiments peuvent être estimées à partir des attributs OSM ou, à défaut, générées.
- Retours de secours : scène immédiatement visible même si les services externes sont inaccessibles. Les bâtiments et reliefs de secours sont **fictifs** et indiqués comme tels dans l'interface.

## Critères de validation avant P1

1. Affichage Chrome Android et ordinateur confirmé sur les appareils réels.
2. Vérifier visuellement style isométrique pixel / références bb.jest.pro.
3. Tester déplacements, rotation, zoom, pincement, date/heure/saisons et capture.
4. Vérifier les messages de source, la disponibilité des APIs externes et la précision des géodonnées utilisées.
5. Mesurer la fluidité sur le téléphone : cible ~30 images/seconde, non vérifiée pour le moment.

## Limites P0

- Aucune vitesse ou position GPS de transport n'est utilisée.
- Pas encore de modélisation fidèle des abris SMC et des landmarks architecturaux.
- L'imagerie de remplacement n'est pas une carte cadastrale et peut ne pas correspondre aux bâtiments du quartier.
- Les bâtiments issus d'OSM utilisent des toitures plates simplifiées pour le moment.

## Sources

- © OpenStreetMap contributors, Open Database License : https://www.openstreetmap.org/copyright
- © swisstopo, service d'altitude : https://docs.geo.admin.ch/access-data/get-point-height.html
- Three.js (MIT) : https://threejs.org/
- Pixelify Sans (SIL Open Font License).

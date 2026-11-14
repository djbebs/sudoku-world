# Crans-Montana Pixel Atlas · P0.5.5

Preview **indépendante** : https://djbebs.github.io/sudoku-world/crans-montana-p055/?v=1

Le périmètre reste le carré de 100 × 100 mètres de Ycoor. Cette version corrige le **chemin piéton manquant** après observation de l'utilisateur.

## Causes corrigées

1. **Ordre de rendu** : P0.5.4 dessinait les chemins en premier, puis un polygone vert de l'aire de jeux était ajouté au-dessus. P0.5.5 peint le jardin en premier et les chemins piétons ensuite à une petite hauteur au-dessus du sol.
2. **Relief irrégulier** : les polygones du jardin utilisent dorénavant une altitude par sommet calculée à partir du relief swisstopo, plutôt qu'une hauteur moyenne qui pouvait masquer les chemins dans une pente.
3. **Couleur des chemins** : beige clair, volontairement contrasté sur le vert, dans le style rétro de Bielsko-Biała.
4. **Données manquantes** : en plus de voies `highway=footway/path/pedestrian/steps` provenant d'OSM, l'atlas peut compléter les tracés avec une **requête unique** à l'API d'identification de la couche officielle `ch.swisstopo.swisstlm3d-strassen` dans le carré de 100 × 100 m. Les lignes ne sont retenues que si leurs attributs mentionnent explicitement un usage piéton. Les lignes déjà représentées dans OSM sont ignorées.
5. **Piétons** : animation uniquement sur l'un des chemins géolocalisés par OSM ou swissTLM3D, et masquée lorsqu'aucun tracé n'est connu.

## Provenance des tracés

- OpenStreetMap contributors (ODbL) : https://www.openstreetmap.org/copyright
- swisstopo swissTLM3D - Routes et chemins : https://opendata.swiss/en/dataset/swisstlm3d-strassen-und-wege
- Documentation des requêtes d'identification : https://docs.geo.admin.ch/access-data/identify-features.html

Le code affiche séparément le nombre de chemins provenant d'OSM et de swissTLM3D, ainsi que le statut de la source officielle.

## Validations effectuées

- Analyse syntaxique de JavaScript : réussie.
- Test de transformation LV95 vers coordonnées locales : réussi.
- Test de la reconnaissance d'un objet piétonnier et du rejet d'une autoroute : réussi.
- Vérification de l'ordre de rendu et du drapage du jardin : réussie.
- Le site P0.5.4 et Sudoku World ne sont pas modifiés.

## Limites restant à vérifier

- Le chargement réel et le rendu sur Chrome Android **n'ont pas été vérifiés**.
- Le service REST swisstopo n'était pas directement interrogeable depuis l'environnement de préparation : sa réponse exacte et la présence de chemins dans le périmètre ne sont pas confirmées.
- Les sentiers très petits à l'intérieur du jardin peuvent être absents d'OSM **et** de swissTLM3D. Aucun tracé non vérifié n'a été inventé pour combler ce manque. Il faudra alors une numérisation à partir d'une orthophoto géoréférencée ou un relevé au sol.
- Largeurs par défaut et matériaux restent illustratifs ; les centres des chemins sont géoréférencés quand les sources les contiennent.

## Validation attendue

Comparer les cheminements affichés à une orthophoto de Ycoor, en particulier ceux à côté du Jardin d'enfants Ycoor et du bâtiment près de la Route du Rawyl. Puis seulement étendre vers P1.

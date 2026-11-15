# Crans-Montana Pixel Atlas · P0.6.2

## Aperçu

**Atlas 3D P0.6.2 :** https://djbebs.github.io/sudoku-world/crans-montana-p06/?v=3

P0.6.1 est une correction de P0.6, indépendante de P0.5.9, de P0.5.8 et de Sudoku World.

## P0.6.2 : intégration des cinq modèles photo-approuvés

L'utilisateur a validé la feuille de concepts 3D inspirée des photographies d'Ycoor. Cinq nouveaux objets low-poly construits en Three.js ont été ajoutés directement dans le projet :

1. **Grande structure avec tunnel horizontal argenté** : poteaux jaunes, garde-corps rouges, plateforme bois, prises d'escalade rouges.
2. **Grand toboggan tubulaire courbe** : structure jaune et rouge, tube métallique facetté et sortie foncée.
3. **Petite structure pour enfants** : panneaux bleus, poteaux jaunes et petit toboggan rouge.
4. **Jeux de cordes et boules d'escalade** : portique jaune, réseau de cordes, jonctions rouges et boules foncées.
5. **Banc en bois** : modèle graphique validé, **présence précise dans la zone non démontrée**.

**Source documentaire principale** : [Aire de jeux à Ycoor, galerie officielle Crans-Montana](https://www.crans-montana.ch/fr/?idcmt=Partenaire_Activite_4ff811345b2094222f969b680bb9ac78). Les modèles sont des **reconstitutions illustratives approuvées**, pas des photocopies géométriques ni un inventaire de mobilier 2026 vérifié objet par objet. Les modèles 3, 4 et 5 peuvent encore nécessiter des photographies locales récentes pour valider leurs détails ou présence.

**Positionnement** : aucune coordonnée de mobilier n'est prétendue mesurée. Le moteur recherche d'abord un polygone géoréférencé `leisure=playground` provenant d'OpenStreetMap. Il propose des positions déterministes d'après la forme de ce polygone et s'assure que **la totalité de l'emprise de chacun des objets est à l'intérieur**. Il ne dessine aucun objet photo si le polygone n'est pas présent. Si la zone est trop petite pour les cinq, seuls les modèles qui y tiennent sont affichés. Les équipements individuels déjà localisés en OSM ont priorité et ne sont pas dupliqués.

**Interrupteur indépendant** : le nouveau bouton **« 🛝 Jeux photo : ON/OFF »** permet d'afficher ou masquer uniquement les cinq modèles illustratifs. Le bouton « 🪑 Mobilier : ON/OFF » continue de gérer la couche OSM. Les contours cadastraux et toitures swisstopo ne sont pas affectés.

**Contournage visible** : la limite de l'aire de jeux est maintenant un trait **orange fluo #ff6900** plus épais et surélevé, distinct des matériaux du sol, pour distinguer le périmètre de la surface.

**Information cliquable** : chaque modèle comporte sa catégorie, une indication « position indicative », le polygone OSM parent, les limites de l'interprétation et le lien à la galerie officielle.

**Tests automatisés sans navigateur** : création de 164 surfaces 3D testées avec doubles de Three.js, 5/5 modèles dans un polygone fictif de taille adaptée, aucun placement sans polygone, absence de double en présence d'un élément OSM de même type, géométrie hors polygone interdite, tests du polygone concave et contrôle de la logique de basculement. Syntaxe JavaScript validée. **Le positionnement réel sur Ycoor et l'affichage sur un navigateur restent à inspecter visuellement.**

## Correction P0.6.1 : jeux et couleurs du sol

**Cause du problème :** P0.6 ne dessinait que le **contour vert** du polygone OSM `leisure=playground`, sans remplir sa surface. Les modèles de jeux exigeaient un nœud OSM individuel, alors que certains équipements sont cartographiés comme des voies/surfaces, ou ne sont pas cartographiés du tout.

**Corrections :**
- La surface **délimitée** de l'aire de jeux est maintenant **remplie en low-poly** et suit les altitudes du terrain. Le contour OSM est conservé.
- Si un tag `surface=grass`, `artificial_turf`, `woodchips`, `sand`, `rubber` ou similaire est présent, le rendu utilise un coloris associé. En absence de tag, l'aire est stylisée en **vert illustratif**, en accord avec les photos du site touristique de Ycoor. Cette couleur ne constitue pas un relevé de matériaux.
- L'aire de jeux est rendue **sous** les polygones officiels du cadastre (offset faible). Les chemins, revêtements durs et surfaces d'eau vérifiées gardent leur géométrie et leur priorité visuelle ; aucune surface cadastrale n'est écrasée.
- Le terrain sans classification cadastrale n'est plus affiché comme de la pelouse partout : il apparaît en **gris-vert neutre**.
- La catégorie cadastrale `GENRE=12` « autre revêtement dur » apparaît en **gris pavé clair** plutôt qu'en marron ambigu. Les surfaces sont restées géométriquement inchangées.
- L'interrogation OSM inclut désormais **`way["playground"]`**, pas seulement les nœuds `node["playground"]`. Pour un **équipement explicitement cartographié comme way**, le symbole est placé en un point représentatif calculé à partir de sa géométrie OSM, étiqueté « position indicative dérivée de géométrie ».
- Six types supplémentaires de jeux peuvent être rendus **si et seulement si** OSM contient une géométrie d'équipement : structure multi-jeux, bascule, jeu à ressort, tourniquet, tyrolienne, bac à sable.
- Le panneau « Mobilier OSM » signale explicitement si un polygone `leisure=playground` existe mais qu'**aucun équipement individuel n'est géolocalisé**. Il contient un lien vers la [galerie touristique officielle de Ycoor](https://www.crans-montana.ch/fr/?idcmt=Partenaire_Activite_4ff811345b2094222f969b680bb9ac78), illustrant notamment les toboggans et structures à grimper.

**Ce qui n'a PAS été fait :** aucun toboggan, balançoire ou jeu n'a été placé à un emplacement arbitraire dans le polygone. La présence d'équipements est confirmée visuellement par les photos touristiques, mais leurs positions individuelles ne le sont pas nécessairement. Les positions des éléments absents d'OSM doivent faire l'objet de données géolocalisées supplémentaires avant une représentation fidèle.

**Tests :** validation syntaxique des sources et des nouveaux types de mobilier ; tests de conversion et de repérage des voies d'équipement OSM ; validation des fichiers GitHub et des références des modules. Rendu sur appareil/navigateur réel et contenu effectif Overpass non encore vérifiés.

## Fonctionnalités P0.6

- Sol, chemins et jardins : uniquement les coordonnées vectorielles des couches de **mensuration officielle du Valais** (270, 180, 190). Couche 260 chargée pour contrôle des bâtiments.
- Bâtiments 3D et arbres : **swissBUILDINGS3D et végétation 3D swisstopo** comme dans la version précédente.
- **Nouveauté : mobilier urbain en pixel-art**, chargé depuis **OpenStreetMap** en direct, seulement lorsque la géométrie OSM fournit une position ou un contour exploitable.
- Bouton **« 🪑 Mobilier : ON/OFF »** dans la carte. Il affiche/cache uniquement le mobilier, sans masquer les surfaces cadastrales.
- Section dépliante **« Mobilier OSM »** : catégorie, nombre de données référencées, date source OSM quand fournie, erreur serveur si inaccessible, bouton Actualiser.
- Chaque petit objet 3D possède un identifiant **OSM `node/id`**, nom si fourni, lien vers sa fiche OSM, type et source. Un clic/toucher affiche les détails.
- Les **aires de jeux** cartographiées en polygone sont remplies en sol pixel-art avec contour OSM. Les jeux individuels n'apparaissent que si OSM fournit leur position ponctuelle ou leur géométrie propre.
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

**Sécurité de provenance :** les catégories sont inférées uniquement depuis les tags d'objets réels. Les nœuds OSM **et les voies OSM décrivant explicitement un équipement** peuvent entraîner la création d'un modèle symbolique ; la position d'une voie est représentative et dérivée de la géométrie cartographiée. Les voies `leisure=playground` ne servent qu'à dessiner leur véritable périmètre ; leur centre n'est jamais utilisé pour placer un jouet fictif. Les objets de type `access=private`, désaffectés ou détruits sont ignorés.

**Géométrie et précision :** le centre LV95 est **E 2'603'036, N 1'128'849**. La conversion WGS84→LV95 locale s'appuie sur un jacobien calculé par PROJ au centre. Vérification numérique avec PROJ des quatre coins du carré : erreur maximale inférieure à **1 mm** pour cette *transformation*, ce qui ne dit rien de la précision terrain du relevé OSM. Les coordonnées cadastrales sont directement lues en LV95, sans transformation écran.

Les objets pixel-art sont des **symboles 3D**. Leur présence et leur position sont appuyées par la source OSM, mais leurs dimensions, couleurs, orientation et forme peuvent ne pas correspondre au mobilier physique. Le choix de modèle n'est pas une prétention de relevé détaillé.

## Fichiers

- `index.html` : moteur Three.js, panneaux de sources et interrupteur de mobilier.
- `mo-valais-strict.js` : adaptateur des couches cadastrales officielles du Valais, copie figée de P0.5.9.
- `cadastre-mesh.js` : maillage des surfaces cadastrales avec trous et limites, copie figée de P0.5.9.
- `furniture-source.js` : requête Overpass, parsing strict, filtrage sur les 100 m et métadonnées OSM.
- `furniture-mesh.js` : modèles low-poly au point OSM et contour de l'aire de jeux orange fluo.
- `photo-playground.js` : cinq maquettes photo-approuvées avec positionnement approximatif déterministe à l'intérieur du périmètre OSM et métadonnées de provenance.

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

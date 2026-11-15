# Crans-Montana Pixel Atlas · P0.6.5

## Aperçu

**Atlas 3D P0.6.5 :** https://djbebs.github.io/sudoku-world/crans-montana-p06/?v=7

P0.6.5 reprend et améliore P0.6.4 sans modifier les versions P0.5.9, P0.5.8 ni Sudoku World.

## P0.6.5 : véritables montées d'escaliers et escalade du filet

Les deux vidéos fournies par l'utilisateur montrent l'enfant près du haut du grand toboggan et un autre enfant sur le filet d'escalade, avec des gestes et des montées trop mécaniques. La correction s'appuie sur **ces séquences et sur la géométrie des modèles pixel-art affichés**, pas sur des positions géographiques inventées.

### 1. Escaliers : un appui de pied par marche

- Le grand toboggan tubulaire et la grande structure possédaient cinq marches géométriques chacun. Les trajectoires ont été alignées sur **les cinq surfaces de marches** (hauteurs et espacements du modèle).
- La petite structure a désormais **cinq marches low-poly visibles** côté arrière, dont les coordonnées sont identiques à celles utilisées par l'animation.
- L'enfant n'est plus interpolé du bas vers le haut d'un seul bloc. Chaque marche est un segment distinct d'environ **0,6 à 0,7 seconde** ; au milieu de chaque segment, une jambe se soulève, le corps se penche légèrement et le bras opposé vient en soutien.
- **Jambe gauche puis jambe droite** alternent ; les jambes restent neutres aux paliers et pendant les attentes.
- Après les escaliers, l'enfant parcourt la plateforme et se dirige vers le toboggan. Les sorties et boucles de retour précédemment implémentées sont conservées.

### 2. Filet d'escalade : deux bras, deux jambes, déplacement réel

- Le trajet de l'enfant suit les **intersections verticales et horizontales** de la grille de cordes de la maquette 3D : progression en X et Y, puis descente.
- Deux mains sont placées en posture de préhension ; la main en mouvement change de côté à chaque prise. Les bras ont des rotations autour des axes X et Z.
- Les genoux et les jambes s'animent en alternance avec les mains, en levant successivement le pied d'appui suivant. Le corps penche légèrement vers le filet.
- Une **pause en haut** et une **descente alternée** complètent le cycle. L'enfant ne traverse pas le filet sans bouger les membres.
- Les modèles GLB originaux de l'utilisateur sont réutilisés sans changement de maillage. Il s'agit d'une **animation procédurale simplifiée**, pas d'une simulation physique, d'une cinématique inverse ou d'une capture de mouvement.

### Réutilisation future dans tout le village

Chaque équipement fournit des **données d'animation propres au prefab** dans `MODEL_INTERACTIONS` : `track` (points d'appui) et `sequence` (phases, index de points et durée). Le module `people-motion.js` génère les postures d'escaliers et d'escalade à partir de ces données, sans connaître le nom du jeu ou la carte de Crans-Montana.

Ainsi, des escaliers ou filets ajoutés dans un autre quartier pourront utiliser **le même moteur**, avec leurs propres points d'appui et géométries. Les limites de population et la taille de tuile demeurent configurables dans `characters.js`.

### Vérifications

- Syntaxe JavaScript validée pour les modules de jeux, personnages et animation.
- Scène intégrée simulée de 8 personnages, dont un grimpe les marches de la grande structure, un remonte les cinq marches du grand toboggan, un escalade celles du petit jeu et un escalade le filet.
- **Alternance confirmée des deux jambes** à chaque escalier et des deux bras + jambes à chaque montée du filet.
- Simulation à pas de 33 ms : déplacements continus (saut maximum inférieur à 8 cm par image simulée), même position en début et fin de boucle, jambes fixes pendant l'attente.
- Les positions sont fondées sur la maquette pixel-art ; les emplacements des équipements dans le véritable Ycoor restent indicatifs et non mesurés.
- **Le rendu graphique et la perception naturelle du mouvement dans le navigateur réel doivent encore être vérifiés visuellement.**

## P0.6.4 : mouvements naturels et interactions sur les jeux

**Retour utilisateur traité :** les personnages stationnaires piétinaient continuellement, les enfants restaient souvent figés sur les équipements, et la solution devra ultérieurement être réutilisée dans tout le village de Crans-Montana.

### Rôles désormais séparés

| Rôle / activité | Traitement d'animation |
|---|---|
| Adulte qui marche sur un chemin OSM | Avance réellement sur sa polyligne géoréférencée. Bras et jambes n'effectuent un mouvement de marche que pendant le déplacement. |
| Adulte immobile, qui surveille ou discute | Jambes à zéro en permanence ; tête légèrement orientée, geste de bras bref et occasionnel, avec longue pause entre les gestes. |
| Enfant sur la plateforme | Se tient debout et touche occasionnellement un garde-corps ; ne marche pas sur place. |
| Enfant sur le petit toboggan rouge | Attend en haut, glisse réellement le long de la rampe visible, atterrit, revient en contournant la structure et remonte vers la plateforme. |
| Enfant du grand toboggan tubulaire | Attend, disparaît pendant la traversée du tube métallique opaque, réapparaît à sa sortie, puis revient vers l'accès. |
| Enfant sur les cordes | Monte et descend réellement sur une portion verticale du filet ; bouge les bras pour atteindre les prises et les jambes uniquement pendant l'escalade. |
| Enfant qui joue au sol | Sans trajet documenté, reste immobile, jambes fixes ; seuls quelques gestes occasionnels des bras et de la tête sont animés. |
| Adulte assis | Pose assise stable, jambes fixes en position pliée, légers mouvements de tête. |

Les positions d'interaction sur les maquettes photo restent **illustratives**. Les séquences et dimensions ont été alignées sur la **géométrie du modèle 3D affiché** : cela ne constitue pas une nouvelle mesure géographique.

### Architecture réutilisable pour tout Crans-Montana

Il n'y a **aucune coordonnée de quartier codée en dur dans le moteur d'animation** :

- **`people-motion.js`** est un moteur pur de mouvements dépendant du rôle : il calcule la position, l'orientation, les poses des membres et l'état de visibilité. Il ne dépend pas de Three.js, d'OSM ni d'une zone géographique particulière.
- **`photo-playground.js`** fournit `MODEL_INTERACTIONS`, un catalogue d'ancres *relatives à chaque prefab de mobilier*. Un nouveau type de jeu ajoutera ses propres ancres et parcours sans réécrire les comportements.
- **`characters.js`** associe des personnages aux jeux et aux polygones de parc, puis à des chemins piétons réellement documentés. La fonction `planPopulationForZones({ zones, walkPaths, tileHalfSize, maxActors })` gère plusieurs zones, une dimension de tuile configurable et une densité maximale d'acteurs.
- **`index.html`** conserve le rôle de visualiseur de la tuile pilote. Le système de personnages est une couche autonome ON/OFF. Son animation utilise les modèles GLB fournis et le moteur ci-dessus.

**Extension future :** lorsque Ycoor sera satisfaisant, découper Crans-Montana en tuiles spatiales et charger seulement celles proches de la caméra. Pour chaque tuile visible, extraire ses surfaces, chemins et équipements documentés, puis appeler `planPopulationForZones`. Décharger les tuiles hors champ et n'animer à plein taux que les personnages proches. Une gestion des niveaux de détail et une bibliothèque géométrique partagée seront nécessaires avant de couvrir tout le village. **Ce streaming multi-tuile n'est pas encore implémenté**, seule l'architecture réutilisable du système de personnages l'est.

### Tests

- Parcours validé pour un véritable marcheur : changements de position et pose de marche synchronisés.
- 1200 évaluations successives d'un adulte immobile : **zéro rotation de jambe** et mouvement de bras significatif sur environ **4 % des échantillons**.
- Test de trajectoire : la hauteur descend effectivement pendant une glissade sur le petit jeu ; le retour et la remontée sont des phases distinctes.
- Grand tube : l'acteur est invisible lorsqu'il traverse le volume fermé, puis réapparaît à la sortie.
- Cordes : la position verticale et la position des bras changent réellement.
- Enfant assis : jambes fléchies constantes et pas de cycle de marche.
- Scène intégrée simulée : 9 personnages avec rôles `walk`, `play-platform`, `play-slide`, `play-tube`, `climb-ropes`, `supervise`, `chat`, `play-ground`, `sit`. Test du masquage des personnages liés aux maquettes photo.
- Test de planification sur une petite zone et une grande zone avec `tileHalfSize` différent, limites de population respectées. Test supplémentaire de 500 poses au sol : jambes toujours immobiles.
- Syntaxe JavaScript des modules validée avant publication. **Rendu réel dans le navigateur toujours à confirmer visuellement.**

## P0.6.3 : personnages saisonniers animés

La version ajoute la **population 3D** que l'utilisateur a fournie dans l'archive `personnages_coiffes.zip`. Les six fichiers originaux ont été vérifiés et transférés sans modification de maillage :

- `adulte_bonnet.glb`, `adulte_casquette.glb`, `adulte_chapeau.glb`
- `enfant_bonnet.glb`, `enfant_casquette.glb`, `enfant_chapeau.glb`

Ils sont stockés sous forme d'un pack gzip sans perte, décodé dans le navigateur via `DecompressionStream('gzip')`. Le format de stockage comprend six tailles `uint32 little-endian` et les six GLB d'origine. Les modules `people-data-a.js`, `people-data-b.js`, `people-data-c7.js`, `people-data-c8.js`, `people-data-c9.js` et `people-data-d.js` contiennent les fragments compressés, et `characters-assets.js` les réassemble. **Empreinte SHA-256 de la concaténation originale des fichiers avec leurs tailles : `4b095541e49c1861bca42bdfecad77c1ab37fde4974aa3b1f54f044ca4850bc8`.**

### Habillage saisonnier

Le module `characters.js` charge les six modèles via Three.js `GLTFLoader.parse`. Les matériaux des fichiers `haut`, `bas`, `coiffe` et `coiffe2` sont clonés par personnage, puis recolorés suivant une palette variée mais déterministe, sans modifier la couleur de peau ni les cheveux.

| Saison | Modèle et vêtements |
|---|---|
| Printemps | Casquette ou chapeau, couleurs claires, variante de bras plus légère |
| Été | Casquette ou chapeau, couleurs vives, tenue légère |
| Automne | Bonnet, palette chaude, variante couvrante |
| Hiver | Bonnet, couleurs hivernales, variante couvrante |

La saison automatique dépend de la date choisie dans l'interface. Les boutons saisonniers permettent de la forcer, le système recrée alors les personnages avec les matériaux correspondants. Les véritables bras et jambes `Bras_G`, `Bras_D`, `Jambe_G`, `Jambe_D` sont animés par rotations locales de leurs nœuds, sans squelette artificiellement supposé.

### Occupations et emplacement

- **Adultes** : marche sur les vrais tracés piétons OSM `highway=footway`, `path`, `pedestrian` ou `living_street`. Si ces tracés manquent, **aucune route imaginaire** n'est créée. D'autres adultes peuvent être placés à proximité des jeux comme spectateurs ou en conversation.
- **Enfants** : certains stationnent ou bougent sur les structures photo-approuvées (`complex`, `small`, `ropes`) à positions indicatives. D'autres sautillent, font signe de la main ou jouent au sol sans pénétrer dans l'emprise approximative des maquettes.
- **Banc** : un adulte peut s'asseoir sur le banc photo-illustratif si ce banc a pu être placé, sans prétendre que sa présence physique a été mesurée.
- Les jambes marchent en alternance, les bras suivent une cadence simple, le corps rebondit légèrement ; une personne joue, grimpe ou salue selon sa fonction.
- Densité adaptative : jusqu'à environ **4 adultes et 5 enfants**. Le nombre réel affiché dépend des géométries effectivement reçues et de l'espace libre. Les personnages ne figurent pas dans des emplacements géographiques inventés hors du polygone OSM ou du tracé piéton.

Le panneau **« 👥 Personnages : ON/OFF »** active et masque indépendamment la couche. Les personnes sont cliquables pour afficher la variante GLB, le rôle et le caractère indicatif de l'animation. Masquer **« Jeux photo »** masque aussi les enfants sur les plateformes désormais invisibles.

### Conventions, limitations et tests

- La population est **illustrative** : elle ne prétend pas représenter des personnes réelles présentes à Ycoor, ni leurs trajets et animations exacts.
- Les modèles GLB ne sont pas une bibliothèque d'animations squelettiques. Les membres nommés sont articulés par transformations Three.js, sans mouvement réaliste de précision.
- Le monde utilise toujours les contours cadastraux officiels et les maquettes d'aire de jeux validées dans les versions précédentes.
- L'API Overpass est élargie à la lecture des voies piétonnes, en plus des objets de mobilier. Les chemins OSM sont convertis en repère local métrique et coupés à la zone P0 avant de servir de trajectoires.
- Le pack GLB gzip a été contrôlé : 9368 caractères Base64 assemblés, CRC32 du texte `bb7287e7`, 100680 octets après décompression attendus, six en-têtes GLB 2.0 vérifiés.
- Tests JS : sélection des six variantes saisonnières, planification d'une population simulée avec 4 adultes et 5 enfants, mouvement des marcheurs, articulation et variation des couleurs, masquage des enfants dépendant des maquettes, aucune présence sans géométrie admissible.
- **Contrôle encore nécessaire :** rendu effectif et performances dans un navigateur connecté avec chargement complet des services OSM et swisstopo. Les scènes réelles peuvent contenir moins de personnages que la scène simulée.

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

# Crans-Montana Pixel Atlas P0.5.6

## Liens prêts à utiliser

- **Atlas 3D :** https://djbebs.github.io/sudoku-world/crans-montana-p056/?v=1
- **Carte 2D swisstopo :** https://djbebs.github.io/sudoku-world/crans-montana-p056/map.html?v=1
- **Ancienne P0.5.5 (préservée) :** https://djbebs.github.io/sudoku-world/crans-montana-p055/?v=1

Aucune installation, copie de code, création de compte, ou export n'est nécessaire pour consulter les deux vues.

## Ce qui a été ajouté

**map.html** : Leaflet avec fond orthophoto SWISSIMAGE officiel, carte topographique, rectangle de P0 (100 × 100 m à Ycoor), recherche automatique de segments piétons OSM via Overpass, affichage orange des chemins présents, surfaces vertes des espaces de jeux et parcs, compteurs et messages d'erreur explicites. Plusieurs fournisseurs Overpass sont essayés. Aucun chemin n'est inventé.

**ground-photo.js** : module Three.js indépendant. Il assemble les 9 tuiles SWISSIMAGE de zoom 19 couvrant les 100 × 100 m d'Ycoor dans une texture de 512 × 512 pixels. Le maillage suit le relief déjà calculé par le projet. Les axes x=Est et z=Sud, les coordonnées de la prise de vue sont celles du même pilote, l'échelle et l'orientation sont calculées à partir de la projection Web Mercator, et l'application au sol peut être affichée ou masquée depuis le panneau de l'atlas.

**index.html** : conservation de l'atlas P0.5.5 (bâtiments swissBUILDINGS3D, végétation, parcours OSM, navigation isométrique) avec bouton **📷 Photo au sol** activé par défaut et lien **Carte 2D** ouvrant le contrôle à la même position.

## Source et licences

- © swisstopo SWISSIMAGE : https://docs.geo.admin.ch/visualize-data/xyz.html
- © OpenStreetMap contributors, ODbL : https://www.openstreetmap.org/copyright
- Three.js MIT, Leaflet BSD-2-Clause, Pixelify Sans SIL OFL.

## Vérifications effectuées

- Les trois fichiers existent bien dans le dépôt GitHub.
- La syntaxe JS des trois nouvelles pages/modules a été vérifiée.
- Les coordonnées de Ycoor ont été transformées de WGS84 en LV95 et comparées à la référence du projet.
- La boîte de 100 × 100 m couvre 9 tuiles WMTS au zoom 19; le code calcule les décalages et l'orientation de la photo.

## Limite cruciale

**Le chemin manquant n'est PAS encore numérisé comme géométrie vectorielle.** Quand OSM et swissTLM ne fournissent aucune ligne, sa position est visible *dans la photographie aérienne* à condition que les dalles photo soient chargées, mais il n'y a pas encore de maillage de sentier pixel-art ni d'animation piétonne sur cette portion.

Il faudrait ensuite vectoriser à partir de l'orthophoto, idéalement à l'aide d'une délimitation vérifiée ou d'un relevé. Ne jamais fabriquer de tracé non vérifié.

## Validation restant à faire

- Chargement HTTP public GitHub Pages (la présence des fichiers sur main ne prouve pas la propagation du site).
- Rendu réel du panneau Leaflet et de la couche photographique sur Chrome Android.
- Chargement complet et CORS des dalles SWISSIMAGE.
- Alignement de l'image et des volumes des bâtiments, fluidité et mémoire sur smartphone.
- Numérisation puis stylisation du véritable sentier de Ycoor pour finaliser P0.

La nouvelle version est volontairement séparée : ni Sudoku World, ni P0.5.5 n'ont été modifiés.

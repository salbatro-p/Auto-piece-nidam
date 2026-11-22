# Modèles 3D par référence et année

Rechercher le numéro fabricant exact, la génération, le moteur, l'année et les restrictions de montage dans le catalogue du fabricant. Le lien de la galerie reprend les références présentes. Consigner la source du dessin, sa révision et la licence applicable avant import.

## Recherche effectuée le 22 novembre 2026

- MANN-FILTER W 75/3. La fiche distingue les variantes de Clio III, dont le K4J780 et des montages K9K avec une restriction jusqu’à septembre 2007. On y trouve des dimensions et des applications. Aucun fichier 3D validé pour AAA n'a été identifié dans les ressources consultées. [Catalogue du fabricant](https://www.mann-filter.com/fr-fr/catalogue/resultats-de-la-recherche/produit.html/w75/3_mann-filter.html).
- SKF 6203-2RSH. La fiche identifie la référence. SKF indique comment chercher les CAO disponibles et précise que leur géométrie peut être simplifiée. Aucun montage automobile précis ni droit de redistribution n'a été validé pour cette référence. [Fiche SKF](https://www.skf.com/lv/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-6203-2RSH) · [Accès aux CAO](https://www.skf.com/africa/en/digital-tools/select-and-evaluate/cad-information).

## Fabriquer un dessin original

1. Choisir la pièce avec sa référence fabricant, la variante vérifiée et l'année attestée. Saisir la référence du plan ou du relevé de mesures et sa révision.
2. Pour une forme complexe, fournir une CAO autorisée ou un scan contrôlé de la pièce au format STL, binaire ou ASCII. Limites de 6 Mo et 24 000 triangles.
3. Pour une pièce entièrement de révolution, télécharger le gabarit de mesures JSON. Inscrire les sommets ordonnés du contour fermé de sa section, alésage compris, en paires [rayon_mm, position_axiale_mm]. La fermeture entre dernier et premier sommet est automatique. Confirmer axisymmetric uniquement après contrôle. Un filetage, un perçage décentré ou une rainure de clavette nécessite un modèle volumique qui représente ce détail.
4. Choisir la licence, examiner et transmettre les douze angles. Après leur revue, la visionneuse affiche une seule empreinte de géométrie, référence, licence, variante et année par série. Les identifiants sont inscrits sur le visuel. La rotation démarre sur demande.
5. Vérifier séparément les cotes critiques, tolérances et conditions de montage. Les exemples de recherche n'ont pas créé de stock. Les mesures de test illustrent une pièce fictive.

## Joint BMW 11 43 1 740 045

Un premier fichier de géométrie réelle est fourni pour le joint torique inférieur du tube de jauge d’huile. Le diamètre intérieur nominal de 19,5 mm et la section circulaire de 3 mm donnent un diamètre extérieur de 25,5 mm. Le dessin est une construction indépendante du tore à partir de ces deux cotes. Les finitions, tolérances et déformations sous compression demandent un contrôle sur pièce.

Le catalogue de pièces du véhicule associe le repère 12 à la berline BMW 325xi E46 américaine de décembre 2004. Le concessionnaire BMW identifie la fonction et la référence, et les archives de BMW confirment la génération et la cylindrée. La même pièce peut équiper plusieurs années. La légende donne une application documentée.

- [Référence BMW chez le concessionnaire](https://parts.bmwofsouthatlanta.com/oem-parts/bmw-engine-oil-dipstick-tube-seal-11431740045)
- [Catalogue de pièces, berline et date de production](https://www.realoem.com/bmw/enUS/showparts?diagId=11_9918&id=EU33-USA-12-2004-E46-BMW-325xi)
- [Catalogue de pièces de la 325xi 2004, repère 12 et cotes](https://www.bmwpartsdeal.com/parts-list/2004-bmw-325xi-sedan_e46/engine/oil_pan_oil_level_indicator.html)
- [Archives BMW, génération et moteur](https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-996-1.bmw-325xi-e46.html)

[Modèle original en millimètres](../apps/business/src/reference-models/bmw-11431740045.stl) · [Rotation avec identification du véhicule](evidence/assortment/bmw-11431740045-2004.gif). Le téléchargement du modèle est proposé sur les fiches BMW portant cette référence. Son ajout à la galerie vérifiée passe par le même circuit de validation que les autres dessins. Aucune quantité en stock n’est créée.

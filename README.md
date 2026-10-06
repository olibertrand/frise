# Frise chronologique

Une application simple pour créer des frises chronologiques en classe.
**Un seul fichier, aucune installation, aucun droit administrateur.**

## Utilisation

1. Téléchargez **`Frise.html`** (bouton « Download raw file » sur GitHub).
2. Double-cliquez dessus : la frise s’ouvre dans le navigateur (Edge, Chrome ou Firefox).
3. Ajoutez des **événements** et des **périodes**, puis cliquez sur **Enregistrer**.

Le fichier peut être copié sur une clé USB, sur un lecteur réseau ou sur l’ENT : il fonctionne hors ligne.

### Enregistrer et rouvrir : un seul fichier

« Enregistrer » produit un fichier **`.html`** qui contient *toute* la frise (textes et images)
**et** l’application elle-même.
Pour reprendre son travail, l’élève **double-clique simplement sur ce fichier** — il n’a pas besoin
de rouvrir l’application puis de chercher son fichier.

- Avec **Edge ou Chrome** : au premier enregistrement, on choisit l’emplacement ; ensuite,
  `Ctrl+S` met à jour le même fichier directement.
- Avec **Firefox** : le fichier est placé dans le dossier *Téléchargements*.
- **Filet de sécurité** : le travail est aussi sauvegardé automatiquement dans le navigateur.
  S’il n’a pas été enregistré, il est proposé à la réouverture (« Travaux récents »).

## Fonctionnalités

| | |
|---|---|
| **Événements et périodes** | Date à l’année, au mois ou au jour ; dates **av. J.-C.** ; dates approximatives (« vers 1450 ») |
| **Images** | Choisir un fichier, glisser-déposer, ou copier-coller (`Ctrl+V`) ; légende / source de l’image ; les grosses images sont réduites automatiquement |
| **Texte détaillé** | Affiché seulement après un clic, dans un panneau latéral ; gras, italique, listes, citations, liens |
| **Lien « En savoir plus »** | Vers Wikipédia, Lumni, un manuel numérique… |
| **Catégories** | Couleurs et légende ; cliquer sur la légende masque/affiche une catégorie |
| **Repères** | Bande des **siècles** (et millénaires) en chiffres romains, durée des périodes calculée, siècle indiqué dans chaque fiche |
| **Navigation** | Zoom à la molette, déplacement à la souris ou au doigt, « Tout voir », flèches ← → pour passer d’un élément au suivant |
| **Liste et recherche** | Tous les éléments par ordre chronologique |
| **Mode révision** | Les titres sont masqués (« ? ») ; on clique puis on révèle la réponse. L’export en image dans ce mode donne une frise à compléter |
| **Exports** | Image PNG (vue ou frise entière), impression / PDF avec les fiches détaillées, **page web en lecture seule** à partager |
| **Travail de groupe** | « Ajouter le contenu d’une autre frise » fusionne les frises de plusieurs élèves |
| **Confort** | Annuler / rétablir, dupliquer, double-clic sur la frise pour ajouter à cette date, affichage grand format pour vidéoprojecteur |

## Pour les développeurs

Le code source est dans `src/` (HTML, CSS, JavaScript sans dépendance).
`Frise.html` est généré par :

```sh
node build.mjs
```

Test de bout en bout (nécessite Playwright et Chromium) :

```sh
node tests/smoke.mjs
```

# Tvijo DSHREM — d'une tâche à un résultat vérifié

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo regroupe un espace de travail dans le navigateur, une extension VS Code et des outils en terminal autour d'un flux de développement partagé. Décrivez la tâche, choisissez son hôte d'exécution et ses permissions, inspectez les modifications, et conservez les preuves utilisées pour accepter le résultat. Ce guide présente le produit ; le README technique du dépôt et la référence des commandes restent la source de référence pour la CLI.

## Commencez avec votre espace de travail préféré

Ouvrez [DSHREM](https://dsh.tvijo.com/), obtenez l'[extension VS Code et les instructions pour le terminal](https://dsh.tvijo.com/download), ou lisez [les paramètres expliqués](https://dsh.tvijo.com/knowledge/settings-explained). Connectez-vous via le flux de compte pris en charge par le service. Ne collez jamais les clés d'API d'un fournisseur dans un prompt partagé, une issue publique ou un dépôt.

La CLI Node.js nécessite Node 22 ou une version plus récente. Depuis une copie locale du dépôt :

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

La commande est également disponible sous le nom `dshrem`. Cette CLI de chat à distance affiche les outils suggérés sans les exécuter. L'édition locale et l'exécution de commandes relèvent de l'Agent VS Code ou d'un environnement d'exécution hôte configuré explicitement ; ils disposent de permissions distinctes. Voir l'[aide de la CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Comprendre les choix

**Preuves d'abord** sépare les faits étayés des hypothèses. **Planifier et vérifier** demande un plan court et confronte le résultat à la demande. **Revoir la réponse** remet en question un brouillon ; il s'agit d'une auto-évaluation, sauf si un relecteur distinct est explicitement désigné. Aucune de ces méthodes ne garantit l'exactitude ni une consommation de tokens plus faible.

Les préréglages de tâche ajoutent des instructions et des listes de contrôle réutilisables. Ils ne créent pas de mémoire supplémentaire pour le modèle. Une collection de contexte plus volumineuse doit tout de même respecter les limites de requête du service et du modèle. Les chemins avancés du contrôleur, de Python et d'état renvoient à l'hôte d'extension sélectionné ; en Remote SSH, il s'agit du serveur distant.

## Travaillez en équipe quand c'est utile

Une équipe AGENTROY attribue à un coordinateur, des implémenteurs et des relecteurs des responsabilités distinctes. Les politiques de l'hôte peuvent demander DSHREM ds41f et des outils Codex ou Claude liés au compte, avec une revue architecturale facultative. La disponibilité dépend de l'environnement d'exécution installé, de l'accès au compte et de la politique choisie. Un abonnement manquant ne doit pas devenir silencieusement un appel d'API payant.

Trois à six rôles relèvent de choix d'organisation, pas d'une formule de qualité. Les relecteurs ont besoin de la version exacte de l'artefact et des preuves de test. Un échec sérieux de vérification bloque l'acceptation, même lorsque les modèles sont d'accord. Lisez [les équipes d'agents et les coûts visibles](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Reprenez sans masquer l'incertitude

Une session tmux détachée côté serveur peut continuer après la déconnexion d'un ordinateur portable ou d'un téléphone. Un travail sur un ordinateur local éteint ne le peut pas. Une panne de serveur, une pression mémoire et une perte de stockage exigent toujours une récupération. Reconnectez-vous à l'ID de tâche enregistré et inspectez son dernier événement confirmé avant de reprendre le travail. Ne répétez pas aveuglément une requête facturable dont l'issue est inconnue. Voir [déconnexions et récupération](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Gardez les coûts et les données visibles

Examinez le devis accepté, le plafond de la tâche, le montant réservé et le reçu d'utilisation. Une majoration de service de 8% transformerait USD1.00 d'utilisation du fournisseur en USD1.08 avant les frais divulgués séparément ; il s'agit d'un exemple, pas d'une offre tarifaire. Les quotas d'abonnement, les frais du fournisseur et les ressources serveur sont des limites différentes. Tout budget supplémentaire exige un choix explicite.

Les fichiers d'identifiants de la CLI locale utilisent des permissions réservées au propriétaire. Ces permissions ne constituent ni un chiffrement ni une sauvegarde. Le téléversement de connaissances est explicite ; les fichiers privés ne devraient jamais entrer dans un lien de transfert public. Les [transferts de prompt](https://dsh.tvijo.com/knowledge/prompt-handoffs) expliquent comment copier une tâche relue dans un autre outil.

Le paquet de ce dépôt est actuellement marqué `UNLICENSED` ; la publication ne confère pas de droits de réutilisation. Consultez les métadonnées actuelles du paquet et la mention de licence avant toute redistribution. Les traductions sont des guides d'introduction, générées avec DSHREM et vérifiées pour leur cohérence structurelle ; l'anglais fait référence en cas d'écart technique.

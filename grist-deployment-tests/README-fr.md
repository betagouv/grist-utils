# Tests de déploiement pour Grist

**Status: ✅ Peut être utilisé en production**

## Motivation

Ce projet vise à fournir quelques tests simples pour s'assurer que l'instance cible est correctement configurée. Il est basé sur des problèmes rencontrés par l'[ANCT](https://anct.gouv.fr) dans le passé.

## Exécution des tests avec un workflow Github

Vous pouvez exécuter les tests en déclenchant simplement un workflow Github ([voir la documentation Github](https://docs.github.com/fr/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow)).

Veuillez vous assurer qu'un environnement secret nommé "deployment tests" ([comme défini dans ce fichier de workflow](https://github.com/betagouv/grist-utils/blob/bcb819601f2ec4d3b8decaed7c462b9f50f1bc8a/.github/workflows/grist-deployment-tests.yml#L18C18-L18C28)) est configuré et que les secrets utilisés dans ce fichier sont définis. Vous pouvez consulter [la documentation Github sur la façon de les définir et de les utiliser](https://docs.github.com/fr/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) pour en savoir plus.


## Running the tests locally

### Installation

Après avoir cloné le dépôt, installez les dépendances en utilisant npm :
```bash
$ npm install
```

### Exécuter les tests

Vous pouvez exécuter le test en utilisant cette commande :
```bash
$ GRIST_DOMAIN='https://my-grist.tld' USER_API_KEY='some-user-api-key' ORG_ID='1234' npm run test:api
```

Les variables d'environnement ci-dessus sont :
- `GRIST_DOMAIN` est le domaine de votre instance Grist (obligatoire) ;
- `USER_API_KEY` est la clé API de l'utilisateur avec lequel vous souhaitez exécuter les tests (obligatoire) ;
- `ORG_ID` est l'ID de l'organisation sur laquelle vous souhaitez exécuter les tests (optionnel, par défaut l'ID de l'espace personnel) ;

Les tests créent un espace de travail dédié (nommé `test__<date au format ISO>`), qui est automatiquement supprimé après l'exécution des tests.

#### Exécuter un test isolément

Vous pouvez exécuter un test isolément en utilisant l'option `-g` de mocha. Par exemple, la commande suivante exécute uniquement les tests dont le titre contient `"snapshots"` :
```bash
$ GRIST_DOMAIN='https://my-grist.tld' USER_API_KEY='some-user-api-key' [...] npm run test:api -- -g 'snapshots' 
```

#### Dépannage

Si vous rencontrez des problèmes avec vos tests, vous pouvez définir la variable d'environnement `NO_CLEANUP` à `1` afin que l'espace de travail créé pendant les tests ne soit pas supprimé et que vous puissiez inspecter les documents créés.

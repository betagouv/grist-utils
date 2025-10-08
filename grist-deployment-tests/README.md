# Deployment tests for Grist

**Status: ✅ Ready to be used in production**

## Motivation

This project aims to provide few simple tests to ensure the target instance is correctly configured. It is based on issues the [ANCT](https://anct.gouv.fr) encountered in the past.

## Running the tests using a Github workflow

You may run the tests by simply triggering a Github workflow through the "Actions" tab ([see the Github documentation](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow)).

Please be sure a secret environment named "deployment tests" ([as defined in this workflow file](https://github.com/betagouv/grist-utils/blob/bcb819601f2ec4d3b8decaed7c462b9f50f1bc8a/.github/workflows/grist-deployment-tests.yml#L18C18-L18C28)) is configured and that the secrets used in this file are defined. You may take a look [at the Github documentation on how to define them and how to use them](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) to know more.

## Running the tests locally
## Running the tests locally

### Installation

### Installation

After cloning the repository, install the dependencies using npm:

```bash
npm install
```

### Run the tests

You may run the test (api and e2e) using this command:

```bash
GRIST_DOMAIN='https://my-grist.tld' USER_API_KEY='some-user-api-key' \
  ORG_ID='1234' npm run test
```

Where the above env variables are:

- `GRIST_DOMAIN` is the domain of your grist instance (required);
- `USER_API_KEY` is the API Key of a user with whom you want to run the tests (required, for API tests);
- `USER_LOGIN` is the email of said user (required for e2e tests)
- `USER_PASSWORD` is the password of said user (required for e2e tests)
- `ORG_ID` is the ID of the organization on which you want to run the tests
(optional, defaults to the Personal organization id, for API tests);

The tests create a dedicated workspace (named `test__<iso formatted date>`), which is automatically deleted after the test run.

#### Run a single test

You may run a single test using the `-g` option of mocha. For example, the following 
command run only the tests whose title contain `"snapshots"`:

```bash
GRIST_DOMAIN='https://my-grist.tld' USER_API_KEY='some-user-api-key' [...] npm run test:api -- -g 'snapshots' 
```

#### Troubleshooting

If you encounter some issue with your API tests, you may set the
env variable `NO_CLEANUP` to `1` so the workspace created during the tests is not
deleted and you can inspect the created documents.

# Installing a jsenv package

All jsenv packages are published on github package registry.

In order to use a jsenv package in your project, npm must be configured to search it on the github registry.<br />

## Configuring npm for github registry

You can do that by adding the following line in your `.npmrc`<br />

```
@jsenv:registry=https://npm.pkg.github.com
```

Or the following command

```console
npm config set @jsenv:registry https://npm.pkg.github.com
```

At this point you can `npm install` but if you never configured npm authentification on github registry you're going to see the following error:

![npm install authentification error screenshot](./npm-install-auth-error-screenshot.png)

To fix it you need to configure npm authentification on github registry

### Configure npm authentification on github registry

1. Creating a token on your github profile with at leat `read:packages` scope.

2. Save the token with the following command
   ```console
   npm config set //npm.pkg.github.com/:_authToken personal-access-token
   ```

— see [Authenticating to GitHub Package Registry documentation on GitHub](https://help.github.com/en/articles/configuring-npm-for-use-with-github-package-registry#authenticating-to-github-package-registry)

## Installing the jsenv package

Now npm is properly configured, you can install a package doing

```console
npm install @jsenv/package-name
```

Or

```console
yarn add @jsenv/package-name
```

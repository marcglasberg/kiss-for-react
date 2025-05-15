# What is it?

The `TodoAppReactNative` is a React Native + TypeScript mobile app to demonstrate the use of Kiss.

![TodoApp_RN_Scren.jpg](readme-images/TodoApp_RN_Scren.jpg)

## To build and run using IntelliJ

1. Select `Edit Configuration...` in the toolbar.
2. Click the `+` button and select `React Native`. A window will open.
3. In `Name`, write `BUILD AND RUN`.
4. Press the `OK` button to save.
5. In the toolbar, click the green "run" button.

## Dependency

In it's `package.json` file it adds Kiss as a dependency like this:

```json
{
  "dependencies": {
    "kiss-for-react": "^1.1.1"
  }
}
```

## Importing

To import Kiss from `TodoAppReactNative`:

```ts
import { Store, KissAction } from 'kiss-for-react';
```

## Resetting everything in Windows

> Remove-Item -Recurse -Force node_modules
> npm cache clean --force
> Remove-Item package-lock.json -Force
> npm install
> npx react-native start --reset-cache  

## Resetting everything in the Mac

> shell rm -rf node_modules/
> npm cache clean --force
> rm package-lock.json
> npm install
> npx react-native start --reset-cache

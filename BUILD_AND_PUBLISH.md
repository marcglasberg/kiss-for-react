# To build and publish this package

1. Make sure all functions and classes are added to `kiss-for-react\src\index.ts`

2. Update version in `kiss-for-react\package.json`:

   ```json
   "name": "kiss-for-react",
   "version": "1.0.0", // Here!
   ```

3. In directory `kiss-for-react\`, run in the terminal:

   ```bash
   npm install
   npm run build
   ```

4. In directory `kiss-for-react\examples\todo-app-example\`, run in the terminal:

   ```bash
   npm install  
   ```

5. In directory `kiss-for-react\examples\TodoAppReactNative\`, run in the terminal:

   ```bash
   npm install  
   ```

6. Back in directory `kiss-for-react\`, run in the terminal:

   ```bash
   npm run build
   npm publish
   ```

Note:

* Typing `npm run build` will create the `lib` folder with the compiled code.

* `npm publish --access=public` is needed only for scoped packages (@username/modern-npm-package) as
  they're private by default.

See:

* [https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish.html](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish.html)
* [https://snyk.io/pt-BR/blog/best-practices-create-modern-npm-package/](https://snyk.io/pt-BR/blog/best-practices-create-modern-npm-package/)

# To build and publish the ESLint plugin

The plugin `eslint-plugin-kiss-for-react` is in the `eslint-plugin` directory. It's a separate
npm package, with its own version, and doesn't need its own `npm install` (it uses the
`node_modules` of the repository root).

1. Run its tests from the repository root: `npx jest eslint-plugin`.

2. Update the version in `eslint-plugin\package.json`, in `eslint-plugin\src\index.ts`
   (`meta.version`), and in `eslint-plugin\CHANGELOG.md`.

3. In directory `kiss-for-react\eslint-plugin\`, run in the terminal:

   ```bash
   npm run build
   npm publish
   ```

// `app/layout.tsx` imports `src/ui/AppStyles.css` for its side effect only. TypeScript 6 reports
// a side-effect import of a module that has no type declarations (`noUncheckedSideEffectImports`
// is on by default). Next.js 16 declares `*.css` in its own types, but Next.js 15 declares only
// `*.module.css`, and the CI builds this example with both. The declarations merge with Next 16's.
declare module '*.css' {}

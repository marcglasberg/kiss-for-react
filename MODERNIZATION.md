# Direct dependency modernization

The root development stack and five web examples use current stable compatible direct dependencies. DEPENDENCY_VERSIONS.md records manifest ranges, resolved versions, official latest metadata and justified compatibility boundaries. TypeScript remains 6.0.3. The library public React 18/19 peer range, entry points, state behavior and declaration boundaries are unchanged. The React Native fixture keeps its paired native toolchain; this change does not convert it to Expo or claim native platform validation.

## React compatibility tests

The prior React 18 CI failure is documented at https://github.com/marcglasberg/kiss-for-react/actions/runs/38802085951/job/116653439682 . Before these harness repairs, the same five suites failed locally with 4 failed and 33 passed tests. No application assertion or feature is removed to obtain a pass.

The jsdom streaming tests explicitly select Node export conditions for renderToPipeableStream. The edge-stream scenario still loads the real browser renderer through the shared typed API, including React 18 whose type package omits the browser subpath declaration. The Suspense boundary scenarios retain their state, recovery and error assertions, and explicitly check React 18's expected caught-error console reports; other unexpected reports still fail the suite.

Stable React 18 rejects its own experimental react-server entry. RSC tests explicitly assert that upstream limitation, rather than claiming it supports React 19's server runtime. React 19 keeps all real server-component store/export assertions. Separate Node tests prove Kiss conditional export resolution in ESM/CJS without evaluating React, and the explicit /server subpath loads under ordinary SSR conditions on both majors. Full ordinary client, streaming, hydration, state and published-type consumer coverage is retained. A bundler handles client-reference modules in RSC; plain Node with React 18's unsupported experimental condition is not advertised as a working runtime.

Packed consumer checks run independently for React 18 and 19 and exercise real ESM/CJS SSR and published positive/negative type contracts. A new packed-plugin check exercises a typed naming diagnostic, its rename suggestion and valid code against both promised ESLint majors. The existing two core jobs and ten SSR matrix jobs remain; two isolated plugin-consumer jobs are added to the existing CI workflow.

## Validation

Use portable patched Node 26.12.1 (the host installation is unchanged). Build the ESLint plugin before root lint. Run types, lint, the full test suite, package build, both packed consumers and plugin-pack-smoke with ESLint 9.22.0 and 10.13.0. The lower ESLint 9.22 floor is a compatibility test, not a recommendation to develop on an unsupported old ESLint patch. CI continues to test all ten Next 15/16 and React 18/19 SSR combinations where supported.

The local React 19 suite passed 231 suites and 3,063 tests before the final additional export-resolution assertion; all five modified suites then passed with 45 tests. The corrected React 18 target suites passed with 43 tests; the full React 18 run then passed all 231 suites and 3,062 tests, including the additional conditional-export assertion. The final standalone React 19 export suite passed all 13 assertions. Final exact-head CI and full-suite results are recorded in the PR body; do not infer results from an older head. Local clean installs/builds cover the five updated web examples. Browser hydration/navigation acceptance is checked by the retained SSR CI jobs; local compilation alone is not a browser test.

## Remaining upstream advisory

The current root audit reports 21 moderate dependency-chain entries rooted in sprintf-js 1.0.3 used by Jest's development tooling. GHSA-hp3w-g68c-fv3c affects versions through 1.1.3 and lists no patched version. It requires attacker-controlled formatting strings. This is test/tooling exposure, not a runtime dependency of the published Kiss package, whose runtime graph consists of use-sync-external-store. No request-time attacker-controlled formatting path is established. Do not force an incompatible formatter or replace the test framework merely to hide metadata. Revisit when upstream publishes a supported fix; keep untrusted format strings out of test-tool configuration.

Source: https://github.com/advisories/GHSA-hp3w-g68c-fv3c . Published September 24 and updated October 5; it is older than the initial October 19–22 advisory window.

Version ranges do not refresh lockfiles or enable vulnerability monitoring. Updates still require deliberate review, lock refresh and regression checks. No background automation, app installation, auto-merge or deployment is enabled.

# Development and CI runtime updates

CI selects the latest available Node 26.x patch with setup-node check-latest enabled, logs the actual version and checks the minimum security release 26.12.1. CI does not cross to Node 27 automatically. This is the build/test runtime; it does not restrict the library consumer engine range. TypeScript remains on its existing ~6.0.3 range and locked 6.0.3.

.nvmrc records the reproducible local baseline 26.12.1. To adopt a newer patch, use nvm install 26 (nvm use alone does not download a new patch), run the core/SSR/packed-consumer checks, and update .nvmrc to the tested version. Runtime ranges do not update dependency lockfiles. Review npm outdated and intentional dependency updates with the existing CI matrix.

Node 26 is scheduled to enter LTS on 2026-10-28 and reach end of life on 2029-04-30. Review the next supported runtime before that date. A future security release may require raising the explicit minimum floor. JavaScript Actions use their own embedded runtimes and require separate runner/Action updates.

Sources: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#check-latest-version and https://github.com/nodejs/Release/blob/main/schedule.json .

// Renders components that use the hooks, with the BUILT package (`lib/esm`, through the package
// "import" condition), in plain Node. Run from the repository root, after `npm run build`.
// Prints the HTML, which `build.esm.test.ts` checks. The CJS twin is `hooks-smoke.cjs`.
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as kiss from 'kiss-for-react';
import { renderWithHooks } from './hooks-smoke-shared.cjs';

process.stdout.write(renderWithHooks(React, renderToString, kiss));

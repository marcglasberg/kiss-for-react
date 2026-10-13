// Renders components that use the hooks, with the BUILT package (`lib/cjs`, through the package
// "require" condition), in plain Node. See `hooks-smoke.mjs`.
const React = require('react');
const { renderToString } = require('react-dom/server');
const kiss = require('kiss-for-react');
const { renderWithHooks } = require('./hooks-smoke-shared.cjs');

process.stdout.write(renderWithHooks(React, renderToString, kiss));

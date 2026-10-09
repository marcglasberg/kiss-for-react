import { createRule, getTypeInfo, isTestFile } from '../utils.js';
import { ClassNode, classNameOf, fieldsOf, isStateClass } from '../stateClasses.js';

const ROUTE_NAMES = new Set(['currentRoute', 'routeName', 'currentPath', 'pathname', 'location']);

/**
 * Opt-in. Reports fields of state classes named `currentRoute`, `routeName`, `currentPath`,
 * `pathname` or `location`. The current route belongs to the router, like React Router's
 * `useLocation()`. A copy in the state can get out of sync with it.
 *
 * It only looks at the name, so it's not in the recommended config. Not reported in tests.
 */
export default createRule({
  name: 'route-in-state',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow keeping the current route in the state. Get it from the router instead.',
    },
    schema: [],
    messages: {
      routeInState:
        'The field `{{field}}` of the state class `{{className}}` seems to keep the current route. Get it from ' +
        'your router instead, like React Router\'s `useLocation()`, since a copy in the state can get out of ' +
        'sync with the router.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const fields = fieldsOf(classNode).filter((field) => ROUTE_NAMES.has(field.name));
      if (fields.length === 0 || !isStateClass(classNode, context, typeInfo)) return;
      for (const field of fields) {
        context.report({
          loc: field.loc,
          messageId: 'routeInState',
          data: {field: field.name, className: classNameOf(classNode)},
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

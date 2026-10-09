import { dispatchMethodOf, renderingComponentOf } from '../components.js';
import { createRule, getTypeInfo } from '../utils.js';

/**
 * Reports a dispatch that runs while a component renders:
 *
 * ```tsx
 * function User() {
 *   const dispatch = useDispatch();
 *   dispatch(new LoadUser());                                        // Warning
 *   useDispatch({ onMount: (store) => store.dispatch(new LoadUser()) }); // OK
 *   return <button onClick={() => dispatch(new LoadUser())} />;      // OK
 * }
 * ```
 *
 * It dispatches again on every render, and loops forever when the action changes the state.
 *
 * Checks the body of components and custom hooks. Dispatches in event handlers, effects,
 * `useDispatch` options, and other nested functions, are not reported.
 */
export default createRule({
  name: 'dispatch-in-render',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow dispatching actions while a component renders.',
    },
    schema: [],
    messages: {
      dispatchInRender:
        '`{{callee}}` dispatches while the component renders, so it dispatches again on every render, and ' +
        'loops forever if the action changes the state. Dispatch in an event handler, in an effect, or with ' +
        'the `onMount` option of `useDispatch`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        if (!dispatchMethodOf(node.callee, context, typeInfo)) return;
        if (!renderingComponentOf(node)) return;
        context.report({
          node: node.callee,
          messageId: 'dispatchInRender',
          data: {callee: context.sourceCode.getText(node.callee)},
        });
      },
    };
  },
});

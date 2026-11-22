/**
 * Optional class decorator that declares that a class belongs to application state.
 *
 * Marking each state class makes its purpose visible to readers, AI agents, and tools
 * without having to find the store that uses it. The Kiss ESLint plugin recognizes
 * annotated classes and checks them even when no store uses them yet. Automatic state
 * class detection remains available without this decorator.
 *
 * The optional `kiss-for-react/missing-state-class` ESLint rule (off by default) requires
 * this decorator on detected state classes, including nested classes. Enable TypeScript
 * type information in ESLint to detect state classes across files.
 *
 * This decorator does not change the class, freeze objects, or add runtime metadata.
 * It supports modern TypeScript class decorators and legacy `experimentalDecorators`.
 * Your application's compiler must support decorator syntax. Applications that do not
 * use this decorator need no decorator configuration.
 * With TypeScript 5 or later, omit `experimentalDecorators` (or use `false`) for modern
 * decorators. For the legacy format, set `compilerOptions.experimentalDecorators: true`
 * in `tsconfig.json`. Babel or SWC must also be configured to accept the chosen decorator
 * format if they compile the application. ESLint's `projectService` is a separate setting.
 * The README's "Configuring decorators" section gives a configuration example.
 *
 * @example
 * ```ts
 * @stateClass
 * class User {
 *   constructor(public readonly name: string) {}
 * }
 * ```
 */
export function stateClass(_target: abstract new (...args: any[]) => any, _context?: unknown): void {
  // A declaration for readers and lint tools; preserve the original class.
}

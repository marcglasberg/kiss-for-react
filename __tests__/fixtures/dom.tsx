/**
 * A test harness with a real `react-dom/client` root, for tests that need DOM commits,
 * hydration or concurrent rendering. Test files that use it must run in the jsdom
 * environment (`@jest-environment jsdom` in the file's docblock).
 *
 * It records three different things separately, since they are different quantities:
 * - Render attempts: how many times React invoked a component function (`useRenderCount`).
 * - Committed results: what the DOM showed after each commit (`useCommitProbe`).
 * - Store notifications and selector calls are left to the tests that need them.
 */
import React, { act, useLayoutEffect } from 'react';
import { createRoot, hydrateRoot, Root, RootOptions } from 'react-dom/client';
import { expect } from '@jest/globals';

export interface Mounted {
  readonly container: HTMLDivElement;
  readonly root: Root;

  /** The text the DOM shows right now. */
  text(): string;

  /** Renders a new element into the same root, inside `act`. */
  rerender(element: React.ReactElement): Promise<void>;

  /** Unmounts the root and removes the container. Safe to call more than once. */
  unmount(): Promise<void>;
}

const mounted = new Set<Mounted>();

/** Creates a container in the document and a root, and renders `element` into it, inside `act`. */
export async function mount(
  element: React.ReactElement,
  { strict = false, rootOptions }: { strict?: boolean, rootOptions?: RootOptions } = {},
): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container, rootOptions);
  const wrap = (el: React.ReactElement) => strict ? React.createElement(React.StrictMode, null, el) : el;

  const result: Mounted = {
    container,
    root,
    text: () => container.textContent ?? '',
    rerender: async (el) => {
      await act(async () => {
        root.render(wrap(el));
      });
    },
    unmount: async () => {
      if (!mounted.has(result)) return;
      mounted.delete(result);
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
  mounted.add(result);

  await act(async () => {
    root.render(wrap(element));
  });
  return result;
}

/**
 * Hydrates `element` into a container that already holds `html` (as produced by the server).
 * Returns the mounted root and the recoverable errors React reported during hydration.
 */
export async function hydrate(
  html: string,
  element: React.ReactElement,
  { strict = false }: { strict?: boolean } = {},
): Promise<Mounted & { recoverableErrors: unknown[] }> {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const recoverableErrors: unknown[] = [];
  const wrap = (el: React.ReactElement) => strict ? React.createElement(React.StrictMode, null, el) : el;

  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, wrap(element), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
  });

  const result: Mounted & { recoverableErrors: unknown[] } = {
    container,
    root,
    recoverableErrors,
    text: () => container.textContent ?? '',
    rerender: async (el) => {
      await act(async () => {
        root.render(wrap(el));
      });
    },
    unmount: async () => {
      if (!mounted.has(result)) return;
      mounted.delete(result);
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
  mounted.add(result);
  return result;
}

/** Unmounts every root still mounted. Call it from `afterEach`. */
export async function unmountAll(): Promise<void> {
  for (const m of Array.from(mounted)) await m.unmount();
}

/**
 * Fails the test if React (or anything else) wrote to `console.error` or `console.warn`,
 * except for messages matching one of the `allowed` patterns. Call it at the top level of a
 * test file: it registers `beforeEach` and `afterEach` hooks.
 *
 * The messages written while a test runs are available in `messages`, so that a test that
 * expects a warning can also assert it was written.
 */
export function failOnConsoleErrors(allowed: RegExp[] = []): { messages: string[] } {
  const messages: string[] = [];
  let spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    messages.length = 0;
    spies = (['error', 'warn'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        messages.push(args.map((a) => (a instanceof Error) ? `${a.name}: ${a.message}` : String(a)).join(' '));
      }));
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    const unexpected = messages.filter((m) => !allowed.some((pattern) => pattern.test(m)));
    expect(unexpected).toEqual([]);
  });

  return { messages };
}

/** Counts how many times the component function ran. Call it at the top of the component. */
export function useRenderCount(counter: { renders: number }): void {
  counter.renders++;
}

/**
 * Records, after every commit of the component that calls it, the value returned by `read`.
 * The layout effect runs after all DOM mutations of the commit, so `read` can read the DOM
 * and get the complete committed result, not a partial one.
 */
export function useCommitProbe<T>(log: T[], read: () => T): void {
  useLayoutEffect(() => {
    log.push(read());
  });
}

/** A simple error boundary that shows the error message, and can be reset. */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode, onError?: (error: Error) => void, resetKey?: unknown },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps: { resetKey?: unknown }) {
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error !== null) return React.createElement('span', null, `error:${this.state.error.message}`);
    return this.props.children;
  }
}

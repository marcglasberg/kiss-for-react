import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/nonStateObjectInState';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: non-state-object-in-state');

const stateWith = (field: string, header = '') => `${header}import { createStore } from 'kiss-for-react';
import type { MutableRefObject, ReactElement, ReactNode, RefObject } from 'react';

class User { constructor(readonly name: string) {} }

class State {
  ${field}
}

export const store = createStore<State>({ initialState: new State() });
`;

Bdd(feature)
  .scenario('A field of a state class that holds a promise, a timer, or another resource is a warning.')
  .given('A state class with a field that holds an object that is not state.')
  .when('The code is linted.')
  .then('There is a warning in the field, which says to keep it outside the state.')
  .example(val('Field', 'readonly user: Promise<User> | null = null;'), val('Type', 'Promise'))
  .example(val('Field', 'readonly users: Promise<User>[] = [];'), val('Type', 'Promise'))
  .example(val('Field', 'readonly loads: ReadonlyMap<string, Promise<User>> = new Map();'), val('Type', 'Promise'))
  .example(val('Field', 'readonly controller = new AbortController();'), val('Type', 'AbortController'))
  .example(val('Field', 'readonly socket: WebSocket | null = null;'), val('Type', 'WebSocket'))
  .example(val('Field', 'readonly events: EventSource | null = null;'), val('Type', 'EventSource'))
  .example(val('Field', 'readonly worker: Worker | null = null;'), val('Type', 'Worker'))
  .example(val('Field', 'readonly timer: NodeJS.Timeout | null = null;'), val('Type', 'NodeJS.Timeout'))
  .example(val('Field', 'readonly timer: ReturnType<typeof setTimeout> | null = null;'), val('Type', 'NodeJS.Timeout'))
  .run(async (ctx) => {
    const type = ctx.example.val('Type') as string;
    const code = stateWith(ctx.example.val('Field') as string, '/// <reference types="node" />\n');
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toBe(
      `The field \`${result.messages[0].text}\` of the state class \`State\` holds a \`${type}\`, which is not state: ` +
      'it can\'t be compared, saved or restored. Keep it outside the state, for example in a module, or in the action that uses it.');
  });

Bdd(feature)
  .scenario('A field of a state class that holds a DOM node, a React ref or a React element is a warning.')
  .given('A state class with a field that holds a part of the UI.')
  .when('The code is linted.')
  .then('There is a warning in the field, which says to keep it in the component.')
  .example(val('Field', 'readonly input: HTMLInputElement | null = null;'), val('Type', 'HTMLElement'))
  .example(val('Field', 'readonly node: Element | null = null;'), val('Type', 'Element'))
  .example(val('Field', 'readonly ref: RefObject<HTMLDivElement> | null = null;'), val('Type', 'React.RefObject'))
  .example(val('Field', 'readonly ref: MutableRefObject<number> | null = null;'), val('Type', 'React.MutableRefObject'))
  .example(val('Field', 'readonly title: ReactNode = null;'), val('Type', 'React.ReactNode'))
  .example(val('Field', 'readonly icons: readonly ReactElement[] = [];'), val('Type', 'React.ReactElement'))
  .run(async (ctx) => {
    const type = ctx.example.val('Type') as string;
    const result = lint(rule, stateWith(ctx.example.val('Field') as string));
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toBe(
      `The field \`${result.messages[0].text}\` of the state class \`State\` holds a \`${type}\`, which is not state: ` +
      'it belongs to the UI, and can\'t be saved or restored. Keep it in the component.');
  });

Bdd(feature)
  .scenario('Subclasses of objects that are not state are warnings too.')
  .given('A state class with a field whose class extends Promise.')
  .when('The code is linted.')
  .then('There is a warning in the field.')
  .run(async (_) => {
    const code = stateWith('readonly task: Task | null = null;') + `
class Task extends Promise<void> {}
`;
    expect(lint(rule, code).messages.map((m) => m.text)).toEqual(['task']);
  });

Bdd(feature)
  .scenario('State values, functions and timers that are numbers are fine.')
  .given('A state class with users, a date, a function, a user class named Node, and a number timer.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = stateWith(`readonly users: readonly User[] = [];
  readonly date: Date = new Date();
  readonly format: (user: User) => string = (user) => user.name;
  readonly load: () => Promise<User> = async () => new User('a');
  readonly node: Node2 | null = null;
  readonly timer: ReturnType<typeof setTimeout> | null = null;`) + `
class Node2 { constructor(readonly children: readonly Node2[]) {} }
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A user class named like a DOM type is fine.')
  .given('A state class with a field of a user class named Node.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';

class Node { constructor(readonly children: readonly Node[]) {} }

class State {
  readonly tree: Node = new Node([]);
}

export const store = createStore<State>({ initialState: new State() });
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Classes that are not state classes, and code without type information, are not reported.')
  .given('A class with a promise, which is not part of the state, and a state class with a promise.')
  .when('The code is linted, with or without type information.')
  .then('With type information, only the state class is reported.')
  .and('Without type information, nothing is reported, since the rule needs it.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = stateWith('readonly user: Promise<User> | null = null;') + `
export class Loader { readonly user: Promise<User> | null = null; }
`;
    expect(lint(rule, code, {types}).messages.map((m) => m.line)).toEqual(types ? [7] : []);
  });

import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/copyMissingField';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: copy-missing-field');

const stateWith = (members: string) => `import { createStore } from 'kiss-for-react';

class State {
  constructor(readonly name: string, readonly age: number, readonly email: string) {}
${members}
}

export const store = createStore<State>({ initialState: new State('Mary', 30, 'mary@example.com') });
`;

Bdd(feature)
  .scenario('A copy method with a destructured object that misses a field is a warning, with a suggestion to add it.')
  .given('A state class with the fields name, age and email.')
  .and('A copy method that only accepts name and email.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning in the method, which says age is missing.')
  .and('The suggestion adds age to the parameters, and uses it in the new state.')
  .and('The code compiles, and has no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = stateWith(`  copy({ name, email }: { name?: string, email?: string }) {
    return new State(name ?? this.name, this.age, email ?? this.email);
  }`);
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['copy']);
    expect(result.messages[0].message).toBe(
      'The `copy` method of the state class `State` can\'t change the field `age`. Add it to its parameters, ' +
      'or the copies always keep the old value.');
    expect(result.messages[0].suggestions).toEqual(['Add the field `age` to the parameters.']);
    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain('copy({ name, email, age }: { name?: string, email?: string, age?: number }) {');
    expect(fixed).toContain('return new State(name ?? this.name, age ?? this.age, email ?? this.email);');
    if (types) expect(lint(rule, fixed).typeErrors).toEqual([]);
    expect(lint(rule, fixed, {types}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A copy method with separate parameters that misses fields is a warning, with a suggestion to add them.')
  .given('A state class with the fields name, age and email.')
  .and('A copyWith method with a name parameter, that creates the state with an object.')
  .when('The code is linted.')
  .then('There is a warning, which says age and email are missing.')
  .and('The suggestion adds them to the parameters, and the code compiles.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';

class State {
  readonly name: string;
  readonly age: number;
  readonly email: string;
  constructor({ name, age, email }: { name: string, age: number, email: string }) {
    this.name = name;
    this.age = age;
    this.email = email;
  }
  copyWith(name?: string) {
    return new State({ name: name ?? this.name, age: this.age, email: this.email });
  }
}

export const store = createStore<State>({ initialState: new State({ name: 'Mary', age: 30, email: 'mary@example.com' }) });
`;
    const result = lint(rule, code);
    expect(result.messages[0].message).toContain('can\'t change the fields `age` and `email`. Add them');
    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain('copyWith(name?: string, age?: number, email?: string) {');
    expect(fixed).toContain('return new State({ name: name ?? this.name, age: age ?? this.age, email: email ?? this.email });');
    expect(lint(rule, fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The suggestion keeps a type with one member per line.')
  .given('A copy method whose parameter type has one member per line.')
  .when('The code is linted.')
  .then('The suggestion adds the missing field in a new line, and the code compiles.')
  .run(async (_) => {
    const code = stateWith(`  copy({ name, email }: {
    name?: string;
    email?: string;
  }) {
    return new State(name ?? this.name, this.age, email ?? this.email);
  }`);
    const fixed = lint(rule, code).withSuggestion(0, 0);
    expect(fixed).toContain(`  copy({ name, email, age }: {
    name?: string;
    email?: string;
    age?: number;
  }) {`);
    expect(lint(rule, fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Copy methods that can change all fields are fine.')
  .given('A state class with copy methods that accept all fields, or a Partial of the state.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true), val('Method', `copy({ name, age, email }: { name?: string, age?: number, email?: string }) {
    return new State(name ?? this.name, age ?? this.age, email ?? this.email);
  }`))
  .example(val('Type information', false), val('Method', `copy(name = this.name, age = this.age, email = this.email) {
    return new State(name, age, email);
  }`))
  .example(val('Type information', true), val('Method', `copy(changes: Partial<State>) {
    return Object.assign(new State(this.name, this.age, this.email), changes);
  }`))
  .example(val('Type information', true), val('Method', `copy(changes: Partial<State>) {
    const s = { ...this, ...changes };
    return new State(s.name, s.age, s.email);
  }`))
  .example(val('Type information', false), val('Method', `copy(changes: Partial<State>) {
    return new State(changes.name ?? this.name, changes.age ?? this.age, changes.email ?? this.email);
  }`))
  .run(async (ctx) => {
    const code = stateWith(`  ${ctx.example.val('Method')}`);
    const types = ctx.example.val('Type information') as boolean;
    const result = lint(rule, code, {types});
    if (types) expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, a copy with an object parameter that misses a field is a warning.')
  .given('A copy method whose parameter is a Pick of some fields of the state.')
  .when('The code is linted with type information.')
  .then('There is a warning, with no suggestion.')
  .run(async (_) => {
    const code = stateWith(`  copy(changes: Pick<State, 'name' | 'age'>) {
    return new State(changes.name, changes.age, this.email);
  }`);
    const result = lint(rule, code);
    expect(result.messages[0].message).toContain('can\'t change the field `email`.');
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Other methods, private fields, and classes that are not state classes are not reported.')
  .given('A state class with a private field, and methods named withName and copy that don\'t list it.')
  .and('A class that is not part of the state, with a copy method that misses a field.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';

class State {
  constructor(readonly name: string, readonly age: number, private readonly cache: string) {}
  withName(name: string) { return new State(name, this.age, this.cache); }
  copy({ name, age }: { name?: string, age?: number }) { return new State(name ?? this.name, age ?? this.age, this.cache); }
}

export class Point {
  constructor(readonly x: number, readonly y: number) {}
  copy({ x }: { x?: number }) { return new Point(x ?? this.x, this.y); }
}

export const store = createStore<State>({ initialState: new State('Mary', 30, '') });
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('There is no suggestion when the field can be null.')
  .given('A state class with a field that can be null.')
  .and('A copy method that doesn\'t list it.')
  .when('The code is linted.')
  .then('There is a warning, with no suggestion, since name ?? this.name would not allow setting it to null.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';

class State {
  constructor(readonly name: string, readonly user: string | null) {}
  copy({ name }: { name?: string }) { return new State(name ?? this.name, this.user); }
}

export const store = createStore<State>({ initialState: new State('Mary', null) });
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['copy']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { createStore, stateClass } from '../src';

import * as ts from 'typescript';
import { runInNewContext } from 'vm';

reporter(new FeatureFileReporter());
const feature = new Feature('Optional state class decorator');

Bdd(feature)
  .scenario('The state class decorator preserves the class and its instances.')
  .given('A class with constructor arguments, a static member, and a method.')
  .when('The class is annotated and an instance is used as store state.')
  .then('The constructor, members, and state instance are preserved without freezing the instance.')
  .run(async () => {
    class Original {
      static label = 'user';
      constructor(public name: string) {}
      greeting() { return this.name; }
    }
    expect(stateClass(Original)).toBeUndefined();
    @stateClass
    class User extends Original {}
    const user = new User('Mary');
    const store = createStore({initialState: user});
    expect(store.state).toBe(user);
    expect(user).toBeInstanceOf(Original);
    expect(User.label).toBe('user');
    expect(user.greeting()).toBe('Mary');
    expect(Object.isFrozen(user)).toBe(false);
    user.name = 'John';
    expect(user.greeting()).toBe('John');
  });

Bdd(feature)
  .scenario('The decorator preserves behavior with modern and legacy decorator compilation.')
  .given('An annotated class compiled with modern decorators and with experimentalDecorators.')
  .when('Each compiled class is instantiated.')
  .then('Both instances retain their constructor arguments and methods.')
  .run(async () => {
    for (const experimentalDecorators of [false, true]) {
      const result = ts.transpileModule(`
        @stateClass
        class User {
          constructor(public readonly name: string) {}
          greeting() { return this.name; }
        }
        new User('Mary').greeting();
      `, {compilerOptions: {target: ts.ScriptTarget.ES2022, experimentalDecorators}, reportDiagnostics: true});
      expect(result.diagnostics).toEqual([]);
      expect(runInNewContext(result.outputText, {stateClass})).toBe('Mary');
    }
  });

import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with a class that has a static toString');

Bdd(feature)
  .scenario('A class with a static toString is read back by running its constructor.')
  .given('A class with a private field, a field initializer, and a <StaticToString>.')
  .and('An instance whose count was changed.')
  .when('The instance is serialized, and then deserialized.')
  .then('The instance read back has its private field.')
  .and('It has the field initializer of its class.')
  .and('It has the saved count.')
  .example(val('StaticToString', 'static toString of its own'))
  .example(val('StaticToString', 'static toString inherited from its parent class'))
  .run(async (ctx) => {
    const CounterClass = ctx.example.val('StaticToString') === 'static toString of its own'
      ? Counter
      : ChildCounter;
    const original = new CounterClass();
    original.count = 5;

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [CounterClass]);

    expect(read).toBeInstanceOf(CounterClass);
    expect(read.secret).toBe(42);
    expect(read.label).toBe('counter');
    expect(read.count).toBe(5);
  });

Bdd(feature)
  .scenario('A class with a static toString that looks like a class is still read back.')
  .given('A class whose static toString returns text starting with "class".')
  .when('An instance is serialized, and then deserialized.')
  .then('The instance read back has its private field, and the saved fields.')
  .run(async (_) => {
    const original = new Tricky();
    original.count = 7;

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [Tricky]);

    expect(read).toBeInstanceOf(Tricky);
    expect(read.secret).toBe(42);
    expect(read.count).toBe(7);
  });

class Counter {
  #secret = 42;
  label = 'counter';
  count = 0;

  static toString() {
    return 'Counter';
  }

  get secret() {
    return this.#secret;
  }
}

class Base {
  static toString() {
    return 'A counter';
  }
}

class ChildCounter extends Base {
  #secret = 42;
  label = 'counter';
  count = 0;

  get secret() {
    return this.#secret;
  }
}

class Tricky {
  #secret = 42;
  count = 0;

  static toString() {
    return 'class Tricky';
  }

  get secret() {
    return this.#secret;
  }
}

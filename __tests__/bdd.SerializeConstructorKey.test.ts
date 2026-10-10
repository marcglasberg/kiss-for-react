import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ClassPersistor, KissAction, Store } from '../src';
import { ESSerializer } from '../src/Esserializer';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with a constructor key');

Bdd(feature)
  .scenario('A plain object with a constructor key is serialized and read back.')
  .given('A plain object with a "constructor" key holding <Constructor>, which is not a function.')
  .when('The object is serialized, and then deserialized.')
  .then('The object read back is equal to the original one.')
  .example(val('Constructor', '1'))
  .example(val('Constructor', '"text"'))
  .example(val('Constructor', 'true'))
  .example(val('Constructor', 'null'))
  .example(val('Constructor', '{"a":1}'))
  .example(val('Constructor', '[1,2]'))
  .run(async (ctx) => {
    const value = { the: 3, constructor: JSON.parse(ctx.example.val('Constructor')) };

    const read = ESSerializer.deserialize(ESSerializer.serialize(value), []);

    expect(read).toEqual(value);
    expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
  });

Bdd(feature)
  .scenario('A dictionary keyed by user text, inside a class, may have a constructor key.')
  .given('A class with a dictionary of word counts.')
  .and('One of the words is "constructor".')
  .when('The class instance is serialized, and then deserialized.')
  .then('The instance read back has the same word counts.')
  .run(async (_) => {
    const original = new WordCounts({ the: 3, constructor: 1, toString: 2 });

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [WordCounts]);

    expect(read).toBeInstanceOf(WordCounts);
    expect(read.counts).toEqual({ the: 3, constructor: 1, toString: 2 });
  });

Bdd(feature)
  .scenario('The ClassPersistor saves a state with a constructor key, and keeps saving.')
  .given('A store with a ClassPersistor, whose state has a dictionary of word counts.')
  .when('The word "constructor" is counted.')
  .and('Then the word "the" is counted.')
  .then('Both state changes are saved, and are read back.')
  .and('No error is reported.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const errors: any[] = [];

    const store = new Store<WordCounts>({
      initialState: new WordCounts({}),
      persistor: storage.persistor<WordCounts>([WordCounts]),
      errorObserver: ({ error }) => {
        errors.push(error);
        return null;
      },
      logger: () => {},
    });
    await store.ready();

    store.dispatch(new CountWord('constructor'));
    await delayMillis(10);
    store.dispatch(new CountWord('the'));
    await delayMillis(10);

    expect(errors).toEqual([]);
    const read = await storage.persistor<WordCounts>([WordCounts]).readState();
    expect(read).toBeInstanceOf(WordCounts);
    expect(read!.counts).toEqual({ constructor: 1, the: 1 });
  });

Bdd(feature)
  .scenario('A function-style class whose instances have their own constructor property is kept.')
  .given('A function-style class, like Big from big.js, whose prototype is a plain object.')
  .and('Its instances have their own "constructor" property, pointing to the class.')
  .when('An instance is serialized, and then deserialized.')
  .then('The value read back is an instance of that class, with the same fields.')
  .run(async (_) => {
    const original = new (Money as any)(42);

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [Money]);

    expect(read).toBeInstanceOf(Money);
    expect(read.amount).toBe(42);
    expect(read.constructor).toBe(Money);
  });

class WordCounts {
  constructor(readonly counts: Record<string, number>) {
  }
}

class CountWord extends KissAction<WordCounts> {
  constructor(readonly word: string) {
    super();
  }

  reduce() {
    const counts = this.state.counts;
    const current = Object.prototype.hasOwnProperty.call(counts, this.word) ? counts[this.word] : 0;
    return new WordCounts({ ...counts, [this.word]: current + 1 });
  }
}

/** Like Big from big.js: the prototype is a plain object, and each instance points to its class. */
function Money(this: any, amount: number) {
  this.constructor = Money;
  this.amount = amount;
}

Money.prototype = {};

class MemoryStorage {
  serialized: string | null = null;

  persistor<St>(classes: any[]): ClassPersistor<St> {
    ESSerializer.clearRegisteredClasses();
    const persistor = new ClassPersistor<St>(
      async () => this.serialized,
      async (s) => { this.serialized = s; },
      async () => { this.serialized = null; },
      classes,
    );
    // No throttle, so every state change is saved right away.
    Object.defineProperty(persistor, 'throttle', { get: () => null });
    return persistor;
  }
}

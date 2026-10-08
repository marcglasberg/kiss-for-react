import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { ClassPersistor, StoreException } from '../src';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ClassPersistor class names');

Bdd(feature)
  .scenario('A class with a typeName is saved under its typeName.')
  .given('A state class with a static typeName that differs from its class name.')
  .when('The state is saved by the ClassPersistor, and then read back.')
  .then('The saved text uses the typeName.')
  .and('The state read back is an instance of the same class.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor<Renamed>([Renamed]);

    await persistor.saveInitialState(new Renamed(7));
    expect(storage.serialized).toContain('"StableKey"');
    expect(storage.serialized).not.toContain('"Renamed"');

    const read = await persistor.readState();
    expect(read).toBeInstanceOf(Renamed);
    expect(read!.value).toBe(7);
  });

Bdd(feature)
  .scenario('Two classes with the same minified name are read back as the right classes, when both have a typeName.')
  .given('Two different state classes, both named "e", as a minifier would name them.')
  .and('Each one has its own typeName.')
  .and('Class names are being minified.')
  .when('The state is saved by the ClassPersistor, and then read back.')
  .then('Each object is read back as an instance of its own class.')
  .run(async (_) => {
    const A = makeClassNamedE('A');
    const B = makeClassNamedE('B');
    expect(A.name).toBe('e');
    expect(B.name).toBe('e');

    const storage = new MemoryStorage();
    const persistor = storage.persistor<any>([A, B], true);

    await persistor.saveInitialState([new A(), new B()]);
    const read = await persistor.readState();

    expect(read[0]).toBeInstanceOf(A);
    expect(read[1]).toBeInstanceOf(B);
  });

Bdd(feature)
  .scenario('The ClassPersistor throws when class names are minified and a class has no typeName.')
  .given('Class names are being minified.')
  .and('A state class with no typeName.')
  .when('The ClassPersistor is created.')
  .then('It throws a StoreException that names the problem.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([NoTypeName], true)).toThrow(StoreException);
    expect(() => storage.persistor<any>([NoTypeName], true)).toThrow(/minif/i);
  });

Bdd(feature)
  .scenario('The ClassPersistor throws when a class name starts with a lowercase letter.')
  .given('A state class with no typeName, whose name starts with a lowercase letter, as a minifier would name it.')
  .when('The ClassPersistor is created.')
  .then('It throws a StoreException that names the problem.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([makeClassNamedE()])).toThrow(StoreException);
    expect(() => storage.persistor<any>([makeClassNamedE()])).toThrow(/minif/i);
  });

Bdd(feature)
  .scenario('A subclass does not inherit the typeName of its parent class.')
  .given('A state class with a typeName.')
  .and('A subclass of it with no typeName of its own.')
  .and('Class names are being minified.')
  .when('The ClassPersistor is created with both classes.')
  .then('It throws a StoreException, because the subclass has no typeName.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([Renamed, RenamedChild], true)).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('A subclass without a typeName is saved under its own class name.')
  .given('A state class with a typeName.')
  .and('A subclass of it with no typeName of its own.')
  .when('A subclass object is saved by the ClassPersistor, and then read back.')
  .then('It is read back as an instance of the subclass, not of the parent class.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor<any>([Renamed, RenamedChild]);

    await persistor.saveInitialState(new RenamedChild(3));
    const read = await persistor.readState();

    expect(read).toBeInstanceOf(RenamedChild);
  });

Bdd(feature)
  .scenario('The ClassPersistor throws when two classes are saved under the same name.')
  .given('Two different state classes that end up with the same name.')
  .when('The ClassPersistor is created with both classes.')
  .then('It throws a StoreException that names the duplicated name.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([Renamed, AlsoStableKey])).toThrow(StoreException);
    expect(() => storage.persistor<any>([Renamed, AlsoStableKey])).toThrow(/StableKey/);
  });

Bdd(feature)
  .scenario('Listing the same class twice is not a problem.')
  .given('A state class listed twice.')
  .when('The ClassPersistor is created.')
  .then('It does not throw.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([NoTypeName, NoTypeName])).not.toThrow();
  });

Bdd(feature)
  .scenario('The ClassPersistor throws when a typeName is not a non-empty string.')
  .given('A state class whose typeName is an empty string.')
  .when('The ClassPersistor is created.')
  .then('It throws a StoreException.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([EmptyTypeName])).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('Class names are not minified when the tests run.')
  .given('The library is not minified.')
  .when('The ClassPersistor checks if class names are minified.')
  .then('It finds they are not.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    expect(() => storage.persistor<any>([NoTypeName])).not.toThrow();
  });

/**
 * A ClassPersistor that can pretend class names are being minified.
 */
class TestClassPersistor<St> extends ClassPersistor<St> {
  static pretendMinified = false;

  protected classNamesAreMinified(): boolean {
    return TestClassPersistor.pretendMinified;
  }
}

class MemoryStorage {
  serialized: string | null = null;

  persistor<St>(classes: any[], minified = false): ClassPersistor<St> {
    ESSerializer.clearRegisteredClasses();
    TestClassPersistor.pretendMinified = minified;
    return new TestClassPersistor<St>(
      async () => this.serialized,
      async (s) => { this.serialized = s; },
      async () => { this.serialized = null; },
      classes,
    );
  }
}

/** Returns a new class whose name is "e", like a minified class. */
function makeClassNamedE(typeName?: string): any {
  const e = class {
  };
  if (typeName !== undefined) (e as any).typeName = typeName;
  return e;
}

class Renamed {
  static readonly typeName = 'StableKey';

  constructor(readonly value: number) {
  }
}

class RenamedChild extends Renamed {
}

class AlsoStableKey {
  static readonly typeName = 'StableKey';
}

class NoTypeName {
}

class EmptyTypeName {
  static readonly typeName = '';
}

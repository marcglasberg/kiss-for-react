import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ClassPersistor, Store } from '../src';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with getter-only properties');

Bdd(feature)
  .scenario('A saved field that is now a getter-only property is ignored when read.')
  .given('A class that had a "total" field in an old version of the app.')
  .and('In the new version, "total" is a getter-only property, defined in the <Where>.')
  .when('A state saved by the old version is deserialized.')
  .then('Deserializing does not throw.')
  .and('The getter returns the value computed from the other fields.')
  .and('The other fields are read back.')
  .example(val('Where', 'class'))
  .example(val('Where', 'constructor'))
  .run(async (ctx) => {
    const cartClass = ctx.example.val('Where') === 'class' ? Cart : CartWithOwnGetter;
    const saved = `{"*type":"${cartClass.name}","items":[1,2,3],"total":99}`;

    const read = ESSerializer.deserialize(saved, [cartClass]);

    expect(read).toBeInstanceOf(cartClass);
    expect(read.items).toEqual([1, 2, 3]);
    expect(read.total).toBe(3);
  });

Bdd(feature)
  .scenario('A saved field that is now a property with a setter keeps the value the constructor gave it.')
  .given('A class that had a "discount" field in an old version of the app.')
  .and('In the new version, "discount" is a property with a getter and a setter, defined in the class.')
  .when('A state saved by the old version is deserialized.')
  .then('Deserializing does not throw.')
  .and('The setter is not called, so "discount" keeps the value the constructor gave it.')
  .and('The other fields are read back.')
  .run(async (_) => {
    const saved = '{"*type":"Order","items":[1,2],"discount":50}';

    const read = ESSerializer.deserialize(saved, [Order]);

    expect(read).toBeInstanceOf(Order);
    expect(read.items).toEqual([1, 2]);
    expect(read.discount).toBe(0);
    expect(read.setterCalls).toBe(0);
  });

Bdd(feature)
  .scenario('A nested saved field that is now a getter-only property is ignored when read.')
  .given('A class with a read-only property holding an object, created by the constructor.')
  .and('That object had a "total" field in an old version of the app, which is now a getter-only property.')
  .when('A state saved by the old version is deserialized.')
  .then('Deserializing does not throw.')
  .and('The getter of the nested object returns the value computed from its other fields.')
  .run(async (_) => {
    const saved = '{"*type":"Shop","cart":{"*type":"Cart","items":[1,2],"total":99}}';

    const read = ESSerializer.deserialize(saved, [Shop, Cart]);

    expect(read).toBeInstanceOf(Shop);
    expect(read.cart).toBeInstanceOf(Cart);
    expect(read.cart.items).toEqual([1, 2]);
    expect(read.cart.total).toBe(2);
  });

Bdd(feature)
  .scenario('The ClassPersistor reads a state saved before a field became a getter, and keeps it.')
  .given('A state saved by an old version of the app, where "total" was a field.')
  .and('In the new version, "total" is a getter-only property.')
  .when('A store with a ClassPersistor starts, and reads that saved state.')
  .then('No error is reported.')
  .and('The store state is the saved state.')
  .and('The saved state is not deleted.')
  .run(async (_) => {
    const saved = '{"*type":"Cart","items":[1,2,3],"total":3}';
    const storage = new MemoryStorage(saved);
    const errors: any[] = [];

    const store = new Store<Cart>({
      initialState: new Cart(),
      persistor: storage.persistor<Cart>([Cart]),
      errorObserver: ({ error }) => {
        errors.push(error);
        return null;
      },
      logger: () => {},
    });
    await store.ready();

    expect(errors).toEqual([]);
    expect(store.state).toBeInstanceOf(Cart);
    expect(store.state.items).toEqual([1, 2, 3]);
    expect(store.state.total).toBe(3);
    expect(storage.serialized).toBe(saved);
  });

class Cart {
  items: number[] = [];

  get total() {
    return this.items.length;
  }
}

class CartWithOwnGetter {
  items: number[] = [];
  declare readonly total: number;

  constructor() {
    Object.defineProperty(this, 'total', { get: () => this.items.length, enumerable: false });
  }
}

class Order {
  items: number[] = [];
  setterCalls = 0;
  private _discount = 0;

  get discount() {
    return this._discount;
  }

  set discount(value: number) {
    this.setterCalls++;
    this._discount = value;
  }
}

class Shop {
  declare readonly cart: Cart;

  constructor() {
    Object.defineProperty(this, 'cart', { value: new Cart(), writable: false, enumerable: true });
  }
}

class MemoryStorage {
  constructor(public serialized: string | null) {
  }

  persistor<St>(classes: any[]): ClassPersistor<St> {
    ESSerializer.clearRegisteredClasses();
    return new ClassPersistor<St>(
      async () => this.serialized,
      async (s) => { this.serialized = s; },
      async () => { this.serialized = null; },
      classes,
    );
  }
}

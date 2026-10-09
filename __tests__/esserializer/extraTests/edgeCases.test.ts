import { expect } from '@jest/globals';
import { ESSerializer } from '../../../src/Esserializer';

const roundTrip = (value: any, classes: any[] = []) =>
  ESSerializer.deserialize(ESSerializer.serialize(value), classes);

class Item {
  constructor(public name: string = '') {
  }
}

beforeEach(() => ESSerializer.clearRegisteredClasses());

describe('numbers', () => {
  test('-0 is kept', () => {
    expect(Object.is(roundTrip(-0), -0)).toBe(true);
    expect(Object.is(roundTrip([-0])[0], -0)).toBe(true);
    expect(Object.is(roundTrip(new Float64Array([-0]))[0], -0)).toBe(true);
  });

  test('NaN, Infinity and -Infinity are kept', () => {
    expect(roundTrip({ a: NaN, b: Infinity, c: -Infinity })).toEqual({ a: NaN, b: Infinity, c: -Infinity });
  });

  test('Number objects are kept', () => {
    const result = roundTrip(new Number(5));
    expect(result).toBeInstanceOf(Number);
    expect(result.valueOf()).toBe(5);
    expect(roundTrip(new Number(NaN)).valueOf()).toBeNaN();
  });
});

describe('arrays', () => {
  test('holes in sparse arrays are kept', () => {
    // eslint-disable-next-line no-sparse-arrays
    const result = roundTrip([1, , 3]);
    expect(result.length).toBe(3);
    expect(1 in result).toBe(false);
    expect(result[2]).toBe(3);
  });

  test('undefined items are kept', () => {
    const result = roundTrip([undefined, 1]);
    expect(result.length).toBe(2);
    expect(0 in result).toBe(true);
    expect(result[0]).toBeUndefined();
  });

  test('subclasses of Array keep their class and items', () => {
    class MyList extends Array {
    }

    const list = MyList.from([1, new Item('x')]);
    const result = roundTrip(list, [MyList, Item]);
    expect(result).toBeInstanceOf(MyList);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(1);
    expect(result[1]).toBeInstanceOf(Item);
  });
});

describe('plain objects', () => {
  test('objects without a prototype are serialized as plain objects', () => {
    const obj = Object.assign(Object.create(null), { a: 1 });
    expect(roundTrip(obj)).toEqual({ a: 1 });
  });

  test('a "__proto__" key is read back as a normal property, without changing the prototype', () => {
    const result = ESSerializer.deserialize('{"__proto__":{"polluted":1}}');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
  });

  test('a "__proto__" own property is kept', () => {
    const obj = JSON.parse('{"__proto__":{"a":1}}');
    const result = roundTrip(obj);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')!.value).toEqual({ a: 1 });
  });

  test('keys that look like the metadata fields are kept', () => {
    const obj = { '*type': 'x', '*value': 1, '**type': 2, '*': 3, '**': 4 };
    expect(roundTrip(obj)).toEqual(obj);
    expect(roundTrip(new Map([['k', obj]])).get('k')).toEqual(obj);
  });

  test('ignoreProperties and rawProperties work with keys that start with "*"', () => {
    const text = ESSerializer.serialize({ '*a': { x: 1 }, '*b': 2 });
    expect(ESSerializer.deserialize(text, [], { rawProperties: ['*a'], ignoreProperties: ['*b'] }))
      .toEqual({ '*a': '{"x":1}' });
  });
});

describe('class names', () => {
  test('user classes with the same name as a built-in class are not confused with it', () => {
    class Map {
      a = 1;
    }

    class Locale {
      b = 2;
    }

    const result = roundTrip({ m: new Map(), l: new Locale(), real: new globalThis.Map([[1, 2]]) }, [Map, Locale]);
    expect(result.m).toBeInstanceOf(Map);
    expect(result.m.a).toBe(1);
    expect(result.l).toBeInstanceOf(Locale);
    expect(result.l.b).toBe(2);
    expect(result.real).toBeInstanceOf(globalThis.Map);
    expect(result.real.get(1)).toBe(2);
  });

  test('user classes with the same name as a special type are not confused with it', () => {
    class UD {
      a = 1;
    }

    class NF {
      a = 2;
    }

    class BI {
      a = 3;
    }

    const result = roundTrip([new UD(), new NF(), new BI()], [UD, NF, BI]);
    expect(result[0]).toBeInstanceOf(UD);
    expect(result[1]).toBeInstanceOf(NF);
    expect(result[2]).toBeInstanceOf(BI);
  });

  test('a typeName with the name of a built-in class is not confused with it', () => {
    class X {
      static typeName = 'Map';
      a = 1;
    }

    const result = roundTrip(new X(), [X]);
    expect(result).toBeInstanceOf(X);
    expect(result.a).toBe(1);
  });
});

describe('errors', () => {
  test('subclasses of Error keep their message, stack, name and fields', () => {
    class MyError extends Error {
      code = 7;
    }

    const error = new MyError('boom');
    const result = roundTrip(error, [MyError]);
    expect(result).toBeInstanceOf(MyError);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('boom');
    expect(result.stack).toBe(error.stack);
    expect(result.code).toBe(7);
  });

  test('a custom error name is kept', () => {
    class NamedError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = 'NamedError';
      }
    }

    const result = roundTrip(new NamedError('x'), [NamedError]);
    expect(result.name).toBe('NamedError');
    const plain = new Error('y');
    plain.name = 'Custom';
    expect(roundTrip(plain).name).toBe('Custom');
  });

  test('the cause is kept', () => {
    const result = roundTrip(new Error('a', { cause: new Item('why') }), [Item]);
    expect(result.cause).toBeInstanceOf(Item);
    expect(result.cause.name).toBe('why');
    expect('cause' in roundTrip(new Error('b'))).toBe(false);
  });

  test('extra fields of built-in errors are kept', () => {
    const error: any = new TypeError('bad');
    error.code = 'E_BAD';
    const result = roundTrip(error);
    expect(result).toBeInstanceOf(TypeError);
    expect(result.code).toBe('E_BAD');
  });

  test('message, name and stack are not saved twice', () => {
    const result = roundTrip(roundTrip(new RangeError('r')));
    expect(Object.keys(result)).toEqual([]);
    expect(result.message).toBe('r');
  });
});

describe('subclasses of built-in classes', () => {
  test('a Map subclass keeps its entries', () => {
    class MyMap extends Map {
      extra = 1;
    }

    const result = roundTrip(new (MyMap as any)([['a', new Item('x')]]), [MyMap, Item]);
    expect(result).toBeInstanceOf(MyMap);
    expect(result.get('a')).toBeInstanceOf(Item);
    expect(result.extra).toBe(1);
  });

  test('a Set subclass keeps its items', () => {
    class MySet extends Set {
    }

    const result = roundTrip(new MySet([1, 2]), [MySet]);
    expect(result).toBeInstanceOf(MySet);
    expect(Array.from(result)).toEqual([1, 2]);
  });

  test('a Date subclass keeps its time', () => {
    class MyDate extends Date {
    }

    const result = roundTrip(new MyDate(12345), [MyDate]);
    expect(result).toBeInstanceOf(MyDate);
    expect(result.getTime()).toBe(12345);
  });

  test('subclasses of other built-in classes are rejected when serializing', () => {
    class MyRegExp extends RegExp {
    }

    expect(() => ESSerializer.serialize(new MyRegExp('a'))).toThrow('MyRegExp');
  });
});

describe('dates', () => {
  test('an invalid Date is read back as an invalid Date', () => {
    const result = roundTrip(new Date(NaN));
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeNaN();
  });
});

describe('Intl', () => {
  test('Intl.Segmenter and Intl.DisplayNames are kept', () => {
    const segmenter = roundTrip(new Intl.Segmenter('fr', { granularity: 'word' }));
    expect(segmenter).toBeInstanceOf(Intl.Segmenter);
    expect(segmenter.resolvedOptions().granularity).toBe('word');

    const names = roundTrip(new Intl.DisplayNames('en', { type: 'region' }));
    expect(names).toBeInstanceOf(Intl.DisplayNames);
    expect(names.of('BR')).toBe('Brazil');
  });
});

describe('values that cannot be serialized', () => {
  test('throw when serializing, instead of failing later when deserializing', () => {
    expect(() => ESSerializer.serialize(new WeakMap())).toThrow('WeakMap');
    expect(() => ESSerializer.serialize({ a: new WeakSet() })).toThrow('WeakSet');
    expect(() => ESSerializer.serialize(Promise.resolve())).toThrow('Promise');
  });

  test('a top-level function or symbol throws', () => {
    expect(() => ESSerializer.serialize(() => 1)).toThrow();
    expect(() => ESSerializer.serialize(Symbol('s'))).toThrow();
  });

  test('functions and symbols inside arrays, Maps and Sets throw', () => {
    expect(() => ESSerializer.serialize([() => 1])).toThrow();
    expect(() => ESSerializer.serialize(new Set([Symbol('s')]))).toThrow();
  });

  test('function and symbol properties are skipped', () => {
    expect(roundTrip({ a: 1, f: () => 1, s: Symbol('s') })).toEqual({ a: 1 });
  });

  test('a circular reference throws a clear error', () => {
    const obj: any = { a: [] };
    obj.a.push(obj);
    expect(() => ESSerializer.serialize(obj)).toThrow(/circular/i);
  });

  test('the same object in two places is not a circular reference', () => {
    const shared = { v: 1 };
    const result = roundTrip({ a: shared, b: [shared] });
    expect(result.a).toEqual({ v: 1 });
    expect(result.b[0]).toEqual({ v: 1 });
  });

  test('an unknown built-in type throws when deserializing', () => {
    expect(() => ESSerializer.deserialize('{"*type":"@Nope"}')).toThrow('@Nope');
  });

  test('a class whose saved name starts with "@" is rejected', () => {
    class X {
      static typeName = '@X';
    }

    expect(() => ESSerializer.serialize(new X())).toThrow('@X');
  });
});

describe('complex values', () => {
  test('classes, built-ins and collections nested inside each other are kept', () => {
    class Holder {
      date = new Date(1);
      set = new Set([new Item('s')]);
      map = new Map<any, any>([[new Item('key'), [new Date(2), 3n]]]);
      list = [new Item('l'), undefined, NaN];
      nested = { deep: { error: new RangeError('r') } };
    }

    const result = roundTrip(new Holder(), [Holder, Item]);
    expect(result).toBeInstanceOf(Holder);
    expect(result.date.getTime()).toBe(1);
    expect([...result.set][0]).toBeInstanceOf(Item);
    const [key, value] = [...result.map][0];
    expect(key).toBeInstanceOf(Item);
    expect(key.name).toBe('key');
    expect(value[0].getTime()).toBe(2);
    expect(value[1]).toBe(3n);
    expect(result.list[0]).toBeInstanceOf(Item);
    expect(result.list[1]).toBeUndefined();
    expect(result.list[2]).toBeNaN();
    expect(result.nested.deep.error).toBeInstanceOf(RangeError);
  });

  test('serializing twice gives the same text', () => {
    class Holder {
      a = new Map([[1, new Set([new Date(3)])]]);
    }

    const text = ESSerializer.serialize(new Holder());
    expect(ESSerializer.serialize(ESSerializer.deserialize(text, [Holder]))).toBe(text);
  });
});

describe('hand-written JSON', () => {
  test('"@Array" is read as a plain array', () => {
    expect(ESSerializer.deserialize('{"*type":"@Array","*value":[1,{"*type":"@undefined"}]}')).toEqual([1, undefined]);
  });

  test('a type named like an inherited Object property is not found as a class', () => {
    expect(() => ESSerializer.deserialize('{"*type":"toString"}')).toThrow('toString');
  });
});

describe('random values', () => {
  class Point {
    constructor(public x: any = 0, public y: any = 0) {
    }
  }

  // A small seeded random generator, so that failures can be reproduced.
  let seed = 12345;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

  const primitives = [
    () => undefined, () => null, () => true, () => false, () => 0, () => -0, () => NaN, () => Infinity,
    () => -Infinity, () => random() * 1e6 - 5e5, () => Number.MAX_SAFE_INTEGER, () => Number.MIN_VALUE,
    () => BigInt(Math.floor(random() * 1e9)) * -7n, () => '', () => 'text ' + random(), () => '*type',
    () => '\u0000\n"\\ emoji 😀', () => new Date(Math.floor(random() * 1e12)), () => new Date(NaN),
    () => /a\/b[c]+/gimsuy, () => new Uint8Array([1, 2, 255]), () => new Float32Array([0.5, -0, Infinity]),
    () => new BigUint64Array([2n ** 64n - 1n]), () => new Error('e' + random()), () => new Number(-0),
  ];

  function randomValue(depth: number): any {
    if (depth <= 0 || random() < 0.3) {
      return pick(primitives)();
    }
    const children = () => Array.from({ length: Math.floor(random() * 4) }, () => randomValue(depth - 1));
    return pick([
      () => children(),
      () => Object.fromEntries(children().map((v, i) => [pick(['a', '*b', '__proto__', 'constructor', String(i)]) + i, v])),
      () => new Map(children().map((v) => [randomValue(0), v])),
      () => new Set(children()),
      () => new Point(randomValue(depth - 1), randomValue(depth - 1)),
      () => {
        // eslint-disable-next-line no-sparse-arrays
        const arr = [, ...children(), ,];
        return arr;
      },
    ])();
  }

  // Jest compares Dates by their timestamps, and NaN !== NaN, so it never finds two invalid Dates equal.
  expect.addEqualityTesters([
    (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date) ? Object.is(a.getTime(), b.getTime()) : undefined,
  ]);

  test('round-trip unchanged, and serialize to the same text again', () => {
    for (let i = 0; i < 500; i++) {
      const value = randomValue(4);
      const text = ESSerializer.serialize(value);
      const result = ESSerializer.deserialize(text, [Point]);
      expect(result).toStrictEqual(value);
      expect(ESSerializer.serialize(result)).toBe(text);
    }
  });
});

import { ESSerializer } from '../../../src/Esserializer';
import { getClassMappingFromClassArray } from '../../../src/Esserializer/deserializer';

class Item {
  constructor(public name: string = '') {
  }
}

describe('ESSerializer coverage gaps', () => {

  beforeEach(() => ESSerializer.clearRegisteredClasses());

  describe('Map', () => {
    test('round-trips a Map with primitive and class keys/values', () => {
      const map = new Map<any, any>([['a', 1], [2, new Item('x')], [new Item('k'), [1, 2]]]);
      const text = ESSerializer.serialize(map);
      const result = ESSerializer.deserialize(text, [Item]);
      expect(result).toBeInstanceOf(Map);
      const entries = Array.from(result.entries()) as any[];
      expect(entries[0]).toEqual(['a', 1]);
      expect(entries[1][0]).toBe(2);
      expect(entries[1][1]).toBeInstanceOf(Item);
      expect(entries[1][1].name).toBe('x');
      expect(entries[2][0]).toBeInstanceOf(Item);
      expect(entries[2][1]).toEqual([1, 2]);
    });

    test('round-trips an empty Map', () => {
      const result = ESSerializer.deserialize(ESSerializer.serialize(new Map()));
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    test('round-trips a Map nested inside an object', () => {
      const result = ESSerializer.deserialize(ESSerializer.serialize({ m: new Map([['k', 'v']]) }));
      expect(result.m).toBeInstanceOf(Map);
      expect(result.m.get('k')).toBe('v');
    });
  });

  describe('function properties', () => {
    test('are not serialized', () => {
      const obj = { a: 1, fn: () => 1 };
      expect(JSON.parse(ESSerializer.serialize(obj))).toEqual({ a: 1 });
    });
  });

  describe('static typeName', () => {
    class Named {
      static typeName = 'CustomName';
      value = 1;
    }

    class SubNamed extends Named {
    }

    test('is used as the saved type, and to find the class when deserializing', () => {
      const text = ESSerializer.serialize(new Named());
      expect(JSON.parse(text)['*type']).toBe('CustomName');
      const result = ESSerializer.deserialize(text, [Named]);
      expect(result).toBeInstanceOf(Named);
      expect(result.value).toBe(1);
    });

    test('inherited from a parent class is ignored', () => {
      const text = ESSerializer.serialize(new SubNamed());
      expect(JSON.parse(text)['*type']).toBe('SubNamed');
      expect(ESSerializer.deserialize(text, [SubNamed])).toBeInstanceOf(SubNamed);
    });
  });

  describe('fieldsForConstructorParameters', () => {
    class Point {
      received: any[];

      constructor(x: any, y: any) {
        this.received = [x, y];
      }
    }

    test('passes saved fields to the constructor, and {} for missing ones', () => {
      const text = '{"*type":"Point","x":5}';
      const result = ESSerializer.deserialize(text, [Point], { fieldsForConstructorParameters: ['x', 'y'] });
      expect(result).toBeInstanceOf(Point);
      expect(result.received).toEqual([5, {}]);
      expect(result.x).toBe(5);
    });
  });

  describe('constructors that always throw', () => {
    class AlwaysThrows {
      constructor() {
        throw new Error('nope');
      }
    }

    class AlwaysThrowsWithParams {
      constructor(a: any) {
        throw new Error('nope ' + a);
      }
    }

    test('fall back to an object with the class prototype (no constructor params)', () => {
      const result = ESSerializer.deserialize('{"*type":"AlwaysThrows","a":1}', [AlwaysThrows]);
      expect(result).toBeInstanceOf(AlwaysThrows);
      expect(result.a).toBe(1);
    });

    test('fall back to an object with the class prototype (after trying all fallback params)', () => {
      const result = ESSerializer.deserialize('{"*type":"AlwaysThrowsWithParams","a":1}', [AlwaysThrowsWithParams]);
      expect(result).toBeInstanceOf(AlwaysThrowsWithParams);
      expect(result.a).toBe(1);
    });
  });

  describe('constructor that only accepts some fallback parameters', () => {
    class NeedsString {
      constructor(s: any) {
        if (typeof s !== 'string') throw new Error('needs string');
      }
    }

    test('is retried with the next fallback parameter until one works', () => {
      const result = ESSerializer.deserialize('{"*type":"NeedsString","v":2}', [NeedsString]);
      expect(result).toBeInstanceOf(NeedsString);
      expect(result.v).toBe(2);
    });
  });

  describe('function-style classes', () => {
    test('are created by calling the function on a new object', () => {
      function OldStyle(this: any) {
        this.created = true;
      }

      OldStyle.prototype.hello = function () {
        return 'hi';
      };
      const result = ESSerializer.deserialize('{"*type":"OldStyle","v":3}', [OldStyle]);
      expect(result).toBeInstanceOf(OldStyle as any);
      expect(result.created).toBe(true);
      expect(result.hello()).toBe('hi');
      expect(result.v).toBe(3);
    });

    test('whose prototype has no constructor use the function itself (like big.js)', () => {
      function NoCtor(this: any) {
        this.created = true;
      }

      NoCtor.prototype = { hello: () => 'hi' };
      const result = ESSerializer.deserialize('{"*type":"NoCtor","v":4}', [NoCtor]);
      expect(result.created).toBe(true);
      expect(result.hello()).toBe('hi');
      expect(result.v).toBe(4);
    });

    test('that throw fall back to an object with the prototype', () => {
      function Throws() {
        throw new Error('nope');
      }

      Throws.prototype.hello = () => 'hi';
      const result = ESSerializer.deserialize('{"*type":"Throws","v":5}', [Throws]);
      expect(result).toBeInstanceOf(Throws as any);
      expect(result.v).toBe(5);
    });
  });

  describe('read-only properties', () => {
    class WithReadOnly {
      constructor() {
        const inner = {};
        Object.defineProperty(inner, 'fixed', { value: 1, writable: false, enumerable: true });
        Object.defineProperty(inner, 'free', { value: 0, writable: true, enumerable: true });
        Object.defineProperty(this, 'config', { value: inner, writable: false, enumerable: true });
        Object.defineProperty(this, 'id', { value: 'orig', writable: false, enumerable: true });
      }
    }

    test('keep primitive read-only values, and only copy writable nested fields', () => {
      const text = '{"*type":"WithReadOnly","id":"saved","config":{"fixed":2,"free":3,"added":4}}';
      const result: any = ESSerializer.deserialize(text, [WithReadOnly]);
      expect(result.id).toBe('orig');
      expect(result.config.fixed).toBe(1);
      expect(result.config.free).toBe(3);
      expect(result.config.added).toBe(4);
    });
  });
});

describe('getClassMappingFromClassArray', () => {
  test('returns an empty mapping when called without classes', () => {
    expect(getClassMappingFromClassArray()).toEqual({});
  });
});

describe('serialize options', () => {
  test('ignoreProperties and interceptProperties do not change the serialized object', () => {
    const obj = { name: 'Tiger', age: 42 };
    ESSerializer.serialize(obj, {
      ignoreProperties: ['name'],
      interceptProperties: { age: (value: any) => value + 1 },
    });
    expect(obj).toEqual({ name: 'Tiger', age: 42 });
  });

  test('interceptProperties can add a property the object does not have', () => {
    const obj = { a: 1 };
    const text = ESSerializer.serialize(obj, {
      interceptProperties: { extra: function (this: any) { return this.a + 1; } },
    });
    expect(JSON.parse(text)).toEqual({ a: 1, extra: 2 });
    expect(obj).toEqual({ a: 1 });
  });

  test('an ignored property is not added back by an interceptor', () => {
    const text = ESSerializer.serialize({ a: 1, b: 2 }, {
      ignoreProperties: ['b', 'c'],
      interceptProperties: { b: () => 3, c: () => 4 },
    });
    expect(JSON.parse(text)).toEqual({ a: 1 });
  });
});

describe('behavior fixes', () => {
  beforeEach(() => ESSerializer.clearRegisteredClasses());

  test('function-style class constructors get each parameter separately', () => {
    function Pair(this: any, a: any, b: any) {
      this.args = [a, b];
    }

    const result = ESSerializer.deserialize('{"*type":"Pair","x":7}', [Pair], {
      fieldsForConstructorParameters: ['x', 'y'],
    });
    expect(result.args).toEqual([7, {}]);
  });

  test('AggregateError inner values are deserialized with the given classes', () => {
    const error = new AggregateError([new Item('inner')], 'many');
    const result = ESSerializer.deserialize(ESSerializer.serialize(error), [Item]);
    expect(result).toBeInstanceOf(AggregateError);
    expect(result.errors[0]).toBeInstanceOf(Item);
    expect(result.errors[0].name).toBe('inner');
  });

  test('deserializing an Intl object keeps its locale', () => {
    const text = ESSerializer.serialize(new Intl.NumberFormat('de-DE'));
    const result = ESSerializer.deserialize(text);
    expect(result).toBeInstanceOf(Intl.NumberFormat);
    expect(result.resolvedOptions().locale).toBe('de-DE');
  });
});

describe('built-in values', () => {
  const roundTrip = (value: any) => ESSerializer.deserialize(ESSerializer.serialize(value));

  test('float typed arrays keep Infinity, -Infinity and NaN', () => {
    const result = roundTrip(new Float64Array([1.5, Infinity, -Infinity, NaN]));
    expect(result).toBeInstanceOf(Float64Array);
    expect(Array.from(result)).toEqual([1.5, Infinity, -Infinity, NaN]);
  });

  test('BigInt typed arrays keep their values', () => {
    const result = roundTrip(new BigInt64Array([-(2n ** 63n), 0n, 2n ** 63n - 1n]));
    expect(result).toBeInstanceOf(BigInt64Array);
    expect(Array.from(result)).toEqual([-(2n ** 63n), 0n, 2n ** 63n - 1n]);
  });

  test('a DataView over part of a buffer saves only its own bytes', () => {
    const buffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const result = roundTrip(new DataView(buffer, 1, 3));
    expect(result).toBeInstanceOf(DataView);
    expect(Array.from(new Uint8Array(result.buffer))).toEqual([2, 3, 4]);
  });

  test('a RegExp with slashes in its source keeps its source and flags', () => {
    const original = new RegExp('a/b/c', 'gi');
    const result = roundTrip(original);
    expect(result).toBeInstanceOf(RegExp);
    expect(result.source).toBe(original.source);
    expect(result.test('a/b/c')).toBe(true);
    expect(result.flags).toBe('gi');
  });

  test('the data of built-in values is saved in the *value field', () => {
    expect(JSON.parse(ESSerializer.serialize(new Date(5)))).toEqual({ '*type': 'Date', '*value': 5 });
    expect(JSON.parse(ESSerializer.serialize(new Set([1])))).toEqual({ '*type': 'Set', '*value': [1] });
    expect(JSON.parse(ESSerializer.serialize(10n))).toEqual({ '*type': 'BI', '*value': '10' });
  });
});

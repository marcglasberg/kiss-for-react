// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import { ESSerializer } from '../../../src/Esserializer';

enum Filter {
  showAll = 'Showing ALL',
  showCompleted = 'Showing COMPLETED',
  showActive = 'Showing ACTIVE',
}

test('Filter enum', () => {

  const filter = Filter.showActive;

  ESSerializer.registerClasses([Filter]);

  const serialized = ESSerializer.serialize(filter);
  const deserialized = ESSerializer.deserialize(serialized);

  function isFilter(value: any): value is Filter {
    return Object.values(Filter).includes(value);
  }

  expect(isFilter(deserialized)).toBeTruthy();

  const filterDeserialized = deserialized as Filter;
  expect(serialized).toBe('"Showing ACTIVE"');
  expect(filterDeserialized.toString()).toBe('Showing ACTIVE');
});


import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Describing state changes');

class State {
  constructor(readonly count: number, readonly user: { name: string, address: { city: string } }) {
  }
}

Bdd(feature)
  .scenario('Changes at the top level of the state are described.')
  .given('A state with a count of 1.')
  .when('The count changes to 2.')
  .then('The description lists the change to the count.')
  .run(async (_) => {
    // Given
    const before = new State(1, { name: 'Ann', address: { city: 'Paris' } });

    // When
    const after = new State(2, { name: 'Ann', address: { city: 'Paris' } });

    // Then
    expect(Store.describeStateChange(before, after)).toBe('State count: 1 → 2; ');
  });

Bdd(feature)
  .scenario('Changes inside nested objects of the state are described.')
  .given('A state with a user named Ann.')
  .when('The user name changes to Bob.')
  .then('The description lists the change to the user name, with its full path.')
  .run(async (_) => {
    // Given
    const before = new State(1, { name: 'Ann', address: { city: 'Paris' } });

    // When
    const after = new State(1, { name: 'Bob', address: { city: 'Paris' } });

    // Then
    expect(Store.describeStateChange(before, after)).toBe('State user.name: Ann → Bob; ');
  });

Bdd(feature)
  .scenario('Changes at several nesting levels are all described.')
  .given('A state with a count of 1, a user named Ann, living in Paris.')
  .when('The count changes to 2, the name to Bob, and the city to Rome.')
  .then('The description lists all three changes.')
  .run(async (_) => {
    // Given
    const before = new State(1, { name: 'Ann', address: { city: 'Paris' } });

    // When
    const after = new State(2, { name: 'Bob', address: { city: 'Rome' } });

    // Then
    expect(Store.describeStateChange(before, after)).toBe(
      'State count: 1 → 2; State user.name: Ann → Bob; State user.address.city: Paris → Rome; ');
  });

Bdd(feature)
  .scenario('Nothing is described when nothing changed.')
  .given('A state with nested objects.')
  .when('It is compared to an equal state.')
  .then('The description is empty.')
  .run(async (_) => {
    // Given
    const before = new State(1, { name: 'Ann', address: { city: 'Paris' } });

    // When
    const after = new State(1, { name: 'Ann', address: { city: 'Paris' } });

    // Then
    expect(Store.describeStateChange(before, after)).toBe('');
  });

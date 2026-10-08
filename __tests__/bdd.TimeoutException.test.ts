import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { TimeoutException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('TimeoutException');

Bdd(feature)
  .scenario('TimeoutException is exported, so its default timeout can be changed.')
  .given('The library is imported.')
  .when('The default timeout of TimeoutException is changed.')
  .then('The new default timeout is used.')
  .run(async (_) => {
    // Given
    expect(TimeoutException).toBeDefined();
    const original = TimeoutException.defaultTimeoutMillis;

    // When
    TimeoutException.defaultTimeoutMillis = 1234;

    // Then
    try {
      expect(TimeoutException.defaultTimeoutMillis).toBe(1234);
      expect(new TimeoutException('t')).toBeInstanceOf(TimeoutException);
    } finally {
      TimeoutException.defaultTimeoutMillis = original;
    }
  });

Bdd(feature)
  .scenario('TimeoutException has a stack trace showing where it was created.')
  .given('A function that creates a TimeoutException.')
  .when('The exception is created.')
  .then('Its stack trace includes the function that created it.')
  .run(async (_) => {
    // Given
    function createTheTimeout() {
      return new TimeoutException('t');
    }

    // When
    const error = createTheTimeout();

    // Then
    expect(error.name).toBe('TimeoutException');
    expect(error.message).toBe('t');
    expect(error.stack).toContain('createTheTimeout');
  });

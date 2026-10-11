import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with an error with an empty message');

Bdd(feature)
  .scenario('An error with an empty message is read back with an empty message.')
  .given('An error of type <Type>, with an empty message.')
  .when('The error is serialized, and then deserialized.')
  .then('The error read back is of type <Type>.')
  .and('Its message is empty.')
  .and('The message is still not an enumerable property.')
  .example(val('Type', 'Error'))
  .example(val('Type', 'TypeError'))
  .example(val('Type', 'an Error subclass whose constructor takes the message'))
  .example(val('Type', 'an Error subclass whose constructor takes the message and a status'))
  .example(val('Type', 'an Error subclass whose constructor has a default message'))
  .run(async (ctx) => {
    const { ErrorClass, create } = ERRORS[ctx.example.val('Type')];
    const original = create();
    expect(original.message).toBe('');

    const read = ESSerializer.deserialize(ESSerializer.serialize({ e: original }), [ErrorClass]).e;

    expect(read).toBeInstanceOf(ErrorClass);
    expect(read.message).toBe('');
    expect(Object.keys(read)).toEqual(Object.keys(original));
  });

Bdd(feature)
  .scenario('An error subclass with an empty message keeps its other fields.')
  .given('An error subclass whose constructor takes the message and a status.')
  .and('An instance with an empty message, and status 404.')
  .when('The error is serialized, and then deserialized.')
  .then('The error read back has an empty message, and status 404.')
  .run(async (_) => {
    const original = new HttpError('', 404);

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [HttpError]);

    expect(read).toBeInstanceOf(HttpError);
    expect(read.message).toBe('');
    expect(read.status).toBe(404);
  });

Bdd(feature)
  .scenario('An error with a message is still read back with that message.')
  .given('An error subclass whose constructor takes the message.')
  .and('An instance with the message "Oops".')
  .when('The error is serialized, and then deserialized.')
  .then('The error read back has the message "Oops".')
  .run(async (_) => {
    const original = new AppError('Oops');

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [AppError]);

    expect(read).toBeInstanceOf(AppError);
    expect(read.message).toBe('Oops');
  });

class AppError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

class DefaultMessageError extends Error {
  constructor(message: string = 'Something went wrong') {
    super(message);
  }
}

const ERRORS: Record<string, { ErrorClass: any, create: () => Error }> = {
  'Error': { ErrorClass: Error, create: () => new Error('') },
  'TypeError': { ErrorClass: TypeError, create: () => new TypeError('') },
  'an Error subclass whose constructor takes the message': {
    ErrorClass: AppError,
    create: () => new AppError(''),
  },
  'an Error subclass whose constructor takes the message and a status': {
    ErrorClass: HttpError,
    create: () => new HttpError('', 500),
  },
  'an Error subclass whose constructor has a default message': {
    ErrorClass: DefaultMessageError,
    create: () => new DefaultMessageError(''),
  },
};

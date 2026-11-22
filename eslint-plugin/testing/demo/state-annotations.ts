/* eslint-disable kiss-for-react/missing-state-class */

// Optional annotations make state classes visible to readers, AI agents, and tools.
// Enable missing-state-class to require an annotation on every detected state class.
import { stateClass } from 'kiss-for-react';

// kiss-for-react/missing-state-class
// User is nested state and needs its own @stateClass annotation.
export class User {}

@stateClass
export class AnnotatedState {
  constructor(readonly user: User) {}
}

Feature: Lint: server-push-associated-action

  Scenario Outline: A push whose key matches the key of its associated action is fine.
    Given An OptimisticSyncWithPush action ToggleLike, with {Members}.
    And A ServerPush whose associatedAction() returns ToggleLike, with {Members}.
    When The code is linted.
    Then There is no error.
    Examples: 
      | Members                  | Code                                                          | Type information |
      | no key methods           |                                                               | true             |
      | no key methods           |                                                               | false            |
      | optimisticSyncKeyParams  | optimisticSyncKeyParams() { return this.itemId; }             | true             |
      | optimisticSyncKeyParams  | optimisticSyncKeyParams() { return this.itemId; }             | false            |
      | computeOptimisticSyncKey | computeOptimisticSyncKey() { return ['likes', this.itemId]; } | true             |
      | computeOptimisticSyncKey | computeOptimisticSyncKey() { return ['likes', this.itemId]; } | false            |

  Scenario Outline: Only one of them overriding optimisticSyncKeyParams() is an error.
    Given An OptimisticSyncWithPush action ToggleLike, {Toggle has} optimisticSyncKeyParams().
    And A ServerPush whose associatedAction() returns ToggleLike, {Push has} optimisticSyncKeyParams().
    When The code is linted.
    Then There is an error in the ToggleLike returned by associatedAction(), saying {Message}.
    Examples: 
      | Toggle has | Push has | Message                                                                                                                                                                                        | Type information |
      | with       | without  | `ToggleLike` overrides `optimisticSyncKeyParams()`, but this push doesn't, so the key of this push never matches it. Override `optimisticSyncKeyParams()` here too, returning the same params. | true             |
      | with       | without  | `ToggleLike` overrides `optimisticSyncKeyParams()`, but this push doesn't, so the key of this push never matches it. Override `optimisticSyncKeyParams()` here too, returning the same params. | false            |
      | without    | with     | This push overrides `optimisticSyncKeyParams()`, but `ToggleLike` doesn't, so the key of this push never matches it. Both must return the same params.                                         | true             |
      | without    | with     | This push overrides `optimisticSyncKeyParams()`, but `ToggleLike` doesn't, so the key of this push never matches it. Both must return the same params.                                         | false            |

  Scenario Outline: An associated action that overrides computeOptimisticSyncKey(), when the push doesn't, is an error.
    Given An OptimisticSyncWithPush action ToggleLike, with computeOptimisticSyncKey().
    And A ServerPush whose associatedAction() returns ToggleLike, without computeOptimisticSyncKey().
    When The code is linted.
    Then There is an error in ToggleLike, saying to override computeOptimisticSyncKey() in the push too.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: An associated action that is abstract is an error, unless the push overrides computeOptimisticSyncKey().
    Given An abstract OptimisticSyncWithPush action LikeBase, and its subclass ToggleLike.
    And A ServerPush whose associatedAction() returns LikeBase, {Push has} computeOptimisticSyncKey().
    When The code is linted.
    Then There {Result}.
    Examples: 
      | Push has | Result                                         | Type information |
      | without  | is an error in LikeBase, saying it is abstract | true             |
      | without  | is an error in LikeBase, saying it is abstract | false            |
      | with     | is no error                                    | true             |
      | with     | is no error                                    | false            |

  Scenario Outline: Key methods inherited from superclasses count too.
    Given An abstract OptimisticSyncWithPush action with optimisticSyncKeyParams(), and its subclass ToggleLike.
    And An abstract ServerPush that returns ToggleLike from associatedAction(), and its subclass PushLike {Push has} optimisticSyncKeyParams().
    When The code is linted.
    Then There {Result}.
    Examples: 
      | Push has | Result                              | Type information |
      | with     | is no error                         | true             |
      | with     | is no error                         | false            |
      | without  | is an error in the name of PushLike | true             |
      | without  | is an error in the name of PushLike | false            |

  Scenario: With type information, an associated action declared in another file is checked too.
    Given An OptimisticSyncWithPush action ToggleLike with optimisticSyncKeyParams(), declared in another file.
    And A ServerPush whose associatedAction() returns ToggleLike, without optimisticSyncKeyParams().
    When The code is linted.
    Then There is an error with type information, and none without it.

  Scenario: An associated action that is not an OptimisticSyncWithPush is left to TypeScript.
    Given A ServerPush whose associatedAction() returns the push class itself.
    When The code is linted, with type information.
    Then TypeScript reports an error, and the rule reports nothing.

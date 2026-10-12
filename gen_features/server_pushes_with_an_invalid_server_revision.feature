Feature: Server pushes with an invalid server revision

  Scenario Outline: A push with an invalid server revision fails, and does not change the state.
    Given An item that is liked, with server revision 20, saved by a push.
    When A push arrives with the item not liked, and server revision {Revision}.
    Then The push fails with a StoreException that says the server revision is invalid.
    And The item is still liked, with server revision 20.
    Examples: 
      | Revision      |
      | undefined     |
      | null          |
      | NaN           |
      | Infinity      |
      | -Infinity     |
      | the text "20" |

  Scenario Outline: A push with an invalid server revision does not break the protection against stale pushes.
    Given An item that is liked, with server revision 20, saved by a push.
    And A push arrived with server revision {Revision}.
    When An older push arrives, with server revision 3, and the item not liked.
    Then The older push is ignored, so the item is still liked, with server revision 20.
    Examples: 
      | Revision  |
      | undefined |
      | NaN       |
      | Infinity  |

  Scenario Outline: A push with an invalid server revision does not keep newer pushes from being applied.
    Given An item that is liked, with server revision 20, saved by a push.
    And A push arrived with server revision {Revision}.
    When A newer push arrives, with server revision 21, and the item not liked.
    Then The newer push is applied, so the item is not liked, with server revision 21.
    Examples: 
      | Revision  |
      | undefined |
      | NaN       |
      | Infinity  |

  Scenario Outline: A push with an invalid server revision does not keep server responses from being applied.
    Given An item that is not liked, with server revision 5.
    And A push arrived with server revision {Revision}.
    When The like is toggled, so the item is liked.
    And The request finishes with server revision 6, and the server says the item is not liked.
    Then The server response is applied, so the item is not liked.
    And The request finishes without error.
    Examples: 
      | Revision  |
      | undefined |
      | NaN       |
      | Infinity  |

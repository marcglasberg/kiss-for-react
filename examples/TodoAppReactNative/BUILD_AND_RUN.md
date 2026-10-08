## How to run a React Native mobile app in WebStorm:

1. Click the text `Current File` (top right of the screen) and select `Edit Configurations...`
2. Press `+` and select `React Native`
3. Change field `Unnamed` to something like `BUILD AND RUN`
4. Change fields as desired (usually the defaults are ok)
5. Press `OK`.
6. Click the play button next to `BUILD AND RUN` (top right of the screen)

## Android build on Windows: "Filename longer than 260 characters"

React Native's New Architecture compiles native code with deeply nested paths. The CMake
version Android uses by default ships an old Ninja that can't handle paths over 260 characters.

1. Enable long paths in Windows (registry `LongPathsEnabled = 1`).
2. In Android Studio, open the SDK Manager → SDK Tools → CMake, and install version 4.x.
3. Create `android/local.properties` (it's git-ignored) pointing to it, for example:

   ```properties
   cmake.dir=C\:/Users/<you>/AppData/Local/Android/Sdk/cmake/4.1.2
   ```

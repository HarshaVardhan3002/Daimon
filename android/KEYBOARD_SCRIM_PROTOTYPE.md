# Android keyboard scrim prototype

The `KeyboardScrim` React Native module creates a translucent, touch-consuming
application-attached window over only the visible keyboard bounds. It uses
`FLAG_NOT_FOCUSABLE` and intentionally omits `FLAG_ALT_FOCUSABLE_IM`, so the
window can sit above the IME without taking key focus. It does not use the
system-alert-window or accessibility permissions.

## JavaScript call points

Import the native module on Android:

```ts
import { NativeModules, Platform } from 'react-native';

const KeyboardScrim = NativeModules.KeyboardScrim as {
  show(top: number, height: number, opacity: number): void;
  hide(): void;
} | undefined;
```

In the existing `keyboardDidShow` listener, pass the keyboard event's
`endCoordinates.screenY` and `endCoordinates.height` to `show(..., 0.22)` when
the reasoning dial opens. Call `hide()` when the dial closes and from the
`keyboardDidHide` listener. Keep the existing React Native scrim behind the
dial; this native surface covers only Gboard, so the dial itself stays bright.
The event coordinates are density-independent pixels, as expected by the
module.

This prototype intentionally does not render the dial in another window. It
consumes taps within the keyboard bounds while open, then removes the overlay
to restore normal keyboard interaction. Verify bounds, focus retention, and
Gboard visibility on device before integrating.

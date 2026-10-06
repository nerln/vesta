# Vesta on iPhone

The iOS app shows the Vesta interface served by the Mac. It is not a simple container:
it handles the connection, the error states and the configuration, so there is no need
to touch the code when the network changes.

What it does
- a launch screen with the brand, while it connects;
- if the Mac does not answer, it explains why and offers `Retry` and `Change address`;
- the server address is set from the app and stays saved (by default the Bonjour name of
  the Mac, which does not change when the IP changes);
- **shake the iPhone** to reopen the connection settings;
- it follows the system light/dark theme, no scroll bounce, haptic feedback on
  load.

## How to create it in Xcode
1. Xcode → New Project → iOS → App. Interface **SwiftUI**, Language **Swift**, name `Vesta`.
2. Replace the generated `VestaApp.swift` file with the one in this folder.
3. In target → Info add:
   - **App Transport Security Settings** → `NSAllowsLocalNetworking` = YES (http on the local network);
   - **Privacy - Local Network Usage Description**: "To connect to Vesta on the Mac";
   - **Privacy - Camera Usage Description**: "To take the photo of the model or of a garment";
   - **Privacy - Photo Library Usage Description**: "To choose a photo from the camera roll".
4. Start Vesta on the Mac, then Run on the iPhone (same Wi-Fi).

## Notes
- The camera from the web (`getUserMedia`) stays blocked on http: the "Choose a photo" button
  still opens the iOS picker with **Take Photo** and **Library**, so camera and camera roll
  work both for your own figure and for the garments.
- For the App Store a native interface that consumes the same APIs will be needed (guideline 4.2):
  the path is described in [PLAN.md](../PLAN.md).

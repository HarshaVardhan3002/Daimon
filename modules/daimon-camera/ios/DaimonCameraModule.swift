import AVFoundation
import ExpoModulesCore

/// Native touches for expo-camera's CameraView. AVCaptureDevice is shared per physical camera, so configuring it
/// here steers the session expo-camera already runs without touching that session.
public class DaimonCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DaimonCamera")

    // The iOS preview is an AVCaptureVideoPreviewLayer, which already clips, fades and scales with its view.
    AsyncFunction("preferTexturePreview") { () -> Bool in
      return true
    }

    // x and y are fractions of the portrait viewfinder (0...1, top-left origin).
    AsyncFunction("focusAt") { (x: Double, y: Double, facing: String) -> Bool in
      let position: AVCaptureDevice.Position = facing == "front" ? .front : .back
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
        return false
      }
      // Device points live in the sensor's landscape-right space. The viewfinder shows the whole 4:3 frame in
      // portrait, so the mapping is an axis swap; the front preview is mirrored, which cancels the flip.
      let clampedX = min(max(x, 0), 1)
      let clampedY = min(max(y, 0), 1)
      let point = position == .front ? CGPoint(x: clampedY, y: clampedX) : CGPoint(x: clampedY, y: 1 - clampedX)
      do {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        if device.isFocusPointOfInterestSupported {
          device.focusPointOfInterest = point
          if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
          } else if device.isFocusModeSupported(.autoFocus) {
            device.focusMode = .autoFocus
          }
        }
        if device.isExposurePointOfInterestSupported {
          device.exposurePointOfInterest = point
          if device.isExposureModeSupported(.continuousAutoExposure) {
            device.exposureMode = .continuousAutoExposure
          }
        }
        return true
      } catch {
        return false
      }
    }
  }
}

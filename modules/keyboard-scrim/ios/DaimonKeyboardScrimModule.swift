import ExpoModulesCore
import UIKit

/// iOS counterpart of android/.../KeyboardScrimModule.kt. The keyboard is drawn in its own window above the app, so no
/// React view can shade it; this puts a tinted window directly above the keyboard's window, over the keyboard's
/// frame only. Like Android it swallows key taps while the dial is open and never takes focus from the text input.
public class DaimonKeyboardScrimModule: Module {
  private var scrim: ScrimWindow?

  public func definition() -> ModuleDefinition {
    Name("DaimonKeyboardScrim")

    // top and height are screen points from React Native's keyboard event.
    Function("show") { (top: Double, height: Double, opacity: Double) in
      DispatchQueue.main.async { self.present(top: top, height: height, opacity: opacity) }
    }

    Function("hide") {
      DispatchQueue.main.async { self.dismiss() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.dismiss() }
    }
  }

  private func present(top: Double, height: Double, opacity: Double) {
    guard top.isFinite, height.isFinite, top >= 0, height > 0, let scene = activeScene() else {
      dismiss()
      return
    }
    let alpha = opacity.isFinite ? min(max(opacity, 0), 0.45) : 0.22
    let window: ScrimWindow
    if let current = scrim, current.windowScene === scene {
      window = current
    } else {
      dismiss()
      window = ScrimWindow(windowScene: scene)
      window.isAccessibilityElement = false
      window.accessibilityElementsHidden = true
      scrim = window
    }
    window.frame = CGRect(x: 0, y: top, width: scene.screen.bounds.width, height: height)
    window.backgroundColor = UIColor.black.withAlphaComponent(alpha)
    window.windowLevel = UIWindow.Level(rawValue: keyboardLevel(in: scene) + 1)
    window.isHidden = false
  }

  private func dismiss() {
    scrim?.isHidden = true
    scrim = nil
  }

  private func activeScene() -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
  }

  // The keyboard's host window (UIRemoteKeyboardWindow / UITextEffectsWindow) sits at a private level; stay just above it.
  private func keyboardLevel(in scene: UIWindowScene) -> CGFloat {
    let levels = scene.windows
      .filter { !($0 is ScrimWindow) }
      .filter {
        let name = NSStringFromClass(type(of: $0))
        return name.contains("Keyboard") || name.contains("TextEffects")
      }
      .map { $0.windowLevel.rawValue }
    return max(levels.max() ?? 10_000_000, UIWindow.Level.alert.rawValue)
  }
}

private final class ScrimWindow: UIWindow {
  // Never becomes key, so the text input keeps first responder and the keyboard stays up.
  override var canBecomeKey: Bool { false }
}

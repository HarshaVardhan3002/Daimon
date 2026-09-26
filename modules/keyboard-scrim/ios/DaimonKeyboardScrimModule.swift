import ExpoModulesCore
import UIKit

/// iOS counterpart of android/.../KeyboardScrimModule.kt: shades only the keyboard while the reasoning dial is open.
/// The keyboard is drawn in its own host window above the app, so no React view can cover it. The tint goes on top of
/// that host window's views; if no host window is found it falls back to a window just above the keyboard's level.
/// Like Android, the tint swallows key taps while the dial is open and never takes focus from the text input.
public class DaimonKeyboardScrimModule: Module {
  private var tint: UIView?
  private var fallbackWindow: ScrimWindow?

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
    guard top.isFinite, height.isFinite, top >= 0, height > 0 else {
      dismiss()
      return
    }
    let alpha = opacity.isFinite ? min(max(opacity, 0), 0.45) : 0.22
    let color = UIColor.black.withAlphaComponent(alpha)
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .filter { !$0.isHidden && !($0 is ScrimWindow) }
    guard let screen = windows.first?.windowScene?.screen ?? activeScene()?.screen else { return }
    let screenRect = CGRect(x: 0, y: top, width: screen.bounds.width, height: height)

    if let host = keyboardHost(in: windows) {
      fallbackWindow?.isHidden = true
      fallbackWindow = nil
      let view = tint ?? ScrimView()
      view.backgroundColor = color
      view.frame = host.convert(screenRect, from: host.screen.coordinateSpace)
      if view.superview !== host {
        view.removeFromSuperview()
        host.addSubview(view)
      }
      host.bringSubviewToFront(view)
      tint = view
      log("host \(NSStringFromClass(type(of: host)))@\(host.windowLevel.rawValue)", windows)
      return
    }

    tint?.removeFromSuperview()
    tint = nil
    guard let scene = windows.first?.windowScene ?? activeScene() else { return }
    let window = fallbackWindow.flatMap { $0.windowScene === scene ? $0 : nil } ?? ScrimWindow(windowScene: scene)
    window.isAccessibilityElement = false
    window.accessibilityElementsHidden = true
    window.frame = screenRect
    window.backgroundColor = color
    let level = (windows.map { $0.windowLevel.rawValue }.max() ?? UIWindow.Level.alert.rawValue) + 1
    window.windowLevel = UIWindow.Level(rawValue: level)
    window.isHidden = false
    fallbackWindow = window
    log("fallback window@\(level)", windows)
  }

  private func dismiss() {
    tint?.removeFromSuperview()
    tint = nil
    fallbackWindow?.isHidden = true
    fallbackWindow = nil
  }

  private func activeScene() -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
  }

  // UIRemoteKeyboardWindow on current iOS; UITextEffectsWindow hosts the input views on older releases.
  private func keyboardHost(in windows: [UIWindow]) -> UIWindow? {
    let named = { (window: UIWindow, fragment: String) in NSStringFromClass(type(of: window)).contains(fragment) }
    let remote = windows.filter { named($0, "RemoteKeyboard") }
    let candidates = remote.isEmpty ? windows.filter { named($0, "TextEffects") } : remote
    return candidates.max { $0.windowLevel.rawValue < $1.windowLevel.rawValue }
  }

  // Window classes and levels only (no content), to see which path a device takes.
  private func log(_ path: String, _ windows: [UIWindow]) {
    let summary = windows.map { "\(NSStringFromClass(type(of: $0)))@\($0.windowLevel.rawValue)" }.joined(separator: ", ")
    NSLog("[DaimonKeyboardScrim] %@; windows: %@", path, summary)
  }
}

private final class ScrimView: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = false
    accessibilityElementsHidden = true
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not used")
  }
}

private final class ScrimWindow: UIWindow {
  // Never becomes key, so the text input keeps first responder and the keyboard stays up.
  override var canBecomeKey: Bool { false }
}

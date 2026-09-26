package com.anonymous.assistantmobile

import android.graphics.Color
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Adds a touch-consuming tint window over only the visible IME bounds.
 *
 * `top` and `height` are density-independent screen coordinates from the
 * React Native keyboard event. This is an application-attached window, so it
 * does not require SYSTEM_ALERT_WINDOW. NOT_FOCUSABLE keeps the editor window
 * as the key/IME target while placing this window above the IME. In particular,
 * do not add ALT_FOCUSABLE_IM: that flag would put a non-focusable window below
 * the IME.
 */
class KeyboardScrimModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var overlay: View? = null
  private var overlayManager: WindowManager? = null
  private var overlayActivity: android.app.Activity? = null

  override fun getName(): String = "KeyboardScrim"

  @ReactMethod
  fun show(top: Double, height: Double, opacity: Double) {
    val activity = currentActivity ?: return
    val safeTop = top.toFloat().takeIf { it.isFinite() && it >= 0f } ?: return
    val safeHeight = height.toFloat().takeIf { it.isFinite() && it > 0f } ?: return
    val safeOpacity = opacity.toFloat().takeIf { it.isFinite() }?.coerceIn(0f, 0.45f) ?: 0.22f

    activity.runOnUiThread {
      if (currentActivity !== activity || activity.isFinishing || activity.isDestroyed) return@runOnUiThread
      val manager = activity.getSystemService(WindowManager::class.java) ?: return@runOnUiThread
      val density = activity.resources.displayMetrics.density
      val topPx = (safeTop * density).toInt()
      val heightPx = (safeHeight * density).toInt().coerceAtLeast(1)

      val currentOverlay = overlay
      if (currentOverlay != null && overlayActivity === activity && overlayManager === manager) {
        currentOverlay.setBackgroundColor(Color.argb((safeOpacity * 255f).toInt(), 0, 0, 0))
        val params = currentOverlay.layoutParams as? WindowManager.LayoutParams ?: return@runOnUiThread
        params.y = topPx
        params.height = heightPx
        runCatching { manager.updateViewLayout(currentOverlay, params) }
        return@runOnUiThread
      }

      removeOverlay()
      val scrimView = FrameLayout(activity).apply {
        setBackgroundColor(Color.argb((safeOpacity * 255f).toInt(), 0, 0, 0))
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        // This surface deliberately blocks key taps while the dial is open.
        // The Activity window remains focused, so closing it restores typing.
        setOnTouchListener { _, _ -> true }
      }
      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        heightPx,
        WindowManager.LayoutParams.TYPE_APPLICATION_ATTACHED_DIALOG,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = 0
        y = topPx
        token = activity.window.decorView.windowToken
        softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING or
          WindowManager.LayoutParams.SOFT_INPUT_STATE_UNCHANGED
        dimAmount = 0f
        setTitle("DaimonKeyboardScrim")
      }
      if (params.token == null) return@runOnUiThread
      runCatching { manager.addView(scrimView, params) }.onSuccess {
        overlay = scrimView
        overlayManager = manager
        overlayActivity = activity
      }
    }
  }

  @ReactMethod
  fun hide() {
    val activity = currentActivity ?: overlayActivity
    if (activity == null) {
      removeOverlay()
      return
    }
    activity.runOnUiThread { removeOverlay() }
  }

  override fun invalidate() {
    val activity = currentActivity ?: overlayActivity
    if (activity == null) removeOverlay() else activity.runOnUiThread { removeOverlay() }
    super.invalidate()
  }

  private fun removeOverlay() {
    val current = overlay ?: return
    val manager = overlayManager
    overlay = null
    overlayManager = null
    overlayActivity = null
    if (manager != null) runCatching { manager.removeViewImmediate(current) }
  }
}

class KeyboardScrimPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(KeyboardScrimModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}

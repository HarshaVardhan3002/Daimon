package expo.modules.camerafocus

import android.view.View
import android.view.ViewGroup
import androidx.camera.core.Camera
import androidx.camera.core.FocusMeteringAction
import androidx.camera.view.PreviewView
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

/**
 * Tap-to-focus for expo-camera's CameraView, which has no point-focus API on Android.
 * It drives the CameraX camera that the mounted view already bound, so no second camera session is opened.
 */
class CameraFocusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CameraFocus")

    // x and y are fractions of the viewfinder (0..1, top-left origin). Resolves false when no preview is live.
    AsyncFunction("focusAt") { x: Double, y: Double, _: String ->
      val root = appContext.currentActivity?.window?.decorView ?: return@AsyncFunction false
      val cameraView = findCameraView(root) ?: return@AsyncFunction false
      val preview = (0 until cameraView.childCount).map { cameraView.getChildAt(it) }.firstOrNull { it is PreviewView } as? PreviewView
        ?: return@AsyncFunction false
      val camera = boundCamera(cameraView) ?: return@AsyncFunction false
      if (preview.width <= 0 || preview.height <= 0) return@AsyncFunction false
      val point = preview.meteringPointFactory.createPoint(
        (x.coerceIn(0.0, 1.0) * preview.width).toFloat(),
        (y.coerceIn(0.0, 1.0) * preview.height).toFloat()
      )
      val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
        .setAutoCancelDuration(4, TimeUnit.SECONDS)
        .build()
      camera.cameraControl.startFocusAndMetering(action)
      true
    }.runOnQueue(Queues.MAIN)
  }

  private fun findCameraView(view: View): ViewGroup? {
    if (view.javaClass.name == CAMERA_VIEW_CLASS && view.isShown) return view as? ViewGroup
    if (view !is ViewGroup) return null
    for (index in 0 until view.childCount) findCameraView(view.getChildAt(index))?.let { return it }
    return null
  }

  // expo-camera keeps the bound Camera private; read it rather than binding a competing session.
  private fun boundCamera(cameraView: ViewGroup): Camera? = try {
    cameraView.javaClass.getDeclaredField("camera").apply { isAccessible = true }.get(cameraView) as? Camera
  } catch (_: ReflectiveOperationException) {
    null
  }

  private companion object {
    const val CAMERA_VIEW_CLASS = "expo.modules.camera.ExpoCameraView"
  }
}

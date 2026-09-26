package expo.modules.daimoncamera

import android.view.SurfaceView
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
 * Native touches for expo-camera's CameraView that its Android API does not expose. Both act on the view and the
 * CameraX camera it already bound, so no second camera session is opened.
 */
class DaimonCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DaimonCamera")

    // expo-camera leaves PreviewView in PERFORMANCE mode, i.e. a SurfaceView that ignores view clipping, alpha and
    // scaling. A TextureView lets the preview round its corners and ride the sheet's morph like any other view.
    AsyncFunction("preferTexturePreview") {
      val preview = findPreview() ?: return@AsyncFunction false
      preview.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      // Too late for the first surface request: rebind so the next request picks up the texture.
      if ((0 until preview.childCount).any { preview.getChildAt(it) is SurfaceView }) {
        val cameraView = preview.parent as? ViewGroup ?: return@AsyncFunction false
        try {
          cameraView.javaClass.getMethod("resumePreview").invoke(cameraView)
        } catch (_: ReflectiveOperationException) {
          return@AsyncFunction false
        }
      }
      true
    }.runOnQueue(Queues.MAIN)

    // x and y are fractions of the viewfinder (0..1, top-left origin). Resolves false when no preview is live.
    AsyncFunction("focusAt") { x: Double, y: Double, _: String ->
      val preview = findPreview() ?: return@AsyncFunction false
      val camera = (preview.parent as? ViewGroup)?.let { boundCamera(it) } ?: return@AsyncFunction false
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

  private fun findPreview(): PreviewView? {
    val root = appContext.currentActivity?.window?.decorView ?: return null
    val cameraView = findCameraView(root) ?: return null
    return (0 until cameraView.childCount).map { cameraView.getChildAt(it) }.firstOrNull { it is PreviewView } as? PreviewView
  }

  private fun findCameraView(view: View): ViewGroup? {
    if (view.javaClass.name == CAMERA_VIEW_CLASS && view.isAttachedToWindow) return view as? ViewGroup
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

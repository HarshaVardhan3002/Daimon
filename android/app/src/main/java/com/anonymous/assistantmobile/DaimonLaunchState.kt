package com.anonymous.assistantmobile

import android.os.Bundle

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/** Captures Android's task-restoration state before MainActivity discards the Bundle. */
object AndroidTaskLaunchState {
  @Volatile private var taskRestored: Boolean = false

  fun capture(savedInstanceState: Bundle?) {
    taskRestored = savedInstanceState != null
  }

  fun isTaskRestored(): Boolean = taskRestored
}

/** Minimal bridge so JS hydration can preserve restored tasks and cold-start only on fresh launches. */
class DaimonLaunchStateModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "DaimonLaunchState"

  @ReactMethod
  fun isTaskRestored(promise: Promise) {
    promise.resolve(AndroidTaskLaunchState.isTaskRestored())
  }
}

class DaimonLaunchStatePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(DaimonLaunchStateModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}

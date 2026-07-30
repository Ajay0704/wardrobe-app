import { registerPlugin } from "@capacitor/core";

export interface AppleVisionPlugin {
  /**
   * Whether this binary/OS can actually segment. The app's deployment target is iOS 15 but the
   * Vision request is iOS 17+, so on an older device the plugin exists and answers `false` —
   * distinct from the plugin being absent entirely (an older app build).
   */
  isSupported(): Promise<{ supported: boolean; reason?: string }>;

  /**
   * Remove the background on-device and return a transparent PNG as base64. Accepts a bare base64
   * string or a whole `data:` URL. Rejects — never returns the input unchanged — when the OS is too
   * old, the input is unreadable, or Vision finds no foreground, so the caller can fall back.
   *
   * `ms` is the native segmentation time, for measuring the swap on a real device rather than
   * trusting the Mac numbers.
   */
  removeBackground(options: { imageBase64: string }): Promise<{ pngBase64: string; ms?: number }>;
}

/**
 * Native bridge to Apple's Vision foreground segmentation, implemented by
 * `ios/App/App/AppleVisionPlugin.swift`. On web/Android `registerPlugin` returns a proxy whose
 * calls reject with "not implemented"; `appleVisionEngine` in `src/lib/cutout.ts` guards with
 * `Capacitor.isPluginAvailable` first and treats any throw as "use imgly instead".
 */
export const AppleVision = registerPlugin<AppleVisionPlugin>("AppleVision");

import { registerPlugin } from "@capacitor/core";

export interface SharedInboxPlugin {
  /**
   * Consume the pending payload the iOS Share Extension stashed in the App Group
   * (`group.app.wardrobe.personal`), returning it once and clearing it. Currently used
   * for shared images (links ride in the deep-link query instead).
   */
  consumePending(): Promise<{
    type?: "image" | "url";
    url?: string;
    imageBase64?: string;
    mime?: string;
  }>;
}

/**
 * Native bridge to read an image the Share Extension saved to the App Group. Implemented by
 * `SharedInboxPlugin.swift` in the iOS app target. On web/Android `registerPlugin` returns a
 * proxy whose calls reject with "not implemented" — callers guard with try/catch.
 */
export const SharedInbox = registerPlugin<SharedInboxPlugin>("SharedInbox");

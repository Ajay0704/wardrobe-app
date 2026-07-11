import {
  Camera,
  CameraDirection,
  EncodingType,
} from "@capacitor/camera";

/**
 * Capture a photo with the native camera (Capacitor).
 * HTML `<input capture>` flashes and dismisses in WKWebView — use this instead.
 * Returns null if the user cancels.
 */
export async function captureNativePhoto(): Promise<File | null> {
  try {
    await Camera.requestPermissions({ permissions: ["camera"] });
  } catch {
    /* permission prompt may throw on some platforms — takePhoto will surface it */
  }

  try {
    const photo = await Camera.takePhoto({
      quality: 90,
      encodingType: EncodingType.JPEG,
      cameraDirection: CameraDirection.Rear,
      correctOrientation: true,
      saveToGallery: false,
      editable: "no",
      presentationStyle: "fullscreen",
    });

    const path = photo.webPath ?? photo.uri;
    if (!path) return null;

    const res = await fetch(path);
    if (!res.ok) throw new Error("Couldn't read the captured photo.");
    const blob = await res.blob();
    return new File([blob], `photo-${Date.now()}.jpg`, {
      type: blob.type || "image/jpeg",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // User dismissed the camera — not an error.
    if (/cancel|dismiss|user cancelled|OS-PLUG-CAMR.*cancel/i.test(msg)) {
      return null;
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

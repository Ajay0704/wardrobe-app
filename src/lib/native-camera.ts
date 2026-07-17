import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

/** Turn a `data:<mime>;base64,...` URL into a File (no network, works offline). */
function dataUrlToFile(dataUrl: string): File {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : "jpg";
  return new File([bytes], `photo-${Date.now()}.${ext}`, { type: mime });
}

/**
 * Capture a photo with the native camera (Capacitor).
 * HTML `<input capture>` flashes and dismisses in WKWebView — use this instead.
 * Returns null if the user cancels.
 *
 * The photo comes back as an inline data URL (CameraResultType.DataUrl), NOT a
 * file path. This app loads from a remote server URL, so the webview origin is
 * `https://…` while the camera's `webPath` is `capacitor://localhost/…` — a
 * `fetch()` of that path is cross-origin and WKWebView blocks it (that surfaced
 * as an error right after taking a photo). A data URL is delivered through the
 * plugin bridge, so it's origin-independent.
 */
export async function captureNativePhoto(): Promise<File | null> {
  // If the installed binary predates the Camera plugin, Capacitor would fall
  // back to the web `<input capture>` — which just flashes and exits in
  // WKWebView. Detect that and tell the user to update, rather than confuse them.
  if (Capacitor.isNativePlatform() && !Capacitor.isPluginAvailable("Camera")) {
    throw new Error(
      "The camera needs the latest app build. Please reinstall the app from Xcode (Product → Run).",
    );
  }

  try {
    await Camera.requestPermissions({ permissions: ["camera"] });
  } catch {
    /* permission prompt may throw on some platforms — getPhoto will surface it */
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      direction: CameraDirection.Rear,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
      presentationStyle: "fullscreen",
    });

    if (!photo.dataUrl) return null;
    return dataUrlToFile(photo.dataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // User dismissed the camera — not an error.
    if (/cancel|dismiss|user cancelled|OS-PLUG-CAMR.*cancel/i.test(msg)) {
      return null;
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

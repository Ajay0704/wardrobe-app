import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";

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
 *
 * `facing` defaults to "rear" so no existing caller changes. Pass "front" for a
 * self-portrait (AJA-276) — every other caller here is photographing clothing, and
 * opening the rear camera for a selfie means the user has to flip it themselves.
 */
export async function captureNativePhoto(
  facing: "rear" | "front" = "rear",
): Promise<File | null> {
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
      direction: facing === "front" ? CameraDirection.Front : CameraDirection.Rear,
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

/**
 * Pick ONE photo from the library via the native picker (AJA-235). Returns an inline
 * data URL (like {@link captureNativePhoto}) — NOT a `capacitor://` webPath, which this
 * remotely-hosted WKWebView can't read cross-origin. iOS WKWebView also won't honour
 * `<input type="file" multiple>`, so callers accumulate multiple photos by calling this
 * repeatedly ("Add another"). Returns null if the user cancels.
 */
export async function pickNativePhoto(): Promise<File | null> {
  if (Capacitor.isNativePlatform() && !Capacitor.isPluginAvailable("Camera")) {
    throw new Error(
      "The photo picker needs the latest app build. Please reinstall the app from Xcode (Product → Run).",
    );
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      correctOrientation: true,
      allowEditing: false,
      presentationStyle: "fullscreen",
    });

    if (!photo.dataUrl) return null;
    return dataUrlToFile(photo.dataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|dismiss|user cancelled|OS-PLUG-CAMR.*cancel/i.test(msg)) {
      return null;
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

/** True only on a native build that actually bundles the Filesystem plugin — i.e. one
 *  that can read the files returned by {@link pickNativePhotos}. Lets callers offer real
 *  at-once multi-select where supported and fall back to one-at-a-time otherwise. */
export function canPickMultiplePhotos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Filesystem");
}

/**
 * Pick SEVERAL photos at once from the library (AJA-235). Uses `Camera.pickImages`
 * (native multi-select) and reads each result's file `path` with the Filesystem plugin
 * into an inline data URL — `pickImages` only returns a `capacitor://` webPath, which
 * this remotely-hosted WKWebView can't `fetch()` cross-origin, so Filesystem is the only
 * way to get the bytes. REQUIRES the Filesystem plugin in the binary (guard with
 * {@link canPickMultiplePhotos}); returns [] if the user cancels.
 */
export async function pickNativePhotos(limit = 10): Promise<File[]> {
  if (!canPickMultiplePhotos()) return [];

  let photos: { path?: string; format?: string }[];
  try {
    const result = await Camera.pickImages({
      quality: 90,
      limit,
      correctOrientation: true,
      presentationStyle: "fullscreen",
    });
    photos = result.photos ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|dismiss|user cancelled/i.test(msg)) return [];
    throw err instanceof Error ? err : new Error(msg);
  }

  const files: File[] = [];
  for (const photo of photos) {
    if (!photo.path) continue;
    try {
      const read = await Filesystem.readFile({ path: photo.path });
      const b64 = typeof read.data === "string" ? read.data : "";
      if (!b64) continue;
      const mime = photo.format ? `image/${photo.format}` : "image/jpeg";
      files.push(dataUrlToFile(`data:${mime};base64,${b64}`));
    } catch {
      /* skip a photo we couldn't read */
    }
  }
  return files;
}

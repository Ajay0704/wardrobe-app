import { FirstRunJourney } from "@/components/proto/FirstRunJourney";

/**
 * AJA-290 · Working preview of the tight 8-step first-run journey, rendered with the app's real
 * tokens, fonts and components — "how it will look exactly on the app." Not linked in nav; open
 * /first-run-preview directly. Capture/extraction are simulated on the sample cutouts (the real
 * flow runs detect-garments + cutout, which need auth).
 */
export default function FirstRunPreviewPage() {
  return <FirstRunJourney />;
}

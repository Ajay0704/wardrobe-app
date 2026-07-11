/**
 * Weather helpers for "What to wear today".
 * Uses Open-Meteo (free, no API key): https://open-meteo.com/
 *
 * On Capacitor iOS, `navigator.geolocation` often fails without native
 * permissions — use `@capacitor/geolocation` + Info.plist location keys.
 */

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { Season } from "./types";

export interface WeatherSnapshot {
  tempC: number;
  precipMm: number;
  weatherCode: number;
  /** Human label, e.g. "Partly cloudy · 18°C" */
  label: string;
  season: Season;
  needsOuterwear: boolean;
  latitude: number;
  longitude: number;
  /** Optional place name when resolved via city search */
  placeName?: string;
}

export type WeatherOptions = {
  /** Timeout for GPS + forecast fetch (ms). */
  timeoutMs?: number;
  /**
   * Optional city/region from profile (e.g. "Toronto") used when GPS fails
   * or is denied — geocoded via Open-Meteo.
   */
  fallbackPlace?: string;
};

function seasonFromTemp(tempC: number): Season {
  if (tempC >= 24) return "summer";
  if (tempC >= 16) return "spring";
  if (tempC >= 8) return "fall";
  return "winter";
}

function weatherLabel(code: number, tempC: number): string {
  // WMO weather interpretation codes (simplified).
  let sky = "Clear";
  if (code === 1 || code === 2) sky = "Partly cloudy";
  else if (code === 3) sky = "Overcast";
  else if (code >= 45 && code <= 48) sky = "Foggy";
  else if (code >= 51 && code <= 67) sky = "Rainy";
  else if (code >= 71 && code <= 77) sky = "Snowy";
  else if (code >= 80 && code <= 82) sky = "Showers";
  else if (code >= 95) sky = "Stormy";
  return `${sky} · ${Math.round(tempC)}°C`;
}

function geoErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const code = "code" in err ? Number((err as { code?: number }).code) : NaN;
    const message =
      "message" in err ? String((err as { message?: string }).message) : "";
    if (code === 1 || /denied|permission/i.test(message)) {
      return "Location permission denied. Enable Location for Wardrobe in iPhone Settings, then try again.";
    }
    if (code === 2 || /unavailable/i.test(message)) {
      return "Couldn't get your location. Try again outdoors or set a city in Settings.";
    }
    if (code === 3 || /timeout/i.test(message)) {
      return "Location timed out. Try again, or set a city in Settings.";
    }
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't get your location.";
}

async function coordsFromNative(
  timeoutMs: number,
): Promise<{ latitude: number; longitude: number }> {
  let status = await Geolocation.checkPermissions();
  if (status.location !== "granted" && status.coarseLocation !== "granted") {
    status = await Geolocation.requestPermissions();
  }
  if (status.location !== "granted" && status.coarseLocation !== "granted") {
    throw new Error(
      "Location permission denied. Enable Location for Wardrobe in iPhone Settings, then try again.",
    );
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: timeoutMs,
    maximumAge: 30 * 60 * 1000,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };
}

async function coordsFromBrowser(
  timeoutMs: number,
): Promise<{ latitude: number; longitude: number }> {
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 30 * 60 * 1000,
    });
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/** Resolve a place name to coords via Open-Meteo geocoding (no API key). */
export async function geocodePlace(
  place: string,
  timeoutMs = 8000,
): Promise<{ latitude: number; longitude: number; name: string }> {
  const q = place.trim();
  if (!q) throw new Error("Enter a city in Settings → Profile (location).");
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error("Couldn't look up that city.");
  const data = (await res.json()) as {
    results?: { latitude: number; longitude: number; name: string; admin1?: string; country?: string }[];
  };
  const hit = data.results?.[0];
  if (!hit) throw new Error(`Couldn't find “${q}”. Try a city name in Settings.`);
  const name = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return { latitude: hit.latitude, longitude: hit.longitude, name };
}

async function forecastAt(
  latitude: number,
  longitude: number,
  timeoutMs: number,
  placeName?: string,
): Promise<WeatherSnapshot> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,precipitation,weather_code` +
    `&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error("Couldn't reach the weather service.");
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      precipitation?: number;
      weather_code?: number;
    };
  };
  const tempC = data.current?.temperature_2m ?? 18;
  const precipMm = data.current?.precipitation ?? 0;
  const weatherCode = data.current?.weather_code ?? 0;
  const season = seasonFromTemp(tempC);
  const base = weatherLabel(weatherCode, tempC);

  return {
    tempC,
    precipMm,
    weatherCode,
    label: placeName ? `${base} · ${placeName}` : base,
    season,
    needsOuterwear: tempC < 14 || precipMm > 0.2 || weatherCode >= 51,
    latitude,
    longitude,
    placeName,
  };
}

/**
 * Device location (Capacitor native or browser) → Open-Meteo.
 * Falls back to geocoding `fallbackPlace` when GPS is denied/unavailable.
 */
export async function fetchLocalWeather(
  options: WeatherOptions | number = {},
): Promise<WeatherSnapshot> {
  // Back-compat: older callers passed timeoutMs as the first arg.
  const opts: WeatherOptions =
    typeof options === "number" ? { timeoutMs: options } : options;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const fallbackPlace = opts.fallbackPlace?.trim();

  let coords: { latitude: number; longitude: number } | null = null;
  let gpsError: string | null = null;

  try {
    coords = Capacitor.isNativePlatform()
      ? await coordsFromNative(timeoutMs)
      : await coordsFromBrowser(timeoutMs);
  } catch (err) {
    gpsError = geoErrorMessage(err);
  }

  if (coords) {
    return forecastAt(coords.latitude, coords.longitude, timeoutMs);
  }

  if (fallbackPlace) {
    const place = await geocodePlace(fallbackPlace, timeoutMs);
    return forecastAt(place.latitude, place.longitude, timeoutMs, place.name);
  }

  throw new Error(
    gpsError ??
      "Couldn't get your location. Enable Location, or set a city in Settings.",
  );
}

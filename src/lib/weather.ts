/**
 * Weather helpers for "What to wear today".
 * Uses Open-Meteo (free, no API key): https://open-meteo.com/
 */

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
}

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

/** Browser geolocation → Open-Meteo current conditions. */
export async function fetchLocalWeather(
  timeoutMs = 8000,
): Promise<WeatherSnapshot> {
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 30 * 60 * 1000,
    });
  });

  const { latitude, longitude } = position.coords;
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

  return {
    tempC,
    precipMm,
    weatherCode,
    label: weatherLabel(weatherCode, tempC),
    season,
    needsOuterwear: tempC < 14 || precipMm > 0.2 || weatherCode >= 51,
    latitude,
    longitude,
  };
}

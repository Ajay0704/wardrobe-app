/**
 * Country & language options for My page settings. Values are stored as the
 * display label on the profile (`country`, `language`). Language selection is
 * persisted for future i18n; the UI is English-only for now.
 */

export const COUNTRIES: string[] = [
  "United States",
  "Canada",
  "United Kingdom",
  "Ireland",
  "Australia",
  "New Zealand",
  "India",
  "Singapore",
  "United Arab Emirates",
  "France",
  "Germany",
  "Spain",
  "Italy",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Portugal",
  "Austria",
  "Poland",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "Taiwan",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Thailand",
  "Vietnam",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Egypt",
  "Saudi Arabia",
  "Turkey",
  "Israel",
];

export const DEFAULT_COUNTRY = "United States";

export interface LanguageOption {
  code: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
];

export const DEFAULT_LANGUAGE = "English";

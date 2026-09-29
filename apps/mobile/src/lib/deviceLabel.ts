// Device label for a session row (profile.md AC-04, open question 6): "Chrome on Android".
// Browser and OS names are product names and stay untranslated; the sentence around them is an
// i18n key (`sessions.device`). Unknown agents fall back to `sessions.unknownDevice`.
// Presentation only; if the server starts returning a label, use it instead.

export interface DeviceParts {
  browser: string;
  os: string;
}

const BROWSERS: [RegExp, string][] = [
  [/EdgA?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function deviceParts(userAgent: string): DeviceParts | null {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const os = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  return browser && os ? { browser, os } : null;
}

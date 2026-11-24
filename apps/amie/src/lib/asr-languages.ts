import type { AsrLanguage } from "./transcript-types";

export type AsrLanguageOption = {
  code: AsrLanguage;
  label: string;
};

/**
 * Languages supported by NVIDIA Nemotron Labs Unified ASR 0.6B:
 * automatic detection plus 25 European languages (alphabetical).
 */
export const ASR_LANGUAGES: readonly AsrLanguageOption[] = [
  { code: "auto", label: "Auto (detect automatically)" },
  { code: "bg", label: "Bulgarian" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "hu", label: "Hungarian" },
  { code: "it", label: "Italian" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "mt", label: "Maltese" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "uk", label: "Ukrainian" },
];

export function asrLanguageLabel(code: string): string {
  return ASR_LANGUAGES.find((item) => item.code === code)?.label ?? code;
}

// Client-side format checks for instant feedback (auth.md §4 AU-04). The server stays the judge:
// it re-validates everything and its errors are shown the same way.

export type UsernameProblem = "required" | "length" | "start" | "chars";

/** Mirrors the server rule: 3–20 characters, English letters, digits, or _, starting with a letter. */
export function usernameProblem(value: string): UsernameProblem | null {
  const v = value.trim();
  if (!v) return "required";
  if (!/^[A-Za-z]/.test(v)) return "start";
  if (!/^[A-Za-z0-9_]+$/.test(v)) return "chars";
  if (v.length < 3 || v.length > 20) return "length";
  return null;
}

export type PasswordRuleKey = "length" | "notDigits" | "notCommon";

/** Minimum length 8 and not only digits are checked here; "not common" only by the server. */
export function passwordRules(password: string, commonRejected: boolean): { key: PasswordRuleKey; met: boolean | null }[] {
  return [
    { key: "length", met: password.length >= 8 },
    { key: "notDigits", met: password.length > 0 && !/^\d+$/.test(password) },
    { key: "notCommon", met: commonRejected ? false : null },
  ];
}

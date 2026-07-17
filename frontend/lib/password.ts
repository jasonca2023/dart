// The one password policy, shared by signup, reset and account settings.

// Must state the actual policy below exactly: the capital letter is required
// in BOTH branches (a previous wording — "or 12+ characters" — implied length
// alone was enough, then the validator rejected a 12-char all-lowercase
// password anyway).
export const PASSWORD_REQ =
  "A capital letter, plus a special character (8+ characters) or 12+ characters.";

// Policy: a capital letter always; 8+ chars when a special character is present,
// otherwise 12+ chars. Returns an error string, or null when the password is OK.
export function passwordError(pw: string): string | null {
  if (!/[A-Z]/.test(pw)) return "Add a capital letter.";
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  if (hasSpecial && pw.length < 8) return "At least 8 characters.";
  if (!hasSpecial && pw.length < 12)
    return "Add a special character, or use 12+ characters.";
  return null;
}

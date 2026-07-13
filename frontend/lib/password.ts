// The one password policy, shared by signup, reset and account settings.

export const PASSWORD_REQ =
  "8+ characters with a capital letter and a special character (or 12+ characters).";

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

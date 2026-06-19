import { ButtonLink } from "../ui/Button";
import { ArrowRight } from "../icons";

// Replaces the generate widget on the logged-out landing — generation lives
// behind sign-in now.
export function SignInCta({ label = "Sign in to start" }: { label?: string }) {
  return (
    <ButtonLink href="/auth" size="lg">
      {label}
      <ArrowRight className="text-[18px]" />
    </ButtonLink>
  );
}

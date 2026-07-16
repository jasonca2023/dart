import { ButtonLink } from "../ui/Button";
import { ArrowRight } from "../icons";

// Replaces the generate widget on the logged-out landing — generation lives
// behind an account now, so the landing CTAs open the create-account door.
export function SignInCta({ label = "Get started free" }: { label?: string }) {
  return (
    <ButtonLink href="/auth?mode=signup" variant="moon" size="lg">
      {label}
      <ArrowRight className="text-[18px]" />
    </ButtonLink>
  );
}

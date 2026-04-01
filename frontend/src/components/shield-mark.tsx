import { cn } from "@/lib/utils";

type ShieldMarkProps = {
  className?: string;
  size?: number;
  /** When set, exposed as accessible name; omit for decorative marks */
  title?: string;
};

/** Sentinel logo mark. */
export function ShieldMark({ className, size = 40, title }: ShieldMarkProps) {
  return (
    <img
      src="/sentinel-logo.png"
      width={size}
      height={size}
      alt={title ?? "Sentinel"}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

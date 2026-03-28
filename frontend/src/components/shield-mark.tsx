import { cn } from "@/lib/utils";

type ShieldMarkProps = {
  className?: string;
  size?: number;
  /** When set, exposed as accessible name; omit for decorative marks */
  title?: string;
};

/** Simple shield graphic (matches public/shield-icon.svg) for chrome and reports. */
export function ShieldMark({ className, size = 40, title }: ShieldMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 36"
      width={size}
      height={(size * 36) / 32}
      fill="none"
      className={cn("shrink-0 text-secondary-fixed", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M16 2L4 7.5v9.2c0 6.2 5.2 12.1 12 16.3 6.8-4.2 12-10.1 12-16.3V7.5L16 2z"
        fill="currentColor"
        className="opacity-[0.18]"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M16 10v12M11 16.5h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );
}

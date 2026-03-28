import { cn } from "@/lib/utils";

export function MaterialIcon({
  name,
  className,
  filled,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={cn("material-symbols-outlined", className)}
      style={
        filled
          ? ({ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } as React.CSSProperties)
          : undefined
      }
    >
      {name}
    </span>
  );
}

import * as React from "react"
import { cn } from "../../lib/utils"

// NEXORA #104 : champ des formulaires du site (même système que le logiciel, le back office et l’espace des parrains) :
// coins de 14 px, filet fin, survol, focus à filet d’encre et halo, erreur (aria-invalid), lecture seule en pointillés.

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-[14px] border border-foreground/15 bg-foreground/[0.04] px-4 text-[15px] text-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-foreground focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-foreground/10 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 read-only:border-dashed read-only:bg-transparent disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Input }

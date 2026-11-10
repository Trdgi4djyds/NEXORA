import * as React from "react"
import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

// shadcn/ui, NEXORA #099 (« Horizon ») : bouton plein en pilule blanche (encre dans une section blanche), à pastille noire
// et flèche quand il en porte une (.btn-orb) ; bouton à contour en verre dépoli qui passe au blanc au survol ; aucun halo.
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,color,box-shadow,transform,border-color] duration-200 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--primary-hi)]",
        outline:
          "border border-foreground/25 bg-foreground/[0.06] text-foreground backdrop-blur-md hover:border-foreground hover:bg-foreground hover:text-background",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 text-[14.5px]",
        sm: "h-9 px-4 text-[13.5px]",
        lg: "h-[54px] px-7 text-[15.5px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp data-slot="button" data-size={size ?? "default"} className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }

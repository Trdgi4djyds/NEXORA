import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "../../lib/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-lg font-semibold", className)} {...props} />
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

/*
 * NEXORA #085 : le site publié interdit les styles en ligne (`style-src 'self'`). En mode modal, Radix verrouille le
 * défilement en injectant une balise <style> (react-remove-scroll), bloquée par cette politique : le site utilise donc
 * la fenêtre en mode non modal (`modal={false}` sur Dialog) avec ce fond à lui et la classe `menu-open` du body.
 * Échap et le clic à l'extérieur ferment toujours la fenêtre.
 */
function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in-0" aria-hidden="true" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-foreground/10 bg-popover text-popover-foreground shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9),0_0_0_1px_rgb(var(--neon)/0.08)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogContent, DialogTitle, DialogDescription }

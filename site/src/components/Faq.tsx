import { Reveal } from "../lib/motion"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion"

/** Questions fréquentes : accordéon de shadcn/ui (Radix), une réponse ouverte à la fois. */
export function Faq({ items, idPrefix = "faq" }: { items: { q: string; a: string }[]; idPrefix?: string }) {
  return (
    <Reveal className="surface px-6 md:px-8">
      <Accordion type="single" collapsible defaultValue={`${idPrefix}-0`}>
        {items.map((it, i) => (
          <AccordionItem key={it.q} value={`${idPrefix}-${i}`}>
            <AccordionTrigger>{it.q}</AccordionTrigger>
            <AccordionContent>{it.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Reveal>
  )
}

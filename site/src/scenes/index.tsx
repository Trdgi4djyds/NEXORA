// Scènes animées de chaque espace, telles qu'elles apparaissent dans la fenêtre de NEXORA du site.
// `click` : instant (ms après l'ouverture de l'espace) où le curseur clique l'élément marqué `data-pointer` de la
// scène ; `duration` : durée de la démonstration avant de passer à l'espace suivant.
import type { ComponentType } from "react"
import type { SpaceId } from "../data/spaces"
import { AppScene } from "./AppScene"
import { BrowserScene } from "./BrowserScene"
import { DesignScene } from "./DesignScene"
import { DesktopScene } from "./DesktopScene"
import { DevScene } from "./DevScene"
import { HomeScene } from "./HomeScene"
import { ResponsiveScene } from "./ResponsiveScene"
import { SecurityScene } from "./SecurityScene"
import { StudioScene } from "./StudioScene"

export type SceneDef = { Component: ComponentType; click: number; duration: number }

export const SCENES: Record<SpaceId, SceneDef> = {
  home: { Component: HomeScene, click: 2100, duration: 6200 },
  preview: { Component: ResponsiveScene, click: 3300, duration: 6800 },
  browser: { Component: BrowserScene, click: 3400, duration: 7000 },
  dev: { Component: DevScene, click: 950, duration: 7000 },
  android: { Component: AppScene, click: 950, duration: 7200 },
  studio: { Component: StudioScene, click: 1150, duration: 7200 },
  design: { Component: DesignScene, click: 2950, duration: 7200 },
  security: { Component: SecurityScene, click: 950, duration: 6600 },
  desktop: { Component: DesktopScene, click: 850, duration: 7400 },
}

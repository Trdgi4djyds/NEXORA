import type { CSSProperties } from "react"
import { Icon } from "../lib/icons"
import { deviceSize } from "../lib/product"
import { d, KoraSite } from "./common"

type Kind = "phone" | "fold" | "tablet" | "desktop"
// Appareils du catalogue du Responsive Lab (tailles réelles en pixels CSS), cadres dessinés à plat.
const DEVICES: { id: string; kind: Kind; icon: string; screen: [number, number] }[] = [
  { id: "iphone-18-pro", kind: "phone", icon: "phone", screen: [138, 300] },
  { id: "galaxy-z-fold7", kind: "fold", icon: "fold", screen: [224, 248] },
  { id: "ipad-air-13", kind: "tablet", icon: "tablet", screen: [190, 254] },
  { id: "macbook-air-13", kind: "desktop", icon: "laptop", screen: [326, 212] },
]

/** Responsive Lab : le site de Kora dans quatre vrais appareils, côte à côte, qui défilent ensemble. */
export function ResponsiveScene() {
  const list = DEVICES.map((dv) => ({ ...dv, size: deviceSize(dv.id) }))
  return (
    <div className="sc sc-resp">
      <div className="rs-top ui-card a-up" style={d(0)}>
        {list.map((dv, i) => (
          <span key={dv.id} className={`ui-chip${i === 0 ? " on" : ""}`}>
            <Icon name={dv.icon} size={13} />
            {dv.size?.name.split(" / ")[0] ?? dv.id}
          </span>
        ))}
        <span className="ui-chip ghost">
          <Icon name="plus" size={13} />
          Ajouter
        </span>
        <span className="nxw-grow" />
        <span className="rs-board-name">Planche « Lancement »</span>
        <span className="ui-btn icon">
          <Icon name="rotate" size={14} />
        </span>
        <span className="ui-btn a-press" style={d(3.3)} data-pointer>
          <Icon name="camera" size={14} />
          Exporter
        </span>
      </div>
      <div className="rs-board ui-card dots-w">
        {list.map((dv, i) => {
          const [sw, sh] = dv.screen
          const nw = dv.size?.w ?? 400
          const style = { "--sw": `${sw}px`, "--sh": `${sh}px`, "--nw": `${nw}px`, "--nh": `${Math.round(sh / (sw / nw))}px`, "--k": sw / nw } as CSSProperties
          return (
            <figure key={dv.id} className={`rs-dev rs-${dv.kind} a-up`} style={{ ...style, ...d(0.15 + i * 0.13) }}>
              <div className="rs-frame">
                <div className="rs-screen">
                  <KoraSite layout={dv.kind} />
                </div>
                {dv.kind === "phone" && <i className="rs-island" />}
                {dv.kind === "fold" && <i className="rs-hinge" />}
                {dv.kind === "phone" && <i className="rs-tap" style={d(2.6)} />}
              </div>
              {dv.kind === "desktop" && <i className="rs-base" />}
              <figcaption>
                <b>{dv.size?.name.split(" / ")[0]}</b>
                <span>
                  {dv.size?.w} × {dv.size?.h}
                </span>
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}

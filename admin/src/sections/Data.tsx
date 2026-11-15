// NEXORA #125 : section « Données » de NEX-SYSTEM : toutes les tables du schéma public, lues et modifiées par un
// administrateur (lire, rechercher, trier, modifier, ajouter, supprimer). Tout passe par les fonctions nx_admin_data_*
// (supabase/migrations/20261115000001_sans_equipes_admins.sql) avec la session de l'administrateur : jamais de clé de
// service dans le navigateur ; chaque écriture est journalisée par la base (Journal d'audit), qui reste en lecture seule.
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRefresh, type SectionProps } from "../App"
import { Icon } from "../icons"
import { must, sb } from "../supabase"
import { downloadCsv, Drawer, Empty, fmtNum, Loaded, Modal, SearchBox, Table, Tag, useAction, useLoad, useUi } from "../ui"

type Column = { name: string; type: string; nullable: boolean; default: string | null; generated: boolean }
type TableInfo = { name: string; rows: number; readonly: boolean; key: string[]; columns: Column[] }
type Page = { total: number; rows: Record<string, unknown>[]; key: string[] }
type Values = Record<string, unknown>

const PAGE = 50
const isJson = (t: string) => t === "json" || t === "jsonb" || t.endsWith("[]")
const isBool = (t: string) => t === "boolean"

export function Data({ param }: SectionProps) {
  const refresh = useRefresh()
  // Route #/data/<table>, ou #/data/<table>/<clé> : ligne ouverte directement (tables à clé simple).
  const [tableName, rowKey] = (param || "").split("/")
  const [filter, setFilter] = useState("")
  const q = useLoad(async () => (must(await sb.rpc("nx_admin_data_tables")) as TableInfo[]) || [], [refresh])
  return (
    <Loaded q={q}>
      {(tables) => {
        const current = tables.find((t) => t.name === tableName) || null
        const shown = tables.filter((t) => !filter || t.name.includes(filter.toLowerCase()))
        return (
          <div className="data-split">
            <aside className="data-tables" aria-label="Tables">
              <div className="data-tables-head">
                <b>{tables.length} tables</b>
                <input className="input sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…" aria-label="Filtrer les tables" />
              </div>
              <nav>
                {shown.map((t) => (
                  <a key={t.name} href={`#/data/${encodeURIComponent(t.name)}`} className={t.name === current?.name ? "on" : ""} aria-current={t.name === current?.name ? "page" : undefined}>
                    <Icon name={t.readonly ? "lock" : "layers"} size={13} />
                    <span className="grow ellipsis">{t.name}</span>
                    <small>{fmtNum(t.rows)}</small>
                  </a>
                ))}
              </nav>
            </aside>
            <section className="data-main">
              {current ? <TableView key={current.name} info={current} openKey={rowKey} onChanged={q.reload} /> : (
                <Empty icon="layers">
                  Choisissez une table à gauche : vous pouvez lire, rechercher, modifier, ajouter et supprimer n’importe quelle ligne.
                  Chaque modification est enregistrée dans le Journal d’audit.
                </Empty>
              )}
            </section>
          </div>
        )
      }}
    </Loaded>
  )
}

function TableView({ info, openKey, onChanged }: { info: TableInfo; openKey?: string; onChanged: () => void }) {
  const refresh = useRefresh()
  const [search, setSearch] = useState("")
  const [order, setOrder] = useState<{ col: string | null; desc: boolean }>({ col: info.columns.some((c) => c.name === "created_at") ? "created_at" : info.key[0] || null, desc: true })
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState<Values | null>(null)
  const [adding, setAdding] = useState(false)
  const q = useLoad(async () => must(await sb.rpc("nx_admin_data_rows", { p_table: info.name, p_search: search || null, p_order: order.col, p_desc: order.desc, p_limit: PAGE, p_offset: page * PAGE })) as Page, [info.name, search, order.col, order.desc, page, refresh, tick])
  const reload = () => { setTick((n) => n + 1); onChanged() }
  // Ligne demandée par la route : ouverte une fois chargée.
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (opened || !openKey || info.key.length !== 1 || !q.data) return
    const r = q.data.rows.find((x) => String(x[info.key[0]]) === openKey)
    if (r) setOpen(r)
    setOpened(true)
  }, [q.data, openKey, opened, info.key])
  const editable = !info.readonly && info.key.length > 0
  const sortBy = (col: string) => { setPage(0); setOrder((o) => ({ col, desc: o.col === col ? !o.desc : true })) }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={search} onSearch={(v) => { setPage(0); setSearch(v) }} placeholder={`Rechercher dans ${info.name}…`} />
        {info.readonly && <Tag>Lecture seule</Tag>}
        {!info.readonly && !info.key.length && <Tag tone="warn">Sans clé primaire : ajout seulement</Tag>}
        <span className="grow" />
        <button className="btn" disabled={!q.data?.rows.length} onClick={() => downloadCsv(info.name, (q.data?.rows || []).map(flat))}>
          <Icon name="download" size={14} /> Exporter
        </button>
        {!info.readonly && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Ajouter une ligne
          </button>
        )}
      </div>
      <Loaded q={q}>
        {(d) => (
          <>
            <Table
              head={info.columns.map((c) => (
                <button key={c.name} type="button" className="data-sort" onClick={() => sortBy(c.name)} title={`${c.type}${info.key.includes(c.name) ? " · clé" : ""} · trier`}>
                  {info.key.includes(c.name) && <Icon name="key" size={11} />}
                  {c.name}
                  {order.col === c.name && <Icon name={order.desc ? "chevronDown" : "chevronUp"} size={11} />}
                </button>
              ))}
              empty={search ? "Aucune ligne ne correspond à la recherche." : "Cette table est vide."}
            >
              {d.rows.map((r, i) => (
                <tr key={info.key.length ? info.key.map((k) => String(r[k])).join("|") : i} className="click" onClick={() => setOpen(r)}>
                  {info.columns.map((c) => <td key={c.name} className="data-cell">{cell(r[c.name])}</td>)}
                </tr>
              ))}
            </Table>
            <div className="pager">
              <span>{fmtNum(d.total)} ligne(s){d.total > PAGE && ` · page ${page + 1} sur ${Math.ceil(d.total / PAGE)}`}</span>
              <span className="grow" />
              <button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédente</button>
              <button className="btn sm" disabled={(page + 1) * PAGE >= d.total} onClick={() => setPage((p) => p + 1)}>Suivante</button>
            </div>
          </>
        )}
      </Loaded>
      {open && <RowDrawer info={info} row={open} editable={editable} onClose={() => setOpen(null)} onSaved={(r) => { setOpen(r); reload() }} onDeleted={() => { setOpen(null); reload() }} />}
      {adding && <AddModal info={info} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); reload() }} />}
    </>
  )
}

/* ---------------------------------------------------------------- Fiche d'une ligne */

function RowDrawer({ info, row, editable, onClose, onSaved, onDeleted }: { info: TableInfo; row: Values; editable: boolean; onClose: () => void; onSaved: (r: Values) => void; onDeleted: () => void }) {
  const ui = useUi()
  const act = useAction()
  const initial = useMemo(() => Object.fromEntries(info.columns.map((c) => [c.name, toField(row[c.name], c)])), [row, info.columns])
  const [form, setForm] = useState<Record<string, Field>>(initial)
  const key = Object.fromEntries(info.key.map((k) => [k, row[k]]))
  const changed = info.columns.filter((c) => !c.generated && JSON.stringify(form[c.name]) !== JSON.stringify(initial[c.name]))

  async function save() {
    let values: Values
    try { values = Object.fromEntries(changed.map((c) => [c.name, fromField(form[c.name], c)])) } catch (e) { ui.fail(e); return }
    let saved: Values | null = null
    if (await act.run(async () => { saved = must(await sb.rpc("nx_admin_data_update", { p_table: info.name, p_key: key, p_values: values })) as Values }, "Ligne enregistrée.") && saved) onSaved(saved)
  }
  async function remove() {
    if (!(await ui.confirm({ title: "Supprimer cette ligne ?", body: <>La ligne de <b>{info.name}</b> ({info.key.map((k) => `${k} = ${String(row[k])}`).join(", ")}) est supprimée définitivement, avec ce qui en dépend dans la base. Une copie reste dans le Journal d’audit.</>, confirm: "Supprimer", danger: true }))) return
    if (await act.run(async () => must(await sb.rpc("nx_admin_data_delete", { p_table: info.name, p_key: key })), "Ligne supprimée.")) onDeleted()
  }

  return (
    <Drawer
      title={info.key.length ? info.key.map((k) => String(row[k])).join(" · ") : info.name}
      sub={<>Table <code>{info.name}</code>{editable ? "" : " · lecture seule"}</>}
      onClose={onClose}
      actions={editable ? <button className="btn sm danger" disabled={act.busy} onClick={remove}><Icon name="trash" size={13} /> Supprimer</button> : undefined}
    >
      <section className="data-form">
        {info.columns.map((c) => (
          <FieldRow key={c.name} c={c} isKey={info.key.includes(c.name)} value={form[c.name]} readOnly={!editable || c.generated} onChange={(v) => setForm({ ...form, [c.name]: v })} />
        ))}
      </section>
      {editable && (
        <div className="actions data-actions">
          <span className="muted small grow">{changed.length ? `${changed.length} champ(s) modifié(s)` : "Aucune modification"}</span>
          <button className="btn" disabled={!changed.length || act.busy} onClick={() => setForm(initial)}>Annuler</button>
          <button className="btn primary" disabled={!changed.length || act.busy} onClick={save}>Enregistrer</button>
        </div>
      )}
    </Drawer>
  )
}

function AddModal({ info, onClose, onAdded }: { info: TableInfo; onClose: () => void; onAdded: () => void }) {
  const ui = useUi()
  const act = useAction()
  const cols = info.columns.filter((c) => !c.generated)
  const [form, setForm] = useState<Record<string, Field>>({})
  async function add() {
    let values: Values
    try { values = Object.fromEntries(cols.filter((c) => form[c.name]).map((c) => [c.name, fromField(form[c.name], c)])) } catch (e) { ui.fail(e); return }
    if (await act.run(async () => must(await sb.rpc("nx_admin_data_insert", { p_table: info.name, p_values: values })), "Ligne ajoutée.")) onAdded()
  }
  return (
    <Modal title={`Ajouter une ligne · ${info.name}`} onClose={onClose} width={640}>
      <p className="muted small">Les champs laissés tels quels prennent la valeur par défaut de la table.</p>
      <section className="data-form data-form-modal">
        {cols.map((c) => (
          <FieldRow key={c.name} c={c} isKey={info.key.includes(c.name)} value={form[c.name]} onChange={(v) => setForm({ ...form, [c.name]: v })} placeholder={c.default ? `par défaut : ${c.default}` : c.nullable ? "vide : NULL" : "obligatoire"} />
        ))}
      </section>
      <div className="actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={act.busy} onClick={add}>Ajouter</button>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- Champs */

// Valeur d'un champ : texte saisi, ou NULL explicite.
type Field = { text: string; isNull: boolean }

function toField(v: unknown, c: Column): Field {
  if (v === null || v === undefined) return { text: "", isNull: true }
  if (isJson(c.type)) return { text: JSON.stringify(v, null, 2), isNull: false }
  return { text: String(v), isNull: false }
}
function fromField(f: Field, c: Column): unknown {
  if (f.isNull) return null
  if (isJson(c.type)) {
    try { return JSON.parse(f.text || "null") } catch { throw new Error(`« ${c.name} » : JSON invalide.`) }
  }
  if (isBool(c.type)) return f.text === "true"
  return f.text
}

function FieldRow({ c, isKey, value, readOnly, onChange, placeholder }: { c: Column; isKey: boolean; value?: Field; readOnly?: boolean; onChange: (v: Field) => void; placeholder?: string }) {
  const f = value || { text: "", isNull: false }
  const long = isJson(c.type) || c.type === "text" && f.text.length > 70
  let input: ReactNode
  if (isBool(c.type)) {
    input = (
      <select className="input sm" disabled={readOnly || f.isNull} value={f.isNull ? "" : f.text || ""} onChange={(e) => onChange({ text: e.target.value, isNull: false })}>
        {!value && <option value="">{placeholder || "—"}</option>}
        <option value="true">Oui (true)</option>
        <option value="false">Non (false)</option>
      </select>
    )
  } else if (long) {
    input = <textarea className="input mono" rows={isJson(c.type) ? Math.min(12, Math.max(3, f.text.split("\n").length)) : 3} readOnly={readOnly} disabled={f.isNull} value={f.text} placeholder={placeholder} onChange={(e) => onChange({ text: e.target.value, isNull: false })} />
  } else {
    input = <input className="input sm" readOnly={readOnly} disabled={f.isNull} value={f.text} placeholder={placeholder} onChange={(e) => onChange({ text: e.target.value, isNull: false })} />
  }
  return (
    <label className="data-field">
      <span className="data-field-head">
        {isKey && <Icon name="key" size={11} />}
        <b>{c.name}</b>
        <small className="muted">{c.type}{c.generated ? " · calculée" : ""}</small>
        <span className="grow" />
        {c.nullable && !readOnly && (
          <span className="data-null">
            <input type="checkbox" checked={f.isNull} onChange={(e) => onChange({ text: f.text, isNull: e.target.checked })} />
            NULL
          </span>
        )}
      </span>
      {input}
    </label>
  )
}

/* ---------------------------------------------------------------- Affichage */

function cell(v: unknown): ReactNode {
  if (v === null || v === undefined) return <span className="muted">NULL</span>
  if (typeof v === "boolean") return v ? "Oui" : "Non"
  const s = typeof v === "object" ? JSON.stringify(v) : String(v)
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}
const flat = (r: Values) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v]))

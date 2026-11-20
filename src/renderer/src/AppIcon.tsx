import { letterOf, type WebApp } from '../../shared/apps'

/** An app's tile: its fetched icon, or its first letter when it has none. */
export function AppIcon({ app, size }: { app: Pick<WebApp, 'name' | 'icon'>; size: number }): JSX.Element {
  if (app.icon) return <img className="appicon" src={app.icon} alt="" width={size} height={size} draggable={false} />
  return (
    <span className="appicon letter" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      {letterOf(app.name)}
    </span>
  )
}

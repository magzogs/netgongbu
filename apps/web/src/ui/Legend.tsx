import { useMemo, useState, type ReactElement } from 'react';
import type { LinkMedium, Protocol } from '@netgongbu/schema';
import { MEDIUM_COLORS, PROTOCOL_COLORS } from '../scene/theme';
import { NARROW_QUERY, useViewer } from '../store/viewer';
import { MEDIUM_NAMES } from './names';

/** Colour key for the protocols in this scenario and the link media in this topology. */
export function Legend(): ReactElement | null {
  const [open, setOpen] = useState(() => !window.matchMedia(NARROW_QUERY).matches);
  const scenario = useViewer((s) => s.scenario);
  const world = useViewer((s) => s.world);

  const protocols = useMemo(() => {
    const used = new Set<Protocol>();
    for (const beat of scenario?.beats ?? []) {
      for (const hop of beat.hops) used.add(hop.packet.protocol);
    }
    return [...used];
  }, [scenario]);
  const media = useMemo(
    () => [...new Set<LinkMedium>(world?.topology.links.map((l) => l.medium))],
    [world],
  );

  if (!scenario || !world) return null;
  return (
    <section className={`legend panel${open ? '' : ' is-collapsed'}`} aria-label="범례">
      <button
        type="button"
        className="legend__toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        범례
      </button>
      {open && (
        <div className="legend__body">
          <ul className="legend__list">
            {protocols.map((p) => (
              <li key={p}>
                <span className="dot" style={{ background: PROTOCOL_COLORS[p] }} />
                {p}
              </li>
            ))}
          </ul>
          <ul className="legend__list">
            {media.map((m) => (
              <li key={m}>
                <span className="line" style={{ background: MEDIUM_COLORS[m] }} />
                {MEDIUM_NAMES[m]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

import { Fragment, type CSSProperties, type ReactElement } from 'react';
import { tr } from '@netgongbu/schema';
import { sameRef, type LayerRef, type Stack } from './stack';
import { BOX_COLORS } from './theme';

export type Selection = LayerRef | 'phy';

interface Props {
  stack: Stack;
  selected: Selection;
  onSelect: (selection: Selection) => void;
}

/**
 * Each layer's unit as its own header in front of what the layer above handed down, application
 * on top and the physical layer at the bottom; the same header lines up in every row.
 */
export function Encapsulation({ stack, selected, onSelect }: Props): ReactElement {
  const { headers, trailers } = stack.columns;
  // Row label, preamble, one column per header, the carried data, trailers, the frame gap.
  const columns = [
    'max-content',
    'auto',
    ...Array.from({ length: headers }, () => 'minmax(72px, max-content)'),
    'minmax(120px, 1fr)',
    ...Array.from({ length: trailers }, () => 'minmax(56px, max-content)'),
    'auto',
  ].join(' ');

  return (
    <div className="encap" style={{ gridTemplateColumns: columns }}>
      {stack.rows.map((row, r) => {
        const target: Selection = row.ref ?? 'phy';
        const isSelected =
          row.ref === null ? selected === 'phy' : selected !== 'phy' && sameRef(row.ref, selected);
        const select = (): void => {
          onSelect(target);
        };
        return (
          <Fragment key={`${row.level}-${row.title}`}>
            <div
              className={`encap__band${isSelected ? ' is-selected' : ''}`}
              style={{ gridRow: r + 1 }}
              onClick={select}
            />
            <button
              type="button"
              className="encap__label"
              style={{ gridRow: r + 1 }}
              aria-pressed={isSelected}
              onClick={select}
            >
              <span className="encap__level">{row.level}</span>
              <span className="encap__title">{row.title}</span>
              <span className="encap__unit">
                {row.unit} · {tr(`${String(row.bytes)}바이트`, `${String(row.bytes)} bytes`)}
              </span>
            </button>
            {row.cells.map((cell) => (
              <div
                key={cell.col}
                className="encap__cell"
                style={{
                  gridRow: r + 1,
                  gridColumn: `${String(cell.col + 2)} / span ${String(cell.span)}`,
                }}
                onClick={select}
              >
                {cell.boxes.map((box) => (
                  <span
                    key={box.key}
                    className={`encap__box encap__box--${box.kind}${box.own ? ' is-own' : ''}`}
                    style={{ '--layer': BOX_COLORS[box.kind] } as CSSProperties}
                    title={
                      box.bytes === null
                        ? box.label
                        : tr(
                            `${box.label} ${String(box.bytes)}바이트`,
                            `${box.label} ${String(box.bytes)} bytes`,
                          )
                    }
                  >
                    <span className="encap__box-label">{box.label}</span>
                    {box.bytes !== null && <small>{box.bytes}B</small>}
                  </span>
                ))}
              </div>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

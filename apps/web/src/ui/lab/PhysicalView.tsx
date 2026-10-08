import type { ReactElement } from 'react';
import type { Dissection } from '@netgongbu/protocols';
import { tr } from '@netgongbu/schema';
import { formatBits, type Radix } from './grid';

/** Bytes of the frame shown at the start of its bit stream. */
const LEAD = 6;

/** A byte's bits in the order Ethernet sends them: lowest bit first. */
const wireOrder = (b: number): string =>
  b.toString(2).padStart(8, '0').split('').reverse().join('');

function Row({
  name,
  size,
  value,
  wire,
}: {
  name: string;
  size: string;
  value: string;
  wire: string;
}): ReactElement {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{size}</td>
      <td className="phy__mono">{value}</td>
      <td className="phy__mono">{wire}</td>
    </tr>
  );
}

/** What the physical layer adds around the frame and how its bits go onto the medium. */
export function PhysicalView({ d, radix }: { d: Dissection; radix: Radix }): ReactElement {
  const frame = d.frame;
  const ethernet = d.layers[0]?.kind === 'ethernet';
  const lead = frame.slice(0, LEAD);
  const leadValue = `${formatBits(lead, 0, lead.length * 8, radix)} …`;
  const leadWire = `${[...lead].map(wireOrder).join(' ')} …`;

  if (!ethernet) {
    return (
      <div className="phy">
        <h3 className="lab__h">
          {tr('물리 계층 · Wi-Fi (IEEE 802.11 PHY)', 'Physical layer · Wi-Fi (IEEE 802.11 PHY)')}
        </h3>
        <table className="phy__table">
          <thead>
            <tr>
              <th>{tr('구간', 'Part')}</th>
              <th>{tr('크기', 'Size')}</th>
              <th>{tr('값', 'Value')}</th>
              <th>{tr('전파에 싣는 방식', 'How it goes onto radio waves')}</th>
            </tr>
          </thead>
          <tbody>
            <Row
              name={tr('PHY 프리앰블 + 헤더', 'PHY preamble + header')}
              size={tr('약 20–40 µs', 'About 20–40 µs')}
              value="L-STF, L-LTF, L-SIG, HE-SIG…"
              wire={tr(
                '수신기가 신호를 잡고 속도(MCS)를 읽는 부분',
                'Where the receiver locks onto the signal and reads the rate (MCS)',
              )}
            />
            <Row
              name={tr('프레임 (PSDU)', 'Frame (PSDU)')}
              size={tr(`${String(frame.length)}바이트`, `${String(frame.length)} bytes`)}
              value={leadValue}
              wire={tr(
                '스크램블 → 오류 정정 부호(LDPC) → QAM 변조 → OFDM 부반송파',
                'Scrambling → error-correcting code (LDPC) → QAM modulation → OFDM subcarriers',
              )}
            />
          </tbody>
        </table>
        <p className="phy__note">
          {tr(
            'Wi-Fi는 비트를 그대로 보내지 않습니다. 섞고(스크램블), 오류 정정용 비트를 더하고, 여러 비트를 한 번에 하나의 전파 상태(예: 1024-QAM이면 10비트)로 바꿔 수백 개의 부반송파에 나눠 싣습니다. 그래서 같은 프레임도 전파 상태에 따라 보내는 데 걸리는 시간이 달라집니다.',
            'Wi-Fi does not send bits as they are. It scrambles them, adds error-correction bits, turns several bits at a time into one radio symbol (10 bits with 1024-QAM, for example), and spreads them across hundreds of subcarriers. So the same frame can take a different time to send depending on radio conditions.',
          )}
        </p>
      </div>
    );
  }

  const bytesOnWire = 8 + frame.length + 12;
  const ns = bytesOnWire * 8;
  return (
    <div className="phy">
      <h3 className="lab__h">
        {tr('물리 계층 · 이더넷 (IEEE 802.3 PHY)', 'Physical layer · Ethernet (IEEE 802.3 PHY)')}
      </h3>
      <table className="phy__table">
        <thead>
          <tr>
            <th>{tr('구간', 'Part')}</th>
            <th>{tr('크기', 'Size')}</th>
            <th>
              {radix === 'hex'
                ? tr('값 (16진수)', 'Value (hex)')
                : tr('값 (2진수)', 'Value (binary)')}
            </th>
            <th>{tr('선로에 나가는 비트 순서', 'Bit order on the wire')}</th>
          </tr>
        </thead>
        <tbody>
          <Row
            name={tr('프리앰블', 'Preamble')}
            size={tr('7바이트', '7 bytes')}
            value={radix === 'hex' ? '55 55 55 55 55 55 55' : '01010101 × 7'}
            wire="10101010 × 7"
          />
          <Row
            name={tr('SFD (프레임 시작)', 'SFD (start of frame)')}
            size={tr('1바이트', '1 byte')}
            value={radix === 'hex' ? 'd5' : '11010101'}
            wire="10101011"
          />
          <Row
            name={tr('프레임 (목적지 MAC부터 FCS까지)', 'Frame (destination MAC through FCS)')}
            size={tr(`${String(frame.length)}바이트`, `${String(frame.length)} bytes`)}
            value={leadValue}
            wire={leadWire}
          />
          <Row
            name={tr('프레임 간격 (IFG)', 'Interframe gap (IFG)')}
            size={tr('12바이트 시간', '12 byte times')}
            value={tr('(신호 없음)', '(no signal)')}
            wire={tr('쉬는 시간', 'Idle')}
          />
        </tbody>
      </table>
      <p className="phy__note">
        {tr(
          '프리앰블의 1010… 반복으로 받는 쪽이 박자를 맞추고, 끝이 11로 바뀌는 SFD에서 프레임이 시작됨을 압니다. 이더넷은 각 바이트를 ',
          'The repeating 1010… of the preamble lets the receiver sync its clock, and the SFD, which ends in 11, tells it the frame starts. Ethernet sends each byte ',
        )}
        <strong>{tr('낮은 비트부터', 'lowest bit first')}</strong>
        {tr(
          ' 보내므로 0x55(01010101)가 선로에서는 10101010이 됩니다.',
          ', so 0x55 (01010101) becomes 10101010 on the wire.',
        )}
      </p>
      <p className="phy__note">
        {tr(
          `이 프레임은 선로에서 ${String(bytesOnWire)}바이트 시간을 씁니다: 1 Gb/s(1비트 = 1 ns)에서 ${(ns / 1000).toFixed(2)} µs, 100 Mb/s에서 ${(ns / 100).toFixed(1)} µs. 실제 전기 신호는 속도마다 다르게 부호화됩니다(100BASE-TX는 4B5B와 MLT-3, 1000BASE-T는 네 쌍의 선에 PAM-5).`,
          `This frame takes ${String(bytesOnWire)} byte times on the wire: ${(ns / 1000).toFixed(2)} µs at 1 Gb/s (1 bit = 1 ns), ${(ns / 100).toFixed(1)} µs at 100 Mb/s. The actual electrical signal is encoded differently at each speed (100BASE-TX uses 4B5B and MLT-3; 1000BASE-T uses PAM-5 over four wire pairs).`,
        )}
      </p>
    </div>
  );
}

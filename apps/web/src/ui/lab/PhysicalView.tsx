import type { ReactElement } from 'react';
import type { Dissection } from '@magvirtualedu/protocols';
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
        <h3 className="lab__h">물리 계층 · Wi-Fi (IEEE 802.11 PHY)</h3>
        <table className="phy__table">
          <thead>
            <tr>
              <th>구간</th>
              <th>크기</th>
              <th>값</th>
              <th>전파에 싣는 방식</th>
            </tr>
          </thead>
          <tbody>
            <Row
              name="PHY 프리앰블 + 헤더"
              size="약 20–40 µs"
              value="L-STF, L-LTF, L-SIG, HE-SIG…"
              wire="수신기가 신호를 잡고 속도(MCS)를 읽는 부분"
            />
            <Row
              name="프레임 (PSDU)"
              size={`${String(frame.length)}바이트`}
              value={leadValue}
              wire="스크램블 → 오류 정정 부호(LDPC) → QAM 변조 → OFDM 부반송파"
            />
          </tbody>
        </table>
        <p className="phy__note">
          Wi-Fi는 비트를 그대로 보내지 않습니다. 섞고(스크램블), 오류 정정용 비트를 더하고, 여러
          비트를 한 번에 하나의 전파 상태(예: 1024-QAM이면 10비트)로 바꿔 수백 개의 부반송파에 나눠
          싣습니다. 그래서 같은 프레임도 전파 상태에 따라 보내는 데 걸리는 시간이 달라집니다.
        </p>
      </div>
    );
  }

  const bytesOnWire = 8 + frame.length + 12;
  const ns = bytesOnWire * 8;
  return (
    <div className="phy">
      <h3 className="lab__h">물리 계층 · 이더넷 (IEEE 802.3 PHY)</h3>
      <table className="phy__table">
        <thead>
          <tr>
            <th>구간</th>
            <th>크기</th>
            <th>값 ({radix === 'hex' ? '16진수' : '2진수'})</th>
            <th>선로에 나가는 비트 순서</th>
          </tr>
        </thead>
        <tbody>
          <Row
            name="프리앰블"
            size="7바이트"
            value={radix === 'hex' ? '55 55 55 55 55 55 55' : '01010101 × 7'}
            wire="10101010 × 7"
          />
          <Row
            name="SFD (프레임 시작)"
            size="1바이트"
            value={radix === 'hex' ? 'd5' : '11010101'}
            wire="10101011"
          />
          <Row
            name="프레임 (목적지 MAC부터 FCS까지)"
            size={`${String(frame.length)}바이트`}
            value={leadValue}
            wire={leadWire}
          />
          <Row name="프레임 간격 (IFG)" size="12바이트 시간" value="(신호 없음)" wire="쉬는 시간" />
        </tbody>
      </table>
      <p className="phy__note">
        프리앰블의 1010… 반복으로 받는 쪽이 박자를 맞추고, 끝이 11로 바뀌는 SFD에서 프레임이
        시작됨을 압니다. 이더넷은 각 바이트를 <strong>낮은 비트부터</strong> 보내므로
        0x55(01010101)가 선로에서는 10101010이 됩니다.
      </p>
      <p className="phy__note">
        이 프레임은 선로에서 {bytesOnWire}바이트 시간을 씁니다: 1 Gb/s(1비트 = 1 ns)에서{' '}
        {(ns / 1000).toFixed(2)} µs, 100 Mb/s에서 {(ns / 100).toFixed(1)} µs. 실제 전기 신호는
        속도마다 다르게 부호화됩니다(100BASE-TX는 4B5B와 MLT-3, 1000BASE-T는 네 쌍의 선에 PAM-5).
      </p>
    </div>
  );
}

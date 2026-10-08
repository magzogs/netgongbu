import type { NetworkInterfaceInfo } from 'node:os';
import {
  interfaceKind,
  normalizeMac,
  parseArp,
  parseHardwarePorts,
  parseIpNeigh,
  parseIpRouteDefault,
  parseResolvConf,
  parseRouteGetDefault,
  parseScutilDns,
  type DefaultRoute,
  type LocalNetwork,
} from '@netgongbu/trace';
import type { Exec } from './exec';

export interface LocalDeps {
  platform: NodeJS.Platform;
  exec: Exec;
  interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]>;
  readFile: (path: string) => Promise<string | null>;
  exists: (path: string) => boolean;
}

function platformOf(p: NodeJS.Platform): LocalNetwork['platform'] {
  return p === 'darwin' || p === 'linux' || p === 'win32' ? p : 'other';
}

/** Address, MAC and netmask of an interface as the OS reports them. */
function addressOf(
  deps: LocalDeps,
  name: string,
): Pick<NonNullable<LocalNetwork['interface']>, 'ipv4' | 'mac' | 'netmask'> {
  const v4 = deps.interfaces()[name]?.find((a) => a.family === 'IPv4' && !a.internal);
  return {
    ipv4: v4?.address ?? null,
    mac: v4?.mac && v4.mac !== '00:00:00:00:00:00' ? normalizeMac(v4.mac) : null,
    netmask: v4?.netmask ?? null,
  };
}

async function darwin(deps: LocalDeps): Promise<Omit<LocalNetwork, 'platform'>> {
  const [route, ports, dns] = await Promise.all([
    deps.exec('/sbin/route', ['-n', 'get', 'default']),
    deps.exec('/usr/sbin/networksetup', ['-listallhardwareports']),
    deps.exec('/usr/sbin/scutil', ['--dns']),
  ]);
  const def: DefaultRoute | null = route ? parseRouteGetDefault(route) : null;
  const arp = def ? await deps.exec('/usr/sbin/arp', ['-n', def.gateway]) : null;
  const port = def && ports ? parseHardwarePorts(ports).get(def.interface) : undefined;
  return {
    interface: def
      ? { name: def.interface, kind: interfaceKind(port), ...addressOf(deps, def.interface) }
      : null,
    gateway: def ? { ip: def.gateway, mac: arp ? parseArp(arp, def.interface) : null } : null,
    defaultRoute: def ? `default → ${def.gateway} (${def.interface})` : null,
    dnsServers: dns ? parseScutilDns(dns) : [],
  };
}

async function linux(deps: LocalDeps): Promise<Omit<LocalNetwork, 'platform'>> {
  const [route, resolv] = await Promise.all([
    deps.exec('ip', ['route', 'show', 'default']),
    deps.readFile('/etc/resolv.conf'),
  ]);
  const def = route ? parseIpRouteDefault(route) : null;
  const neigh = def ? await deps.exec('ip', ['neigh', 'show', def.gateway]) : null;
  const wifi = def ? deps.exists(`/sys/class/net/${def.interface}/wireless`) : false;
  return {
    interface: def
      ? { name: def.interface, kind: wifi ? 'wifi' : 'ethernet', ...addressOf(deps, def.interface) }
      : null,
    gateway: def ? { ip: def.gateway, mac: neigh ? parseIpNeigh(neigh) : null } : null,
    defaultRoute: def ? `default → ${def.gateway} (${def.interface})` : null,
    dnsServers: resolv ? parseResolvConf(resolv) : [],
  };
}

/** Interface, gateway, default route and DNS servers of this computer, read with OS tools. */
export async function snapshotLocal(deps: LocalDeps): Promise<LocalNetwork> {
  const platform = platformOf(deps.platform);
  if (platform === 'darwin') return { platform, ...(await darwin(deps)) };
  if (platform === 'linux') return { platform, ...(await linux(deps)) };
  return { platform, interface: null, gateway: null, defaultRoute: null, dnsServers: [] };
}

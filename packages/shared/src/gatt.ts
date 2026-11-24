export const GATT_SERVICES: Record<string, string> = {
  '0x1800': 'Generic Access',
  '0x1801': 'Generic Attribute',
  '0x180A': 'Device Information',
  '0x180D': 'Heart Rate',
  '0x180F': 'Battery Service',
  '0x1812': 'Human Interface Device',
  '0x181A': 'Environmental Sensing',
  '0x1844': 'Volume Control (LE Audio)',
  '0x1846': 'Coordinated Set Identification (CSIS)',
  '0x184E': 'Audio Stream Control (ASCS)',
  '0x184F': 'Broadcast Audio Scan (BASS)',
  '0x1850': 'Published Audio Capabilities (PACS)',
  '0xFE2C': 'Google Fast Pair',
  '0xFDDF': 'Amazon / Bose Control'
};

export const GATT_CHARACTERISTICS: Record<string, string> = {
  '0x2A00': 'Device Name',
  '0x2A01': 'Appearance',
  '0x2A19': 'Battery Level',
  '0x2A24': 'Model Number String',
  '0x2A26': 'Firmware Revision String',
  '0x2A29': 'Manufacturer Name String',
  '0x2A37': 'Heart Rate Measurement',
  '0x2A4D': 'HID Report',
  '0x2B7D': 'Volume State',
  '0x2BC4': 'ASE Control Point'
};

const OUI_VENDORS: Record<string, string> = {
  '00:1A:7D': 'Cyber-Blue / Generic HCI',
  '04:52:C7': 'Bose Corporation',
  '14:3F:A6': 'Sony Corporation',
  '28:11:A5': 'Bose Corporation',
  '2C:41:A1': 'Bose Corporation',
  '38:18:4C': 'Sony Corporation',
  '40:98:AD': 'Apple Inc.',
  '58:FC:C6': 'JBL / Harman',
  '64:A2:F9': 'JBL / Harman',
  '70:26:05': 'Sony Corporation',
  '7C:96:D2': 'Sony Corporation',
  '80:99:E7': 'Sennheiser',
  '94:DB:56': 'Sony Corporation',
  'A4:5E:60': 'Apple Inc.',
  'B8:27:EB': 'Raspberry Pi',
  'C4:9D:ED': 'Microsoft Corporation',
  'D0:8A:55': 'Logitech',
  'DC:2C:26': 'Keychron',
  'E4:17:D8': '8BitDo / HID',
  'E8:AB:FA': 'Anker Soundcore',
  'F0:13:C3': 'Polar Electro',
  'F4:4E:FC': 'Samsung Electronics'
};

export function lookupVendor(macAddress: string): string {
  const normalized = macAddress.trim().toUpperCase().replace(/-/g, ':');
  const prefix = normalized.slice(0, 8);
  return OUI_VENDORS[prefix] ?? 'Bluetooth Device';
}

/**
 * Estimates physical distance in meters from RSSI using the log-distance path loss model.
 * txPower defaults to -59 dBm (calibrated 1m RSSI for Class 2 Bluetooth radios).
 */
export function estimateDistanceMeters(rssi: number, txPower = -59, pathLossExponent = 2.4): number {
  if (rssi >= 0) return 0.2;
  const ratio = (txPower - rssi) / (10 * pathLossExponent);
  const meters = Math.pow(10, ratio);
  return Math.round(Math.min(30, Math.max(0.2, meters)) * 10) / 10;
}

export function normalizeMacAddress(address: string): string {
  return address.trim().toUpperCase().replace(/-/g, ':');
}

export function isValidMacAddress(address: string): boolean {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizeMacAddress(address));
}

import { useCallback, useState } from 'react';
import type { BluetoothDevice, GattService } from '@polyblue/shared';

interface WebBluetoothNavigator extends Navigator {
  bluetooth?: {
    requestDevice(options: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    }): Promise<{
      id: string;
      name?: string;
      gatt?: {
        connect(): Promise<{
          getPrimaryService(uuid: string): Promise<{
            getCharacteristic(uuid: string): Promise<{
              readValue(): Promise<DataView>;
            }>;
          }>;
        }>;
      };
    }>;
  };
}

export function useWebBluetooth(
  onDeviceDiscovered: (device: Partial<BluetoothDevice> & { id: string; name: string }) => Promise<unknown>
) {
  const nav = typeof navigator !== 'undefined' ? (navigator as WebBluetoothNavigator) : null;
  const supported = Boolean(nav?.bluetooth);
  const [pairing, setPairing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const requestRealBleDevice = useCallback(async () => {
    if (!nav?.bluetooth) {
      setStatusMessage('Web Bluetooth requires Chrome, Edge, or Opera over HTTPS/localhost.');
      return;
    }

    setPairing(true);
    setStatusMessage(null);
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information', 'heart_rate']
      });

      let batteryLevel: number | null = null;
      const services: GattService[] = [];

      if (device.gatt) {
        try {
          const server = await device.gatt.connect();
          try {
            const battSvc = await server.getPrimaryService('battery_service');
            const battChar = await battSvc.getCharacteristic('battery_level');
            const val = await battChar.readValue();
            batteryLevel = val.getUint8(0);
            services.push({
              uuid: '0x180F',
              name: 'Battery Service (Live GATT)',
              primary: true,
              characteristics: [
                {
                  uuid: '0x2A19',
                  name: 'Battery Level',
                  properties: ['read', 'notify'],
                  valueHex: batteryLevel.toString(16).padStart(2, '0').toUpperCase(),
                  valueDecoded: `${batteryLevel}%`
                }
              ]
            });
          } catch {
            // Device did not expose battery_service
          }
        } catch {
          // GATT connection optional
        }
      }

      const cleanId = `WEBBT:${device.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase()}`;
      await onDeviceDiscovered({
        id: cleanId,
        address: cleanId,
        name: device.name || 'Nearby BLE Device',
        vendor: 'Web Bluetooth (Direct Browser GATT)',
        category: 'sensor',
        batteryLevel,
        connected: true,
        gattServices: services
      });

      setStatusMessage(`Connected real BLE device "${device.name || cleanId}" via Web Bluetooth.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('cancel')) {
        setStatusMessage(msg);
      }
    } finally {
      setPairing(false);
    }
  }, [nav, onDeviceDiscovered]);

  return { supported, pairing, statusMessage, clearStatus: () => setStatusMessage(null), requestRealBleDevice };
}

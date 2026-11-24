import {
  Bluetooth,
  Gamepad2,
  Headphones,
  HeartPulse,
  Keyboard,
  Mouse,
  Smartphone,
  Speaker,
  Tv,
  Watch
} from 'lucide-react';
import type { DeviceCategory } from '@polyblue/shared';

export function DeviceIcon({ category, className = 'w-5 h-5' }: { category: DeviceCategory; className?: string }) {
  switch (category) {
    case 'headphones':
    case 'earbuds':
      return <Headphones className={className} />;
    case 'speaker':
      return <Speaker className={className} />;
    case 'soundbar':
      return <Tv className={className} />;
    case 'keyboard':
      return <Keyboard className={className} />;
    case 'mouse':
      return <Mouse className={className} />;
    case 'gamepad':
      return <Gamepad2 className={className} />;
    case 'wearable':
      return <Watch className={className} />;
    case 'sensor':
      return <HeartPulse className={className} />;
    case 'phone':
      return <Smartphone className={className} />;
    default:
      return <Bluetooth className={className} />;
  }
}

export function SignalBars({ rssi }: { rssi: number }) {
  const level = rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -78 ? 2 : 1;
  const color =
    level >= 3 ? 'bg-emerald-400' : level === 2 ? 'bg-amber-400' : 'bg-rose-400';

  return (
    <div className="inline-flex items-end gap-[2px] h-3.5" title={`Signal ${rssi} dBm`}>
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          style={{ height: `${bar * 25}%` }}
          className={`w-[3px] rounded-full transition-colors ${
            bar <= level ? color : 'bg-slate-600/35 dark:bg-slate-700'
          }`}
        />
      ))}
    </div>
  );
}

# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Security Architecture Notes

- The PolyBlue daemon binds to `127.0.0.1` by default when `POLYBLUE_HOST=127.0.0.1` is configured, or `0.0.0.0` when LAN Remote mode is enabled.
- OS driver helpers execute fixed, validated device MAC addresses and numeric latency parameters; arbitrary shell expressions are never interpolated into command strings.
- Device MAC addresses are validated against strict hexadecimal formats before invoking platform utilities (`bluetoothctl`, `pactl`, `blueutil`, PowerShell).

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities. Report suspected vulnerabilities privately through GitHub Security Advisories on this repository. Include reproduction steps, affected OS/driver, and impact details. Maintainers aim to acknowledge reports within 48 hours.

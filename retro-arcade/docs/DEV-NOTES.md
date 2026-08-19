# Dev Notes — Owner Environment

## Owner's PC project path (permanent — owner directive, 2026-08-26)

All PowerShell instructions use this address:

```
C:\Users\Admin\.claude\projects\jarvis-main\retro-arcade
```

> The earlier `C:\Users\alsad\.claude\Projects` path was temporary and is retired.

### Standard update routine (Windows PC + Expo Go)

1. Close **all** PowerShell windows (kills any old dev server)
2. Delete `jarvis-main` inside `C:\Users\Admin\.claude\projects`
3. Re-download https://github.com/abdullahalsada/jarvis/archive/refs/heads/main.zip and extract there
4. In a fresh PowerShell:
   ```powershell
   cd C:\Users\Admin\.claude\projects\jarvis-main\retro-arcade
   npm install
   npx expo start --clear
   ```
5. Rescan the QR in Expo Go; verify the version in Settings' footer

### Known PC quirks & fixes

- **"running scripts is disabled" (npm.ps1)** → `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- **QR shows `exp://127.0.0.1:8081` (phone can't connect)** → find the laptop's IPv4 with `ipconfig`, then before starting:
  ```powershell
  $env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.x.x"
  ```
  Permanent fix: Windows Settings → Wi-Fi → network → profile type **Private**.
- **Speed testing** → `npx expo start --no-dev --minify` (production-mode preview; first build is slow, then cached)
- **Tunnel fallback** (Wi-Fi refuses to cooperate) → `npm install --save-dev @expo/ngrok` then `npx expo start --tunnel --clear`

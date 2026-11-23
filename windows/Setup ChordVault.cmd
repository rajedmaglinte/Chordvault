@echo off
rem One-time setup for ChordVault on this PC: secret, packages, desktop icons, start with Windows, firewall.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChordVault.ps1" setup

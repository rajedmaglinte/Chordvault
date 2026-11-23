@echo off
rem Fallback: start ChordVault without a window, even if the desktop icons are missing.
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0ChordVault.ps1" start

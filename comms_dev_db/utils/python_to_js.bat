@echo off
:: Convert file %1 to JavaScript

if "%~1"=="" (
  echo Usage: %~n0 ^<file^> [<trace_level>]
  exit /b 1
)

type %1 | python %~dpn0.py %2

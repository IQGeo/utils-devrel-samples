@echo off
:: Cut both modules
if "%~1"=="" (
   echo Usage: %~n0 ^<version^>
   exit /b 1
)

setlocal
set root=%~dp0\..\..
set version=%1
set output=\\CAM1FS01\geospatial\products\nm\comms\releases\%version%

if not exist %output% mkdir %output%

for %%m in (comms,comms_dev_db) do (
   echo ================================
   echo   Cutting %%m
   echo ================================
   echo Source: %root%\%%m
   pushd %root%\%%m

   echo Cutting ...
   call cut_module %%m %version% --output=%output%
)



@echo off
:: Save a copy of the currently published Dev DB as in DevDB/data.releases/%1

setlocal
if "%1"=="" (
   echo Usage: %~n0 ^<version^>
   exit /b 1
)
set version=%1

set source_dir=\\CAM1FS01\Geospatial\Products\nm\comms\dev_db
set output_dir=\\CAM1FS01\Geospatial\Products\nm\comms\releases\%version%

if not exist "%output_dir%" (
   echo Directory does not exist: %output_dir%
   exit /b 1
)

:: Copy latest versions into target
for %%f in (%source_dir%\comms_dev_db_*.backup) do copy %%f %output_dir%\comms_dev_db_%version%.backup


        @echo off
setlocal

set archive_dir=%MYW_COMMS_ARCHIVE_DIR%
if "%archive_dir%"=="" set archive_dir=\\CAM1FS01\geospatial\products\nm\comms\dev_db

set db=comms_dev_db
set archive=%db%_*.backup


:: Find latest archive to restore from
for %%f in (%archive_dir%\%archive%) do set archive_path=%%f

:: Check for not found
if not exist "%archive_path%" (
   echo File not found: %archive_dir%%archive%
   exit /b 1
)

:: Restore it
call myw_db %MYW_COMMS_DEV_DB% restore %archive_path%

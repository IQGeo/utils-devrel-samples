@echo off
:: Initialise database for replication and create an extract

setlocal

set db=%MYW_COMMS_DEV_DB%
set target_dir=%MYW_COMMS_NATIVE_ROOT%\databases\%db%
set sync_dir=%MYW_COMMS_NATIVE_ROOT%\sync\%db%
set sync_url=%MYW_COMMS_BASE_URL%

echo Creating extract for: %db%

echo Initialising DB ..
call myw_db %db% initialise %sync_dir% %sync_url%
call myw_db %db% load %~dpn0.settings --update

echo Removing existing data for: %db%
if exist %target_dir% rmdir /s /q %target_dir%
if exist %sync_dir% rmdir /s /q %sync_dir%
mkdir %sync_dir%

echo Extracting ..
call myw_db %db% extract %target_dir%\%db%.db full --include_deltas --zipped --overwrite

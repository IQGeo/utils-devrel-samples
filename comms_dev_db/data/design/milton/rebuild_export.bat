@echo off
:: Rebuild the export used in the automated tests

setlocal

pushd %~dp0
call comms_db %MYW_COMMS_DEV_DB% export ..\..\import\milton.zip --delta=design/milton --overwrite %*

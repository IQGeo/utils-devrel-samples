@echo off
:: Load all data without mapping IDs

setlocal
set db=%MYW_COMMS_DEV_DB%

pushd %~dp0
call myw_db %db% load design.csv

call myw_db %db% load *.csv --update_seq --delta=design/milton %*

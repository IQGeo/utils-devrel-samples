@echo off
call myw_db %COMSOF_DEV_DB% load %~dp0\..\dev_db\scalability\*.csv

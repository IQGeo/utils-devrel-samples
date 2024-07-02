@echo off

setlocal
call %~dp0\..\..\..\..\..\Tools\myw_env

call myw_db %MYW_COMMS_DEV_DB% run %~dpn0.py %*


@echo off

call myw_db %MYW_COMMS_DEV_DB% run %~dpn0.py %*

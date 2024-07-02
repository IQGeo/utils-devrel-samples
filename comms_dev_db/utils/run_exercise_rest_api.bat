@echo off

setlocal
call %~dp0\..\..\..\..\..\Tools\myw_env

call python %~dpn0.py %*

@echo off
:: Run a python command

setlocal

:: Init environment
call %~dp0\..\..\..\..\..\Tools\myw_env

:: Run command
call python %~dpn0.py %*

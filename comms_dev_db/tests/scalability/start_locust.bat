@echo off
:: Run a python command

setlocal

:: Init environment
call %~dp0\..\..\..\..\..\..\Tools\myw_env

:: Run command - locust needs to be installed using pip
call locust -f %~dp0\locust\comms_user.py
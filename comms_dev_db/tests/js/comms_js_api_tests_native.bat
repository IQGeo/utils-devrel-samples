@echo off
:: Run CLI tools test suite

setlocal

:: Init environment
call %~dp0\..\..\..\..\..\..\Tools\myw_env

:: Ensure node can find files
:: pushd %~dp0\..

:: Run command
call python %~dpn0.py %*

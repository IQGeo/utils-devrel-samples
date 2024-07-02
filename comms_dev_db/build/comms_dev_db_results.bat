@echo off

setlocal
set here=%~dp0

:: Setup environment
call %here%\..\..\..\..\..\Tools\myw_env
set path=%here%\..\..\..\..\..\Tools;%PATH%
set path=%here%\..\..\dev_tools\Tools;%PATH%

python %here%\%~n0.py %*

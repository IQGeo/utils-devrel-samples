@echo off
:: Add a message %* to both change logs
setlocal

set modules=%~dp0\..\..

for %%m in (%modules%\comms %modules%\comms_dev_db) do (
   echo.   >> %%m\doc\change_log.txt
   echo - cut: release %* >> %%m\doc\change_log.txt
)

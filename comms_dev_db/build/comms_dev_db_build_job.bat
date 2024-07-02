@echo off
:: script for running overnight build under control of Jenkins

setlocal
set here=%~dp0

:: Setup environment
call %here%\..\..\..\..\..\Tools\myw_env

:: Update source and platform
call %here%\update_src.bat      > %TMP%\update_src.log 2>&1
call %here%\update_product.bat >> %TMP%\update_src.log 2>&1

:: Build database
python %here%\comms_dev_db_builder.py %*

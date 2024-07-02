@echo off
:: script for running overnight tests under control of Jenkins

setlocal
set here=%~dp0

:: Setup environment
call %here%\..\..\..\..\..\Tools\myw_env

:: Update source and platform
call %here%\update_src.bat      > %TMP%\update_src.log 2>&1
call %here%\update_product.bat >> %TMP%\update_src.log 2>&1

:: Run tests
python %here%\comms_dev_db_test_runner.py %*

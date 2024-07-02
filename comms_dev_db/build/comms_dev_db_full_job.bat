@echo off
:: script for running overnight build under control of Jenkins

setlocal
set here=%~dp0

:: Setup environment
call %here%\..\..\..\..\..\Tools\myw_env
::call %here%\comms_dev_db_results --step=clear_output

:: Update source and platform
call %here%\update_src.bat > %TMP%\update_src.log 2>&1
call %here%\update_product.bat >> %TMP%\update_src.log 2>&1

:: Remove database locks
call restart_apache

:: Build database
python %here%\comms_dev_db_builder.py %*

:: Run all tests
python %here%\comms_dev_db_test_runner.py %*

:: Update results database
call %here%\comms_dev_db_results --step=import_results,output_summary,update_slack

@echo off
setlocal
:: Requires developer mode

:: For writable public
::call myw_product build code_package
::call myw_db %MYW_COMMS_DEV_DB% export --include_code

:: For no writable public
set src=%~dp0..\..\..
set dst=%MYW_COMMS_NATIVE_ROOT%\myworldApp\6\myWorld

:: Replace bundles dir by link
for %%d in (bundles) do (
   echo Replacing %dst%\%%d
   if exist "%dst%\%%d" rmdir /s /q "%dst%\%%d"
   mklink /d "%dst%\%%d" "%src%\core\public\%%d"
)

:: Replace modules dirs by links
for %%m in (comms,comms_dev_db,workflow,dev_tools) do (
   echo Replacing %dst%\%%m
   if exist "%dst%\modules\%%m" rmdir /s /q "%dst%\modules\%%m"
   mklink /d "%dst%\modules\%%m" "%src%\modules\%%m\public"
)


@echo off
setlocal

if "%2"=="" (
   echo Usage: %~n0 ^<db_file^> ^<build^>
   exit /b 1
)

set db_file=%1
set build=%2

set path=%~dp0\..\..\..\..\..\Tools;%PATH%

call test_results %db_file% list %build%/validation/*/* --group --columns suite,test,windows
echo.

call test_results %db_file% list %build%/tools/*/* --group --columns suite,test,windows
echo.

call test_results %db_file% list %build%/engine/*/* --group --columns suite,test,windows
echo.

call test_results %db_file% list %build%/server/*/* --group --columns suite,test,windows
echo.

call test_results %db_file% list %build%/js_api/*/* --group --columns suite,test,windows,native
echo.

call test_results %db_file% list %build%/client/*/* --group --columns suite,test,chrome_log
echo.

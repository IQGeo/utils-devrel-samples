@echo off
setlocal
set path=%~dp0\..\..\..\..\..\Tools;%PATH%

if "%~3"=="" (
   echo usage: %~n0: ^<db_file^> ^<directory^> ^<log_files^> [^<test_results_opt^>] ..
   exit /b 1
)

for /r %2 %%f in (%3) do if exist %%f (
   echo Processing %%f
   call test_results %1 import %%f %4 %5 %6 %7 %8 %9
   @echo.
)

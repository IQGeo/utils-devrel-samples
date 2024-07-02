@echo off
:: Run a test suite, logging output to %MYW_BUILD_LOG_DIR%

if "%3"=="" (
   echo Usage: %~n0:  ^<suite_name^> ^<test_name^> ^<test_cmd^> [^<test_cmd_opt^> ...]
   exit /b 1
)


setlocal
set suite_name=%1
set test_name=%2
set test_cmd=%3
set test_cmd_opts=%4 %5 %6 %7 %8 %9

:: Set location for log file
set results_dir=%MYW_BUILD_LOG_DIR%\%suite_name%
if not exist %results_dir% mkdir %results_dir%
set log_file=%results_dir%\%test_name%.log


:: Say what we are doing
echo Running %suite_name%/%test_name% >&2
echo Running %test_cmd% run %test_cmd_opts% > %log_file%
   
:: Run tests (+ show summary)
call %test_cmd% %test_cmd_opts% -l %log_file%

exit /b 0
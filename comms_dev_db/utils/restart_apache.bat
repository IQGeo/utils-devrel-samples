@echo off
:: Clear the Apache logs
::
:: Note: On windows server, must be run as administrator

echo -----------------------
echo  Restarting Apache
echo -----------------------

setlocal
if "%ProgramFiles(x86)%"=="" set ProgramFiles(x86)=%ProgramFiles%

if "%1"=="--force" (
   set install=
   set force=%1
) else (
   set install=%1
   set force=%2
)

:: Get defaults from environment
if "%APACHE_ROOT%"=="" set APACHE_ROOT=c:\program_files
if "%install%"=="" set install=%APACHE_INSTALL%

:: Get location of log files etc
if "%install%"=="" (
   set apache_product="%APACHE_ROOT%\apache24"
   set apache_service=Apache2.4
) else (
   set apache_product="%APACHE_ROOT%\apache_%install%"
   set apache_service=Apache2.4_%install%
)

:: Stop server
echo Stopping %apache_service%
net stop %apache_service% 2> nul:
if "%force%"=="--force" (
    taskkill /f /im httpd.exe 2>nul
)

:: Kill any hanging Selenium sessions (workaround for recent Selenium bug)
for %%p in (IEDriverServer Chromedriver firefox) do (
   taskkill /f /im %%p.exe 2>nul
)

echo Resetting logs in %apache_product%
del %apache_product%\logs\error.log
del %apache_product%\logs\access.log

:: Restart server
echo Running command: net start %apache_service%
net start %apache_service%

::pause
echo.

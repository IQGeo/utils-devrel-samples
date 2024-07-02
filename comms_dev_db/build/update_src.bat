@echo off
:: Update the local copy of the source and platform
::
:: Note: Requires HOME or GIT_SSH to be set (for finding ssh keys)
::
:: This file should be kept as small as possible since it can change itself!

setlocal

echo.

echo -----------------
echo  Updating Source
echo -----------------
echo.
call %~dp0\..\utils\comms_git pull --rebase
echo.

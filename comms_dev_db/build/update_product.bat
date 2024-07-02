@echo off
:: Update the local copy of the platform product

setlocal

echo ------------------
echo  Updating Product
echo ------------------
echo  Installing Patches
call myw_product install %~dp0\..\patches\core\ --rebuild --verbosity 0
echo.

echo Fetching node modules
call myw_product fetch node_modules
echo.

echo Rebuilding Bundles
call myw_product build applications_dev --debug
call myw_product build config --debug
call myw_product build native --debug
echo.

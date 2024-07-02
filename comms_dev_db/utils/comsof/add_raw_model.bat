@echo off
:: Add tables and layers for storing comsof raw data

setlocal
set raw_dir=%~dp0\..\config\raw_data

call myw_db %COMSOF_DEV_DB% load %raw_dir%\*.def --update
call myw_db %COMSOF_DEV_DB% load %raw_dir%\*.layer --update
call myw_db %COMSOF_DEV_DB% load %raw_dir%\*.layer_group --update

call myw_db %COMSOF_DEV_DB% add application_layer mywcom out*


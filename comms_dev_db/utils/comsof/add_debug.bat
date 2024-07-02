@echo off
call myw_db %COMSOF_DEV_DB% load %~dp0\..\config\ws_connectivity\*.layer --update
call myw_db %COMSOF_DEV_DB% load %~dp0\..\config\ws_connectivity\*.layer_group --update
call myw_db %COMSOF_DEV_DB% add application_layer mywcom comsof_out*


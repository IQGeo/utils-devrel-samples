
@echo off

setlocal
call %~dp0\..\..\..\..\..\..\Tools\myw_env

set MYW_COMMS_SCALE_DB=iqg_comms_scale

call myw_db %MYW_COMMS_SCALE_DB% run comms_scale_db_builder.py --commit
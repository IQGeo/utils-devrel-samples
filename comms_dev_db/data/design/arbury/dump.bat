@echo off
:: Re-save the design

setlocal
call myw_db %MYW_COMMS_DEV_DB% dump . data * --delta=design/Arbury

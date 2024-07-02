@echo off
setlocal
python %~dpn0.py %MYW_COMMS_DEV_DB% \\CAM1FS01\geospatial\products\nm\comms\dev_db comms_dev_db

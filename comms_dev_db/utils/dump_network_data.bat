@echo off
:: Update the raw network data files
::
:: WARNING: Take care not to lose conflict data

setlocal

if "%~1"=="" (
  echo Usage: %~n0 ^<database^>
  exit /b 1
)


set db=%1
set data_dir=%~dp0\..\data\network

call myw_db %db% dump %data_dir% data building --format=csv --fields id name location 
call myw_db %db% dump %data_dir% data pole     --format=csv --fields id location type height 
call myw_db %db% dump %data_dir% data manhole  --format=csv --fields id location myw_orientation_location
call myw_db %db% dump %data_dir% data cabinet  --format=csv --fields id location myw_orientation_location

call myw_db %db% dump %data_dir% data splice_closure     --format=csv --fields id location 
call myw_db %db% dump %data_dir% data fiber_patch_panel  --format=csv --fields id n_fiber_out_ports location 
call myw_db %db% dump %data_dir% data fiber_splitter     --format=csv --fields id n_fiber_out_ports location 
call myw_db %db% dump %data_dir% data fiber_mux          --format=csv --fields id n_fiber_in_ports location 

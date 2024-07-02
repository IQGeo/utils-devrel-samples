:: Run all the comms tests with args %*
@echo off
setlocal

set suites=comms_validation_tests comms_tools_tests comms_engine_tests comms_server_tests comms_js_api_tests comms_js_api_tests_native comms_client_tests

for %%s in (%suites%) do (
    echo.
    for /f "usebackq delims==" %%l in (`%%s %*`) do echo %%s: %%l
)

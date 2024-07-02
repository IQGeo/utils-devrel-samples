#! /bin/bash

# Make python controller logging verbose
if ! grep -q "myw.mywcom.options" /opt/iqgeo/platform/WebApps/myworldapp.ini; then
    sed -i -e '$a\\nmyw.mywcom.options = {"log_level": 10}' /opt/iqgeo/platform/WebApps/myworldapp.ini
fi

# Add comsof login data
if ! grep -q "comsof.cloud.login" /opt/iqgeo/platform/WebApps/myworldapp.ini; then
    sed -i -e '/# Configure logging/i\comsof.cloud.login = {"username": "appsdev@iqgeo.com", "password": "^usegF4zbyPCqu3!#k%%p"}' /opt/iqgeo/platform/WebApps/myworldapp.ini
fi

if ! grep -q "comsof.licence.login" /opt/iqgeo/platform/WebApps/myworldapp.ini; then
    sed -i -e '/# Configure logging/i\comsof.licence.login = {"username": "appsdev@iqgeo.com", "password": "LjayX4gVS!KJH$"}' /opt/iqgeo/platform/WebApps/myworldapp.ini
fi
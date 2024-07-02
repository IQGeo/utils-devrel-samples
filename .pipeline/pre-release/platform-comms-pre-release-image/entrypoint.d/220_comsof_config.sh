#! /bin/bash -e

# INI file Config

# Configure Comsof Cloud access
if [[ $COMSOF_CLOUD_USERNAME && $COMSOF_CLOUD_PASSWORD ]]; then
    if ! grep -q "comsof.cloud.login" /opt/iqgeo/platform/WebApps/myworldapp.ini; then
        # add myw.dev.options section (required for restoring db in tests)
        sed -i '/# Configure logging/ i comsof.cloud.login = \{ "username": "'$COMSOF_CLOUD_USERNAME'", "password": "'$COMSOF_CLOUD_PASSWORD'"}\n\n' /opt/iqgeo/platform/WebApps/myworldapp.ini
    fi
fi

# Configure Comsof Licence access
if [[ $COMSOF_LICENCE_USERNAME && $COMSOF_LICENCE_PASSWORD ]]; then
    if ! grep -q "comsof.licence.login" /opt/iqgeo/platform/WebApps/myworldapp.ini; then
        # add myw.dev.options section (required for restoring db in tests)
        sed -i '/# Configure logging/ i comsof.licence.login = \{ "username": "'$COMSOF_LICENCE_USERNAME'", "password": "'$COMSOF_LICENCE_PASSWORD'"}\n\n' /opt/iqgeo/platform/WebApps/myworldapp.ini
    fi
fi
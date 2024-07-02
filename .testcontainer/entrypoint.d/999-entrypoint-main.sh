#!/bin/bash
echo 'running 999-entrypoint-main.sh'
TEST_USER="iqgeo:iqgeo"

rm -Rf /opt/iqgeo/platform/WebApps/data/*
clear_data_status=$?

if [ $clear_data_status -eq 1 ]; then
    echo "Couldn't not ensure old data expunged. Please manually remove volume."
    exit 1
fi

# # Prefs file for the native js tests:
# mkdir -p ~/IQGeo/myWorld/
# echo '{"database_name":"myw_dev","application_name":"","username":"mobile","ids_per_shard":500}' > ~/IQGeo/myWorld/preferences.json
# chown -R devtest:devtest ~/IQGeo/


# # inject EXTERNAL_IP, KEYCLOAK_PORT and MYW_EXT_BASE_URL into keycloak configuration
# sed -i -e "s=___EXTERNAL_IP___=${EXTERNAL_IP}=g; s=___KEYCLOAK_PORT___=${KEYCLOAK_PORT}=g; s=___MYW_EXT_BASE_URL___=${MYW_EXT_BASE_URL}=g" /opt/iqgeo/data/oidc/conf.json
# sed -i -e "s=___EXTERNAL_IP___=${EXTERNAL_IP}=g s=___KEYCLOAK_PORT___=${KEYCLOAK_PORT}=g; s=___MYW_EXT_BASE_URL___=${MYW_EXT_BASE_URL}=g" /opt/iqgeo/data/saml/settings.json

# TODO fix this with /proc/self/fd
# Set off tail background processes (as root) to echo them to stderr
tail -n 0 -f $errlogfile 1>&2 &

/usr/sbin/apache2ctl -D FOREGROUND &

echo "starting /opt/iqgeo/platform/WebApps/myworldapp/modules/.pipeline/ci_testcontainer_entry_point"
/opt/iqgeo/platform/WebApps/myworldapp/modules/.pipeline/ci_testcontainer_entry_point

# kill apache unless KEEP_RUNNING is set to true
if [ "x$KEEP_RUNNING" != "xtrue" ]; then
    echo "killing apache"
    APACHE_PID=`cat /run/apache2/apache2.pid`
    kill $APACHE_PID
else
    echo "running in a loop..."
    while true; do
        sleep 5
    done
fi

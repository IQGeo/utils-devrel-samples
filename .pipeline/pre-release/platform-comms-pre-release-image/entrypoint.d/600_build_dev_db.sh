#!/bin/bash

# Build DB
sleep 15
${IQG_COMMS_DEV_DB_DIR}/utils/comms_build_dev_db --database ${MYW_DB_NAME} --skip run_tests


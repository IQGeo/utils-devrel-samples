#! /bin/bash

# Build the client js packages
myw_product fetch node_modules
myw_product build all --debug
myw_product build applications_dev --debug

# build failure shouldn't halt container
true

# Docker configuration for IQGeo Platform test environment

Setup:

If you want to run the container at the same time as the .devcontainer, you'll need to make sure it
has the right `.env` which uses different ports etc. Try:

    cp .env.example .env

Customising the test run:

We configure the test run via environment variables. The defaults for the various values can be
found in the table below (double check in docker-compose.yml if something is fishy), but you can
override any of them by modifying the `.env` file in this folder before running the container.

| Variable            | Description                                                                                                                                                                                                             | Default                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `UID`               | UID for devtest. Allows us to sync with host user (useful on Linux)                                                                                                                                                     | `1000`                       |
| `GID`               | GID for devtest. Allows us to sync with host group (useful on Linux)                                                                                                                                                    | `1000`                       |
| `MYW_BUILD_LOGS`    | Build log location, so you can read the test log after the run finishes.                                                                                                                                                | `./log/tests`                |
| `RESTORE_DB`        | Whether to restore the dev db from a backup, or build it. Can speed up the test run a lot if you restore.                                                                                                               | `false`                      |
| `TEST_RUN_STEPS`    | comma separated list of suites (e.g. `engine_tests`, `native_js_tests` etc). Empty = all.                                                                                                                               | (empty)                      |
| `KEEP_RUNNING`      | if `true`, will keep running the container in a loop after the tests complete.                                                                                                                                          | `false`                      |
| `SELENIUM_IMAGE`    | docker image for selenium (e.g. to override arch)                                                                                                                                                                       | `selenium/standalone-chrome` |
| ---                 | **Git Behaviour**                                                                                                                                                                                                       | ---                          |
| `CREATE_GIT_BRANCH` | Whether to create a branch named like ci_test_results/[current_branch]/2023-07-24_2200, with any modified results files commited.                                                                                       | `false`                      |
| `PUSH_TO_GITHUB`    | Whether to push the new branch to origin (github), and then switch back to the starting branch. Has no effect if CREATE_GIT_BRANCH is not true.                                                                         | `false`                      |
| `TIDY_OLD_BRANCHES` | Whether to delete old server branches (> 1 week) of the form origin/ci*test_results/[current_branch]/2023-07-24_2200. Note, it \_always* pushes the branch deletions - there is no local version of this functionality. | `false`                      |

For user ID config, the easiest way to find the IDs you want is to run `id $USER`, which will show
you the uid and gid of the current user (along with the group ids of all other groups they're a
member of.)

Note: the git options do work in the .env file, but you must run the top level script
`../.pipelines/ci_host_entry_point`. If you just run the container with docker compose it won't
do any of the git stuff, it will just leave the changes in the local folder.

Running:

Running the container will start a full test run, but will skip any git operations. Running locally
this is sometimes fine:

    docker-compose down
    docker-compose up --build --abort-on-container-exit --exit-code-from=comms-test

Note: on some machines, depending on the version of docker, you may need `docker compose` with a
space instead of a hyphen. On newer versions, you can pass `--attach=platform-test` to only see
logs from the main test runner on the console. On older versions, you need to
`| grep platformtest` instead, which isn't quite as clean.

"""
After doing 'source <TOOLSDIR>/myw_env'. You can run this either:
- python comms_user.py. To start single user and their tasks
- locust -f comms_user.py. To get full Locust experience

"""

# Command line utility for managing myWorld databases
import site, os, sys, codecs

# Add the product root dir to the module search path
product_root_dir = os.getenv("MYW_PRODUCT_ROOT_DIR")
if product_root_dir:
    site.addsitedir(product_root_dir)

# Add myWorld modules to module search path and ensure they have priority over default python paths
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)


from locust import HttpUser, between, run_single_user, events
import logging, csv, sys, random, os

import event_handlers

from myworldapp.modules.comms_dev_db.tests.scalability.locust.comms_user_tasks import (
    CommsQueryTasks,
    CommsRouteCircuitTasks,
    CommsCustomerDropTasks,
    run_single_user,
    CommsBreakTask,
)
from myworldapp.modules.comms_dev_db.tests.scalability.locust.utils import responseSummary
from myworldapp.modules.comms_dev_db.tests.scalability.locust.comms_anywhere_user_tasks import (
    CommsAnywhereTaskSet,
)


class CommsUser(HttpUser):
    host = "http://localhost"
    wait_time = between(10, 15)  # <== wait time between user tasks (seconds)

    def open_outfile():
        if "IQGEO_CSV_FILE" in os.environ:
            return open(os.environ["IQGEO_CSV_FILE"], "a")

    # Sorry
    outfile = open_outfile()

    @classmethod
    def close_file(self):
        if self.outfile:
            self.outfile.close()

    def context(self):
        return {
            "tag": os.environ["IQGEO_TEST_TAG"] if "IQGEO_TEST_TAG" in os.environ else "",
            "outfile": self.outfile,
        }

    users = list(range(1000))
    users.reverse()

    def get_next_user_credentials(self):
        if not self.users:
            self.users = range(1000)
        user_num = self.users.pop()
        username = "locust_{:03d}".format(user_num)
        return (username, "_mywWorld_")

    def on_start(self):
        self.csrf_token = ""

        (self.username, self.password) = self.get_next_user_credentials()

        res = self.client.post("/auth", {"user": self.username, "pass": self.password})

        logging.info(responseSummary("Login Request", res))
        logging.info("ℹ️  USER:" + self.username)
        if res.status_code in range(200, 300):
            self.csrf_token = res.cookies.get("csrf_token")
            logging.info("ℹ️  🔒 CSRF_TOKEN: " + res.cookies.get("csrf_token"))


class CommsConnectedUser(CommsUser):
    tasks = {
        CommsQueryTasks: 12,
        CommsRouteCircuitTasks: 1,
        CommsCustomerDropTasks: 1,
        CommsBreakTask: 2,
    }


class CommsAnywhereUser(CommsUser):
    tasks = {CommsAnywhereTaskSet: 1}


@events.quit.add_listener
def comms_quit_handler(**kwargs):
    print("** Closing file")
    CommsUser.close_file()


if __name__ == "__main__":
    run_single_user(CommsUser)

"""
Install Locust in Terminal:
pip3 install locust

Run Locust in terminal:
locust -f comms_anywhere_user.py --headless -u <number_of_users> -r <hatch_rate>

To run Redis locally, execute
redis-sever.exe
then
redis-cli.exe
in order
"""

from locust import HttpUser, between
from anywhere_user_tasks import CommsAnywhereTaskSet
from wallbox_data import data


class CommsAnywhereUser(HttpUser):
    host = "https://engineering-1.sandbox.iqgeo.cloud"

    wait_time = between(3, 5)
    tasks = [CommsAnywhereTaskSet]

    def on_start(self):
        self.replica_id = ""
        self.wallbox_data_array = data.data_array

        with self.client.post(
            "/auth", name="/auth", data={"user": "admin", "pass": "_mywWorld_"}, catch_response=True
        ) as response:
            if response.status_code == 200:
                self.csrf_token = response.cookies["csrf_token"]
                self.myworldapp = response.cookies["myworldapp"]
                response.success()
            else:
                response.failure("Failed to access latest")

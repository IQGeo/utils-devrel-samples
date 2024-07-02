"""
Comments '#' are used to group together the http requests executed for each task
that's listed in NMC-1427
"""
from locust import SequentialTaskSet, TaskSet, task, between

# import wallbox_data_change
from job_queue import JobQueue
import re, tempfile, shutil, os


class CommsAnywhereTaskSet(SequentialTaskSet):
    """
    Mimic anywhere user doing:
       - Query extract
       - Register extract (we skip downloading)
    """

    wait_time = between(30, 40)

    def __init__(self, parent):
        super().__init__(parent)
        self.csrf_token = self._parent.csrf_token
        self.headers = {"X-CSRF-Token": self.csrf_token}
        self.redis_data = JobQueue("redis")
        self.download_extracts = []

    # Queries for available Extracts
    @task()
    def query_available_extracts(self):

        suffix = "/extracts/list"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure("Failed to view available extracts")

    @task()
    def get_birmingham_metadata(self):
        suffix = "/extracts/FEXBHM01/metadata"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure("Failed to query latest extract")

    # Download available extract
    # @task() skip this for now - should really download from CDN or similar
    def download_birmingham_1(self):
        suffix = "/extracts/FEXBHM01/file/code.zip"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure("Failed do download latest")

    # @task()
    def download_birmingham_2(self):
        suffix = "/extracts/FEXBHM01/file/FEXBHM01.db.zip"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()

            else:
                response.failure("Failed do download latest")

    @task()
    def query_username(self):
        suffix = "/system/username"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()

            else:
                response.failure("Failed to query username")

    #  Sets extracts to writable
    @task()
    def make_writable(self):
        suffix = "/sync/register/FEXBHM01"

        data = {"n_ids": 500, "location": "User PC", "owner": "admin"}

        with self.client.post(
            suffix, data=data, headers=self.headers, name=suffix, catch_response=True
        ) as response:
            if response.status_code == 200:
                replica_id = re.findall("replica\d+", response.text)[0]
                self._parent.replica_id = replica_id
                response.success()
            else:
                response.failure("Failed to set Make Writable")

    @task()
    def set_extract(self):
        suffix = "/sync/master/FEXBHM01/index.json?since=0"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure("Failed to set extract")

    @task()
    def upload_data(self):
        """
        Creates update package and sends to server
        """

        wallbox_data = self.redis_data.pop()
        if not wallbox_data:
            return

        # wallbox_data = { 'delta_name' : "design/CD_001",
        #                 'id' : 24415,
        #                 'location' : "0101000020E6100000855A375B056EFEBF377633FC1B414A40"
        #                 }

        print("UPLOADING ", wallbox_data)

        # FIXME - make more portable
        in_dir = "./locust/sync_data"

        suffix = f"/sync/{self._parent.replica_id}/1.zip"
        headers = {"Content-Type": "application/zip", "X-CSRF-Token": self.csrf_token}

        with tempfile.TemporaryDirectory() as out_dir:

            shutil.copytree(in_dir, os.path.join(out_dir, "1"))
            zip_filename = os.path.join(out_dir, "1.zip")

            # TODO - Modify CSV
            new_date = "2022-01-30"

            out_file_path = os.path.join(out_dir, "1", "deltas", "wall_box.delta")
            in_file_path = "./locust/sync_data/deltas/wall_box.delta"
            with open(in_file_path, "r") as in_file:
                with open(out_file_path, "w") as out_file:
                    l1 = in_file.readline()
                    out_file.write(l1)

                    l2 = f"{wallbox_data['id']},,,,,{new_date},{wallbox_data['location']},{wallbox_data['delta_name']},update,{new_date}"
                    out_file.write(l2)

            shutil.make_archive(os.path.join(out_dir, "1"), "zip", os.path.join(out_dir, "1"))

            with open(zip_filename, "rb") as file:
                zip_data = file.read()

                with self.client.post(
                    suffix, data=zip_data, headers=headers, name=suffix, catch_response=True
                ) as response:
                    if response.status_code == 200:
                        response.success()
                    else:
                        response.failure("Failed to upload data")

    # Downloads data
    @task()
    def sync_downloads(self):

        suffix = "/sync/master/full/index.json?since=1&application=mywcom HTTP/1.1"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                response.success()

            else:
                response.failure("Failed to select sync downloads")

    @task()
    def get_recent_extract_list(self):
        suffix = "/sync/master/FEXBHM01/index.json?since=2"

        with self.client.get(suffix, name=suffix, catch_response=True) as response:
            if response.status_code == 200:
                self.download_extracts = sorted(re.findall("\d+.zip", response.text))
                response.success()
            else:
                response.failure("Failed to select download recent extract")

    @task()
    def get_recent_extract(self):
        for extract in self.download_extracts:
            suffix = f"/sync/master/FEXBHM01/{extract}"

            with self.client.get(
                suffix, name="/sync/master/FEXBHM01/<extract_number.zip>", catch_response=True
            ) as response:
                if response.status_code == 200:
                    response.success()
                else:
                    response.failure("Failed to select download recent extract")

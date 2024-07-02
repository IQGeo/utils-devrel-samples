import time


def test_worker(db, progress, args):

    for i in range(10):
        time.sleep(1)

        progress(0, f"Worker working {i}")

    return {"data": "Worker done"}

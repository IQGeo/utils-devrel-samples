import json, subprocess, os, time, threading, sys
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.system.myw_product import MywProduct
import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class TaskCancelException(MywError):
    pass


class Task:
    """ """

    WAITING = "WAITING"
    SUCCESS = "SUCCESS"
    ERROR = "ERROR"
    WORKING = "WORKING"
    CANCEL = "CANCEL"

    TABLE_NAME = "iqgapp_task_queue"

    # Seconds between polls.
    poll_delay = 5

    def __init__(self, log_level=0, task_id=None):
        self.task_id = task_id
        self.db = myw_globals.db
        self.db_view = myw_globals.db.view()

    def status(self):
        """
        Obtain status information about task or results if it has completed
        """

        # Get task from queue
        task_rec = self.getTaskRecord(self.task_id)

        # Get status and result if there is one
        result = json.loads(task_rec.result) if task_rec.result else None
        if task_rec.status == Task.SUCCESS:
            return {"status": task_rec.status, "data": result}
        elif task_rec.status == Task.ERROR:
            return {
                "status": task_rec.status,
                "error_msg": task_rec.error_msg,
                "data": task_rec.exc_info,
            }
        else:
            return {"status": task_rec.status, "data": result, "log": task_rec.log}

    def log(self):
        """
        Get log lines for task
        """
        task_rec = self.getTaskRecord(self.task_id)
        return task_rec.log

    def interrupt(self):
        """
        Cancel task. Set cancel flag and next time the worker outputs progress, it will be stopped.
        """

        task_rec = self.getTaskRecord(self.task_id)
        task_rec.status = Task.CANCEL
        self.update(task_rec)

    def spawn(self, worker_function_name, args):
        """
        Add task to queue and start worker process
        """

        # Add task record to queue
        task_rec = self.db_view.table(self.TABLE_NAME).insertWith(
            status="WAITING", func_name=worker_function_name, args=json.dumps(args)
        )
        Session.commit()

        # Run task in background
        # We run a process rather than forking a thread to avoid issues with shared data
        # and to ensure the apache instance is ready for another request.
        # In future, the worker will be managed by a queue.
        cmd = "comms_db.bat" if sys.platform == "win32" else "comms_db"
        comms_db = MywProduct().moduleOf(__file__).file(os.path.join("tools", cmd))

        process = subprocess.Popen(
            [comms_db, self.db.name(), "manage_tasks", "run", str(task_rec.id)]
        )

        self.startPollThread(process)

        self.task_id = task_rec.id

    def getTaskRecord(self, task_id):
        return self.db_view.get(f"iqgapp_task_queue/{task_id}")

    def update(self, rec):
        rec = self.db_view.table(rec.feature_type).update(rec)
        Session.commit()
        return rec

    def startPollThread(self, process):
        """
        To avoid build up <defunct> (aka zombie) processes on Linux, we need to be waiting
        for the worker process to complete. This is the only reason we have this thread,
        other interaction with the worker is done via the task queue.
        """

        if sys.platform == "win32":
            return

        def thread_function():
            process.wait()
            return
            while True:

                process.poll()
                if process.returncode != None:
                    return
                time.sleep(self.poll_delay)

        thread = threading.Thread(target=thread_function)
        thread.start()

import json, geojson, traceback, importlib


from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms.server.task_manager.task_progress_handler import TaskProgressHandler

from .task import Task, TaskCancelException


class TaskWorker:
    """
    Wrapper for invoking worker function for a task.
    """

    def __init__(self, db, task_id, progress=MywSimpleProgressHandler(0, "TASK WORKER: ")):
        self.db = db
        self.db_view = db.view()
        self.task_id = task_id
        self.progress = progress

    def run(self):
        """
        Start work on task
        """

        self.progress(1, f"Running task {self.task_id}")

        # Get job from queue
        task = self.db_view.get(f"{Task.TABLE_NAME}/{self.task_id}")

        if not task:
            self.progress(1, "Task not found with id ", self.task_id)
            return

        # Check if it is a waiting task
        if task.status != Task.WAITING:
            self.progress(1, "Wrong status", task.status)
            return

        # Import task function
        func = self.import_function(task.func_name)
        args = [] if not task.args else json.loads(task.args)

        # Run task
        task.status = Task.WORKING
        self.update(task)

        self.progress(1, "Starting function for task", self.task_id)
        progress = TaskProgressHandler(2, task_id=task.id, db=self.db)

        try:
            result = func(self.db, progress, *args)
        except TaskCancelException:
            return
        except MywError as err:
            self.update_task_with_error(task, err.msg, traceback.format_exc())
            return
        except Exception as err:
            self.update_task_with_error(task, "exception", traceback.format_exc())

            return

        # Function complete, update status and results
        self.progress(1, "Function complete for task", self.task_id)
        task.status = Task.SUCCESS
        task.result = geojson.dumps(result)
        self.update(task)

    def update_task_with_error(self, task, msg, traceback_str):
        task.status = Task.ERROR
        task.error_msg = msg
        task.exc_info = traceback_str
        self.update(task)

    def import_function(self, worker_function_name):
        """
        Import worker function
        """

        parts = worker_function_name.split(".")
        module = importlib.import_module(".".join(parts[:-1]))
        func = getattr(module, parts[-1])
        return func

    def update(self, rec):
        """
        Update task record and commit change
        """

        rec = self.db_view.table(rec.feature_type).update(rec)
        Session.commit()

    def all_tasks(self):
        """
        List tasks in queue
        """

        table = self.db_view.table(Task.TABLE_NAME)
        return table.orderBy("id")

    def cancel(self):
        """
        Cancel task
        """

        task = self.db_view.get(f"{Task.TABLE_NAME}/{self.task_id}")

        if not task:
            self.progress(1, "Task not found with id ", self.task_id)
            return

        task.status = Task.CANCEL
        self.update(task)

    def delete_tasks(self):
        """
        Deletes non-active tasks
        """

        cnt = 0
        table = self.db_view.table(Task.TABLE_NAME)
        for rec in table:
            if rec.status not in [Task.WAITING, Task.WORKING]:
                table.delete(rec)
                cnt += 1
        Session.commit()
        return cnt

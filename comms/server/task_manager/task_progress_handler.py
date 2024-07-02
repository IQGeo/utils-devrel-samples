import json, geojson
from myworldapp.core.server.base.db.globals import Session
from myworldapp.modules.comms.server.task_manager.task import Task, TaskCancelException
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler


class TaskProgressHandler(MywSimpleProgressHandler):
    """
    Progress class to update log information for a task in the task queue. Will also detect if
    task has been cancelled.
    """

    def __init__(self, level, prefix="", task_id=None, db=None):

        super().__init__(level, prefix=prefix)
        self.db_view = db.view("")
        self.task_id = task_id

    def add_result(self, result):
        """
        Add intermediate result to result property of task so that these can be shown to user
        """

        task_rec = self.db_view.get(f"{Task.TABLE_NAME}/{self.task_id}")
        task_rec.result = geojson.dumps(result)
        self.db_view.table(task_rec.feature_type).update(task_rec)
        Session.commit()

    def write(self, *items):
        """
        Write progress information to task in the queue
        """

        task_rec = self.db_view.get(f"{Task.TABLE_NAME}/{self.task_id}")

        log = task_rec.log if task_rec.log else ""
        if task_rec.status == Task.CANCEL:
            msg = "TASK CANCELLED"
        else:
            msg = ""
            for item in items:
                msg += str(item)

        task_rec.log = log + msg
        self.db_view.table(task_rec.feature_type).update(task_rec)

        Session.commit()

        if task_rec.status == Task.CANCEL:
            raise TaskCancelException

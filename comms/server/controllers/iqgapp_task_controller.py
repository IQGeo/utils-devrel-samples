###############################################################################
# Task Controller
###############################################################################
# Copyright: IQGeo Limited 2010-2023


import json, time, random
from pyramid.view import view_config
from pyramid.response import Response
from myworldapp.modules.comms.server.task_manager.task import Task
from .mywcom_controller import MywcomController


class IqgappTaskController(MywcomController):
    def __init__(self, request):
        """
        Initialize slots of self
        Subclassed from MywcomController as it has better get_param
        """

        super().__init__(request, "TASK")

    @view_config(route_name="iqgapp_task_controller.status", renderer="json", request_method="GET")
    def status(self):
        """
        Returns status of a task
        """

        self.current_user.assertAuthorized(self.request)

        task_id = self.get_param(self.request, "task_id", type=str, mandatory=True)
        task = Task(task_id=task_id)

        return task.status()

    @view_config(route_name="iqgapp_task_controller.status_event", request_method="GET")
    def status_event(self):
        """
        Returns status updates of a task as an event stream.
        Event stream format is described here:
        https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
        """

        def generate_events(stream_id):
            """
            Iterator that yields status information for event stream
            """

            while True:
                task_id = self.get_param(self.request, "task_id", type=str, mandatory=True)
                task = Task(task_id=task_id)
                task_status = task.status()

                result = f"data: {json.dumps(task_status)}\n\n"

                yield bytes(result, encoding="utf-8")

                if task_status["status"] in [Task.SUCCESS, Task.ERROR, Task.CANCEL]:
                    break

                # ENH: sleep duration configurable or as part of request args?
                time.sleep(1)

        self.current_user.assertAuthorized(self.request)

        stream_id = random.random()

        response = Response()
        response.content_type = "text/event-stream"
        # ENH: Do we need these?
        # response.cache_control = "no-cache"
        # response.connection = "keep-alive"
        response.app_iter = generate_events(stream_id)
        return response

    @view_config(route_name="iqgapp_task_controller.log", renderer="json", request_method="GET")
    def log(self):
        """
        Returns status and log of a task
        """

        self.current_user.assertAuthorized(self.request)

        task_id = self.get_param(self.request, "task_id", type=str, mandatory=True)
        task = Task(task_id=task_id)

        status = task.status()
        status["log"] = task.log()
        return status

    @view_config(
        route_name="iqgapp_task_controller.interrupt", renderer="json", request_method="POST"
    )
    def interrupt(self):
        """
        Set interrupt flag on task
        """

        self.current_user.assertAuthorized(self.request)

        task_id = self.get_param(self.request, "task_id", type=str, mandatory=True)
        task = Task(task_id=task_id)

        # Writes flag to communication 'stream' .. to be read on next call of engine.progress()
        task.interrupt()

        return task.status()

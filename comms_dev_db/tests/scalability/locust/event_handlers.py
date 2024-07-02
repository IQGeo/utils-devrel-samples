"""
Custom event handlers
"""

import json
import datetime
import pytz
import socket
from locust import HttpLocust, TaskSet, task, between, events


@events.request.add_listener
def comms_request_handler(
    request_type,
    name,
    response_time,
    response_length,
    response,
    context,
    exception,
    start_time,
    url,
    **kwargs,
):

    if not exception:
        hostname = ""
        SUCCESS_TEMPLATE = (
            '[{"measurement": "%s","tags": {"hostname":"%s","requestName": "%s","requestType": "%s","status":"%s"'
            '},"time":"%s","fields": {"responseTime": "%s","responseLength":"%s"}'
            "}]"
        )
        json_string = SUCCESS_TEMPLATE % (
            "ResponseTable",
            hostname,
            name,
            request_type,
            "success",
            datetime.datetime.now(tz=pytz.UTC),
            response_time,
            response_length,
        )
        tag = context["tag"] if context and "tag" in context else ""
        outfile = context["outfile"]
        if outfile:
            outfile.write(
                f'{tag},{datetime.datetime.now(tz=pytz.UTC)},{request_type},"{name}",{response_time},{response_length}\n'
            )

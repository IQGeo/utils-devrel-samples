###############################################################################
# Wrappers to allow updating params on a Pyramid request
###############################################################################
# Copyright: IQGeo Limited 2010-2024

def wrapRequest(request, params, updates):
    newParams = ParamsDictWrapper(params, updates)
    newRequest = RequestWrapper(
        request, {"params": newParams}
    )
    return newRequest

class ParamsDictWrapper(dict):
    def __init__(self, params, updates=None):
        super().__init__(**params)
        if updates is not None:
            self.update(updates)

class RequestWrapper:
    def __init__(self, request, updates=None):
        self._request = request
        self._updates = updates or {}

    def __getattr__(self, name):
        if name in self._updates:
            return self._updates[name]
        return getattr(self._request, name)
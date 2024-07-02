# Copyright:Ubisense Limited 2010-2023

import json
from jsonschema import validate,validators,Draft7Validator
from jsonschema.exceptions import ValidationError

# See https://python-jsonschema.readthedocs.io/en/latest/referencing/



from pathlib import Path
import json

from referencing import Registry, Resource
from referencing.exceptions import NoSuchResource
import urllib.request



class CommsSchemaValidator:
    """
    Class that provides facilities for validating data returned from an API against a schema
    """

    def __init__(self):
        
        schema_dir = "/opt/iqgeo/platform/WebApps/myworldapp/modules/comms/api/schema"
        SCHEMAS = Path(schema_dir)

        def retrieve_from_filesystem(uri: str):
            schema_base_url = "http://localhost/modules/comms/api/schema/"
            if not uri.startswith(schema_base_url):
                with urllib.request.urlopen(uri) as response:
                    txt = response.read()
                    return Resource.from_contents(json.loads(txt))              
            path = SCHEMAS / Path(uri.removeprefix(schema_base_url))
            contents = json.loads(path.read_text())
            return Resource.from_contents(contents)

        self.registry = Registry(retrieve=retrieve_from_filesystem)
        

    def validate(self,schema_name,data):
        """
        Valdates DATA against SCHEMA_NAME
        """

        # Dummy schema to pull in schema from file system
        schema = {
            "$id": "https://example.com/test.schema.json",
            "$schema": "'http://json-schema.org/draft-07/schema#",
            "type": "object",
            "$ref" : f"http://localhost/modules/comms/api/schema/{schema_name}.schema.json#/definitions/{schema_name}" 
        }

        try:
            validate( data,schema=schema,registry=self.registry)
            return None
        except ValidationError as exc:
            return exc.message

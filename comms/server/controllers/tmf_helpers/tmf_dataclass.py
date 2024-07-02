###############################################################################
# Dataclass that allows simple typing of TMF schema 
###############################################################################
# Copyright: IQGeo Limited 2010-2024

from dataclasses import dataclass, make_dataclass, fields, field
from typing import Literal, get_origin, get_args, Any

@dataclass
class TmfData():

    @staticmethod
    # maps feature property values to tmf names
    def createKwargs(name_map, feature_props):
        kwargs = {}
        for dc_name, feature_name in name_map.items():
            if feature_name in feature_props and feature_props[feature_name] is not None:
                kwargs[dc_name] = feature_props[feature_name]
        return kwargs

    # create class from properties dictionary with simple type checking
    @staticmethod
    def createDC(className, properties):
        # turn schema into a typed dictionary
        fields = []
        for key,value in properties.items():
            fld_type = Any
            default = field(default='')
            if 'enum' in value:
                enum_val = tuple(value["enum"]) 
                fld_type = Literal[enum_val]
                default = field(default=enum_val[0])
            elif 'type' in value:
                #fld_type = self.type_map[value['type']]
                if value["type"] == "string":
                    fld_type = str
                    default = field(default='')
                elif value["type"] == "number":
                    fld_type = float
                    default = field(default=0)
                elif value["type"] == "boolean":
                    fld_type = bool
                    default = field(default=False)
            

            fields.append([key, fld_type, default])

        TmfDataClass = make_dataclass(className, fields, bases=(TmfData,))
        return TmfDataClass

    def __post_init__(self):
        # validate dataclass values based on declared types
        for (name, field_type) in  self.__annotations__.items():
            if (Any == field_type):
                continue
            
            fld_value = self.__dict__[name]
            is_literal = (get_origin(field_type) is Literal)
           
            if not is_literal:
                if (float == field_type):
                    # float substitutes for 'number' allowing ints and floats
                    type_match =  (isinstance(fld_value, int) and not isinstance(fld_value, bool)) or isinstance(fld_value, float)
                else:
                    type_match = isinstance(fld_value, field_type)
                
                if not type_match and fld_value != None:
                    current_type = type(fld_value)
                    raise TypeError(f"The field `{name}` was assigned value value `{fld_value}` of type `{current_type}` instead of the required type `{field_type}`")
            elif is_literal:
                validValues = get_args(field_type)
                if not fld_value in validValues:
                    raise TypeError(f"The field `{name}` was assigned value `{fld_value}` instead of one of the required values `{validValues}`")

# Create layer definitions for all layers in a workspace
import json
from myworldapp.modules.comsof.server.sync.comsof_ws import ComsofWS

ws_file  = args[0]
ftr_spec = args[1] if len(args)>1 else '*'

out_file = r"C:\Users\trmay\myWorld\releases\myWorld-6.4\WebApps\myworldapp\modules\comsof\_unshipped\config\all_layers.settings"

ws = ComsofWS(ws_file)
ftr_pgk = ws.featurePackage()

setting = {}

for ft in ftr_pgk.featureTypes(ftr_spec ):
    db.progress(1,ft)
    desc = ftr_pgk.featureDesc(ft)

    geom_type = desc.fields['geometry'].type
    if geom_type=='point':
        item = {"point_style": "circle:#AE5095:8px",
                "visible": ft.startswith('OUT_')}

    elif geom_type=='linestring':
        item = {"line_style": "#AE5095:2:solid:none:arrow",
                "visible": ft.startswith('OUT_')}

    elif geom_type=='polygon':
        item = {"line_style": "#AE5095:2:solid", 
                "fill_style": "#AE5095:34", 
                "visible": False}

    setting[ft] = item

settings = {'comsof.workspace_layers': setting}


with open(out_file,"w") as strm:
    json.dump(settings,strm,indent=4)


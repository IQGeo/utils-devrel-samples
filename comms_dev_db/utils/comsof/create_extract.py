# Populate workspace #1 from #2
import os
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.io.myw_feature_ostream import MywFeatureOStream
from myworldapp.modules.comsof.server.sync.comsof_ws import ComsofWS

tgt_ws_id = args[0]
src_ws_id = args[1]

ws_tab     = db.tables['comsof_workspace']
src_ws_rec = ws_tab.get(src_ws_id)
tgt_ws_rec = ws_tab.get(tgt_ws_id)
ws_root_dir = db.setting('comsof.workspaces').replace('/','\\')

src_ws_dir     = os.path.join( ws_root_dir,str(src_ws_rec.id) )
src_ws        = ComsofWS(src_ws_dir,db.progress)

tgt_ws_dir     = r'c:\temp\cuts' # os.path.join( ws_root_dir,str(src_ws_rec.id) )


os_engine = MywOsEngine(db.progress)
os_engine.ensure_empty(tgt_ws_dir)

# Create control file
poly_file = os.path.join(tgt_ws_dir,'extract_region.shp')
src_coord_sys = src_ws.dbTable('IN_AccessStructures').coord_sys

db.progress(1,'Creating',poly_file)
with MywFeatureOStream.streamFor(poly_file,tgt_ws_rec._descriptor.storedFields(),coord_sys=src_coord_sys) as strm:
    strm.writeFeature(tgt_ws_rec)

# Do extract
db.progress(1,'Source',src_ws_dir)
db.progress(1,'Target',tgt_ws_dir)
                  
cmd = [ 'cmd/c', 'designer.exe','/cutWorkspace',
        '--target',tgt_ws_dir,
        '--polygons',poly_file,
        src_ws_dir,
        '-Djava.awt.headless=true' ]

db.progress( 1,'Running command:',' '.join(cmd) )
os_engine.run(*cmd,use_pipes=True)

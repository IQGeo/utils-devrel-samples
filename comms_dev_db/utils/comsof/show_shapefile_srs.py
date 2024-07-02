import sys
from osgeo import osr

def esriprj2standards(shapeprj_path):
    with open(shapeprj_path, 'r') as f:
        prj_txt = f.read()
    srs = osr.SpatialReference()
    srs.ImportFromESRI([prj_txt])
    print('Shape prj is: ' + prj_txt)
    print('WKT is: ' + str(srs.ExportToWkt()))
    print('Proj4 is : ' + str(srs.ExportToProj4()))
    srs.AutoIdentifyEPSG()
    print('EPSG is: ' + str(srs.GetAuthorityCode(None)))

esriprj2standards(args[0])

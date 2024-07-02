# Fix OSM building outlines for registration error

from shapely.geometry import LineString
from geoalchemy2 import shape
import shapely

# pylint: disable=undefined-variable
for rec in db.tables["osm_building"]:
    srid = rec.__table__.columns["location"].type.srid
    outline = rec._field("outline").geom()

    outline = shapely.affinity.translate(outline, 0.000035, 0.00001)

    rec.outline = shape.from_shape(outline, srid)

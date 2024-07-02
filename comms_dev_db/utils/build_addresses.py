# Builds address points from OSM building centroids

from shapely.geometry import LineString
import shapely

# pylint: disable=undefined-variable
for building_rec in db.tables["osm_building"]:
    location = building_rec._primary_geom_field.geom().centroid

    address_rec = db.tables["address"].insertWith()

    address_rec._field("building").set(building_rec)
    # address_rec._field('location').get(location)   # TODO: Set location

    db.session.add(address_rec)

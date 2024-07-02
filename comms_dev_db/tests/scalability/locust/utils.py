import random


def getTileListForRandomView():
    tile_list_options = [
        ["13/4016/2752.mvt", "13/4015/2751.mvt", "13/4015/2752.mvt", "13/4017/2751.mvt"],
        ["12/2035/1366.mvt", "12/2034/1366.mvt", "12/2035/1367.mvt", "12/2035/1365.mvt"],
        ["12/2036/1366.mvt", "12/2034/1367.mvt", "12/2034/1365.mvt", "12/2036/1367.mvt"],
        ["11/1017/683.mvt", "11/1017/682.mvt", "11/1018/683.mvt", "11/1018/682.mvt"],
        ["11/1019/683.mvt", "11/1019/684.mvt", "11/1020/683.mvt", "11/1020/684.mvt"],
        ["11/1018/683.mvt", "11/1018/684.mvt", "11/1016/683.mvt", "11/1016/682.mvt"],
        ["11/1020/681.mvt", "11/1020/682.mvt", "11/1019/681.mvt", "11/1019/682.mvt"],
        ["9/253/164.mvt", "9/254/164.mvt", "9/253/165.mvt", "9/254/165.mvt"],
        ["9/255/165.mvt", "9/254/165.mvt", "9/255/166.mvt", "9/255/164.mvt"],
        ["9/256/165.mvt", "9/254/166.mvt", "9/254/164.mvt", "9/256/166.mvt"],
        ["12/2035/1315.mvt", "12/2035/1316.mvt", "12/2036/1315.mvt", "12/2036/1316.mvt"],
        ["13/4070/2627.mvt", "13/4069/2627.mvt", "13/4070/2626.mvt", "13/4070/2628.mvt"],
        ["13/4069/2626.mvt", "13/4069/2628.mvt", "13/4071/2627.mvt", "13/4071/2626.mvt"],
        ["8/127/83.mvt", "8/126/83.mvt", "8/127/84.mvt", "8/126/84.mvt"],
    ]

    return list(map(lambda mvt: "/tile/geo/zoomstack/" + mvt, random.choice(tile_list_options)))


def getRandomCoords():
    return {
        "x": round(
            random.uniform(-82.7698809, -81.2106084), 14
        ),  # x coord within range that contains feature data
        "y": round(
            random.uniform(29.2050118, 27.5750003), 14
        ),  # y coord within range that contains fature data
    }


def getRandomZoomLevel(lowerBound, upperBound):
    return random.randint(lowerBound, upperBound)


coord_diffs = {
    # x and y coordinate value range spans for an arbitrary map viewport size at selected zoom levels
    "18": {"x_diff": 0.00578, "y_diff": 0.00295},
    "17": {"x_diff": 0.01156, "y_diff": 0.00591},
    "16": {"x_diff": 0.02331, "y_diff": 0.01181},
    "15": {"x_diff": 0.04712, "y_diff": 0.02359},
    "14": {"x_diff": 0.09409, "y_diff": 0.04728},
    "13": {"x_diff": 0.18802, "y_diff": 0.09455},
    "12": {"x_diff": 0.37053, "y_diff": 0.18861},
    "11": {"x_diff": 0.73883, "y_diff": 0.35672},
    "10": {"x_diff": 1.42137, "y_diff": 0.75704},
}


def getNewPannedCenterPt(currentCenter, zoom_level, pan_direction):
    newCenter = currentCenter
    if pan_direction == "E":
        newCenter["x"] += coord_diffs[str(zoom_level)]["x_diff"] / 2
    elif pan_direction == "W":
        newCenter["x"] -= coord_diffs[str(zoom_level)]["x_diff"] / 2
    elif pan_direction == "N":
        newCenter["y"] += coord_diffs[str(zoom_level)]["y_diff"] / 2
    elif pan_direction == "S":
        newCenter["y"] -= coord_diffs[str(zoom_level)]["y_diff"] / 2

    return newCenter


def getBboxFromZoomAndCenter(zoom, center_pt):
    bbox = []
    bbox.append(center_pt["x"] - (coord_diffs[str(zoom)]["x_diff"] / 2))  # x min
    bbox.append(center_pt["y"] - (coord_diffs[str(zoom)]["y_diff"] / 2))  # y min
    bbox.append(center_pt["x"] + (coord_diffs[str(zoom)]["x_diff"] / 2))  # x max
    bbox.append(center_pt["y"] + (coord_diffs[str(zoom)]["y_diff"] / 2))  # y max
    return bbox


def getFeatureRequestUrl(bbox, zoom_level):
    return (
        "/layer/Progress%2520Electric%2520Distribution/features?svars=%7B%7D&delta=&bbox="
        + str(bbox[0])
        + "%2C"
        + str(bbox[1])
        + "%2C"
        + str(bbox[2])
        + "%2C"
        + str(bbox[3])
        + "&limit=500&zoom="
        + str(zoom_level)
        + "&requiredFields=%7B%7D&application=standard&lang=en-US"
    )


def getRandomOntFeature():
    return f"fiber_ont%2F{random.randint(1,167)}"


def getRandomTraceFeature():
    feature_options = [
        "pole%2FgisYYpoleYY2605",
        "uub%2FgisYYuubYY310106",
        "uub%2FgisYYuubYY64101",
        "uub%2FgisYYuubYY1470293",
        "pole%2FgisYYpoleYY1948925",
        "uub%2FgisYYuubYY8521",
        "uub%2FgisYYuubYY1935142",
        "uub%2FgisYYuubYY1941463",
        "pole%2FgisYYpoleYY370883",
        "uub%2FgisYYuubYY244406",
        "uub%2FgisYYuubYY153886",
        "uub%2FgisYYuubYY169033",
        "uub%2FgisYYuubYY7223",
        "uub%2FgisYYuubYY12951",
        "uub%2FgisYYuubYY5285",
    ]
    return random.choice(feature_options)


def getRandomTraceFeaturePair():
    feature_pair_options = [
        ("uub%2FgisYYuubYY7842", "uub%2FgisYYuubYY1782196"),
        ("mit_terminal_enclosure%2FgisYYmit_terminal_enclosureYY2001013", "uub%2FgisYYuubYY5278"),
        ("building%2FgisYYbuildingYY69458", "uub%2FgisYYuubYY1470293"),
        ("uub%2FgisYYuubYY305414", "uub%2FgisYYuubYY122429"),
        ("uub%2FgisYYuubYY305414", "pole%2FgisYYpoleYY1948940"),
        ("pole%2FgisYYpoleYY385168", "pole%2FgisYYpoleYY1948940"),
        ("pole%2FgisYYpoleYY392778", "pole%2FgisYYpoleYY371590"),
        ("underground_route%2FgisYYunderground_routeYY219778", "uub%2FgisYYuubYY534448"),
        (
            "underground_route%2FgisYYunderground_routeYY219778",
            "underground_route%2FgisYYunderground_routeYY11470",
        ),
        ("underground_route%2FgisYYunderground_routeYY157132", "pole%2FgisYYpoleYY2615"),
        ("uub%2FgisYYuubYY310322", "uub%2FgisYYuubYY7017"),
        ("uub%2FgisYYuubYY5442", "pole%2FgisYYpoleYY2728"),
        ("uub%2FgisYYuubYY310322", "uub%2FgisYYuubYY6226"),
        ("uub%2FgisYYuubYY343643", "uub%2FgisYYuubYY6830"),
        ("uub%2FgisYYuubYY1935585", "uub%2FgisYYuubYY1935166"),
    ]
    return random.choice(feature_pair_options)


def response_emoji(res):
    return "✅ 💻 ↔️  🖥 " if res.status_code in range(200, 300) else "❌ 💻 ↔️  🖥 "


def responseSummary(description, res):
    return response_emoji(res) + " (" + str(res.status_code) + ") - " + description

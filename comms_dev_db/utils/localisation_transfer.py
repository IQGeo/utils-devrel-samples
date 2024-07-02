###############################################################################
# Command line util for extracting information from a localization file
# and using it to create a translated models.msg file
###############################################################################

import argparse, sys, json


def keyGenerator(words, groups, names, keyWordValues):
    """
    Takes the split up key from models.msg and filters it into either names or groups.

    Does not return anything but populates the names and groups variables."""

    keywordFound = False
    designFound = False
    for word in words:
        if (
            word == "feature"
            or word == "field"
            or word == "spec"
            or word == "layer"
            or word == "design"
            or word == "state"
        ):
            if word == "feature" and groups:
                if not keywordFound:
                    keyWordValues[0] = True
                else:
                    names.append(word)
            if word == "layer":
                keyWordValues[1] = True
            if word == "field":
                keyWordValues[2] = True
            if word == "spec" and groups:
                keyWordValues[3] = True
                groups.append(word)
            if word == "design":
                groups.append(word)
                designFound = True
                keyWordValues[4] = True
            if word == "state" and designFound:
                keyWordValues[4] = True
                groups.append(word)

            if groups:
                keywordFound = True
            else:
                groups.append(word)

        else:
            if keyWordValues[2]:
                break
            if keyWordValues[0] or keyWordValues[1] or keyWordValues[3] or keyWordValues[4]:
                names.append(word)
            else:
                groups.append(word)


def searchGroupGenerator(groups, searchGroup):
    """
    Takes the groups variable and forms it into a key that can be searched in the

    localisation file. Returns a string value to be searched for in the localisation

    file."""

    for group in groups:
        if group != groups[len(groups) - 1]:
            if group == "n":
                searchGroup += group + "_fiber_"
            elif group == "spec":
                pass
            else:
                searchGroup += group + "_"
        else:
            if group == "orientation":
                searchGroup += "myw_" + group + "_location"
            else:
                searchGroup += group
    return searchGroup


def searchNameGenerator(names, searchName):
    """
    Takes the names variable and forms it into a key that can be searched in the

    localisation file. Returns a string value to be searched for in the localisation

    file."""

    for name in names:
        if name == names[len(names) - 2]:
            if name == "external" or name == "display":
                searchName += name + "_name"
            elif name == "desc":
                searchName += name + "ription"
            elif name == "title":
                searchName += name + "_expr"
            elif name == "short":
                searchName += name + "_description_expr"
            elif name == "awaiting":
                searchName += name + "_approval"
            else:
                searchName += name
        elif name != names[len(names) - 1]:
            searchName += name + "_"
        else:
            break
    return searchName


def searchField(searchGroup, quoteWords, englishValue):
    """
    Searched the localisation file for a value that has been labeled as

    a field name in models.msg. Returns search results from the localisation file.

    If results are not found, the key will be added to models-not-found.txt"""

    results = ""
    for feature in data["features"]["myworld"]:
        try:
            results = data["features"]["myworld"][feature]["fields"][searchGroup]
            return results
        except KeyError:
            pass
    if not results:
        outputNotFound.write("    input." + quoteWords[1] + ": " + englishValue[1] + "\n")


def searchLayer(searchGroup, searchName, quoteWords, englishValue):
    """
    Searches the localisation file for a value that has been labeled as

    a layer in models.msg. Returns search results from the localisation file.

    If results are not found, the key will be added to models-not-found.txt"""

    try:
        results = data["layers"][searchGroup][searchName]
        return results
    except KeyError:
        try:
            searchGroup = "mywcom_" + searchGroup
            results = data["layers"][searchGroup][searchName]
            return results
        except KeyError:
            outputNotFound.write("    input." + quoteWords[1] + ": " + englishValue[1] + "\n")


def searchFeature(searchGroup, searchName, quoteWords, englishValue):
    """
    Searches the localisation file for a value that has been labeled as

    a feature in models.msg. Returns search results from the localisation file.

    If results are not found, the key will be added to models-not-found.txt"""

    try:
        if (
            searchName == "external_name"
            or searchName == "title_expr"
            or searchName == "short_description_expr"
        ):
            results = data["features"]["myworld"][searchGroup][searchName]
            return results
        else:
            results = data["features"]["myworld"][searchGroup]["fields"][searchName]
            return results
    except KeyError:
        outputNotFound.write("    input." + quoteWords[1] + ": " + englishValue[1] + "\n")


def searchDesign(searchGroup, searchName, quoteWords, englishValue):
    """
    Searches the localisation file for a value that has been labeled as

    a design in models.msg. Returns search results from the localisation file.

    If results are not found, the key will be added to models-not-found.txt"""

    try:
        if searchGroup == "design_state":
            if searchName == "new":
                searchName = "New"
            elif searchName == "designing":
                searchName = "Designing"
            elif searchName == "awaiting_approval":
                searchName = "Awaiting Approval"
            elif searchName == "approved":
                searchName = "Approved"
            elif searchName == "building":
                searchName = "Building"
            elif searchName == "complete":
                searchName = "Complete"

            results = data["enum"][searchGroup][searchName]
            return results
        else:
            results = data["features"]["myworld"][searchGroup][searchName]
            return results
    except KeyError:
        outputNotFound.write("    input." + quoteWords[1] + ": " + englishValue[1] + "\n")


if __name__ == "__main__":

    # Check to make sure that both of the required parameters are included.
    try:
        file1 = open(sys.argv[1], "r")
        file2 = open(sys.argv[2], "r")
    except IndexError:
        print(
            "localisation_transfer requires two parameters: the path to models.msg and the path to the localisation file."
        )
        exit()

    # Opening and loading files for parsing.
    data = json.load(file2)
    outputNotFound = open("models-not-found.txt", "w")
    outputFound = open("models-translated.msg", "w")
    contents = file1.readlines()

    outputNotFound.write("Keys missing from " + sys.argv[2] + ":\n")

    outputFound.write("{\n")
    outputFound.write('    "install": {\n')

    for content in contents:
        # Grabbing a line from models.msg and splitting it up so that it can be processed.
        key = content.split(":")
        if len(key) >= 2:
            quoteWords = key[0].split('"')
            englishValue = key[1].split('"')
            if len(quoteWords) >= 2:
                words = quoteWords[1].split("_")

                keyWordValues = [False, False, False, False, False]

                groups = []
                names = []

                searchGroup = ""
                searchName = ""
                results = ""

                # Populating names and groups values as well as determining what search function to use.
                keyGenerator(words, groups, names, keyWordValues)
                featureValue = keyWordValues[0]
                layerValue = keyWordValues[1]
                fieldValue = keyWordValues[2]
                specValue = keyWordValues[3]
                designValue = keyWordValues[4]

                # Generating search keys for the localisation file.
                searchGroup = searchGroupGenerator(groups, searchGroup)

                searchName = searchNameGenerator(names, searchName)

                # Searching the localisation file for a matching key.
                if fieldValue:
                    results = searchField(searchGroup, quoteWords, englishValue)
                elif layerValue:
                    results = searchLayer(searchGroup, searchName, quoteWords, englishValue)
                elif featureValue or specValue:
                    results = searchFeature(searchGroup, searchName, quoteWords, englishValue)
                elif designValue:
                    results = searchDesign(searchGroup, searchName, quoteWords, englishValue)
                else:
                    if quoteWords[1] == "install":
                        pass
                    else:
                        outputNotFound.write(
                            "    input." + quoteWords[1] + ": " + englishValue[1] + "\n"
                        )

                if results:
                    outputString = '    "' + quoteWords[1] + '": "' + results + '",'
                    outputFound.write("    " + outputString + "\n")

    outputFound.write("    }\n")
    outputFound.write("}\n")
    file1.close()
    file2.close()
    outputFound.close()
    outputNotFound.close()

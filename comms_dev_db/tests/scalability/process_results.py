import re, argparse, os
import numpy as np
import matplotlib.pyplot as plt


# Setup an argument parser
argument_parser = argparse.ArgumentParser(
    description="""
COMMS LOCUST RESULTS PROCESSOR
This command is used to process the results from a Locust run. It makes use
of a CSV file containing one line per request for the range of user numbers the test is run for.
These lines are written by the event handler in the locust setup.
""",
    formatter_class=argparse.RawTextHelpFormatter,
)
argument_parser.add_argument(
    "csv_input_filename", metavar="csv_input_filename", help="CSV file with request data"
)
argument_parser.add_argument("outdir", metavar="outdir", help="directory to write results to")
argument_parser.add_argument(
    "--percentile",
    "-p",
    type=int,
    default=None,
    dest="percentile",
    help="Include percentile on plots.Integer between 0 and 100",
)
argument_parser.add_argument(
    "--skip", "-s", type=int, default=None, dest="skip", help="Skip percentage of requests"
)
args = argument_parser.parse_args()

filename = args.csv_input_filename
outdir = args.outdir
skip = args.skip

outcsv = open(os.path.join(outdir, "summary.csv"), "w")

bins_regex = [
    "/network/mywcom_fiber",
    "/modules/comms/cable/path",
    "/modules/comms/structure/.*/contents",
    "/modules/comms/circuit/.*/route",
    "/modules/comms/delta/.*/validate",
    "/modules/comms/feature",
    "/layer/",
    'POST,"/feature/',
    'GET,"/feature/',
]

bins = list(map(lambda b: {"regex": re.compile(".*" + b), "data": {}, "name": b}, bins_regex))

tags = set()


import csv

print("Reading and processing results file")

with open(filename) as csvfile:
    spamreader = csv.reader(csvfile, delimiter=",", quotechar='"')
    for line_data in spamreader:

        # print(line_data)

        search_line = f'{line_data[2]},"{line_data[3]}'
        for bin in bins:

            if bin["regex"].search(search_line):

                tag = int(line_data[0])
                if tag not in bin["data"]:
                    bin["data"][tag] = []
                bin["data"][tag].append(float(line_data[4]))
                # print(f"adding {bin['regex']} {tag} {float(line_data[4])}")
                tags.add(tag)
                break


num = 0

print("Writing out summaries")

outcsv.write("category,users,requests,median,p95\n")
for b in bins:
    num += 1
    # print(b['name'])
    request_label = b["name"].replace('"', "").replace(",", "")
    tags = list(tags)
    tags.sort()

    print(f"Processing requests matching: {b['name']}")

    data = {}
    for t in tags:
        data[t] = [0, 0]

    for k, v in b["data"].items():
        if skip:
            start = int(skip * len(v) / 100)
            actual_v = v[start:]
            # print(f"using {start}")
            # print(v)
            # print(actual_v)
        else:
            actual_v = v

        m = np.median(actual_v)
        if args.percentile:
            p95 = np.percentile(actual_v, args.percentile)
        else:
            p95 = np.percentile(actual_v, 95)
        outcsv.write(f"{request_label},{k},{len(actual_v)},{m},{p95}\n")
        data[k] = [m, p95, len(actual_v)]

    y = []
    y95 = []
    for t in tags:
        y.append(data[t][0])
        y95.append(data[t][1])

    x = np.array(tags)
    y = np.array(y)
    plt.title(b["name"])
    plt.xlabel("Users")
    plt.ylabel("Duration (ms)")
    plt.plot(x, y)
    for xy in zip(x, y):
        plt.annotate(f"({xy[0]},{int(xy[1])})", xy=xy, textcoords="data")
    if args.percentile:
        plt.plot(x, y95)
    # plt.grid()
    plt.savefig(f"{outdir}/test_plot_{num}.png")
    plt.clf()

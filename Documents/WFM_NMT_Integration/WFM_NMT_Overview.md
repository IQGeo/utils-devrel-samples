# WFM/NMT Integration - Overview

## Table of Contents

- [WFM/NMT Integration - Overview](#wfmnmt-integration---overview)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [How to use the tool](#how-to-use-the-tool)

---

## Tool Description

The integration between the Workflow Manager (WFM) and Network Manager Telecom (NMT), allows users to manipulate WFM tickets from within NMT, making the processing of these tickets easier and more streamlined.

This sample allows the user to query the features database with a rule and create tickets associated with features that break this rule. 

For instance I want to ensure all my fiber cables have more than 24 fibers, if any of the cables have less than 24 fibers a ticket is created with basic information (that can be later edited) to replace this cable.

## How to use the tool

This Field Validator tool is available in the `main.wfm_nmt_integration.js` application configuration file in the top menu

![Field Validator Tool location in the toolbar](./WFM_NMT_Integration_1.png)

<p align="center"><i>Fig. 1: Field Validator Tool location in the toolbar</i></p>

When clicking in the button a window open where the user first selects, the feature, then the feature's field to be validated. Then depending on the type of field selected (the tool only works with number, string, and boolean types of fields), the proper fields are shown:

- If the field is a string, the rules are "must contain" and "must not contain" a substring
- If the fiels is a number, the rules is if the field is bigger than or smaller than a given number
- If the field is a boolean, the rue is to check if the field is True or False

In Fig. 2 below you can see a rule configured

![Field Validator Tool window with a rule configured](./WFM_NMT_Integration_2.png)

<p align="center"><i>Fig. 2: Field Validator Tool window with a rule configured (Fiber cables must have more than 24 fibers)</i></p>

When the user presses OK the rule is checked agains all the features that are curretly visible in the map (i.e.: If the map is zoomed in, fewer features will be checked, if it is zoomed all the way out it will check all the features in the world).

Once the check is done a list of all checked features is shown with a sign indicating if the feature breaks or not the rule, if the feature breaks the rule a button is also shown allowing a ticket to be created (Fig. 3). Also clicking in a feature will focus the map in said feature. Also next to the feature's name you can see its value for the field checked.

![Output of the rule checking, you can see that all cables that have less than 24 fibers have failed the check and tickets can be created](./WFM_NMT_Integration_3.png)

<p align="center"><i>Fig. 3: Output of the rule checking, you can see that all cables that have less than 24 fibers have failed the check and tickets can be created</i></p>

When the "Create WFM Ticket" button is pressed the ticket is created and a pop-up with the number of the ticket is shown, and clicking in the pop-up the ticket details are shown in the "Details" tab (Fig. 4 and Fig. 5)

![Ticket created, notice the ticket number in the top right corner](./WFM_NMT_Integration_4.png)

<p align="center"><i>Ticket created, notice the ticket number in the top right corner</i></p>

![Ticket details in the "Details" tab](./WFM_NMT_Integration_5.png)

<p align="center"><i>Ticket details in the "Details" tab</i></p>
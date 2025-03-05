# Long Running Tasks (LRT) - Python/Javascript - Code Deep Dive

## Table of Contents

- [ Long Running Tasks (LRT) - Python/JavaScript - Code Deep Dive](#long-running-tasks-lrt---pythonjavascript---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [customer\_connection\_plugin.js](#customer_connection_pluginjs)
    - [customer\_connection\_modal.js](#customer_connection_modaljs)
    - [customer\_connection\_builder.js](#customer_connection_builderjs)

---

## Tool Description

The tool uses the Long Running Task (LRT) framework that is designed to handle high-volume/compute-intensive tasks that if performed with Javascript on the client would degrade the end-user experience (e.g. time-out errors).  The framework combines Python script execution on the server with task queues managed by Python RQ backed by a Redis instance that is already available in the containerized environment.  

Because of the "long-running" nature of the tasks, the example includes a technique for providing useful feedback to the end user about the progress of the task.

Similar to the use cases found elsewhere in the Samples, we are looking to automate the creation of a connection between a Pole and an Address.  But in this case we are creating connections to 2000 random addresses in order to demonstrate the LRT functionality.

Starting with an empty Design polygon, the script creates the necessary Structures and Equipment to create a Fiber connection:
- Creates a new pole
  - Adds a Splice Closure to the Pole
  - Adds a Fiber Splitter to the Splice Closure

    (once the 24 ports on the Fiber Splitter are filled, it creates another Pole)
- With a random Address
  - Adds a Wall Box at the Address location
  - Adds an ONT to the Wall Box housing
- Creates a Connection
  - Creates a Route between the Pole and Wall Box at the address
  - Creates a Cable between the Pole and Wall Box at the address
  - Connects the Cable to a Pin in the Fiber Splitter
  - Connects the Cable to a Pin in the ONT


The user is provided feedback on the progress of the 2000 connections being made via a message in the modal dialog.

## Tool files

The tool files are:

- `benchmarkTask.py` - this is the Python file that includes both the execution logic for creating structures, equipment, and fiber cable connections as well as the logic for invoking the LRT framework and setting task parameters. \s\s 
    - Long Running Task Python files *must* reside in the `/server/tasks` folder.  In this case it should be in the `/modules/devrel_samples/server/tasks` folder.



- `lrt_modal.js` - The file containing the React code used to render the modal window, including displaying the progress in the execution of the Python script. 


    - This is found in the `/modules/devrel_samples/public/js/Samples/LRT` folder.

- `lrt_plugin.js` - the configuration file for the LRT plugin.  The LrtPlugin class will be then imported into the `main.sampleapp.js` file in a similar way as the other Palette tools. 

    - This is found in the `/modules/devrel_samples/public/js/Samples/LRT` folder.


## How the tool works

In this section we will go over the tool source code describing how it works.

### benchmarkTask.py

```
import string
from myworldapp.core.server.tasks.myw_base_task import MywBaseTask, myw_task

import re
from myworldapp.modules.comms.server.controllers.mywcom_controller import MywcomController
from myworldapp.modules.comms.server.api.manager import *
from myworldapp.modules.comms.server.api.cable_manager import *
from myworldapp.modules.comms.server.api.connection_manager import *
from myworldapp.modules.comms.server.api.pin_range import *
import random
from typing import Any
import time

```

- As is customary in Python, at the top of our script we begin by importing our libraries:  

    `string`, `re`, `random`, `typing`, and `time` are standard Python libraries 

    we import the `MywBaseTask` and `myw_task` in order to work with the Long Running Task framework  

    

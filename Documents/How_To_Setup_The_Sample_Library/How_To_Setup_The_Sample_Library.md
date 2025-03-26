# How To Setup The Sample Library

In this document we cover how to add the sample library to your development environment and set up the applications that allow you to use the samples.

********** If you still do not have a development enviroment, contact devrel@iqgeo.com **********

## Table of Contents

- [How To Setup The Sample Library](#how-to-setup-the-sample-library)
  - [Table of Contents](#table-of-contents)
  - [How to add the Sample Library to your development environment](#how-to-add-the-sample-library-to-your-development-environment)
  - [How to add the Sample Applications to the Platform](#how-to-add-the-sample-applications-to-the-platform)

---

## How to add the Sample Library to your development environment

To add the sample library to your development environment clone the [Repository](https://github.com/IQGeo/utils-devrel-samples/tree/main) directly into the root directory of your development environment (i.e.: The same level as the `custom` folder).

Once the repository is cloned you should have a `utils-devrel-sample` within it with the contents of the repository. The next step is to add the Samples Module to your `iqgeorc.jsonc` file, as well as the other modules needed to properly run the samples.

The `modules` section of the `iqgeorc.jsonc` file should look like below

> **Make sure to update the version number to the latest available version of the modules before updating your `iqgeorc.jsonc` file!**
> 
> **You can find the latest available version information in the [Modules Dependencies](https://github.com/IQGeo/utils-project-template/wiki/Module-dependencies) page**

```    "modules": [
        {
            "name": "comms",
            "version": "3.3"
        },
        {
            "name": "comsof",
            "version": "1.5"
        },
        {
            "name": "comms_dev_db",
            "devOnly": true,
            "version": "3.2"
        },
        {
            "name": "utils-devrel-samples"
        },
        {
            "name": "groups",
            "version": "1.0.2"
        },
        {
            "name": "workflow_manager",
            "version": "4.0"
        },
        {
            "name": "workflow_manager_dev_db",
            "version": "4.0"
        },
        {
            "name": "dev_tools",
            "version": "7.2",
            "dbInit": false
        }
    ],
```
<p align="center"><i>Modules section of the iqgeorc.jsonc file</i></p>

After editing the `iqgeorc.jsonc` file, right click on it in the "Explorer" window in VS Code and run the "IQGeo Update Project from .iqgeorc.jsonc" and rebuild the container.

> You have to clean up your working tree before running the Update Project command!

Once the container is rebuilt, you can cofigure the application within the "Configuration" Page.

## How to add the Sample Applications to the Platform

In order to use the Samples you need to add the Applications containing the Samples to you Platform.

Below we will describe how to set one of the applications: `main.nmt_samples.js`, the procedure for the other files are similar with some considerations after the instructions.

In the Platform main page:

- Click on Configurations -> Applications -> Add New
- Set the Name, Display Name, and Description as you want
- In the JavaScript File field use `modules/utils-devrel-samples/js/main.nmt_samples.js`
- Tick Available Online and Available in Native App
- Select the appropriate Basemap(s)
- In Overlays select all BUT the ones starting with `comsof`
- Enable Snapping in
  - Addresses
  - mywcom_cables
  - mywcom_equipment
  - mywcom_structures
- Click "Save"

Once the application is configured you must give permissions to the users that will access it

Go back to the main page by clicking in the IQGeo logo on the top right corner:

- Click on Configurations -> Roles
- Select the user group that will access the application
- Look for the `devrel_samples_app` and enable it
- Enable all permissions for the application
- Click "Save"

Go back to the main page by clicking in the IQGeo logo and you should see the icon for the Samples Application.